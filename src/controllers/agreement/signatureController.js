import mongoose from "mongoose";
import { CustomerHeaderDoc, VersionPdf } from "../../models/agreement/index.js";
import SignatureRequest, {
  SIGNATURE_REQUEST_STATUS,
  SIGNATURE_METHOD,
  SIGNED_VIA,
  SIGNER_ROLE,
  SIGNER_STATUS,
  SIGNATURE_EVENT,
} from "../../models/agreement/SignatureRequest.model.js";
import {
  resolveLatestVersion,
  seedSignersFromAgreement,
  decodeSignatureImage,
  extractClientIp,
  resolveSignatureLocation,
  serializeRequest,
  serializeSigner,
  sendSignatureInvite,
  sendDeclineNotification,
  sendCompletionNotification,
  buildSigningUrl,
  resolvePortalOrigin,
} from "../../services/agreement/signatureService.js";
import { buildSignedPdf } from "../../services/agreement/signedPdfService.js";
import logger from "../../utils/logger.js";

const EXPIRING_SOON_WINDOW_DAYS = Number(
  process.env.SIGNATURE_EXPIRING_SOON_DAYS || 7
);

function badRequest(res, detail) {
  return res.status(400).json({ success: false, error: "bad_request", detail });
}

function notFound(res, detail) {
  return res.status(404).json({ success: false, error: "not_found", detail });
}

function serverError(res, error, context) {
  logger.error(`${context}: ${error.message}`);
  return res.status(500).json({
    success: false,
    error: "server_error",
    detail: error?.message || String(error),
  });
}

function actorOf(req) {
  return req.user?.username || req.admin?.username || "system";
}

function buildDocumentDescriptor(agreement, version) {
  if (version) {
    return {
      kind: "version",
      id: String(version._id),
      label: version.versionLabel || `Version ${version.versionNumber}`,
      versionNumber: version.versionNumber,
      fileName: version.fileName || `agreement_v${version.versionNumber}.pdf`,
      sizeBytes: version.pdf_meta?.sizeBytes || 0,
      createdAt: version.createdAt || null,
      createdBy: version.createdBy || null,
    };
  }

  return {
    kind: "agreement",
    id: String(agreement._id),
    label: "Agreement PDF",
    versionNumber: null,
    fileName: `${agreement.payload?.headerTitle || "agreement"}.pdf`,
    sizeBytes: agreement.pdf_meta?.sizeBytes || 0,
    createdAt: agreement.createdAt || null,
    createdBy: agreement.createdBy || null,
  };
}

async function loadSourcePdf(request) {
  if (request.versionId) {
    const version = await VersionPdf.findById(request.versionId).select(
      "pdf_meta.pdfBuffer"
    );
    if (version?.pdf_meta?.pdfBuffer) return Buffer.from(version.pdf_meta.pdfBuffer);
  }

  const agreement = await CustomerHeaderDoc.findById(request.agreementId).select(
    "pdf_meta.pdfBuffer"
  );
  if (agreement?.pdf_meta?.pdfBuffer) return Buffer.from(agreement.pdf_meta.pdfBuffer);

  return null;
}

async function finalizeSignedPdf(request, actor) {
  const sourceBuffer = await loadSourcePdf(request);
  if (!sourceBuffer) {
    logger.warn(
      `Cannot build signed PDF for agreement ${request.agreementId}: source PDF unavailable`
    );
    return false;
  }

  const result = await buildSignedPdf({ sourceBuffer, request });

  request.signedPdf = {
    buffer: result.buffer,
    sizeBytes: result.sizeBytes,
    contentType: "application/pdf",
    pageCount: result.pageCount,
    generatedAt: result.generatedAt,
    sourceSha256: result.sourceSha256,
    sha256: result.sha256,
    stale: false,
  };

  request.recordEvent(SIGNATURE_EVENT.FINALIZED, {
    actor: actor || "system",
    detail: `Signed PDF generated (${result.pageCount} pages, sha256 ${result.sha256.slice(0, 12)}…)`,
  });

  logger.info(
    `Signed PDF generated for agreement ${request.agreementId} (envelope ${request.envelopeId})`
  );
  return true;
}

async function refreshSignedPdf(request, actor) {
  try {
    await finalizeSignedPdf(request, actor);
  } catch (error) {
    request.signedPdf.stale = true;
    logger.error(
      `Signed PDF generation failed for agreement ${request.agreementId}: ${error.message}`
    );
  }
}

async function loadAgreementForSignature(agreementId) {
  return await CustomerHeaderDoc.findById(agreementId)
    .select(
      "_id status createdAt createdBy payload.headerTitle payload.serviceAgreement pdf_meta.sizeBytes isDeleted"
    )
    .lean();
}

