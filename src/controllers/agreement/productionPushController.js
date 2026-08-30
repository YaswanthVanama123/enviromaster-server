/**
 * Production Push Controller
 *
 * Sender side (stage): reads an agreement folder and POSTs it to the production
 * API, which is bound to the production database.
 * Receiver side (production): ingests a folder into this deployment's own DB.
 *
 * The same code is deployed to both environments; each only exercises one side.
 */

import {
  previewAgreementPush,
  pushAgreementToProduction,
  ingestAgreementFolder,
  isProductionPushConfigured,
  isSelfTarget,
  getProductionApiUrl,
} from "../../services/agreement/productionPushService.js";
import logger from "../../utils/logger.js";

function actorOf(req) {
  return req.admin?.username || req.user?.username || req.admin?.id || "admin";
}

export async function getProductionPushStatus(req, res) {
  res.json({
    success: true,
    configured: isProductionPushConfigured() && !isSelfTarget(),
    targetApiUrl: getProductionApiUrl(),
  });
}

export async function previewProductionPush(req, res) {
  try {
    const preview = await previewAgreementPush(req.params.agreementId);
    if (!preview) {
      return res.status(404).json({ success: false, error: "Agreement not found" });
    }
    res.json({ success: true, preview });
  } catch (err) {
    logger.error("previewProductionPush error:", err);
    res.status(400).json({ success: false, error: err.message || "Preview failed" });
  }
}

export async function pushAgreementToProductionController(req, res) {
  try {
    const { confirmAgreementId } = req.body || {};
    if (confirmAgreementId && confirmAgreementId !== req.params.agreementId) {
      return res.status(400).json({
        success: false,
        error: "confirmAgreementId does not match the agreement being pushed",
      });
    }

    const result = await pushAgreementToProduction(req.params.agreementId, {
      actor: actorOf(req),
    });

    res.json({
      success: true,
      message: `Pushed "${result.title}" to production`,
      result,
    });
  } catch (err) {
    const map = { not_found: 404, not_configured: 400, unreachable: 502, remote_error: 502 };
    const status = map[err.code] || 500;
    if (status >= 500) logger.error("pushAgreementToProduction error:", err);
    res.status(status).json({ success: false, error: err.message || "Push failed" });
  }
}

export async function ingestProductionPush(req, res) {
  try {
    const expected = process.env.PRODUCTION_PUSH_TOKEN;
    if (!expected) {
      return res.status(503).json({
        success: false,
        error: "This deployment is not accepting pushes (PRODUCTION_PUSH_TOKEN unset)",
      });
    }
    const provided = req.get("x-production-push-token");
    if (!provided || provided !== expected) {
      logger.warn("[ProductionPush] Rejected ingest with invalid token");
      return res.status(401).json({ success: false, error: "Invalid push token" });
    }

    const result = await ingestAgreementFolder(req.body);
    res.json({ success: true, message: "Agreement folder stored", result });
  } catch (err) {
    if (err.code === "bad_payload") {
      return res.status(400).json({ success: false, error: err.message });
    }
    logger.error("ingestProductionPush error:", err);
    res.status(500).json({ success: false, error: err.message || "Ingest failed" });
  }
}

export default {
  getProductionPushStatus,
  previewProductionPush,
  pushAgreementToProductionController,
  ingestProductionPush,
};
