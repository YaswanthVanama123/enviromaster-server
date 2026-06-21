import logger from "../../utils/logger.js";
/**
 * Commission Controller V2
 * Backend API handlers for commission calculations
 * Based on Solange Commission Draft v2 (June 2026)
 */

// Note: This is the backend controller for Node.js/Express
// It mirrors the frontend calculation logic for server-side validation

// ============================================================
// TYPES (mirrored from frontend for consistency)
// ============================================================

const AccountTypes = ['Anchor', 'Bread5', 'Bread15', 'Pit'];
const AgreementTerms = ['3-year', '1-year', 'MTM-with-install', 'MTM-no-install'];
const QuotaLevels = ['below', 'above', 'double'];
const ServiceFrequencies = ['weekly', 'biweekly', 'monthly', 'quarterly', 'one-time'];
const BusinessTypes = ['new', 'renewal'];

// ============================================================
// CONSTANTS - Solange Commission Draft v2
// ============================================================

const PRICING_TIERS = [
  { minRatio: 0, maxRatio: 0.99, quotaMultiplier: 0.5, label: 'Below Redline', requiresApproval: true },
  { minRatio: 1.00, maxRatio: 1.09, quotaMultiplier: 1.0, label: 'Redline', requiresApproval: false },
  { minRatio: 1.10, maxRatio: 1.19, quotaMultiplier: 1.25, label: '110% Premium', requiresApproval: false },
  { minRatio: 1.20, maxRatio: 1.29, quotaMultiplier: 1.5, label: '120% Premium', requiresApproval: false },
  { minRatio: 1.30, maxRatio: Infinity, quotaMultiplier: 2.0, label: 'Greenline (130%+)', requiresApproval: false },
];

const ACCOUNT_TYPE_REVENUE_RULES = {
  'Anchor': { revenueDeduction: 0, anchorBonusThreshold: 200, anchorBonusMultiplier: 1.5 },
  'Bread5': { revenueDeduction: 50, anchorBonusThreshold: 0, anchorBonusMultiplier: 1.0 },
  'Bread15': { revenueDeduction: 75, anchorBonusThreshold: 0, anchorBonusMultiplier: 1.0 },
  'Pit': { revenueDeduction: 100, anchorBonusThreshold: 0, anchorBonusMultiplier: 1.0 },
};

const QUOTA_THRESHOLDS = [
  { monthsEmployed: 1, annualQuota: 0, weeklyEquivalent: 0 },
  { monthsEmployed: 2, annualQuota: 2500, weeklyEquivalent: 50 },
  { monthsEmployed: 3, annualQuota: 5000, weeklyEquivalent: 100 },
  { monthsEmployed: 4, annualQuota: 7500, weeklyEquivalent: 150 },
  { monthsEmployed: 5, annualQuota: 10000, weeklyEquivalent: 200 },
];

const AUTO_QUOTA_RULES = [
  { minMonths: 1, maxMonths: 3, requiredSales: 2, minimumPerSale: 1000 },
  { minMonths: 4, maxMonths: Infinity, requiredSales: 3, minimumPerSale: 1000 },
];

const FREQUENCY_VISITS_PER_YEAR = {
  'weekly': 50,
  'biweekly': 25,
  'monthly': 12,
  'quarterly': 4,
  'one-time': 1,
};

const COMMISSION_RULES = {
  version: '2.0.0',
  quotaRates: { below: 3, above: 6, double: 9 },
  agreementMultipliers: { '3-year': 135, '1-year': 100, 'MTM-with-install': 100, 'MTM-no-install': 50 },
  insideSalesDeduction: -3,
  renewalBonusRate: 4,
  renewalMinYears: 2,
  anchorMinPerVisit: 200,
  anchorMinGreenline: 100,
};

// ============================================================
// CALCULATION UTILITIES
// ============================================================