async function ensureSignatureRequest(agreement, actor) {
  let request = await SignatureRequest.findOne({ agreementId: agreement._id });

  const latestVersion = await resolveLatestVersion(agreement._id);
  const agreementTitle = agreement.payload?.headerTitle || "Untitled Agreement";

  if (!request) {
    request = new SignatureRequest({
      agreementId: agreement._id,
      agreementTitle,
      versionId: latestVersion?._id || null,
      versionNumber: latestVersion?.versionNumber ?? null,
      versionLabel:
        latestVersion?.versionLabel ||
        (latestVersion ? `Version ${latestVersion.versionNumber}` : "Agreement PDF"),
      signers: seedSignersFromAgreement(agreement, actor),
      createdBy: actor,
      updatedBy: actor,
      readyAt: new Date(),
    });
    request.recordEvent(SIGNATURE_EVENT.CREATED, {
      actor,
      detail: `Envelope prepared with ${request.signers.length} signature places`,
    });
    request.recalculateStatus();
    await request.save();
    logger.info(
      `Signature request created for agreement ${agreement._id} by ${actor}`
    );
    return { request, latestVersion, created: true };
  }

  request.agreementTitle = agreementTitle;

  const noSignaturesYet = !(request.signers || []).some(
    (signer) => signer.status === SIGNER_STATUS.SIGNED
  );
  const pinnedIsStale =
    latestVersion &&
    String(request.versionId || "") !== String(latestVersion._id);

  if (noSignaturesYet && pinnedIsStale) {
    request.versionId = latestVersion._id;
    request.versionNumber = latestVersion.versionNumber;
    request.versionLabel =
      latestVersion.versionLabel || `Version ${latestVersion.versionNumber}`;
    request.updatedBy = actor;
  }

  request.recalculateStatus();
  await request.save();

  return { request, latestVersion, created: false };
}

async function resolvePinnedVersion(request) {
  if (!request.versionId) return null;
  return await VersionPdf.findById(request.versionId)
    .select(
      "_id versionNumber versionLabel fileName pdf_meta.sizeBytes createdAt createdBy"
    )
    .lean();
}

function buildRequestResponse(request, agreement, pinnedVersion, latestVersion, options) {
  const payload = serializeRequest(request, options);

  return {
    success: true,
    request: payload,
    document: buildDocumentDescriptor(agreement, pinnedVersion),
    hasNewerVersion:
      !!latestVersion &&
      !!pinnedVersion &&
      String(latestVersion._id) !== String(pinnedVersion._id),
    latestVersion: latestVersion
      ? {
          id: String(latestVersion._id),
          versionNumber: latestVersion.versionNumber,
          label:
            latestVersion.versionLabel || `Version ${latestVersion.versionNumber}`,
        }
      : null,
  };
}

export async function listSignatureRequests(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);

    const filter = {};

    if (req.query.search) {
      filter.agreementTitle = { $regex: req.query.search, $options: "i" };
    }

    const status = req.query.status;
    if (status && status !== "all") {
      if (!Object.values(SIGNATURE_REQUEST_STATUS).includes(status)) {
        return badRequest(res, "Unknown signature status");
      }
      filter.status = status;
    }

    if (req.query.mine === "true") {
      const actor = actorOf(req);
      filter.$or = [{ createdBy: actor }, { updatedBy: actor }];
    }

    const OPEN_STATUSES = [
      SIGNATURE_REQUEST_STATUS.READY,
      SIGNATURE_REQUEST_STATUS.IN_PROGRESS,
    ];
    const now = new Date();
    const expirySoonCutoff = new Date(now.getTime() + EXPIRING_SOON_WINDOW_DAYS * 86400000);

    const [total, requests, summaryFacet] = await Promise.all([
      SignatureRequest.countDocuments(filter),
      SignatureRequest.find(filter)
        .select("-signers.signatureImage -signedPdf.buffer -events")
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SignatureRequest.aggregate([
        {
          $facet: {
            statusCounts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
            actionRequired: [
              {
                $match: {
                  status: { $in: OPEN_STATUSES },
                  "signers.status": SIGNER_STATUS.PENDING,
                },
              },
              { $count: "count" },
            ],
            waitingForOthers: [
              {
                $match: {
                  status: { $in: OPEN_STATUSES },
                  "signers.status": SIGNER_STATUS.SENT,
                },
              },
              { $count: "count" },
            ],
            expiringSoon: [
              {
                $match: {
                  status: { $in: OPEN_STATUSES },
                  signers: {
                    $elemMatch: {
                      status: SIGNER_STATUS.SENT,
                      tokenExpiresAt: { $gte: now, $lte: expirySoonCutoff },
                    },
                  },
                },
              },
              { $count: "count" },
            ],
          },
        },
      ]),
    ]);

    const facet = summaryFacet[0] || {};
    const counts = { all: 0 };
    for (const key of Object.values(SIGNATURE_REQUEST_STATUS)) {
      counts[key] = 0;
    }
    for (const group of facet.statusCounts || []) {
      counts[group._id] = group.count;
      counts.all += group.count;
    }

    const summary = {
      actionRequired: facet.actionRequired?.[0]?.count || 0,
      waitingForOthers: facet.waitingForOthers?.[0]?.count || 0,
      expiringSoon: facet.expiringSoon?.[0]?.count || 0,
      completed: counts[SIGNATURE_REQUEST_STATUS.COMPLETED] || 0,
      expiringSoonWindowDays: EXPIRING_SOON_WINDOW_DAYS,
    };

    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      total,
      page,
      limit,
      counts,
      summary,
      requests: requests.map((request) => serializeRequest(request, { includeLink: true, portalOrigin })),
    });
  } catch (error) {
    serverError(res, error, "listSignatureRequests failed");
  }
}

