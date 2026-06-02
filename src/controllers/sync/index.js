/**
 * Sync Controllers - Index
 * Exports all sync-related controller functions
 */

// Bigin Audit
export {
  getAllAuditLogs,
  getAuditLogById,
  getScrapeStatus,
  startScrape,
  getAuditStats,
  getScrapeHistory,
  uploadCsv,
  deleteAllAuditLogs,
  deleteUnnecessaryData,
  checkInsideSalesEligibility,
} from "./biginAuditController.js";

// Map Distance
export {
  initializeJobStatus,
  getRouteStarCustomers,
  fetchMapDistance,
  startSync,
  startUpdateSync,
  resumeSync,
  pauseSync,
  getSyncStatus,
  cancelSync,
  resetStuckJobs,
  getSyncHistory,
  getStoredRecords,
  getCustomerRecords,
  getCustomersWithData,
  getStats,
  deleteAllRecords,
  detectAccountType,
  detectAccountTypeWithMapbox,
  getCustomerDistances,
} from "./mapDistanceController.js";

export { default as mapDistanceController } from "./mapDistanceController.js";

// Zoho Upload
export {
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
} from "./zohoUploadController.js";

export {
  firstTimeUpload,
  updateUpload,
  addAttachedFileToDeal,
} from "./zohoUploadOperationsController.js";
