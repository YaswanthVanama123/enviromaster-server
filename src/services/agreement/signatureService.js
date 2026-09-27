import { VersionPdf } from "../../models/agreement/index.js";
import {
  SIGNER_ROLE,
  SIGNER_STATUS,
  SIGNATURE_TOKEN_TTL_DAYS,
} from "../../models/agreement/SignatureRequest.model.js";
import { reverseGeocode } from "../sync/mapboxService.js";
import { sendEmail } from "./emailService.js";
import logger from "../../utils/logger.js";

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/;
const MAX_SIGNATURE_IMAGE_BYTES = Number(
  process.env.SIGNATURE_IMAGE_MAX_BYTES || 2 * 1024 * 1024
);

const FALLBACK_PORTAL_URL = "http://localhost:5173";
let warnedAboutPortalFallback = false;

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function allowedPortalOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => trimTrailingSlash(origin.trim()))
    .filter(Boolean);
}

export function isAllowedPortalOrigin(origin) {
  const candidate = trimTrailingSlash(origin);
  if (!candidate) return false;
  return allowedPortalOrigins().includes(candidate);
}

export function getSigningPortalBaseUrl(preferredOrigin) {
  if (isAllowedPortalOrigin(preferredOrigin)) {
    return trimTrailingSlash(preferredOrigin);
  }

  const explicit = process.env.SIGNING_PORTAL_URL;
  if (explicit) return trimTrailingSlash(explicit);

  const allowed = allowedPortalOrigins();
  if (allowed.length > 0) {
    if (!warnedAboutPortalFallback) {
      warnedAboutPortalFallback = true;
      logger.warn(
        `SIGNING_PORTAL_URL is not set — signing links will use "${allowed[0]}". ` +
          "This must be the origin that serves the web app, not a marketing site, " +
          "or signers will get a 404."
      );
    }
    return allowed[0];
  }

  return FALLBACK_PORTAL_URL;
}

export function resolvePortalOrigin(req) {
  const fromBody = req?.body?.portalOrigin;
  if (isAllowedPortalOrigin(fromBody)) return trimTrailingSlash(fromBody);

  const fromHeader = req?.get?.("origin") || req?.headers?.origin;
  if (isAllowedPortalOrigin(fromHeader)) return trimTrailingSlash(fromHeader);

  return null;
}

export function buildSigningUrl(token, preferredOrigin) {
  return `${getSigningPortalBaseUrl(preferredOrigin)}/sign/${token}`;
}

export async function resolveLatestVersion(agreementId) {
  return await VersionPdf.findOne({
    agreementId,
    isDeleted: { $ne: true },
    status: { $ne: "archived" },
  })
    .sort({ versionNumber: -1 })
    .select("_id versionNumber versionLabel fileName pdf_meta.sizeBytes createdAt createdBy status")
    .lean();
}

export function seedSignersFromAgreement(agreement, addedBy) {
  const serviceAgreement = agreement?.payload?.serviceAgreement || {};
  const seeds = [];

  const customerName =
    (serviceAgreement.customerContactName || "").trim() ||
    (agreement?.payload?.headerTitle || "").trim();

  seeds.push({
    name: customerName || "Customer",
    email: "",
    title: serviceAgreement.customerContactLabel || "Customer Contact",
    role: SIGNER_ROLE.CUSTOMER,
    placement: serviceAgreement.customerSignatureLabel
      ? `Customer — ${serviceAgreement.customerSignatureLabel.replace(/:$/, "")}`
      : "Customer Signature",
    order: 0,
    status: SIGNER_STATUS.PENDING,
    addedBy: addedBy || null,
  });

  seeds.push({
    name: (serviceAgreement.emFranchisee || "").trim() || "EnviroMaster Franchisee",
    email: "",
    title: serviceAgreement.emFranchiseeLabel
      ? serviceAgreement.emFranchiseeLabel.replace(/:$/, "")
      : "EM Franchisee",
    role: SIGNER_ROLE.EM_FRANCHISEE,
    placement: serviceAgreement.emSignatureLabel
      ? `EM Franchisee — ${serviceAgreement.emSignatureLabel.replace(/:$/, "")}`
      : "EM Franchisee Signature",
    order: 1,
    status: SIGNER_STATUS.PENDING,
    addedBy: addedBy || null,
  });

  return seeds;
}

export function decodeSignatureImage(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;

  const match = dataUrl.match(DATA_URL_PATTERN);
  if (!match) {
    throw new Error("Signature image must be a base64 data URL");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) {
    throw new Error("Signature image is empty");
  }
  if (buffer.length > MAX_SIGNATURE_IMAGE_BYTES) {
    throw new Error("Signature image is too large");
  }

  return { buffer, contentType: match[1] };
}