export async function downloadSignedPdf(req, res) {
  try {
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    if (!request.signedPdf?.buffer) {
      const hasSignature = (request.signers || []).some(
        (signer) => signer.status === SIGNER_STATUS.SIGNED
      );
      if (!hasSignature) {
        return badRequest(res, "No signatures have been collected yet");
      }
      await refreshSignedPdf(request, actorOf(req));
      await request.save();
    }

    if (!request.signedPdf?.buffer) {
      return notFound(res, "The signed PDF could not be generated");
    }

    const safeTitle = (request.agreementTitle || "agreement")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeTitle}_signed.pdf"`,
      "Content-Length": request.signedPdf.buffer.length.toString(),
      "X-Envelope-Id": request.envelopeId,
      "X-Document-Sha256": request.signedPdf.sha256 || "",
      "Cache-Control": "no-store",
    });
    res.send(request.signedPdf.buffer);
  } catch (error) {
    serverError(res, error, "downloadSignedPdf failed");
  }
}

export async function regenerateSignedPdf(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const agreement = await loadAgreementForSignature(agreementId);
    if (!agreement) return notFound(res, "Agreement not found");

    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    const actor = actorOf(req);
    const built = await finalizeSignedPdf(request, actor);
    if (!built) {
      return badRequest(res, "The source document is not available to sign");
    }
    await request.save();

    const pinnedVersion = await resolvePinnedVersion(request);
    const latestVersion = await resolveLatestVersion(agreementId);

    res.json(
      buildRequestResponse(request, agreement, pinnedVersion, latestVersion, {
        includeLink: true,
        portalOrigin,
      })
    );
  } catch (error) {
    serverError(res, error, "regenerateSignedPdf failed");
  }
}

export async function downloadPublicSignedPdf(req, res) {
  try {
    const { token } = req.params;
    const request = await loadRequestByToken(token);
    if (!request) return notFound(res, "This signing link is no longer valid");

    const signer = findSignerByToken(request, token);
    if (!signer || tokenExpired(signer)) {
      return notFound(res, "This signing link is no longer valid");
    }
    if (!request.signedPdf?.buffer) {
      return notFound(res, "The signed copy is not ready yet");
    }

    const safeTitle = (request.agreementTitle || "agreement")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeTitle}_signed.pdf"`,
      "Content-Length": request.signedPdf.buffer.length.toString(),
      "Cache-Control": "no-store",
    });
    res.send(request.signedPdf.buffer);
  } catch (error) {
    serverError(res, error, "downloadPublicSignedPdf failed");
  }
}

function findSignerByReceipt(request, receipt) {
  return (request.signers || []).find((entry) => entry.receiptToken === receipt);
}

function receiptExpired(signer) {
  return (
    !signer.receiptExpiresAt ||
    new Date(signer.receiptExpiresAt).getTime() < Date.now()
  );
}

async function loadReceipt(res, receipt) {
  if (!receipt || typeof receipt !== "string" || receipt.length < 32) {
    notFound(res, "This download link is no longer valid");
    return null;
  }

  const request = await SignatureRequest.findByReceiptToken(receipt);
  const signer = request ? findSignerByReceipt(request, receipt) : null;
  if (!request || !signer) {
    notFound(res, "This download link is no longer valid");
    return null;
  }

  if (receiptExpired(signer)) {
    res.status(410).json({
      success: false,
      error: "receipt_expired",
      detail: "This download link has expired.",
    });
    return null;
  }

  return { request, signer };
}

export async function getReceiptContext(req, res) {
  try {
    const loaded = await loadReceipt(res, req.params.receipt);
    if (!loaded) return;

    const { request, signer } = loaded;
    const signedCount = request.signers.filter(
      (entry) => entry.status === SIGNER_STATUS.SIGNED
    ).length;

    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      agreementTitle: request.agreementTitle,
      documentLabel: request.versionLabel || "Agreement PDF",
      requestStatus: request.status,
      envelopeId: request.envelopeId || "",
      totalSigners: request.signers.length,
      signedCount,
      signedPdfAvailable: !!request.signedPdf?.buffer,
      receiptExpiresAt: signer.receiptExpiresAt,
      signer: {
        name: signer.name,
        role: signer.role,
        placement: signer.placement || "",
        signedAt: signer.signedAt || null,
        signatureId: signer.signatureId || null,
      },
    });
  } catch (error) {
    serverError(res, error, "getReceiptContext failed");
  }
}

export async function downloadReceiptSignedPdf(req, res) {
  try {
    const loaded = await loadReceipt(res, req.params.receipt);
    if (!loaded) return;

    const { request } = loaded;
    if (!request.signedPdf?.buffer) {
      return notFound(res, "The signed copy is not ready yet");
    }

    const safeTitle = (request.agreementTitle || "agreement")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeTitle}_signed.pdf"`,
      "Content-Length": request.signedPdf.buffer.length.toString(),
      "Cache-Control": "no-store",
      "X-Envelope-Id": request.envelopeId || "",
    });
    res.send(request.signedPdf.buffer);
  } catch (error) {
    serverError(res, error, "downloadReceiptSignedPdf failed");
  }
}

