/**
 * Customer Controllers - Index
 * Exports all customer-related controller functions
 */

// RouteStar Customers
export {
  getAllCustomers,
  getCustomerById,
  getSyncStatus,
  startSync,
  getCustomerStats,
} from "./routestarCustomersController.js";

// Bigin Company
export {
  getAllCompanies,
  getCompanyById,
  getFetchStatus,
  startFetch,
  getCompanyStats,
  deleteCompany,
  updateCompany,
} from "./biginCompanyController.js";

// Company Mapping
export {
  getAllMappings,
  getMappingStats,
  getMappingById,
  saveMapping,
  updateMapping,
  deleteMapping,
  bulkSaveMapping,
  initializeMappings,
  getAvailableRouteStarCustomers,
  syncMappings,
} from "./companyMappingController.js";