export function extractClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

export async function resolveSignatureLocation(rawLocation) {
  const latitude = Number(rawLocation?.latitude);
  const longitude = Number(rawLocation?.longitude);
  const hasCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;

  if (!hasCoordinates) {
    return {
      source: "none",
      latitude: null,
      longitude: null,
      accuracyMeters: null,
      address: "",
      city: "",
      region: "",
      postalCode: "",
      country: "",
      capturedAt: new Date(),
    };
  }

  const accuracyRaw = Number(rawLocation?.accuracyMeters);
  const location = {
    source: "gps",
    latitude,
    longitude,
    accuracyMeters: Number.isFinite(accuracyRaw) ? Math.round(accuracyRaw) : null,
    address: "",
    city: "",
    region: "",
    postalCode: "",
    country: "",
    capturedAt: new Date(),
  };

  try {
    const resolved = await reverseGeocode(longitude, latitude);
    location.address = resolved.address || "";
    location.city = resolved.city || "";
    location.region = resolved.region || "";
    location.postalCode = resolved.postalCode || "";
    location.country = resolved.country || "";
  } catch (error) {
    logger.warn(
      `Reverse geocoding failed for ${latitude},${longitude}: ${error.message}`
    );
  }

  return location;
}

export function serializeLocation(location) {
  if (!location) return null;

  const hasCoordinates =
    location.latitude !== null &&
    location.latitude !== undefined &&
    location.longitude !== null &&
    location.longitude !== undefined;

  if (!hasCoordinates && !location.address) return null;

  return {
    source: location.source || "none",
    latitude: hasCoordinates ? location.latitude : null,
    longitude: hasCoordinates ? location.longitude : null,
    accuracyMeters: location.accuracyMeters ?? null,
    address: location.address || "",
    city: location.city || "",
    region: location.region || "",
    postalCode: location.postalCode || "",
    country: location.country || "",
    capturedAt: location.capturedAt || null,
    mapUrl: hasCoordinates
      ? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
      : null,
  };
}

export function serializeSigner(signer, options = {}) {
  const { includeLink = false, portalOrigin = null } = options;
  const plain = typeof signer.toObject === "function" ? signer.toObject() : signer;

  const tokenIsLive =
    !!plain.token &&
    (!plain.tokenExpiresAt || new Date(plain.tokenExpiresAt).getTime() > Date.now());

  return {
    id: String(plain._id),
    signatureId: plain.signatureId || null,
    printedName: plain.printedName || "",
    name: plain.name,
    email: plain.email || "",
    title: plain.title || "",
    role: plain.role,
    placement: plain.placement || "",
    order: plain.order ?? 0,
    status: plain.status,
    signedAt: plain.signedAt || null,
    signedBy: plain.signedBy || null,
    signedVia: plain.signedVia || null,
    signatureMethod: plain.signatureMethod || null,
    typedName: plain.typedName || "",
    typedFontFamily: plain.typedFontFamily || "",
    hasSignatureImage: !!plain.signatureImage,
    consentAccepted: !!plain.consentAccepted,
    location: serializeLocation(plain.location),
    invitedAt: plain.invitedAt || null,
    invitedBy: plain.invitedBy || null,
    inviteCount: plain.inviteCount || 0,
    declinedAt: plain.declinedAt || null,
    declineReason: plain.declineReason || "",
    addedBy: plain.addedBy || null,
    linkActive: tokenIsLive,
    tokenExpiresAt: plain.tokenExpiresAt || null,
    signingUrl:
      includeLink && tokenIsLive ? buildSigningUrl(plain.token, portalOrigin) : null,
  };
}

