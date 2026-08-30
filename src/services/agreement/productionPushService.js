/**
 * Push to Production — transfers a single agreement "folder" from this
 * environment to the production environment over the production HTTP API.
 *
 * Transport rationale: production already exposes a backend bound to the
 * production database (https://pdfform.enviromasternva.com/api), so stage POSTs
 * the folder there instead of holding production DB credentials itself.
 *
 * A folder is the agreement plus everything hanging off it:
 *   CustomerHeaderDoc      — the agreement (payload + stored PDF buffer)
 *   VersionPdf[]           — every version PDF (by agreementId)
 *   ManualUploadDocument[] — files attached to the agreement
 *   VersionChangeLog[]     — price-change logs (by agreementId)
 *
 * Deliberate choices:
 *  - _id values are preserved and the receiver upserts, so pushing twice updates
 *    in place instead of duplicating.
 *  - ZohoMapping is NOT sent. Bigin/CRM deal + file IDs are environment specific;
 *    carrying stage IDs across would point production at stage deals.
 *  - Nothing is ever deleted on the receiving side.
 */

import mongoose from "mongoose";
import {
  CustomerHeaderDoc,
  VersionPdf,
  ManualUploadDocument,
} from "../../models/agreement/index.js";
import { VersionChangeLog } from "../../models/logging/index.js";
import logger from "../../utils/logger.js";

const DEFAULT_PRODUCTION_API_URL = "https://pdfform.enviromasternva.com/api";

export function getProductionApiUrl() {
  return (process.env.PRODUCTION_API_URL || DEFAULT_PRODUCTION_API_URL).replace(/\/+$/, "");
}

export function isProductionPushConfigured() {
  return Boolean(process.env.PRODUCTION_PUSH_TOKEN);
}

export function assertNotSelfTarget() {
  const target = getProductionApiUrl().toLowerCase();
  const self = (process.env.SELF_API_URL || "").replace(/\/+$/, "").toLowerCase();
  if (self && target === self) {
    throw new Error(
      "PRODUCTION_API_URL points at this same deployment — refusing to push production onto itself."
    );
  }
}

const BUFFER_TAG = "__buffer_b64__";

function toBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value.buffer) return Buffer.from(value.buffer);
  if (Array.isArray(value)) return Buffer.from(value);
  return null;
}

export function encodeBuffers(value) {
  if (value === null || value === undefined) return value;
  const buf = Buffer.isBuffer(value) ? value : value?._bsontype === "Binary" ? toBuffer(value) : null;
  if (buf) return { [BUFFER_TAG]: buf.toString("base64") };
  if (Array.isArray(value)) return value.map(encodeBuffers);
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    if (value instanceof mongoose.Types.ObjectId) return String(value);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = encodeBuffers(v);
    return out;
  }
  return value;
}

export function decodeBuffers(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(decodeBuffers);
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    if (typeof value[BUFFER_TAG] === "string") {
      return Buffer.from(value[BUFFER_TAG], "base64");
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = decodeBuffers(v);
    return out;
  }
  return value;
}

export async function collectAgreementFolder(agreementId) {
  if (!mongoose.isValidObjectId(agreementId)) {
    throw new Error("Invalid agreement id");
  }

  const agreement = await CustomerHeaderDoc.findById(agreementId).lean();
  if (!agreement) return null;

  const manualIds = (agreement.attachedFiles || [])
    .map((f) => f.manualDocumentId)
    .filter(Boolean);

  const [versions, manualUploads, logs] = await Promise.all([
    VersionPdf.find({ agreementId }).lean(),
    manualIds.length ? ManualUploadDocument.find({ _id: { $in: manualIds } }).lean() : [],
    VersionChangeLog.find({ agreementId }).lean(),
  ]);

  return { agreement, versions, manualUploads, logs };
}

function bufLen(b) {
  const buf = toBuffer(b);
  return buf ? buf.length : 0;
}

export function folderPdfBytes(folder) {
  let total = bufLen(folder.agreement?.pdf_meta?.pdfBuffer);
  for (const v of folder.versions) total += bufLen(v.pdf_meta?.pdfBuffer);
  for (const m of folder.manualUploads) total += bufLen(m.pdfBuffer);
  return total;
}

export async function previewAgreementPush(agreementId) {
  const folder = await collectAgreementFolder(agreementId);
  if (!folder) return null;

  const pdfBytes = folderPdfBytes(folder);
  return {
    agreementId: String(folder.agreement._id),
    title: folder.agreement.payload?.headerTitle || "Untitled",
    status: folder.agreement.status,
    counts: {
      versions: folder.versions.length,
      attachedFiles: folder.manualUploads.length,
      changeLogs: folder.logs.length,
    },
    totalPdfBytes: pdfBytes,
    estimatedPayloadBytes: Math.ceil(pdfBytes * 1.34),
    target: getProductionApiUrl(),
    configured: isProductionPushConfigured(),
  };
}