export async function getSignatureRequest(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const agreement = await loadAgreementForSignature(agreementId);
    if (!agreement) return notFound(res, "Agreement not found");

    const actor = actorOf(req);
    const { request, latestVersion } = await ensureSignatureRequest(agreement, actor);
    const pinnedVersion = await resolvePinnedVersion(request);

    res.setHeader("Cache-Control", "no-store");
    res.json(
      buildRequestResponse(request, agreement, pinnedVersion, latestVersion, {
        includeLink: true,
        portalOrigin,
      })
    );
  } catch (error) {
    serverError(res, error, "getSignatureRequest failed");
  }
}

export async function syncToLatestVersion(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const agreement = await loadAgreementForSignature(agreementId);
    if (!agreement) return notFound(res, "Agreement not found");

    const actor = actorOf(req);
    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    const latestVersion = await resolveLatestVersion(agreementId);
    if (!latestVersion) {
      return badRequest(res, "This agreement has no version PDF to sign");
    }

    request.versionId = latestVersion._id;
    request.versionNumber = latestVersion.versionNumber;
    request.versionLabel =
      latestVersion.versionLabel || `Version ${latestVersion.versionNumber}`;
    request.updatedBy = actor;

    for (const signer of request.signers) {
      signer.status = SIGNER_STATUS.PENDING;
      signer.signedAt = null;
      signer.signedBy = null;
      signer.signedVia = null;
      signer.signatureMethod = null;
      signer.signatureImage = null;
      signer.typedName = "";
      signer.typedFontFamily = "";
      signer.consentAccepted = false;
      signer.location = { source: "none" };
      signer.declinedAt = null;
      signer.declineReason = "";
      signer.token = null;
      signer.tokenExpiresAt = null;
      signer.receiptToken = null;
      signer.receiptExpiresAt = null;
    }

    request.completedAt = null;
    request.signedPdf = { stale: false };
    request.recordEvent(SIGNATURE_EVENT.VERSION_SYNCED, {
      actor,
      detail: `Re-pinned to ${request.versionLabel}; collected signatures reset`,
    });
    request.recalculateStatus();
    await request.save();

    logger.info(
      `Signature request for agreement ${agreementId} re-pinned to version ${latestVersion.versionNumber} by ${actor}`
    );

    const pinnedVersion = await resolvePinnedVersion(request);
    res.json(
      buildRequestResponse(request, agreement, pinnedVersion, latestVersion, {
        includeLink: true,
        portalOrigin,
      })
    );
  } catch (error) {
    serverError(res, error, "syncToLatestVersion failed");
  }
}

export async function addSigner(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId } = req.params;
    const { name, email, title, role, placement } = req.body || {};

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }
    if (!name || !String(name).trim()) {
      return badRequest(res, "Signer name is required");
    }
    if (role && !Object.values(SIGNER_ROLE).includes(role)) {
      return badRequest(res, "Unknown signer role");
    }

    const agreement = await loadAgreementForSignature(agreementId);
    if (!agreement) return notFound(res, "Agreement not found");

    const actor = actorOf(req);
    const { request } = await ensureSignatureRequest(agreement, actor);

    const nextOrder = request.signers.reduce(
      (max, signer) => Math.max(max, signer.order ?? 0),
      -1
    );

    request.signers.push({
      name: String(name).trim(),
      email: email ? String(email).trim().toLowerCase() : "",
      title: title ? String(title).trim() : "",
      role: role || SIGNER_ROLE.OTHER,
      placement: placement ? String(placement).trim() : "Additional Signature",
      order: nextOrder + 1,
      status: SIGNER_STATUS.PENDING,
      addedBy: actor,
    });

    request.updatedBy = actor;
    request.recordEvent(SIGNATURE_EVENT.SIGNER_ADDED, {
      actor,
      signerName: String(name).trim(),
      detail: placement ? String(placement).trim() : "Additional Signature",
    });
    request.recalculateStatus();
    await refreshSignedPdf(request, actor);
    await request.save();

    const pinnedVersion = await resolvePinnedVersion(request);
    const latestVersion = await resolveLatestVersion(agreementId);

    res.status(201).json(
      buildRequestResponse(request, agreement, pinnedVersion, latestVersion, {
        includeLink: true,
        portalOrigin,
      })
    );
  } catch (error) {
    serverError(res, error, "addSigner failed");
  }
}

export async function updateSigner(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId, signerId } = req.params;
    const { name, email, title, role, placement, order } = req.body || {};

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const agreement = await loadAgreementForSignature(agreementId);
    if (!agreement) return notFound(res, "Agreement not found");

    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    const signer = request.signers.id(signerId);
    if (!signer) return notFound(res, "Signer not found");

    if (signer.status === SIGNER_STATUS.SIGNED) {
      return badRequest(res, "A signer who has already signed cannot be edited");
    }

    if (name !== undefined) {
      if (!String(name).trim()) return badRequest(res, "Signer name is required");
      signer.name = String(name).trim();
    }
    if (email !== undefined) signer.email = String(email).trim().toLowerCase();
    if (title !== undefined) signer.title = String(title).trim();
    if (placement !== undefined) signer.placement = String(placement).trim();
    if (role !== undefined) {
      if (!Object.values(SIGNER_ROLE).includes(role)) {
        return badRequest(res, "Unknown signer role");
      }
      signer.role = role;
    }
    if (order !== undefined && Number.isFinite(Number(order))) {
      signer.order = Number(order);
    }

    request.updatedBy = actorOf(req);
    await request.save();

    const pinnedVersion = await resolvePinnedVersion(request);
    const latestVersion = await resolveLatestVersion(agreementId);

    res.json(
      buildRequestResponse(request, agreement, pinnedVersion, latestVersion, {
        includeLink: true,
        portalOrigin,
      })
    );
  } catch (error) {
    serverError(res, error, "updateSigner failed");
  }
}