export function serializeRequest(request, options = {}) {
  const signers = [...(request.signers || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  const signedCount = signers.filter(
    (signer) => signer.status === SIGNER_STATUS.SIGNED
  ).length;

  const signedPdf = request.signedPdf || {};

  return {
    id: String(request._id),
    agreementId: String(request.agreementId),
    agreementTitle: request.agreementTitle || "",
    envelopeId: request.envelopeId || "",
    signedPdf: {
      available: !!signedPdf.sha256 && (signedPdf.sizeBytes || 0) > 0,
      stale: !!signedPdf.stale,
      sizeBytes: signedPdf.sizeBytes || 0,
      pageCount: signedPdf.pageCount || 0,
      generatedAt: signedPdf.generatedAt || null,
      sha256: signedPdf.sha256 || null,
      sourceSha256: signedPdf.sourceSha256 || null,
    },
    versionId: request.versionId ? String(request.versionId) : null,
    versionNumber: request.versionNumber ?? null,
    versionLabel: request.versionLabel || "",
    status: request.status,
    signers: signers.map((signer) => serializeSigner(signer, options)),
    totalSigners: signers.length,
    signedCount,
    pendingCount: signers.length - signedCount,
    createdBy: request.createdBy || null,
    createdAt: request.createdAt || null,
    updatedAt: request.updatedAt || null,
    completedAt: request.completedAt || null,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendSignatureInvite({
  signer,
  agreementTitle,
  versionLabel,
  senderName,
  token,
  portalOrigin,
}) {
  if (!signer.email) {
    throw new Error("Signer has no email address");
  }

  const signingUrl = buildSigningUrl(token, portalOrigin);
  const safeName = escapeHtml(signer.name);
  const safeTitle = escapeHtml(agreementTitle || "Service Agreement");
  const safeVersion = escapeHtml(versionLabel || "");
  const safeSender = escapeHtml(senderName || "EnviroMaster");

  const body = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
      <p>Hello ${safeName},</p>
      <p>
        ${safeSender} has requested your electronic signature on
        <strong>${safeTitle}</strong>${safeVersion ? ` (${safeVersion})` : ""}.
      </p>
      <p style="margin:24px 0">
        <a href="${signingUrl}"
           style="background:#c00000;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;display:inline-block">
          Review &amp; Sign
        </a>
      </p>
      <p style="font-size:12px;color:#6b7280">
        This link is unique to you and expires in ${SIGNATURE_TOKEN_TTL_DAYS} days.
        If the button does not work, copy this address into your browser:<br />
        <span style="word-break:break-all">${signingUrl}</span>
      </p>
      <p style="font-size:12px;color:#6b7280">
        Your signature, the time you sign, and your device location (if you allow it)
        are recorded as part of the signing audit trail.
      </p>
    </div>
  `;

  return await sendEmail({
    to: signer.email,
    subject: `Signature requested: ${agreementTitle || "Service Agreement"}`,
    body,
  });
}

function ownerEmailFor() {
  const explicit = process.env.SIGNATURE_NOTIFY_EMAIL;
  if (explicit) return explicit;
  return process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER || null;
}

function notificationShell(heading, color, lines) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
      <p style="font-size:16px;font-weight:700;color:${color};margin:0 0 12px">${heading}</p>
      ${lines.map((line) => `<p style="margin:0 0 6px">${line}</p>`).join("")}
      <p style="font-size:12px;color:#6b7280;margin-top:20px">
        Open the agreement in EnviroMaster to review the full signing history.
      </p>
    </div>
  `;
}

export async function sendDeclineNotification({ request, signer }) {
  const to = ownerEmailFor();
  if (!to) {
    logger.warn("No notification address configured — decline notice not sent");
    return { success: false, error: "No notification address configured" };
  }

  const title = escapeHtml(request.agreementTitle || "Service Agreement");
  const body = notificationShell("A signer declined to sign", "#b91c1c", [
    `<strong>${escapeHtml(signer.name)}</strong> declined to sign <strong>${title}</strong>.`,
    signer.declineReason
      ? `Reason given: <em>${escapeHtml(signer.declineReason)}</em>`
      : "No reason was given.",
    `Signature place: ${escapeHtml(signer.placement || "Signature")}`,
    `Envelope: ${escapeHtml(request.envelopeId || "")}`,
  ]);

  return await sendEmail({
    to,
    subject: `Declined: ${request.agreementTitle || "Service Agreement"}`,
    body,
    fireAndForget: true,
  });
}

export async function sendCompletionNotification({ request }) {
  const to = ownerEmailFor();
  if (!to) {
    logger.warn("No notification address configured — completion notice not sent");
    return { success: false, error: "No notification address configured" };
  }

  const title = escapeHtml(request.agreementTitle || "Service Agreement");
  const signerLines = (request.signers || []).map(
    (signer) =>
      `• ${escapeHtml(signer.printedName || signer.name)} — ${
        signer.signedAt ? new Date(signer.signedAt).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—"
      }`
  );

  const body = notificationShell("All signatures collected", "#15803d", [
    `<strong>${title}</strong> is now fully signed.`,
    ...signerLines,
    `Envelope: ${escapeHtml(request.envelopeId || "")}`,
  ]);

  return await sendEmail({
    to,
    subject: `Fully signed: ${request.agreementTitle || "Service Agreement"}`,
    body,
    fireAndForget: true,
  });
}

export default {
  getSigningPortalBaseUrl,
  allowedPortalOrigins,
  isAllowedPortalOrigin,
  resolvePortalOrigin,
  buildSigningUrl,
  resolveLatestVersion,
  seedSignersFromAgreement,
  decodeSignatureImage,
  extractClientIp,
  resolveSignatureLocation,
  serializeLocation,
  serializeSigner,
  serializeRequest,
  sendSignatureInvite,
  sendDeclineNotification,
  sendCompletionNotification,
};