function getPricingTier(actualPrice, redlinePrice) {
  if (redlinePrice <= 0) return PRICING_TIERS[1];
  const ratio = actualPrice / redlinePrice;

  for (const tier of PRICING_TIERS) {
    if (ratio >= tier.minRatio && ratio < tier.maxRatio) {
      return tier;
    }
  }
  return PRICING_TIERS[PRICING_TIERS.length - 1];
}

function calculateCommissionableRevenue(perVisitRevenue, accountType) {
  const rule = ACCOUNT_TYPE_REVENUE_RULES[accountType];
  if (!rule) throw new Error(`Unknown account type: ${accountType}`);

  const revenueDeduction = Math.min(perVisitRevenue, rule.revenueDeduction);
  let commissionableRevenue = Math.max(0, perVisitRevenue - rule.revenueDeduction);
  let anchorBonus = 0;

  if (accountType === 'Anchor' && perVisitRevenue > rule.anchorBonusThreshold) {
    const bonusPortion = perVisitRevenue - rule.anchorBonusThreshold;
    anchorBonus = bonusPortion * (rule.anchorBonusMultiplier - 1);
    commissionableRevenue = rule.anchorBonusThreshold + bonusPortion * rule.anchorBonusMultiplier;
  }

  return { commissionableRevenue, revenueDeduction, anchorBonus };
}

function getQuotaThreshold(monthsEmployed) {
  const effectiveMonths = Math.min(monthsEmployed, 5);
  return QUOTA_THRESHOLDS.find(t => t.monthsEmployed === effectiveMonths) || QUOTA_THRESHOLDS[4];
}

function checkAutoQuota(monthsEmployed, newRooftopCount, salesMeetMinimum) {
  const rule = AUTO_QUOTA_RULES.find(r => monthsEmployed >= r.minMonths && monthsEmployed <= r.maxMonths);
  if (!rule) return false;
  return newRooftopCount >= rule.requiredSales && salesMeetMinimum;
}

function determineQuotaLevel(monthsEmployed, periodSalesTotal, newRooftopCount, salesMeetMinimum) {
  if (checkAutoQuota(monthsEmployed, newRooftopCount, salesMeetMinimum)) {
    return 'above';
  }

  const threshold = getQuotaThreshold(monthsEmployed);
  if (threshold.annualQuota === 0) return 'above';

  if (periodSalesTotal >= threshold.annualQuota * 2) return 'double';
  if (periodSalesTotal >= threshold.annualQuota) return 'above';
  return 'below';
}

function detectAccountType(perVisitRevenue, drivingTimeMinutes, isGreenline) {
  const anchorThreshold = isGreenline ? COMMISSION_RULES.anchorMinGreenline : COMMISSION_RULES.anchorMinPerVisit;

  if (perVisitRevenue >= anchorThreshold) {
    return 'Anchor';
  }

  if (drivingTimeMinutes === null || drivingTimeMinutes === undefined) {
    return 'Pit';
  }

  if (drivingTimeMinutes < 5) return 'Bread5';
  if (drivingTimeMinutes <= 15) return 'Bread15';
  return 'Pit';
}

// ============================================================
// MAIN CALCULATION FUNCTION
// ============================================================

