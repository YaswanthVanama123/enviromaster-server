import mongoose from "mongoose";
import {
  isBiDbConfigured,
  getBiConnection,
  getBiDbName,
  getBiCollectionPrefix,
} from "../../config/biDb.js";
import {
  getProductionApiUrl,
  isProductionPushConfigured,
  isSelfTarget,
} from "../../services/agreement/productionPushService.js";
import { PDF_REMOTE_BASE } from "../../config/pdfConfig.js";
import { getPdfHealth } from "../../services/agreement/pdfService.js";
import logger from "../../utils/logger.js";

const PROBE_TIMEOUT_MS = Number(process.env.DIAGNOSTICS_TIMEOUT_MS) || 8000;

const READY_STATES = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

async function timed(fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    return { ok: true, latencyMs: Date.now() - startedAt, ...detail };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - startedAt, error: err?.message || String(err) };
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkPrimaryDb() {
  const conn = mongoose.connection;
  const state = READY_STATES[conn.readyState] || "unknown";

  const result = await timed(async () => {
    if (conn.readyState !== 1) throw new Error(`Connection is ${state}`);
    await conn.db.admin().ping();
    return { database: conn.name, host: conn.host || null };
  });

  return {
    key: "primary",
    label: "EnviroMaster database",
    required: true,
    state,
    configured: Boolean(process.env.MONGO_URI),
    ...result,
  };
}

async function checkBiDb() {
  if (!isBiDbConfigured()) {
    return {
      key: "bi",
      label: "BI database (customers)",
      required: true,
      configured: false,
      ok: false,
      state: "not_configured",
      error: "BI_MONGO_URI is not set — customer import is disabled",
    };
  }

  const prefix = getBiCollectionPrefix();
  const result = await timed(async () => {
    const conn = getBiConnection();
    if (conn.readyState !== 1) await conn.asPromise();
    await conn.db.admin().ping();

    const [sourceCustomers, customerAccounts] = await Promise.all([
      conn.db.collection("routestarcustomers").countDocuments(),
      conn.db.collection(`${prefix}customeraccounts`).countDocuments(),
    ]);

    return {
      database: getBiDbName(),
      collections: {
        routestarcustomers: sourceCustomers,
        [`${prefix}customeraccounts`]: customerAccounts,
      },
    };
  });

  const state = result.ok ? "connected" : "error";
  return {
    key: "bi",
    label: "BI database (customers)",
    required: true,
    configured: true,
    state,
    ...result,
  };
}

async function checkPdfService() {
  const result = await timed(async () => {
    const health = await getPdfHealth();
    if (!health.ok) throw new Error(health.error || "PDF service did not respond");
    return {};
  });

  return {
    key: "pdf",
    label: "PDF compile service",
    required: true,
    configured: Boolean(PDF_REMOTE_BASE),
    state: result.ok ? "reachable" : "error",
    target: PDF_REMOTE_BASE,
    ...result,
  };
}

async function checkProductionPush() {
  const target = getProductionApiUrl();

  if (!isProductionPushConfigured()) {
    return {
      key: "productionPush",
      label: "Production push target",
      required: false,
      configured: false,
      ok: true,
      state: "disabled",
      target,
      note: "PRODUCTION_PUSH_TOKEN is not set — the feature is intentionally off",
    };
  }

  if (isSelfTarget()) {
    return {
      key: "productionPush",
      label: "Production push target",
      required: false,
      configured: true,
      ok: true,
      state: "self",
      target,
      note: "This deployment is the production target — it only receives pushes",
    };
  }

  const result = await timed(async () => {
    const response = await fetchWithTimeout(`${target}/production-push/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (response.status === 404) throw new Error("Target has no /production-push/ingest route");
    return { httpStatus: response.status };
  });

  return {
    key: "productionPush",
    label: "Production push target",
    required: false,
    configured: true,
    state: result.ok ? "reachable" : "error",
    target,
    ...result,
  };
}

export const getConnectionDiagnostics = async (req, res) => {
  try {
    const checks = await Promise.all([
      checkPrimaryDb(),
      checkBiDb(),
      checkPdfService(),
      checkProductionPush(),
    ]);

    const failing = checks.filter((c) => !c.ok);
    const requiredFailing = failing.filter((c) => c.required);
    const status = requiredFailing.length ? "error" : failing.length ? "degraded" : "ok";

    res.status(status === "error" ? 503 : 200).json({
      success: true,
      status,
      environment: process.env.NODE_ENV || "development",
      checkedAt: new Date().toISOString(),
      summary: {
        total: checks.length,
        healthy: checks.length - failing.length,
        failing: failing.length,
        requiredFailing: requiredFailing.length,
      },
      checks,
    });
  } catch (error) {
    logger.error("Connection diagnostics failed:", error);
    res.status(500).json({ success: false, error: "Failed to run connection diagnostics" });
  }
};

export default { getConnectionDiagnostics };
