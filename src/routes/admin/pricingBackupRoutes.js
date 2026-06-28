import express from "express";
import PricingBackupController from "../../controllers/admin/pricingBackupController.js";
import { requireAdminAuth, requireBackupPermission } from "../../middleware/adminAuth.js";

const router = express.Router();

router.post(
  "/create",
  requireAdminAuth,
  requireBackupPermission,
  PricingBackupController.createManualBackup
);

router.get(
  "/list",
  PricingBackupController.getBackupList
);

router.get(
  "/details/:changeDayId",
  PricingBackupController.getBackupDetails
);

router.post(
  "/restore",
  requireAdminAuth,
  requireBackupPermission,
  PricingBackupController.restoreFromBackup
);

router.get(
  "/statistics",
  PricingBackupController.getBackupStatistics
);

router.post(
  "/enforce-retention",
  requireAdminAuth,
  requireBackupPermission,
  PricingBackupController.enforceRetentionPolicy
);

router.delete(
  "/delete",
  requireAdminAuth,
  requireBackupPermission,
  PricingBackupController.deleteBackups
);

router.get(
  "/snapshot/:changeDayId",
  PricingBackupController.getBackupSnapshot
);

router.get(
  "/health",
  PricingBackupController.getBackupSystemHealth
);

export default router;