function calculateCommissionV2(input) {
  const {
    perVisitRevenue,
    redlinePrice,
    frequency,
    accountType,
    agreementTerm,
    businessType,
    yearsAsCustomer = 0,
    totalRenewalValue = 0,
    isInsideSales,
    employeeMonthsEmployed = 5,
    periodSalesTotal = 0,
    newRooftopCount = 0,
  } = input;

  // Step 1: Pricing Tier
  const priceRatio = redlinePrice > 0 ? perVisitRevenue / redlinePrice : 1;
  const pricingTier = getPricingTier(perVisitRevenue, redlinePrice);
  const pricingMultiplier = pricingTier.quotaMultiplier;
  const requiresApproval = pricingTier.requiresApproval;

  // Step 2: Revenue Adjustments
  const { commissionableRevenue, revenueDeduction, anchorBonus } =
    calculateCommissionableRevenue(perVisitRevenue, accountType);

  // Step 3: Apply Pricing Multiplier
  const revenueWithPricingMultiplier = commissionableRevenue * pricingMultiplier;

  // Step 4: Annual Quota Credit
  const visitsPerYear = FREQUENCY_VISITS_PER_YEAR[frequency] || 1;
  const annualQuotaCredit = revenueWithPricingMultiplier * visitsPerYear;

  // Step 5: Quota Level
  const quotaThreshold = getQuotaThreshold(employeeMonthsEmployed);
  const totalPeriodSales = periodSalesTotal + annualQuotaCredit;
  const annualRevenue = perVisitRevenue * visitsPerYear;
  const salesMeetMinimum = annualRevenue >= 1000 || frequency !== 'one-time';
  const autoQuotaQualified = checkAutoQuota(employeeMonthsEmployed, newRooftopCount + 1, salesMeetMinimum);
  const quotaLevel = determineQuotaLevel(employeeMonthsEmployed, totalPeriodSales, newRooftopCount + 1, salesMeetMinimum);

  // Step 6: Commission Rate
  const baseRate = COMMISSION_RULES.quotaRates[quotaLevel];
  const insideSalesDeduction = isInsideSales ? COMMISSION_RULES.insideSalesDeduction : 0;
  const effectiveRate = baseRate + insideSalesDeduction;

  // Step 7: Agreement Multiplier
  const agreementMultiplier = COMMISSION_RULES.agreementMultipliers[agreementTerm];
  const finalCommissionRate = effectiveRate * (agreementMultiplier / 100);

  // Step 8: Commission Amounts
  const perVisitCommission = commissionableRevenue * (finalCommissionRate / 100);
  const annualCommission = perVisitCommission * visitsPerYear;
  const weeklyCommission = annualCommission / 52;
  // Commission is always paid for 12 months only
  const contractCommission = annualCommission;

  // Step 9: Renewal Bonus
  let renewalBonusRate = 0;
  let renewalBonusAmount = 0;
  if (businessType === 'renewal' && yearsAsCustomer >= COMMISSION_RULES.renewalMinYears) {
    renewalBonusRate = COMMISSION_RULES.renewalBonusRate;
    renewalBonusAmount = totalRenewalValue * (renewalBonusRate / 100);
  }

  return {
    input,
    breakdown: {
      priceRatio,
      pricingTier: pricingTier.label,
      pricingMultiplier,
      requiresApproval,
      originalRevenue: perVisitRevenue,
      revenueDeduction,
      anchorBonus,
      commissionableRevenue,
      revenueWithPricingMultiplier,
      visitsPerYear,
      annualQuotaCredit,
      employeeQuotaThreshold: quotaThreshold.annualQuota,
      totalPeriodSales,
      autoQuotaQualified,
      quotaLevel,
      baseRate,
      insideSalesDeduction,
      effectiveRate,
      agreementMultiplier,
      finalCommissionRate,
      renewalBonusRate,
      renewalBonusAmount,
    },
    perVisitCommission,
    weeklyCommission,
    annualCommission,
    contractCommission,
    renewalBonus: renewalBonusAmount,
    totalCommission: contractCommission + renewalBonusAmount,
    backCommissionEligible: false,
    backCommissionAmount: 0,
    calculatedAt: new Date().toISOString(),
    rulesVersion: COMMISSION_RULES.version,
  };
}

// ============================================================
// EXPRESS CONTROLLER HANDLERS
// ============================================================

/**
 * POST /api/commission/calculate
 * Calculate commission for given input
 */
