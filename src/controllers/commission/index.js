/**
 * Commission Controllers - Index
 * Exports all commission-related controller functions
 */

// Commission Rules and Calculations
export {
  getActiveRules,
  getAllRules,
  updateRules,
  createRules,
  calculate,
  saveRecord,
  getRecords,
  getRecordById,
  updateRecordStatus,
  deleteRecord,
} from "./commissionController.js";

// Quota Tracking
export {
  getAllSalesPersons,
  getSalesPersonById,
  createSalesPerson,
  updateSalesPerson,
  updateSalesPersonQuota,
  createAgreement,
  getAllAgreements,
  getAgreementById,
  updateAgreementStatus,
  getQuotaStatus,
  getQuotaHistory,
  getCurrentQuotaLevel,
  getLeaderboard,
} from "./quotaController.js";

// Commission V2 Calculations
export {
  calculateCommission,
  detectAccountTypeEndpoint,
  getCommissionRules,
  getQuotaThresholdEndpoint,
  calculateCommissionV2,
  detectAccountType,
  getQuotaThreshold,
  checkAutoQuota,
  determineQuotaLevel,
  calculateCommissionableRevenue,
  getPricingTier,
  COMMISSION_RULES,
  PRICING_TIERS,
  ACCOUNT_TYPE_REVENUE_RULES,
  QUOTA_THRESHOLDS,
  AUTO_QUOTA_RULES,
  FREQUENCY_VISITS_PER_YEAR,
} from "./commissionControllerV2.js";
