/**
 * Commission Models - Index
 * Exports all commission-related models
 */

import CommissionRules, {
  QUOTA_LEVELS,
  AGREEMENT_TERMS,
  ACCOUNT_TYPES,
  PRICING_LINES,
  BUSINESS_TYPES,
  DEFAULT_COMMISSION_RULES,
} from "./CommissionRules.model.js";

import CommissionRecord, {
  COMMISSION_RECORD_STATUS,
} from "./CommissionRecord.model.js";

import Agreement, {
  AGREEMENT_STATUS,
} from "./Agreement.model.js";

import QuotaPeriod, {
  QUOTA_PERIOD_STATUS,
} from "./QuotaPeriod.model.js";

export {
  // Models
  CommissionRules,
  CommissionRecord,
  Agreement,
  QuotaPeriod,

  // Constants
  QUOTA_LEVELS,
  AGREEMENT_TERMS,
  ACCOUNT_TYPES,
  PRICING_LINES,
  BUSINESS_TYPES,
  DEFAULT_COMMISSION_RULES,
  COMMISSION_RECORD_STATUS,
  AGREEMENT_STATUS,
  QUOTA_PERIOD_STATUS,
};

export default {
  CommissionRules,
  CommissionRecord,
  Agreement,
  QuotaPeriod,
};
