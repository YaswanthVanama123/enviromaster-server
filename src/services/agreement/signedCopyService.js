import SignatureRequest from "../../models/agreement/SignatureRequest.model.js";
import { SIGNER_STATUS } from "../../models/agreement/SignatureRequest.model.js";
import logger from "../../utils/logger.js";

function hasCollectedSignature(request) {
  return (request?.signers || []).some(
    (signer) => signer.status === SIGNER_STATUS.SIGNED
  );
}

export async function resolveSignedCopy({ agreementId, versionId = null }) {
  if (!agreementId) return null;

  try {
    const request = await SignatureRequest.findOne({ agreementId }).select(
      "versionId signedPdf.buffer signedPdf.sizeBytes signedPdf.sha256 signers.status envelopeId"
    );

    if (!request?.signedPdf?.buffer) return null;
    if (!hasCollectedSignature(request)) return null;

    const pinned = request.versionId ? String(request.versionId) : null;
    const requested = versionId ? String(versionId) : null;
    if (pinned !== requested) return null;

    return {
      buffer: Buffer.from(request.signedPdf.buffer),
      sha256: request.signedPdf.sha256 || null,
      envelopeId: request.envelopeId || null,
    };
  } catch (error) {
    logger.warn(
      `Could not resolve signed copy for agreement ${agreementId}: ${error.message}`
    );
    return null;
  }
}

export function sendSignedCopy(res, signed, fileName) {
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Content-Length": signed.buffer.length.toString(),
    "X-Signed-Copy": "true",
    "X-Envelope-Id": signed.envelopeId || "",
    "X-Document-Sha256": signed.sha256 || "",
  });
  res.send(signed.buffer);
}

export default { resolveSignedCopy, sendSignedCopy };