export const calculateCommission = async (req, res) => {
  try {
    const input = req.body;

    // Validate required fields
    const requiredFields = ['perVisitRevenue', 'redlinePrice', 'frequency', 'accountType', 'agreementTerm', 'contractMonths'];
    for (const field of requiredFields) {
      if (input[field] === undefined || input[field] === null) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    // Validate enum values
    if (!AccountTypes.includes(input.accountType)) {
      return res.status(400).json({ error: `Invalid accountType: ${input.accountType}` });
    }
    if (!AgreementTerms.includes(input.agreementTerm)) {
      return res.status(400).json({ error: `Invalid agreementTerm: ${input.agreementTerm}` });
    }
    if (!ServiceFrequencies.includes(input.frequency)) {
      return res.status(400).json({ error: `Invalid frequency: ${input.frequency}` });
    }

    const result = calculateCommissionV2(input);
    res.json(result);
  } catch (error) {
    logger.error('Commission calculation error:', error);
    res.status(500).json({ error: 'Commission calculation failed', message: error.message });
  }
};

/**
 * POST /api/commission/detect-account-type
 * Auto-detect account type based on revenue and driving time
 */
export const detectAccountTypeEndpoint = async (req, res) => {
  try {
    const { perVisitRevenue, drivingTimeMinutes, isGreenline = false } = req.body;

    if (perVisitRevenue === undefined) {
      return res.status(400).json({ error: 'perVisitRevenue is required' });
    }

    const accountType = detectAccountType(perVisitRevenue, drivingTimeMinutes, isGreenline);

    res.json({
      accountType,
      perVisitRevenue,
      drivingTimeMinutes,
      isGreenline,
      reason: getAccountTypeReason(accountType, perVisitRevenue, drivingTimeMinutes, isGreenline),
    });
  } catch (error) {
    logger.error('Account type detection error:', error);
    res.status(500).json({ error: 'Account type detection failed', message: error.message });
  }
};

function getAccountTypeReason(accountType, perVisitRevenue, drivingTimeMinutes, isGreenline) {
  const threshold = isGreenline ? COMMISSION_RULES.anchorMinGreenline : COMMISSION_RULES.anchorMinPerVisit;

  if (perVisitRevenue >= threshold) {
    return `Revenue $${perVisitRevenue} meets Anchor threshold ($${threshold}+)`;
  }

  if (drivingTimeMinutes === null || drivingTimeMinutes === undefined) {
    return 'No driving time available - defaulting to Pit';
  }

  if (drivingTimeMinutes < 5) {
    return `Within 5 minutes of Anchor (${drivingTimeMinutes} min) - Bread5`;
  }
  if (drivingTimeMinutes <= 15) {
    return `Within 15 minutes of Anchor (${drivingTimeMinutes} min) - Bread15`;
  }
  return `More than 15 minutes from Anchor (${drivingTimeMinutes} min) - Pit`;
}

/**
 * GET /api/commission/rules
 * Get current commission rules
 */
export const getCommissionRules = async (req, res) => {
  res.json({
    rules: COMMISSION_RULES,
    pricingTiers: PRICING_TIERS,
    accountTypeRules: ACCOUNT_TYPE_REVENUE_RULES,
    quotaThresholds: QUOTA_THRESHOLDS,
    autoQuotaRules: AUTO_QUOTA_RULES,
    frequencyVisits: FREQUENCY_VISITS_PER_YEAR,
  });
};

/**
 * GET /api/commission/quota-threshold/:monthsEmployed
 * Get quota threshold for employee tenure
 */
export const getQuotaThresholdEndpoint = async (req, res) => {
  try {
    const monthsEmployed = parseInt(req.params.monthsEmployed, 10);
    if (isNaN(monthsEmployed) || monthsEmployed < 1) {
      return res.status(400).json({ error: 'Invalid monthsEmployed' });
    }

    const threshold = getQuotaThreshold(monthsEmployed);
    const autoRule = AUTO_QUOTA_RULES.find(r => monthsEmployed >= r.minMonths && monthsEmployed <= r.maxMonths);

    res.json({
      monthsEmployed,
      threshold,
      autoQuotaRule: autoRule,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ============================================================
// EXPORTS
// ============================================================

export {
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
};

export default {
  calculateCommission,
  detectAccountTypeEndpoint,
  getCommissionRules,
  getQuotaThresholdEndpoint,
};