export async function removeSigner(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId, signerId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const agreement = await loadAgreementForSignature(agreementId);
    if (!agreement) return notFound(res, "Agreement not found");

    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    const signer = request.signers.id(signerId);
    if (!signer) return notFound(res, "Signer not found");

    if (signer.status === SIGNER_STATUS.SIGNED) {
      return badRequest(res, "A signer who has already signed cannot be removed");
    }

    const removedName = signer.name;
    signer.deleteOne();
    request.updatedBy = actorOf(req);
    request.recordEvent(SIGNATURE_EVENT.SIGNER_REMOVED, {
      actor: actorOf(req),
      signerName: removedName,
    });
    request.recalculateStatus();
    await refreshSignedPdf(request, actorOf(req));
    await request.save();

    const pinnedVersion = await resolvePinnedVersion(request);
    const latestVersion = await resolveLatestVersion(agreementId);

    res.json(
      buildRequestResponse(request, agreement, pinnedVersion, latestVersion, {
        includeLink: true,
        portalOrigin,
      })
    );
  } catch (error) {
    serverError(res, error, "removeSigner failed");
  }
}

export async function sendSignerInvite(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId, signerId } = req.params;
    const { email } = req.body || {};

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const agreement = await loadAgreementForSignature(agreementId);
    if (!agreement) return notFound(res, "Agreement not found");

    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    const signer = request.signers.id(signerId);
    if (!signer) return notFound(res, "Signer not found");

    if (signer.status === SIGNER_STATUS.SIGNED) {
      return badRequest(res, "This signer has already signed");
    }

    if (email) signer.email = String(email).trim().toLowerCase();
    if (!signer.email) {
      return badRequest(res, "Add an email address for this signer first");
    }
    if (!request.versionId) {
      return badRequest(res, "This agreement has no version PDF to sign");
    }

    const actor = actorOf(req);
    const token = SignatureRequest.generateToken();

    signer.token = token;
    signer.tokenExpiresAt = SignatureRequest.tokenExpiry();
    signer.invitedAt = new Date();
    signer.invitedBy = actor;
    signer.inviteCount = (signer.inviteCount || 0) + 1;
    if (signer.status === SIGNER_STATUS.PENDING) {
      signer.status = SIGNER_STATUS.SENT;
    }

    const result = await sendSignatureInvite({
      signer,
      agreementTitle: request.agreementTitle,
      versionLabel: request.versionLabel,
      senderName: actor,
      token,
      portalOrigin,
    });

    if (!result?.success) {
      return res.status(502).json({
        success: false,
        error: "email_failed",
        detail: result?.error || "Unable to send the signing invitation",
      });
    }

    request.updatedBy = actor;
    request.recordEvent(SIGNATURE_EVENT.INVITE_SENT, {
      actor,
      signerId: signer._id,
      signerName: signer.name,
      detail: `Secure link emailed to ${signer.email}`,
    });
    request.recalculateStatus();
    await request.save();

    logger.info(
      `Signing invitation sent to ${signer.email} for agreement ${agreementId} by ${actor}`
    );

    res.json({
      success: true,
      signer: serializeSigner(signer, { includeLink: true, portalOrigin }),
      signingUrl: buildSigningUrl(token, portalOrigin),
    });
  } catch (error) {
    serverError(res, error, "sendSignerInvite failed");
  }
}

export async function createSignerLink(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId, signerId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    const signer = request.signers.id(signerId);
    if (!signer) return notFound(res, "Signer not found");

    if (signer.status === SIGNER_STATUS.SIGNED) {
      return badRequest(res, "This signer has already signed");
    }
    if (!request.versionId) {
      return badRequest(res, "This agreement has no version PDF to sign");
    }

    const actor = actorOf(req);
    const token = SignatureRequest.generateToken();

    signer.token = token;
    signer.tokenExpiresAt = SignatureRequest.tokenExpiry();

    request.updatedBy = actor;
    request.recordEvent(SIGNATURE_EVENT.INVITE_SENT, {
      actor,
      signerId: signer._id,
      signerName: signer.name,
      detail: "Signing link generated for manual sharing (not emailed)",
    });
    await request.save();

    logger.info(
      `Signing link generated for ${signer.name} on agreement ${agreementId} by ${actor}`
    );

    res.json({
      success: true,
      signer: serializeSigner(signer, { includeLink: true, portalOrigin }),
      signingUrl: buildSigningUrl(token, portalOrigin),
    });
  } catch (error) {
    serverError(res, error, "createSignerLink failed");
  }
}

