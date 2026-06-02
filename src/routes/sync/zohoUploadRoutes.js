/**
 * Zoho Upload Routes
 * Routes for Zoho Bigin upload operations
 */

import { Router } from "express";
import {
  getUploadStatus,
  getCompanies,
  getUsers,
  createCompany,
  getUploadHistory,
  getModules,
  getPipelineOptionsForCompany,
  getPipelineOptions,
  getDealsForCompany,
  validateDealFields,
  cleanupFailed,
  createTaskForAgreement,
  createTaskForCompany,
  createAutoApprovalTask,
} from "../../controllers/sync/zohoUploadController.js";
import {
  firstTimeUpload,
  updateUpload,
  addAttachedFileToDeal,
} from "../../controllers/sync/zohoUploadOperationsController.js";

const router = Router();

// Status and lookup routes
router.get("/:agreementId/status", getUploadStatus);
router.get("/:agreementId/history", getUploadHistory);

// Company routes
router.get("/companies", getCompanies);
router.post("/companies", createCompany);
router.get("/companies/:companyId/deals", getDealsForCompany);
router.get("/companies/:companyId/pipeline-options", getPipelineOptionsForCompany);

// User routes
router.get("/users", getUsers);

// Module and pipeline routes
router.get("/modules", getModules);
router.get("/pipeline-options", getPipelineOptions);

// Upload routes
router.post("/:agreementId/first-time", firstTimeUpload);
router.post("/:agreementId/update", updateUpload);

// Attached file routes
router.post("/attached-file/:fileId/add-to-deal", addAttachedFileToDeal);

// Validation and cleanup routes
router.post("/validate-deal-fields", validateDealFields);
router.post("/cleanup-failed", cleanupFailed);

// Task routes
router.post("/:agreementId/tasks", createTaskForAgreement);
router.post("/:agreementId/auto-approval-task", createAutoApprovalTask);
router.post("/companies/:companyId/tasks", createTaskForCompany);

export default router;
