/**
 * PDF Controller - Aggregated exports from atomic controllers
 *
 * This file re-exports all functions from the atomic controllers
 * for backward compatibility with existing imports.
 */

// PDF Compile Controller
export {
  pdfHealth,
  compileFromRaw,
  compileFromProposalFile,
  compileCustomerHeaderPdf,
  proxyCompileFile,
  proxyCompileBundle,
} from "./pdfCompileController.js";

// Zoho Test Controller
export {
  testZohoAccessEndpoint,
  runZohoDiagnosticsEndpoint,
  testV10CompatibilityEndpoint,
  testV9SimplePipelineEndpoint,
  testV7LayoutPipelineEndpoint,
} from "./zohoTestController.js";

// Customer Header Controller
export {
  compileAndStoreCustomerHeader,
  getCustomerHeaders,
  getCustomerHeaderById,
  getCustomerHeaderForEdit,
  updateCustomerHeader,
  updateCustomerHeaderStatus,
} from "./customerHeaderController.js";

// Admin Header Controller
export {
  compileAndStoreAdminHeader,
  getAdminHeaders,
  getAdminHeaderById,
  updateAdminHeader,
} from "./adminHeaderController.js";

// Saved Files Controller
export {
  getSavedFilesList,
  getSavedFilesGrouped,
  getSavedFileDetails,
  addFileToAgreement,
  downloadAttachedFile,
  getCustomerHeadersHighLevel,
  getCustomerHeaderViewerById,
  downloadCustomerHeaderPdf,
} from "./savedFilesController.js";

// Trash Controller
export {
  restoreAgreement,
  restoreFile,
  deleteAgreement,
  deleteFile,
  permanentlyDeleteAgreement,
  permanentlyDeleteFile,
  debugGetAllFiles,
  verifyTrashWorkflow,
} from "./trashController.js";

// Approval Controller
export {
  getApprovalDocumentsGrouped,
} from "./approvalController.js";

// Price Override Controller
export {
  logPriceOverride,
  getPriceOverrideLogs,
  getPriceOverrideStats,
  reviewPriceOverride,
  getPendingPriceOverrides,
} from "./priceOverrideController.js";

// Version Change Log Controller
export {
  logVersionChanges,
  getVersionChangeLogs,
  getVersionChangeLog,
  reviewVersionChanges,
  getPendingVersionChanges,
} from "./versionChangeLogController.js";

// Document Stats Controller
export {
  getDocumentStatusCounts,
} from "./documentStatsController.js";

// Pricing Catalog Controller
export {
  exportPricingCatalog,
  exportPricingCatalogFromDb,
} from "./pricingCatalogController.js";

// Agreement Commission Controller
export {
  getUserCommissions,
  getAllEmployeesCommissions,
  getEmployeeCommissions,
} from "./agreementCommissionController.js";