export async function revokeSignerLink(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId, signerId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    const signer = request.signers.id(signerId);
    if (!signer) return notFound(res, "Signer not found");

    signer.token = null;
    signer.tokenExpiresAt = null;
    if (signer.status === SIGNER_STATUS.SENT) {
      signer.status = SIGNER_STATUS.PENDING;
    }

    request.updatedBy = actorOf(req);
    request.recordEvent(SIGNATURE_EVENT.LINK_REVOKED, {
      actor: actorOf(req),
      signerId: signer._id,
      signerName: signer.name,
    });
    await request.save();

    res.json({ success: true, signer: serializeSigner(signer, { includeLink: true, portalOrigin }) });
  } catch (error) {
    serverError(res, error, "revokeSignerLink failed");
  }
}

async function applySignature(request, signer, payload, req, signedVia, signedBy) {
  const { method, signatureImage, typedName, typedFontFamily, consentAccepted, printedName } =
    payload || {};

  const resolvedPrintedName = String(printedName || "").trim();
  if (!resolvedPrintedName) {
    throw Object.assign(new Error("Enter the full legal name to print on the agreement"), {
      statusCode: 400,
    });
  }

  if (!consentAccepted) {
    throw Object.assign(
      new Error("Consent to sign electronically is required"),
      { statusCode: 400 }
    );
  }

  if (!Object.values(SIGNATURE_METHOD).includes(method)) {
    throw Object.assign(new Error("Signature method must be draw or type"), {
      statusCode: 400,
    });
  }

  if (method === SIGNATURE_METHOD.DRAW) {
    const decoded = decodeSignatureImage(signatureImage);
    if (!decoded) {
      throw Object.assign(new Error("A drawn signature image is required"), {
        statusCode: 400,
      });
    }
    signer.signatureImage = decoded.buffer;
    signer.signatureImageContentType = decoded.contentType;
    signer.typedName = "";
    signer.typedFontFamily = "";
  } else {
    const trimmed = String(typedName || "").trim();
    if (!trimmed) {
      throw Object.assign(new Error("Type your full name to sign"), {
        statusCode: 400,
      });
    }
    signer.typedName = trimmed;
    signer.typedFontFamily = String(typedFontFamily || "").trim();

    const decoded = decodeSignatureImage(signatureImage);
    if (decoded) {
      signer.signatureImage = decoded.buffer;
      signer.signatureImageContentType = decoded.contentType;
    } else {
      signer.signatureImage = null;
    }
  }

  signer.signatureMethod = method;
  signer.printedName = resolvedPrintedName;
  signer.consentAccepted = true;
  signer.status = SIGNER_STATUS.SIGNED;
  signer.signedAt = new Date();
  signer.signedVia = signedVia;
  signer.signedBy = signedBy;
  signer.declinedAt = null;
  signer.declineReason = "";
  signer.location = await resolveSignatureLocation(payload?.location);
  signer.ipAddress = extractClientIp(req);
  signer.userAgent = String(req.headers["user-agent"] || "").slice(0, 400);
  signer.token = null;
  signer.tokenExpiresAt = null;
  signer.receiptToken = SignatureRequest.generateToken();
  signer.receiptExpiresAt = SignatureRequest.receiptExpiry();
  signer.signatureId = signer.signatureId || SignatureRequest.generateSignatureId();

  const previousStatus = request.status;
  request.recalculateStatus();

  request.recordEvent(SIGNATURE_EVENT.SIGNED, {
    actor: signedBy,
    signerId: signer._id,
    signerName: signer.name,
    ipAddress: signer.ipAddress,
    detail: `${method === SIGNATURE_METHOD.DRAW ? "Drawn" : "Typed"} signature via ${
      signedVia === SIGNED_VIA.REMOTE_LINK ? "emailed link" : "in person"
    }`,
  });

  if (
    request.status === SIGNATURE_REQUEST_STATUS.COMPLETED &&
    previousStatus !== SIGNATURE_REQUEST_STATUS.COMPLETED
  ) {
    request.recordEvent(SIGNATURE_EVENT.COMPLETED, {
      actor: signedBy,
      detail: `All ${request.signers.length} signatures collected`,
    });
    sendCompletionNotification({ request }).catch((error) =>
      logger.warn(`Completion notification failed: ${error.message}`)
    );
  }

  await refreshSignedPdf(request, signedBy);
}

