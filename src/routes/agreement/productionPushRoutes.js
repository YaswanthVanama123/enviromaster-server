/**
 * Production Push Routes
 *
 * /ingest is the receiving end, called server-to-server by a lower environment
 * and authenticated by the shared PRODUCTION_PUSH_TOKEN — so it must be declared
 * before the admin-session guard.
 *
 * Everything else is the sending end, driven from the admin UI.
 */

import express from "express";
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import {
  getProductionPushStatus,
  previewProductionPush,
  pushAgreementToProductionController,
  ingestProductionPush,
} from "../../controllers/agreement/productionPushController.js";

const router = express.Router();

router.post("/ingest", ingestProductionPush);

router.use(requireAdminAuth);

router.get("/status", getProductionPushStatus);

router.get("/:agreementId/preview", previewProductionPush);

router.post("/:agreementId", pushAgreementToProductionController);

export default router;
