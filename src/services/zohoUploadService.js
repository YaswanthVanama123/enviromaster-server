/**
 * Zoho Upload Service
 * Helper functions for Zoho upload operations
 */

import mongoose from "mongoose";
import { CustomerHeaderDoc, VersionPdf } from "../models/agreement/index.js";

/**
 * Convert text log content to PDF using remote LaTeX service
 */
export async function convertTextLogToPdf(textContent, fileName = "log.txt") {
  console.log(`📄 [TEXT-TO-PDF] Converting log text to PDF: ${fileName}`);

  const latexContent = `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{fancyhdr}
\\usepackage{verbatim}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\textbf{${fileName.replace(/_/g, "\\_")}}}
\\fancyfoot[C]{\\thepage}

\\begin{document}
\\section*{Log File: ${fileName.replace(/_/g, "\\_")}}

\\begin{verbatim}
${textContent}
\\end{verbatim}

\\end{document}`;

  try {
    const PDF_REMOTE_BASE = process.env.PDF_REMOTE_BASE || "http://45.55.208.199:3000";
    const timeoutMs = 30000;

    console.log(`🌐 [TEXT-TO-PDF] Calling remote LaTeX service: ${PDF_REMOTE_BASE}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${PDF_REMOTE_BASE}/pdf/compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/pdf",
      },
      body: JSON.stringify({ template: latexContent }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`❌ [TEXT-TO-PDF] Remote service error (${response.status}): ${errorText}`);
      throw new Error(`Remote LaTeX service failed: ${response.status} ${errorText}`);
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`✅ [TEXT-TO-PDF] Generated PDF: ${pdfBuffer.length} bytes`);

    return pdfBuffer;
  } catch (error) {
    console.error(`❌ [TEXT-TO-PDF] Failed to convert log to PDF: ${error.message}`);
    throw error;
  }
}

/**
 * Get PDF data for an agreement from VersionPdf or CustomerHeaderDoc
 */
export async function getPdfForAgreement(agreementId, options = {}) {
  const requestedVersionId = options?.versionId ? String(options.versionId).trim() : null;
  const cachedAgreement = options?.agreementDoc || null;

  const versionIdDisplay = requestedVersionId ? ` (versionId: ${requestedVersionId})` : "";
  console.log(`📎 [PDF-LOOKUP] Searching for PDF data in VersionPdf collection for agreement: ${agreementId}${versionIdDisplay}`);

  let versionDoc = null;

  if (requestedVersionId) {
    if (mongoose.Types.ObjectId.isValid(requestedVersionId)) {
      versionDoc = await VersionPdf.findOne({
        _id: requestedVersionId,
        agreementId: agreementId,
        status: { $ne: "archived" },
      }).select("_id versionNumber pdf_meta fileName createdAt");

      if (versionDoc) {
        console.log(`📎 [PDF-LOOKUP] Found requested VersionPdf v${versionDoc.versionNumber} (ID: ${versionDoc._id})`);
      } else {
        console.warn(`⚠️ [PDF-LOOKUP] Requested VersionPdf not found for agreement: ${agreementId} (id: ${requestedVersionId})`);
      }
    } else {
      console.warn(`⚠️ [PDF-LOOKUP] Invalid requested versionId format: ${requestedVersionId}`);
    }
  }

  if (!versionDoc) {
    versionDoc = await VersionPdf.findOne({
      agreementId: agreementId,
      status: { $ne: "archived" },
    })
      .sort({ versionNumber: -1 })
      .select("_id versionNumber pdf_meta fileName createdAt");

    if (!versionDoc) {
      console.error(`❌ [PDF-LOOKUP] No VersionPdf documents found for agreement: ${agreementId}`);

      const customerDoc = cachedAgreement ||
        (await CustomerHeaderDoc.findById(agreementId).select("pdf_meta fileName currentVersionNumber"));

      if (customerDoc?.pdf_meta?.pdfBuffer) {
        const fallbackBuffer = Buffer.isBuffer(customerDoc.pdf_meta.pdfBuffer)
          ? customerDoc.pdf_meta.pdfBuffer
          : Buffer.from(customerDoc.pdf_meta.pdfBuffer);
        const resolvedFileName = customerDoc.fileName || customerDoc.pdf_meta.fileName || `agreement_${customerDoc.currentVersionNumber || 1}.pdf`;

        console.log(`📄 [PDF-LOOKUP] Falling back to CustomerHeaderDoc PDF: ${resolvedFileName} (${fallbackBuffer.length} bytes)`);

        return {
          pdfBuffer: fallbackBuffer,
          source: "CustomerHeaderDoc",
          version: customerDoc.currentVersionNumber || 1,
          versionId: null,
          fileName: resolvedFileName,
          requestedVersionId,
          sizeBytes: customerDoc.pdf_meta.sizeBytes || fallbackBuffer.length,
          bufferSize: fallbackBuffer.length,
        };
      }

      const versionCount = await VersionPdf.countDocuments({
        agreementId: agreementId,
        status: { $ne: "archived" },
      });

      return {
        pdfBuffer: null,
        source: null,
        version: null,
        debugInfo: {
          error: "no_versions_found",
          versionCount: versionCount,
          agreementId: agreementId,
          requestedVersionId,
          message: "No VersionPdf documents exist for this agreement",
        },
      };
    }

    console.log(`📎 [PDF-LOOKUP] Found VersionPdf v${versionDoc.versionNumber} (ID: ${versionDoc._id})`);
  }

  if (!versionDoc.pdf_meta?.pdfBuffer) {
    console.error(`❌ [PDF-LOOKUP] VersionPdf v${versionDoc.versionNumber} has no pdfBuffer field`);

    return {
      pdfBuffer: null,
      source: "VersionPdf",
      version: versionDoc.versionNumber,
      debugInfo: {
        error: "no_pdf_buffer",
        versionId: versionDoc._id,
        versionNumber: versionDoc.versionNumber,
        hasPdfMeta: !!versionDoc.pdf_meta,
        createdAt: versionDoc.createdAt,
        requestedVersionId,
        message: "VersionPdf document exists but pdfBuffer field is missing",
      },
    };
  }

  const mongoBuffer = versionDoc.pdf_meta.pdfBuffer;
  const actualSize = mongoBuffer.length || mongoBuffer.buffer?.length || 0;

  if (actualSize === 0) {
    console.error(`❌ [PDF-LOOKUP] VersionPdf v${versionDoc.versionNumber} has empty pdfBuffer (0 bytes)`);

    const versionCount = await VersionPdf.countDocuments({
      agreementId: agreementId,
      status: { $ne: "archived" },
    });

    const versionsWithPdf = await VersionPdf.countDocuments({
      agreementId: agreementId,
      status: { $ne: "archived" },
      "pdf_meta.pdfBuffer": { $exists: true, $ne: null },
      "pdf_meta.sizeBytes": { $gt: 0 },
    });

    return {
      pdfBuffer: null,
      source: "VersionPdf",
      version: versionDoc.versionNumber,
      debugInfo: {
        error: "empty_pdf_buffer",
        versionId: versionDoc._id,
        versionNumber: versionDoc.versionNumber,
        versionCount: versionCount,
        versionsWithPdf: versionsWithPdf,
        sizeBytes: versionDoc.pdf_meta.sizeBytes || 0,
        actualSize: actualSize,
        createdAt: versionDoc.createdAt,
        requestedVersionId,
        message: `VersionPdf v${versionDoc.versionNumber} exists but pdfBuffer is empty (0 bytes). This suggests PDF compilation failed.`,
      },
    };
  }

  const bufferSize = actualSize;
  const sizeBytes = versionDoc.pdf_meta.sizeBytes || bufferSize;
  const resolvedFileName = versionDoc.fileName || `version_${versionDoc.versionNumber}.pdf`;

  let properBuffer;
  if (Buffer.isBuffer(mongoBuffer)) {
    properBuffer = mongoBuffer;
  } else if (mongoBuffer.buffer) {
    properBuffer = Buffer.from(mongoBuffer.buffer);
  } else {
    properBuffer = Buffer.from(mongoBuffer);
  }

  const sourceLabel = requestedVersionId ? "VersionPdf (requested)" : "VersionPdf";
  console.log(`📄 [PDF-LOOKUP] Found valid PDF in ${sourceLabel} v${versionDoc.versionNumber}: ${properBuffer.length} bytes`);

  return {
    pdfBuffer: properBuffer,
    source: sourceLabel,
    version: versionDoc.versionNumber,
    versionId: versionDoc._id,
    fileName: resolvedFileName,
    requestedVersionId,
    sizeBytes: sizeBytes,
    bufferSize: properBuffer.length,
  };
}

/**
 * Build a normalized file name from raw input
 */
export function buildNormalizedFileName(rawName, fallbackBase = "file", fallbackExtension = ".pdf") {
  const candidate = (rawName || "").trim().replace(/[^a-zA-Z0-9-_.]/g, "_");
  const extensionMatch = candidate.match(/(\.[^./]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : fallbackExtension;
  const baseName = extensionMatch ? candidate.slice(0, candidate.length - extension.length) : candidate;
  const sanitizedFallback = (fallbackBase || "").trim().replace(/[^a-zA-Z0-9-_.]/g, "_") || "file";
  const finalBase = baseName || sanitizedFallback;
  return `${finalBase}${extension}`;
}

/**
 * Calculate deal amount from agreement payload
 */
export function calculateDealAmount(agreement) {
  let total = 0;
  const payload = agreement.payload;

  if (payload?.products) {
    ["smallProducts", "dispensers", "bigProducts"].forEach((category) => {
      if (payload.products[category]) {
        payload.products[category].forEach((product) => {
          if (product.weeklyTotal) total += parseFloat(product.weeklyTotal);
        });
      }
    });
  }

  if (payload?.services) {
    Object.values(payload.services).forEach((service) => {
      if (service && service.weeklyTotal) {
        total += parseFloat(service.weeklyTotal);
      }
    });
  }

  return Math.round(total * 100) / 100;
}
