import express from "express";
import PricingBackupController from "../../controllers/admin/pricingBackupController.js";

const router = express.Router();

router.post(
  "/create",
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
  PricingBackupController.restoreFromBackup
);

router.get(
  "/statistics",
  PricingBackupController.getBackupStatistics
);

router.post(
  "/enforce-retention",
  PricingBackupController.enforceRetentionPolicy
);

router.delete(
  "/delete",
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
