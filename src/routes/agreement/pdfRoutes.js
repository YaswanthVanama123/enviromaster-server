import { Router } from "express";
import multer from "multer";
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import { requireAuth } from "../../middleware/authMiddleware.js";

// PDF Compile Controller
import {
  pdfHealth,
  compileFromRaw,
  compileFromProposalFile,
  compileCustomerHeaderPdf,
  proxyCompileFile,
  proxyCompileBundle,
} from "../../controllers/agreement/pdfCompileController.js";

// Zoho Test Controller
import {
  testZohoAccessEndpoint,
  runZohoDiagnosticsEndpoint,
  testV10CompatibilityEndpoint,
  testV9SimplePipelineEndpoint,
  testV7LayoutPipelineEndpoint,
} from "../../controllers/agreement/zohoTestController.js";

// Customer Header Controller
import {
  compileAndStoreCustomerHeader,
  getCustomerHeaders,
  getCustomerHeaderById,
  getCustomerHeaderForEdit,
  updateCustomerHeader,
  updateCustomerHeaderStatus,
  saveAccountTypeCache,
} from "../../controllers/agreement/customerHeaderController.js";

// Admin Header Controller
import {
  compileAndStoreAdminHeader,
  getAdminHeaders,
  getAdminHeaderById,
  updateAdminHeader,
} from "../../controllers/agreement/adminHeaderController.js";

// Saved Files Controller
import {
  getSavedFilesList,
  getSavedFilesGrouped,
  getSavedFileDetails,
  addFileToAgreement,
  downloadAttachedFile,
  getCustomerHeadersHighLevel,
  getCustomerHeaderViewerById,
  downloadCustomerHeaderPdf,
} from "../../controllers/agreement/savedFilesController.js";

// Trash Controller
import {
  restoreAgreement,
  restoreFile,
  deleteAgreement,
  deleteFile,
  permanentlyDeleteAgreement,
  permanentlyDeleteFile,
  debugGetAllFiles,
  verifyTrashWorkflow,
} from "../../controllers/agreement/trashController.js";

// Approval Controller
import {
  getApprovalDocumentsGrouped,
} from "../../controllers/agreement/approvalController.js";

// Price Override Controller
import {
  logPriceOverride,
  getPriceOverrideLogs,
  getPriceOverrideStats,
  reviewPriceOverride,
  getPendingPriceOverrides,
} from "../../controllers/agreement/priceOverrideController.js";

// Version Change Log Controller
import {
  logVersionChanges,
  getVersionChangeLogs,
  getVersionChangeLog,
  reviewVersionChanges,
  getPendingVersionChanges,
} from "../../controllers/agreement/versionChangeLogController.js";

// Document Stats Controller
import {
  getDocumentStatusCounts,
} from "../../controllers/agreement/documentStatsController.js";

// Pricing Catalog Controller
import {
  exportPricingCatalog,
  exportPricingCatalogFromDb,
} from "../../controllers/agreement/pricingCatalogController.js";

// Agreement Commission Controller
import {
  getUserCommissions,
  getAllEmployeesCommissions,
  getEmployeeCommissions,
} from "../../controllers/agreement/agreementCommissionController.js";

// Log Controller
import {
  createVersionLog,
  getVersionLogs,
  getAllVersionLogs,
  downloadVersionLog,
} from "../../controllers/agreement/logController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/health", pdfHealth);
router.get("/test-zoho-access", testZohoAccessEndpoint);
router.get("/zoho-diagnostics", runZohoDiagnosticsEndpoint);
router.get("/test-v10-compatibility", testV10CompatibilityEndpoint);
router.get("/test-v9-simple-pipeline", testV9SimplePipelineEndpoint);
router.get("/test-v7-layout-pipeline", testV7LayoutPipelineEndpoint);

router.get("/debug/all-files", debugGetAllFiles);
router.get("/debug/verify-trash-workflow", verifyTrashWorkflow);

router.post("/compile", compileFromRaw);
router.post("/proposal", compileFromProposalFile);

router.post("/customer-header-preview", compileCustomerHeaderPdf);
router.post("/customer-header", requireAuth, compileAndStoreCustomerHeader);
router.get("/customer-headers", getCustomerHeaders);
router.get("/customer-headers/:id", getCustomerHeaderById);
router.get("/customer-headers/:id/edit-format", getCustomerHeaderForEdit);
router.put("/customer-headers/:id", requireAuth, updateCustomerHeader);
router.patch("/customer-headers/:id/status", requireAuth, updateCustomerHeaderStatus);
router.patch("/customer-headers/:id/account-type-cache", requireAuth, saveAccountTypeCache);

router.post("/admin-header", compileAndStoreAdminHeader);
router.get("/admin-headers", getAdminHeaders);
router.get("/admin-headers/:id", getAdminHeaderById);
router.put("/admin-headers/:id", updateAdminHeader);

router.get("/viewer/getall/highlevel", getCustomerHeadersHighLevel);
router.get("/viewer/getbyid/:id", getCustomerHeaderViewerById);
router.get("/viewer/download/:id", downloadCustomerHeaderPdf)

router.get("/saved-files", getSavedFilesList);
router.get("/saved-files/grouped", getSavedFilesGrouped);
router.get("/saved-files/:id/details", getSavedFileDetails);
router.post("/saved-files/:agreementId/add-files", addFileToAgreement);
router.get("/attached-files/:fileId/download", downloadAttachedFile);

router.get("/document-status-counts", getDocumentStatusCounts);

router.get("/approval-documents/grouped", getApprovalDocumentsGrouped);

router.patch("/agreements/:agreementId/restore", restoreAgreement);
router.patch("/files/:fileId/restore", restoreFile);
router.patch("/agreements/:agreementId/delete", deleteAgreement);
router.patch("/files/:fileId/delete", deleteFile);
router.delete("/agreements/:agreementId/permanent-delete", requireAdminAuth, permanentlyDeleteAgreement);
router.delete("/files/:fileId/permanent-delete", requireAdminAuth, permanentlyDeleteFile);

router.post("/price-overrides/log", logPriceOverride);
router.get("/price-overrides/logs/:agreementId", getPriceOverrideLogs);
router.get("/price-overrides/stats/:agreementId", getPriceOverrideStats);
router.patch("/price-overrides/:logId/review", reviewPriceOverride);
router.get("/price-overrides/pending", getPendingPriceOverrides);

router.post("/version-changes/log", logVersionChanges);
router.get("/version-changes/logs/:agreementId", getVersionChangeLogs);
router.get("/version-changes/log/:versionId", getVersionChangeLog);
router.patch("/version-changes/:logId/review", reviewVersionChanges);
router.get("/version-changes/pending", getPendingVersionChanges);

router.post("/logs/create", createVersionLog);
router.get("/logs/agreement/:agreementId", getVersionLogs);
router.get("/logs/all", getAllVersionLogs);
router.get("/logs/:logId/download", downloadVersionLog);

router.post("/pricing-catalog/export", exportPricingCatalog);
router.get("/pricing-catalog/export", requireAdminAuth, exportPricingCatalogFromDb);

router.get("/user/commissions", requireAuth, getUserCommissions);
router.get("/admin/commissions/employees", requireAdminAuth, getAllEmployeesCommissions);
router.get("/admin/commissions/employee/:username", requireAdminAuth, getEmployeeCommissions);

router.post("/compile-file", upload.single("file"), proxyCompileFile);
router.post(
  "/compile-bundle",
  upload.fields([
    { name: "main", maxCount: 1 },
    { name: "assets", maxCount: 63 },
  ]),
  proxyCompileBundle
);

export default router;