export async function signInPerson(req, res) {
  try {
    const portalOrigin = resolvePortalOrigin(req);
    const { agreementId, signerId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const agreement = await loadAgreementForSignature(agreementId);
    if (!agreement) return notFound(res, "Agreement not found");

    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    if (request.status === SIGNATURE_REQUEST_STATUS.CANCELLED) {
      return badRequest(res, "This signature request has been cancelled");
    }

    const signer = request.signers.id(signerId);
    if (!signer) return notFound(res, "Signer not found");
    if (signer.status === SIGNER_STATUS.SIGNED) {
      return badRequest(res, "This signer has already signed");
    }
    if (signer.status === SIGNER_STATUS.DECLINED) {
      return badRequest(
        res,
        "This signer declined. Clear the decline before collecting a signature."
      );
    }

    const actor = actorOf(req);
    await applySignature(request, signer, req.body, req, SIGNED_VIA.IN_PERSON, actor);

    request.updatedBy = actor;
    await request.save();

    logger.info(
      `Signer ${signer.name} signed agreement ${agreementId} in person (witnessed by ${actor})`
    );

    const pinnedVersion = await resolvePinnedVersion(request);
    const latestVersion = await resolveLatestVersion(agreementId);

    res.json(
      buildRequestResponse(request, agreement, pinnedVersion, latestVersion, {
        includeLink: true,
        portalOrigin,
      })
    );
  } catch (error) {
    if (error.statusCode === 400) return badRequest(res, error.message);
    serverError(res, error, "signInPerson failed");
  }
}

export async function getSignerImage(req, res) {
  try {
    const { agreementId, signerId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const request = await SignatureRequest.findOne({ agreementId }).select("signers");
    if (!request) return notFound(res, "Signature request not found");

    const signer = request.signers.id(signerId);
    if (!signer) return notFound(res, "Signer not found");
    if (!signer.signatureImage) return notFound(res, "No drawn signature on file");

    res.set({
      "Content-Type": signer.signatureImageContentType || "image/png",
      "Content-Length": signer.signatureImage.length.toString(),
      "Cache-Control": "private, max-age=300",
    });
    res.send(signer.signatureImage);
  } catch (error) {
    serverError(res, error, "getSignerImage failed");
  }
}

async function loadRequestByToken(token) {
  if (!token || typeof token !== "string" || token.length < 32) return null;
  return await SignatureRequest.findOne({ "signers.token": token });
}

function findSignerByToken(request, token) {
  return (request.signers || []).find((signer) => signer.token === token);
}

function tokenExpired(signer) {
  return (
    !!signer.tokenExpiresAt &&
    new Date(signer.tokenExpiresAt).getTime() < Date.now()
  );
}

export async function getPublicSigningContext(req, res) {
  try {
    const { token } = req.params;
    const request = await loadRequestByToken(token);
    if (!request) return notFound(res, "This signing link is no longer valid");

    const signer = findSignerByToken(request, token);
    if (!signer) return notFound(res, "This signing link is no longer valid");
    if (tokenExpired(signer)) {
      return res.status(410).json({
        success: false,
        error: "link_expired",
        detail: "This signing link has expired. Ask your EnviroMaster contact to resend it.",
      });
    }
    if (request.status === SIGNATURE_REQUEST_STATUS.CANCELLED) {
      return res.status(410).json({
        success: false,
        error: "cancelled",
        detail: "This signature request has been cancelled.",
      });
    }

    const signedCount = request.signers.filter(
      (entry) => entry.status === SIGNER_STATUS.SIGNED
    ).length;

    if (!signer.viewedAt && signer.status !== SIGNER_STATUS.SIGNED) {
      signer.viewedAt = new Date();
      request.recordEvent(SIGNATURE_EVENT.VIEWED, {
        actor: signer.name,
        signerId: signer._id,
        signerName: signer.name,
        ipAddress: extractClientIp(req),
        detail: "Opened the signing link",
      });
      try {
        await request.save();
      } catch (error) {
        logger.warn(`Could not record view for ${signer.name}: ${error.message}`);
      }
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      agreementTitle: request.agreementTitle,
      documentLabel: request.versionLabel || "Agreement PDF",
      requestStatus: request.status,
      totalSigners: request.signers.length,
      signedCount,
      signer: {
        id: String(signer._id),
        name: signer.name,
        email: signer.email || "",
        title: signer.title || "",
        role: signer.role,
        placement: signer.placement || "",
        status: signer.status,
        signedAt: signer.signedAt || null,
      },
    });
  } catch (error) {
    serverError(res, error, "getPublicSigningContext failed");
  }
}

export async function downloadPublicPdf(req, res) {
  try {
    const { token } = req.params;
    const request = await loadRequestByToken(token);
    if (!request) return notFound(res, "This signing link is no longer valid");

    const signer = findSignerByToken(request, token);
    if (!signer || tokenExpired(signer)) {
      return notFound(res, "This signing link is no longer valid");
    }

    if (request.signedPdf?.buffer) {
      const safeName = (request.agreementTitle || "agreement")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .slice(0, 80);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeName}.pdf"`,
        "Content-Length": request.signedPdf.buffer.length.toString(),
        "X-Signed-Copy": "true",
        "Cache-Control": "no-store",
      });
      return res.send(request.signedPdf.buffer);
    }

    if (request.versionId) {
      const version = await VersionPdf.findById(request.versionId).select(
        "fileName pdf_meta.pdfBuffer pdf_meta.contentType"
      );
      if (!version?.pdf_meta?.pdfBuffer) {
        return notFound(res, "The document is not available for signing");
      }
      res.set({
        "Content-Type": version.pdf_meta.contentType || "application/pdf",
        "Content-Disposition": `inline; filename="${version.fileName || "agreement.pdf"}"`,
        "Content-Length": version.pdf_meta.pdfBuffer.length.toString(),
        "Cache-Control": "no-store",
      });
      return res.send(version.pdf_meta.pdfBuffer);
    }

    const agreement = await CustomerHeaderDoc.findById(request.agreementId).select(
      "pdf_meta.pdfBuffer pdf_meta.contentType payload.headerTitle"
    );
    if (!agreement?.pdf_meta?.pdfBuffer) {
      return notFound(res, "The document is not available for signing");
    }

    const fileName = `${agreement.payload?.headerTitle || "agreement"}.pdf`.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    res.set({
      "Content-Type": agreement.pdf_meta.contentType || "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Content-Length": agreement.pdf_meta.pdfBuffer.length.toString(),
      "Cache-Control": "no-store",
    });
    res.send(agreement.pdf_meta.pdfBuffer);
  } catch (error) {
    serverError(res, error, "downloadPublicPdf failed");
  }
}

