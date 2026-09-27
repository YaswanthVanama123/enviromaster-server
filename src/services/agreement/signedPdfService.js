import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildDocumentIndex, findLabel, findFillRule } from "./pdfTextLocator.js";
import logger from "../../utils/logger.js";

const SIGNATURE_INK = rgb(0.05, 0.11, 0.42);
const PAGE_WIDTH = 612;
const MAX_SIGNATURE_HEIGHT = 20;
const MIN_SIGNATURE_HEIGHT = 9;
const SAME_ROW_TOLERANCE = 8;

const FIELD_MAP = [
  {
    role: "customer",
    column: "left",
    nameLabels: ["Customer Contact Name", "Customer Name"],
    signatureLabels: ["Customer Signature"],
  },
  {
    role: "em_franchisee",
    column: "right",
    nameLabels: ["EM Franchisee Name", "EM Franchisee"],
    signatureLabels: ["EM Signature"],
  },
];

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function formatSignatureDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
}

function shrinkToFit(text, font, maxSize, minSize, maxWidth) {
  let size = maxSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.25;
  }
  return size;
}

function truncate(text, font, size, maxWidth) {
  const value = String(text ?? "");
  if (!value || font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let cut = value;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function slotFor(index, anchor, fallbackWidth) {
  if (!anchor) return null;
  const rule = findFillRule(index, anchor);
  if (rule) {
    return {
      x: rule.x,
      baseline: rule.y + rule.height,
      width: rule.width,
      pageIndex: rule.pageIndex,
    };
  }
  return {
    x: anchor.labelEndX + 5,
    baseline: anchor.y,
    width: fallbackWidth,
    pageIndex: anchor.pageIndex,
  };
}

const BLOCK_HEADINGS = [
  "AUTHORITY TO SIGN THIS AGREEMENT",
  "I HEREBY REPRESENT",
];

function locateSignatureBlock(index) {
  for (const heading of BLOCK_HEADINGS) {
    const anchor = findLabel(index, heading);
    if (anchor) {
      return { pageIndex: anchor.pageIndex, maxY: anchor.y + 2 };
    }
  }
  return { pageIndex: null, maxY: null };
}

function resolveAnchor(index, labels, column, scope) {
  for (const label of labels) {
    const anchor = findLabel(index, label, {
      column,
      pageWidth: PAGE_WIDTH,
      pageIndex: scope.pageIndex,
      maxY: scope.maxY,
    });
    if (anchor) return anchor;
  }
  return null;
}

function headroomAbove(index, slot) {
  let nearest = Infinity;

  const floor = slot.baseline + SAME_ROW_TOLERANCE;

  for (const line of index.lines) {
    if (line.pageIndex !== slot.pageIndex) continue;
    if (line.y <= floor) continue;
    nearest = Math.min(nearest, line.y);
  }
  for (const rule of index.rules) {
    if (rule.pageIndex !== slot.pageIndex) continue;
    if (rule.y <= floor) continue;
    nearest = Math.min(nearest, rule.y);
  }

  if (!Number.isFinite(nearest)) return MAX_SIGNATURE_HEIGHT;
  return Math.max(nearest - slot.baseline - 3, MIN_SIGNATURE_HEIGHT);
}

async function embedSignatureImage(doc, signer) {
  const contentType = (signer.signatureImageContentType || "image/png").toLowerCase();
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return await doc.embedJpg(signer.signatureImage);
  }
  return await doc.embedPng(signer.signatureImage);
}

async function drawSignature(page, doc, fonts, slot, signer, index) {
  const padding = 4;
  const available = Math.max(slot.width - padding * 2, 24);

  if (signer.signatureImage && signer.signatureImage.length > 0) {
    try {
      const image = await embedSignatureImage(doc, signer);
      const maxHeight = Math.min(MAX_SIGNATURE_HEIGHT, headroomAbove(index, slot));
      const scale = Math.min(available / image.width, maxHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: slot.x + padding,
        y: slot.baseline + 1,
        width,
        height,
      });
      return true;
    } catch (error) {
      logger.warn(`Signature image embed failed for ${signer.name}: ${error.message}`);
    }
  }

  const typed = (signer.typedName || signer.printedName || signer.name || "").trim();
  if (!typed) return false;

  const size = shrinkToFit(typed, fonts.script, 16, 8, available);
  page.drawText(typed, {
    x: slot.x + padding,
    y: slot.baseline + 3,
    size,
    font: fonts.script,
    color: SIGNATURE_INK,
  });
  return true;
}