export async function pushAgreementToProduction(agreementId, { actor = "admin" } = {}) {
  if (!isProductionPushConfigured()) {
    const err = new Error(
      "PRODUCTION_PUSH_TOKEN is not configured. Set it before using Push to Production."
    );
    err.code = "not_configured";
    throw err;
  }
  assertNotSelfTarget();

  const folder = await collectAgreementFolder(agreementId);
  if (!folder) {
    const err = new Error("Agreement not found");
    err.code = "not_found";
    throw err;
  }

  const payload = encodeBuffers({
    agreement: folder.agreement,
    versions: folder.versions,
    manualUploads: folder.manualUploads,
    logs: folder.logs,
    meta: {
      pushedBy: actor,
      sourceEnv: process.env.NODE_ENV || "development",
      sourceApi: process.env.SELF_API_URL || null,
    },
  });

  const url = `${getProductionApiUrl()}/production-push/ingest`;
  const timeoutMs = Number(process.env.PRODUCTION_PUSH_TIMEOUT_MS) || 120000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  let body;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-production-push-token": process.env.PRODUCTION_PUSH_TOKEN,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    body = await response.json().catch(() => null);
  } catch (err) {
    clearTimeout(timer);
    const wrapped = new Error(
      err.name === "AbortError"
        ? `Production did not respond within ${Math.round(timeoutMs / 1000)}s`
        : `Could not reach production API: ${err.message}`
    );
    wrapped.code = "unreachable";
    throw wrapped;
  }
  clearTimeout(timer);

  if (!response.ok || !body?.success) {
    const err = new Error(body?.error || `Production API returned ${response.status}`);
    err.code = "remote_error";
    err.status = response.status;
    throw err;
  }

  logger.info(
    `[ProductionPush] Sent agreement ${agreementId} to ${url} by ${actor} ` +
      `(versions=${folder.versions.length}, files=${folder.manualUploads.length}, logs=${folder.logs.length})`
  );

  return {
    agreementId: String(folder.agreement._id),
    title: folder.agreement.payload?.headerTitle || "Untitled",
    versions: folder.versions.length,
    attachedFiles: folder.manualUploads.length,
    changeLogs: folder.logs.length,
    totalPdfBytes: folderPdfBytes(folder),
    target: getProductionApiUrl(),
    pushedAt: new Date(),
    pushedBy: actor,
    remote: body.result ?? null,
  };
}

export async function ingestAgreementFolder(rawPayload) {
  const payload = decodeBuffers(rawPayload || {});
  const { agreement, versions = [], manualUploads = [], logs = [], meta = {} } = payload;

  if (!agreement?._id) {
    const err = new Error("Payload is missing the agreement document");
    err.code = "bad_payload";
    throw err;
  }

  const stamp = {
    pushedToProductionAt: new Date(),
    pushedToProductionBy: meta.pushedBy || "admin",
    pushedFromEnv: meta.sourceEnv || null,
  };

  const replaceById = (Model, doc) =>
    Model.replaceOne({ _id: doc._id }, { ...doc, ...stamp }, { upsert: true, strict: false });

  const result = { versions: 0, attachedFiles: 0, changeLogs: 0 };

  for (const m of manualUploads) {
    await replaceById(ManualUploadDocument, m);
    result.attachedFiles++;
  }
  for (const l of logs) {
    await replaceById(VersionChangeLog, l);
    result.changeLogs++;
  }
  for (const v of versions) {
    await replaceById(VersionPdf, v);
    result.versions++;
  }
  await replaceById(CustomerHeaderDoc, agreement);

  logger.info(
    `[ProductionPush] Ingested agreement ${agreement._id} from ${stamp.pushedFromEnv} ` +
      `by ${stamp.pushedToProductionBy} (versions=${result.versions}, files=${result.attachedFiles}, logs=${result.changeLogs})`
  );

  return {
    agreementId: String(agreement._id),
    title: agreement.payload?.headerTitle || "Untitled",
    ...result,
    ingestedAt: stamp.pushedToProductionAt,
  };
}

export default {
  collectAgreementFolder,
  previewAgreementPush,
  pushAgreementToProduction,
  ingestAgreementFolder,
  isProductionPushConfigured,
  getProductionApiUrl,
};
