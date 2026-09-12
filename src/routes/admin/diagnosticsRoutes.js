import express from "express";
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import { getConnectionDiagnostics } from "../../controllers/admin/diagnosticsController.js";

const router = express.Router();

router.use(requireAdminAuth);

router.get("/connections", getConnectionDiagnostics);

export default router;