function drawValue(page, fonts, slot, value) {
  const text = String(value ?? "").trim();
  if (!text) return false;

  const padding = 4;
  const available = Math.max(slot.width - padding * 2, 24);
  const size = shrinkToFit(text, fonts.regular, 9.5, 6, available);

  page.drawText(truncate(text, fonts.regular, size, available), {
    x: slot.x + padding,
    y: slot.baseline + 3,
    size,
    font: fonts.regular,
    color: SIGNATURE_INK,
  });
  return true;
}

async function fillSignatureBlock(doc, fonts, request) {
  const index = buildDocumentIndex(doc);
  const pages = doc.getPages();
  const scope = locateSignatureBlock(index);

  const signers = [...(request.signers || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const filled = [];
  const unplaced = [];
  const usedDateColumns = new Set();

  for (const signer of signers) {
    if (signer.status !== "signed") continue;

    const mapping = FIELD_MAP.find((entry) => entry.role === signer.role);
    if (!mapping) {
      unplaced.push(signer);
      continue;
    }

    let signaturePlaced = false;

    const signatureAnchor =
      resolveAnchor(index, mapping.signatureLabels, mapping.column, scope) ||
      findLabel(index, "Signature:", {
        column: mapping.column,
        pageWidth: PAGE_WIDTH,
        pageIndex: scope.pageIndex,
        maxY: scope.maxY,
      });

    if (signatureAnchor) {
      const slot = slotFor(index, signatureAnchor, 150);
      const page = pages[slot.pageIndex];
      if (page) {
        signaturePlaced = await drawSignature(page, doc, fonts, slot, signer, index);
      }
    }

    const nameAnchor = resolveAnchor(index, mapping.nameLabels, mapping.column, scope);
    if (nameAnchor) {
      const slot = slotFor(index, nameAnchor, 150);
      const page = pages[slot.pageIndex];
      if (page) {
        drawValue(page, fonts, slot, signer.printedName || signer.name);
      }
    }

    if (!usedDateColumns.has(mapping.column)) {
      const dateAnchor = findLabel(index, "Date:", {
        column: mapping.column,
        pageWidth: PAGE_WIDTH,
        pageIndex: signatureAnchor ? signatureAnchor.pageIndex : scope.pageIndex,
        maxY: signatureAnchor ? signatureAnchor.y - 2 : scope.maxY,
      });
      if (dateAnchor) {
        const slot = slotFor(index, dateAnchor, 90);
        const page = pages[slot.pageIndex];
        if (page && drawValue(page, fonts, slot, formatSignatureDate(signer.signedAt))) {
          usedDateColumns.add(mapping.column);
        }
      }
    }

    if (signaturePlaced) {
      filled.push(signer);
    } else {
      unplaced.push(signer);
    }
  }

  return { filled, unplaced };
}

export async function buildSignedPdf({ sourceBuffer, request }) {
  const sourceHash = sha256(sourceBuffer);
  const doc = await PDFDocument.load(sourceBuffer, { ignoreEncryption: true });

  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    script: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
  };

  const placement = await fillSignatureBlock(doc, fonts, request);

  doc.setTitle(`${request.agreementTitle || "Service Agreement"} (Signed)`);
  doc.setSubject(`Signed agreement — envelope ${request.envelopeId}`);
  doc.setProducer("EnviroMaster Signature Service");
  doc.setCreator("EnviroMaster");
  doc.setKeywords([
    "signed",
    "esignature",
    `envelope:${request.envelopeId}`,
    `source-sha256:${sourceHash}`,
  ]);
  doc.setModificationDate(new Date());

  const bytes = await doc.save({ useObjectStreams: false });
  const buffer = Buffer.from(bytes);

  if (placement.unplaced.length > 0) {
    logger.warn(
      `Envelope ${request.envelopeId}: ${placement.unplaced.length} signature(s) had no matching field in the agreement signature block`
    );
  }

  return {
    buffer,
    sizeBytes: buffer.length,
    pageCount: doc.getPageCount(),
    sourceSha256: sourceHash,
    sha256: sha256(buffer),
    generatedAt: new Date(),
    stampedCount: placement.filled.length,
    unplacedCount: placement.unplaced.length,
  };
}

export default { buildSignedPdf, sha256 };