export async function signWithToken(req, res) {
  try {
    const { token } = req.params;
    const request = await loadRequestByToken(token);
    if (!request) return notFound(res, "This signing link is no longer valid");

    const signer = findSignerByToken(request, token);
    if (!signer) return notFound(res, "This signing link is no longer valid");
    if (tokenExpired(signer)) {
      return res.status(410).json({
        success: false,
        error: "link_expired",
        detail: "This signing link has expired.",
      });
    }
    if (signer.status === SIGNER_STATUS.SIGNED) {
      return badRequest(res, "You have already signed this document");
    }
    if (request.status === SIGNATURE_REQUEST_STATUS.CANCELLED) {
      return badRequest(res, "This signature request has been cancelled");
    }

    await applySignature(
      request,
      signer,
      req.body,
      req,
      SIGNED_VIA.REMOTE_LINK,
      signer.name
    );

    request.updatedBy = signer.name;
    await request.save();

    logger.info(
      `Signer ${signer.name} signed agreement ${request.agreementId} via remote link`
    );

    res.json({
      success: true,
      signedAt: signer.signedAt,
      requestStatus: request.status,
      location: serializeSigner(signer).location,
      receiptToken: signer.receiptToken,
      receiptExpiresAt: signer.receiptExpiresAt,
      signedPdfAvailable: !!request.signedPdf?.buffer,
      signatureId: signer.signatureId,
      envelopeId: request.envelopeId || "",
    });
  } catch (error) {
    if (error.statusCode === 400) return badRequest(res, error.message);
    serverError(res, error, "signWithToken failed");
  }
}

export async function declineWithToken(req, res) {
  try {
    const { token } = req.params;
    const { reason } = req.body || {};

    const request = await loadRequestByToken(token);
    if (!request) return notFound(res, "This signing link is no longer valid");

    const signer = findSignerByToken(request, token);
    if (!signer) return notFound(res, "This signing link is no longer valid");
    if (signer.status === SIGNER_STATUS.SIGNED) {
      return badRequest(res, "You have already signed this document");
    }

    signer.status = SIGNER_STATUS.DECLINED;
    signer.declinedAt = new Date();
    signer.declineReason = String(reason || "").slice(0, 500);
    signer.token = null;
    signer.tokenExpiresAt = null;
    signer.ipAddress = extractClientIp(req);

    request.recordEvent(SIGNATURE_EVENT.DECLINED, {
      actor: signer.name,
      signerId: signer._id,
      signerName: signer.name,
      ipAddress: signer.ipAddress,
      detail: signer.declineReason,
    });
    request.recalculateStatus();
    await request.save();

    logger.info(
      `Signer ${signer.name} declined to sign agreement ${request.agreementId}`
    );

    sendDeclineNotification({ request, signer }).catch((error) =>
      logger.warn(`Decline notification failed: ${error.message}`)
    );

    res.json({ success: true, declinedAt: signer.declinedAt });
  } catch (error) {
    serverError(res, error, "declineWithToken failed");
  }
}

export async function resetSigner(req, res) {
  try {
    const { agreementId, signerId } = req.params;
    const portalOrigin = resolvePortalOrigin(req);

    if (!mongoose.isValidObjectId(agreementId)) {
      return badRequest(res, "Invalid agreement ID format");
    }

    const agreement = await loadAgreementForSignature(agreementId);
    if (!agreement) return notFound(res, "Agreement not found");

    const request = await SignatureRequest.findOne({ agreementId });
    if (!request) return notFound(res, "Signature request not found");

    const signer = request.signers.id(signerId);
    if (!signer) return notFound(res, "Signer not found");

    if (signer.status !== SIGNER_STATUS.DECLINED) {
      return badRequest(res, "Only a declined signer can be reset");
    }

    const actor = actorOf(req);

    signer.status = SIGNER_STATUS.PENDING;
    signer.declinedAt = null;
    signer.declineReason = "";
    signer.viewedAt = null;
    signer.token = null;
    signer.tokenExpiresAt = null;
    signer.receiptToken = null;
    signer.receiptExpiresAt = null;

    request.updatedBy = actor;
    request.recordEvent(SIGNATURE_EVENT.SIGNER_UPDATED, {
      actor,
      signerId: signer._id,
      signerName: signer.name,
      detail: "Decline cleared — signer can be asked again",
    });
    request.recalculateStatus();
    await request.save();

    logger.info(
      `Decline reset for ${signer.name} on agreement ${agreementId} by ${actor}`
    );

    const pinnedVersion = await resolvePinnedVersion(request);
    const latestVersion = await resolveLatestVersion(agreementId);

    res.json(
      buildRequestResponse(request, agreement, pinnedVersion, latestVersion, {
        includeLink: true,
        portalOrigin,
      })
    );
  } catch (error) {
    serverError(res, error, "resetSigner failed");
  }
}
