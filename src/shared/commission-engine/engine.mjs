// GENERATED FILE - do not edit by hand. Source: enviromaster-webapp/src/shared/commission-engine. Rebuild: npm run build:commission-engine

// src/backendservice/types/commission.types.v2.ts
var FREQUENCY_VISITS_PER_YEAR = {
  "weekly": 50,
  "biweekly": 25,
  "monthly": 12,
  "quarterly": 4,
  "one-time": 1
};
var DEFAULT_COMMISSION_RULES_V2 = {
  version: "2.0.0",
  isActive: true,
  quotaRates: {
    below: 3,
    above: 6,
    double: 9
  },
  agreementMultipliers: {
    "3-year": 135,
    "1-year": 100,
    "MTM-with-install": 100,
    "MTM-no-install": 50
  },
  insideSalesDeduction: -3,
  renewalBonusRate: 4,
  renewalMinYears: 2,
  anchorMinPerVisit: 200,
  anchorMinGreenline: 100
};

// src/backendservice/utils/commissionCalculatorV2.ts
function getVisitsPerYear(frequency) {
  return FREQUENCY_VISITS_PER_YEAR[frequency] || 1;
}
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount);
}

// src/backendservice/types/commission.types.ts
var PRICING_TIERS2 = [
  { minRatio: 0, maxRatio: 0.99, quotaMultiplier: 0.5, label: "Below Redline", requiresApproval: true },
  { minRatio: 1, maxRatio: 1.09, quotaMultiplier: 1, label: "Redline", requiresApproval: false },
  { minRatio: 1.1, maxRatio: 1.19, quotaMultiplier: 1.25, label: "110% Premium", requiresApproval: false },
  { minRatio: 1.2, maxRatio: 1.29, quotaMultiplier: 1.5, label: "120% Premium", requiresApproval: false },
  { minRatio: 1.3, maxRatio: Infinity, quotaMultiplier: 2, label: "Greenline (130%+)", requiresApproval: false }
];
var ACCOUNT_TYPE_REVENUE_RULES2 = {
  "Anchor": { revenueDeduction: 0, anchorBonusThreshold: 200, anchorBonusMultiplier: 1.5 },
  "Bread5": { revenueDeduction: 50, anchorBonusThreshold: 0, anchorBonusMultiplier: 1 },
  "Bread15": { revenueDeduction: 75, anchorBonusThreshold: 0, anchorBonusMultiplier: 1 },
  "Pit": { revenueDeduction: 100, anchorBonusThreshold: 0, anchorBonusMultiplier: 1 }
};
var FREQUENCY_VISITS_PER_YEAR2 = {
  "weekly": 50,
  "biweekly": 25,
  "monthly": 12,
  "quarterly": 4,
  "one-time": 1
};
var COMMISSION_RULES_V2 = {
  version: "2.0.0",
  quotaRates: {
    below: 3,
    above: 6,
    double: 9
  },
  agreementMultipliers: {
    "3-year": 135,
    "1-year": 100,
    "MTM-with-install": 100,
    "MTM-no-install": 50
  },
  insideSalesDeduction: -3,
  renewalBonusRate: 4,
  renewalMinYears: 2,
  anchorMinPerVisit: 200,
  anchorMinGreenline: 100
};
var DEFAULT_QUOTA_TIER_CUTOFFS = {
  aboveQuota: 1e4,
  doubleQuota: 2e4
};
var DEFAULT_QUOTA_TARGET = 5e4;
var PIT_PER_VISIT_THRESHOLD = 100;
var ANCHOR_PER_VISIT_THRESHOLD = 200;
var ANCHOR_BONUS_MULTIPLIER = 1.5;
function resolveCommissionRules(partial) {
  const p = partial || {};
  return {
    quotaRates: {
      below: p.quotaRates?.below ?? COMMISSION_RULES_V2.quotaRates.below,
      above: p.quotaRates?.above ?? COMMISSION_RULES_V2.quotaRates.above,
      double: p.quotaRates?.double ?? COMMISSION_RULES_V2.quotaRates.double
    },
    agreementMultipliers: {
      "3-year": p.agreementMultipliers?.["3-year"] ?? COMMISSION_RULES_V2.agreementMultipliers["3-year"],
      "1-year": p.agreementMultipliers?.["1-year"] ?? COMMISSION_RULES_V2.agreementMultipliers["1-year"],
      "MTM-with-install": p.agreementMultipliers?.["MTM-with-install"] ?? COMMISSION_RULES_V2.agreementMultipliers["MTM-with-install"],
      "MTM-no-install": p.agreementMultipliers?.["MTM-no-install"] ?? COMMISSION_RULES_V2.agreementMultipliers["MTM-no-install"]
    },
    insideSalesDeduction: p.insideSalesDeduction ?? COMMISSION_RULES_V2.insideSalesDeduction,
    renewalBonusRate: p.renewalBonusRate ?? COMMISSION_RULES_V2.renewalBonusRate,
    renewalMinYears: p.renewalMinYears ?? COMMISSION_RULES_V2.renewalMinYears,
    anchorMinPerVisit: p.anchorMinPerVisit ?? COMMISSION_RULES_V2.anchorMinPerVisit,
    anchorMinGreenline: p.anchorMinGreenline ?? COMMISSION_RULES_V2.anchorMinGreenline,
    pitPerVisitThreshold: p.pitPerVisitThreshold ?? PIT_PER_VISIT_THRESHOLD,
    anchorPerVisitThreshold: p.anchorPerVisitThreshold ?? ANCHOR_PER_VISIT_THRESHOLD,
    anchorBonusMultiplier: p.anchorBonusMultiplier ?? ANCHOR_BONUS_MULTIPLIER,
    perVisitPenalties: {
      Anchor: 0,
      Bread5: p.perVisitPenalties?.Bread5 ?? ACCOUNT_TYPE_REVENUE_RULES2.Bread5.revenueDeduction,
      Bread15: p.perVisitPenalties?.Bread15 ?? ACCOUNT_TYPE_REVENUE_RULES2.Bread15.revenueDeduction,
      Pit: p.perVisitPenalties?.Pit ?? ACCOUNT_TYPE_REVENUE_RULES2.Pit.revenueDeduction
    },
    pricingTiers: p.pricingTiers && p.pricingTiers.length > 0 ? p.pricingTiers : PRICING_TIERS2,
    frequencyVisitsPerYear: {
      weekly: p.frequencyVisitsPerYear?.weekly ?? FREQUENCY_VISITS_PER_YEAR2.weekly,
      biweekly: p.frequencyVisitsPerYear?.biweekly ?? FREQUENCY_VISITS_PER_YEAR2.biweekly,
      monthly: p.frequencyVisitsPerYear?.monthly ?? FREQUENCY_VISITS_PER_YEAR2.monthly,
      quarterly: p.frequencyVisitsPerYear?.quarterly ?? FREQUENCY_VISITS_PER_YEAR2.quarterly,
      "one-time": p.frequencyVisitsPerYear?.["one-time"] ?? FREQUENCY_VISITS_PER_YEAR2["one-time"]
    },
    quotaTierCutoffs: {
      aboveQuota: p.quotaTierCutoffs?.aboveQuota ?? DEFAULT_QUOTA_TIER_CUTOFFS.aboveQuota,
      doubleQuota: p.quotaTierCutoffs?.doubleQuota ?? DEFAULT_QUOTA_TIER_CUTOFFS.doubleQuota
    },
    quotaTarget: p.quotaTarget ?? DEFAULT_QUOTA_TARGET,
    weeksPerAnnualCommission: p.weeksPerAnnualCommission ?? 52
  };
}
function getPricingTierFromList(actualPrice, redlinePrice, tiers) {
  if (!tiers || tiers.length === 0) return PRICING_TIERS2[1];
  if (redlinePrice <= 0) return tiers[1] ?? tiers[0];
  const ratio = actualPrice / redlinePrice;
  for (const tier of tiers) {
    const max = Number.isFinite(tier.maxRatio) ? tier.maxRatio : Infinity;
    if (ratio >= tier.minRatio && ratio < max) return tier;
  }
  return tiers[tiers.length - 1];
}

// src/shared/commission-engine/frequency.ts
var BACKEND_TO_FREQUENCY = {
  1: "Weekly",
  2: "Bi-Weekly",
  3: "Monthly",
  4: "Quarterly",
  5: "Semi-Annual",
  6: "Annual",
  13: "Twice per Month",
  14: "Bi-Monthly",
  0: "One-Time"
};
var FREQUENCY_TO_BACKEND = {
  weekly: 1,
  biweekly: 2,
  twicepermonth: 13,
  monthly: 3,
  bimonthly: 14,
  quarterly: 4,
  semiannual: 5,
  biannual: 5,
  annual: 6,
  onetime: 0,
  "bi-weekly": 2,
  "bi-monthly": 14,
  "semi-annual": 5,
  "bi-annual": 5,
  "one-time": 0,
  "1time": 0,
  everyfourweeks: 3,
  "every four weeks": 3
};
function normalizeFrequencyKey(value) {
  if (value === void 0 || value === null) return null;
  const raw = typeof value === "object" ? value.frequencyKey ?? value.value ?? value.label ?? value.name ?? value.frequency ?? "" : value;
  const text = String(raw).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return text || null;
}
function getFrequencyNumber(serviceData) {
  if (!serviceData) return null;
  const candidates = [
    serviceData.frequency,
    serviceData.frequencyKey,
    serviceData.frequency?.frequencyKey,
    serviceData.frequency?.value,
    serviceData.frequency?.label,
    serviceData.frequencyDisplay?.frequencyKey,
    serviceData.frequencyDisplay?.value
  ];
  for (const candidate of candidates) {
    const normalized = normalizeFrequencyKey(candidate);
    if (normalized && FREQUENCY_TO_BACKEND[normalized] !== void 0) {
      return FREQUENCY_TO_BACKEND[normalized];
    }
  }
  return null;
}

// src/shared/commission-engine/computeGlobalCommission.ts
var ACCOUNT_TYPE_DEDUCTIONS = {
  Anchor: 0,
  Bread5: 50,
  Bread15: 75,
  Pit: 100
};
var FREQ_ORDER_BY_VISITS_ASC = [6, 0, 5, 4, 14, 3, 13, 2, 1];
function findAccountEntry(cache, freqNum) {
  if (cache[freqNum]) return cache[freqNum];
  const idx = FREQ_ORDER_BY_VISITS_ASC.indexOf(freqNum);
  if (idx === -1) {
    for (const f of FREQ_ORDER_BY_VISITS_ASC) if (cache[f]) return cache[f];
    return void 0;
  }
  for (let i = idx + 1; i < FREQ_ORDER_BY_VISITS_ASC.length; i++) {
    if (cache[FREQ_ORDER_BY_VISITS_ASC[i]]) return cache[FREQ_ORDER_BY_VISITS_ASC[i]];
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (cache[FREQ_ORDER_BY_VISITS_ASC[i]]) return cache[FREQ_ORDER_BY_VISITS_ASC[i]];
  }
  return void 0;
}
function getAgreementTerm(contractMonths) {
  if (contractMonths >= 36) return "3-year";
  if (contractMonths >= 12) return "1-year";
  return "MTM-with-install";
}
function getAgreementMultiplier(contractMonths) {
  const term = getAgreementTerm(contractMonths);
  return DEFAULT_COMMISSION_RULES_V2.agreementMultipliers[term];
}
var EXTENDED_FREQUENCY_VISITS = {
  "weekly": 52,
  "biweekly": 26,
  "bi-weekly": 26,
  "monthly": 12,
  "quarterly": 4,
  "semi-annual": 2,
  "annual": 1,
  "twice-per-month": 24,
  "bi-monthly": 6,
  "one-time": 1
};
function backendFrequencyToServiceFrequency(freqNum) {
  const mapping = {
    1: "weekly",
    2: "bi-weekly",
    3: "monthly",
    4: "quarterly",
    5: "semi-annual",
    6: "annual",
    13: "twice-per-month",
    14: "bi-monthly",
    0: "one-time"
  };
  return mapping[freqNum] || "monthly";
}
function getVisitsPerYearExtended(frequency) {
  if (EXTENDED_FREQUENCY_VISITS[frequency] !== void 0) {
    return EXTENDED_FREQUENCY_VISITS[frequency];
  }
  try {
    return getVisitsPerYear(frequency);
  } catch {
    return 12;
  }
}
function computeQuotaTierPortions(priorQuotaCredit, agreementQuotaCredit, quotaTarget, rates) {
  const bounds = [0, quotaTarget, quotaTarget * 2, Infinity];
  const defs = [
    { level: "below", label: "Below Quota", rate: rates.below },
    { level: "above", label: "Above Quota", rate: rates.above },
    { level: "double", label: "Double Quota", rate: rates.double }
  ];
  const lo = Math.max(0, priorQuotaCredit);
  const hi = lo + agreementQuotaCredit;
  return defs.map((d, i) => {
    const from = Math.max(lo, bounds[i]);
    const to = Math.min(hi, bounds[i + 1]);
    const quotaCredit = Math.max(0, to - from);
    return { ...d, quotaCredit, commission: quotaCredit * (d.rate / 100) };
  });
}
function progressiveQuotaCommissionRate(priorQuotaCredit, agreementQuotaCredit, quotaTarget, rates, fallbackRate) {
  if (agreementQuotaCredit <= 0 || quotaTarget <= 0) return fallbackRate;
  const portions = computeQuotaTierPortions(priorQuotaCredit, agreementQuotaCredit, quotaTarget, rates);
  const commission = portions.reduce((sum, t) => sum + t.commission, 0);
  return commission / agreementQuotaCredit * 100;
}
function computeCommissionTiers(priorQuotaCredit, commissionableBase, quotaTarget, rates, agreementMultiplier) {
  const bounds = [0, quotaTarget, quotaTarget * 2, Infinity];
  const defs = [
    { level: "below", label: "Below Quota", rate: rates.below },
    { level: "above", label: "Above Quota", rate: rates.above },
    { level: "double", label: "Double Quota", rate: rates.double }
  ];
  const mult = agreementMultiplier / 100;
  const lo = Math.max(0, priorQuotaCredit);
  const hi = lo + commissionableBase;
  return defs.map((d, i) => {
    const from = Math.max(lo, bounds[i]);
    const to = Math.min(hi, bounds[i + 1]);
    const base = Math.max(0, to - from);
    const effectiveRate = d.rate * mult;
    return { ...d, effectiveRate, base, commission: base * (effectiveRate / 100) };
  });
}
function computeGlobalCommission(servicesState, accountTypeCache, globalContractMonths, commissionRate, rules, priorQuotaCredit = 0, isNewLocation = true, priorLocationFarAnnualRedline = 0, priorLocationFarAnnualGreenline = 0) {
  const visitsPerYearOf = (freqStr) => {
    const v = rules.frequencyVisitsPerYear;
    const norm = (freqStr || "monthly").toLowerCase().replace(/-/g, "");
    if (norm === "weekly") return v.weekly;
    if (norm === "biweekly") return v.biweekly;
    if (norm === "monthly") return v.monthly;
    if (norm === "quarterly") return v.quarterly;
    if (norm === "onetime") return v["one-time"];
    return EXTENDED_FREQUENCY_VISITS[freqStr] ?? 12;
  };
  const agreementTerm = getAgreementTerm(globalContractMonths);
  const agreementMultiplier = rules.agreementMultipliers[agreementTerm];
  const rows = [];
  Object.entries(servicesState).forEach(([serviceName, serviceData]) => {
    if (!serviceData?.isActive) return;
    const freqNum = getFrequencyNumber(serviceData);
    if (freqNum === null || freqNum === 0) return;
    const serviceCurrent = typeof serviceData.contractTotal === "number" && serviceData.contractTotal || serviceData.totals?.contract?.amount || serviceData.totals?.annual?.amount || 0;
    const serviceOriginal = typeof serviceData.originalContractTotal === "number" && serviceData.originalContractTotal || serviceCurrent;
    if (serviceCurrent <= 0) return;
    const annualCurrent = globalContractMonths > 0 ? serviceCurrent / globalContractMonths * 12 : serviceCurrent;
    const annualOriginal = globalContractMonths > 0 ? serviceOriginal / globalContractMonths * 12 : serviceOriginal;
    const cacheEntry = findAccountEntry(accountTypeCache, freqNum);
    const accountType = cacheEntry?.accountType || null;
    const freqStr = backendFrequencyToServiceFrequency(freqNum);
    const freqLabel = BACKEND_TO_FREQUENCY[freqNum] || "Unknown";
    rows.push({
      serviceName,
      serviceData,
      freqNum,
      freqLabel,
      freqStr,
      annualCurrent,
      annualOriginal,
      accountType,
      cacheEntry
    });
  });
  const groups = /* @__PURE__ */ new Map();
  rows.forEach((row) => {
    const key = `${row.accountType || "none"}|${row.freqStr}`;
    if (!groups.has(key)) {
      groups.set(key, {
        freqStr: row.freqStr,
        freqLabel: row.freqLabel,
        rows: [],
        accountType: row.accountType,
        annualCurrent: 0,
        annualOriginal: 0,
        priceRatio: 1,
        pricingTier: PRICING_TIERS2[1],
        pricingMultiplier: 1,
        adjustedAnnual: 0,
        revenueDeduction: 0,
        anchorBonus: 0,
        commissionableAnnual: 0,
        annualCommission: 0,
        farTiers: null
      });
    }
    const g = groups.get(key);
    g.rows.push(row);
    g.annualCurrent += row.annualCurrent;
    g.annualOriginal += row.annualOriginal;
    if (!g.accountType && row.accountType) g.accountType = row.accountType;
  });
  let totalCommissionableAnnual = 0;
  let totalQuotaCredit = 0;
  let totalFarAnnual = 0;
  let numFarGroups = 0;
  groups.forEach((g) => {
    if (g.accountType === "Anchor" || g.accountType === "Pit") numFarGroups++;
  });
  let agreementCurrentAnnual = 0;
  let agreementOriginalAnnual = 0;
  rows.forEach((r) => {
    agreementCurrentAnnual += r.annualCurrent;
    agreementOriginalAnnual += r.annualOriginal;
  });
  const agreementPriceRatio = agreementOriginalAnnual > 0 ? agreementCurrentAnnual / agreementOriginalAnnual : 1;
  const agreementPricingTier = getPricingTierFromList(
    agreementCurrentAnnual,
    agreementOriginalAnnual,
    rules.pricingTiers
  );
  const agreementPricingMultiplier = agreementPricingTier.quotaMultiplier;
  const agreementIsGreenline = agreementPricingTier.label === "Greenline (130%+)";
  const priorLocationFarAnnual = agreementIsGreenline ? priorLocationFarAnnualGreenline : priorLocationFarAnnualRedline;
  const perFarGroupPrior = !isNewLocation && numFarGroups > 0 ? priorLocationFarAnnual / numFarGroups : 0;
  groups.forEach((g) => {
    g.pricingTier = agreementPricingTier;
    g.pricingMultiplier = agreementPricingMultiplier;
    g.priceRatio = agreementPriceRatio;
    const isGreenline = agreementIsGreenline;
    g.adjustedAnnual = g.annualCurrent * g.pricingMultiplier;
    const visits = visitsPerYearOf(g.freqStr);
    const pitZoneAnnual = rules.pitPerVisitThreshold * visits;
    const anchorZoneAnnual = (isGreenline ? rules.anchorMinGreenline : rules.anchorPerVisitThreshold) * visits;
    const pen = rules.perVisitPenalties;
    const bread5Annual = pen.Bread5 * visits;
    const bread15Annual = pen.Bread15 * visits;
    const pitAnnual = pen.Pit * visits;
    const adjusted = g.adjustedAnnual;
    switch (g.accountType) {
      case "Anchor":
      case "Pit": {
        totalFarAnnual += adjusted;
        const prior = perFarGroupPrior;
        const comb = adjusted + prior;
        const tieredFar = (v) => Math.min(Math.max(0, v - pitZoneAnnual), Math.max(0, anchorZoneAnnual - pitZoneAnnual)) + Math.max(0, v - anchorZoneAnnual) * rules.anchorBonusMultiplier;
        const visitsF = visits > 0 ? visits : 1;
        const round2 = (x) => Math.round(x * 100) / 100;
        const cpv = round2(Math.max(0, tieredFar(comb) - tieredFar(prior)) / visitsF);
        g.commissionableAnnual = cpv * visitsF;
        g.revenueDeduction = Math.max(0, Math.min(comb, pitZoneAnnual) - Math.min(prior, pitZoneAnnual));
        const anchorOfThis = Math.max(0, comb - anchorZoneAnnual) - Math.max(0, prior - anchorZoneAnnual);
        g.anchorBonus = anchorOfThis * (rules.anchorBonusMultiplier - 1);
        const bandNormal = Math.max(0, Math.min(comb, anchorZoneAnnual) - Math.max(prior, pitZoneAnnual));
        g.farTiers = {
          originalPerVisit: round2(g.annualOriginal / visitsF),
          currentPerVisit: round2(adjusted / visitsF),
          priorPerVisit: round2(prior / visitsF),
          combinedPerVisit: round2(comb / visitsF),
          pitThreshold: rules.pitPerVisitThreshold,
          anchorThreshold: isGreenline ? rules.anchorMinGreenline : rules.anchorPerVisitThreshold,
          isGreenline,
          noCommPerVisit: round2(g.revenueDeduction / visitsF),
          normalPerVisit: round2(bandNormal / visitsF),
          anchorPerVisit: round2(anchorOfThis / visitsF),
          commissionablePerVisit: cpv
        };
        break;
      }
      case "Bread5": {
        g.revenueDeduction = bread5Annual;
        g.commissionableAnnual = Math.max(0, adjusted - g.revenueDeduction);
        break;
      }
      case "Bread15": {
        g.revenueDeduction = bread15Annual;
        g.commissionableAnnual = Math.max(0, adjusted - g.revenueDeduction);
        break;
      }
      default: {
        g.revenueDeduction = 0;
        g.commissionableAnnual = adjusted;
      }
    }
    totalCommissionableAnnual += g.commissionableAnnual;
    totalQuotaCredit += g.annualCurrent * g.pricingMultiplier;
  });
  let totalAnnualCommission = 0;
  let totalWeeklyCommission = 0;
  let totalPerVisitCommission = 0;
  let totalPerVisitRevenue = 0;
  let totalCommissionableRevenue = 0;
  const services = [];
  const groupsList = [];
  const baseQuotaRate = progressiveQuotaCommissionRate(
    priorQuotaCredit,
    totalQuotaCredit,
    rules.quotaTarget,
    rules.quotaRates,
    commissionRate
  );
  const quotaTierBreakdown = rules.quotaTarget > 0 && totalQuotaCredit > 0 ? computeQuotaTierPortions(priorQuotaCredit, totalQuotaCredit, rules.quotaTarget, rules.quotaRates) : [];
  const commissionTierBreakdown = rules.quotaTarget > 0 && totalCommissionableAnnual > 0 ? computeCommissionTiers(
    priorQuotaCredit,
    totalCommissionableAnnual,
    rules.quotaTarget,
    rules.quotaRates,
    agreementMultiplier
  ) : [];
  const tieredCommission = commissionTierBreakdown.reduce((sum, t) => sum + t.commission, 0);
  const effectiveCommissionRate = commissionTierBreakdown.length > 0 && totalCommissionableAnnual > 0 ? tieredCommission / totalCommissionableAnnual * 100 : baseQuotaRate * (agreementMultiplier / 100);
  groups.forEach((g) => {
    g.annualCommission = g.commissionableAnnual * (effectiveCommissionRate / 100);
    const groupVisits = visitsPerYearOf(g.freqStr);
    groupsList.push({
      groupKey: `${g.accountType || "none"}|${g.freqStr}`,
      serviceNames: g.rows.map((r) => r.serviceName),
      accountType: g.accountType,
      frequencyLabel: g.freqLabel,
      visitsPerYear: groupVisits,
      perVisitRevenue: g.annualCurrent,
      revenueDeduction: g.revenueDeduction,
      commissionableRevenue: g.commissionableAnnual,
      anchorBonus: g.anchorBonus,
      annualOriginalRevenue: g.annualOriginal,
      priceRatio: g.priceRatio,
      pricingTierLabel: g.pricingTier.label,
      pricingMultiplier: g.pricingMultiplier,
      perVisitCommission: groupVisits > 0 ? g.annualCommission / groupVisits : 0,
      weeklyCommission: g.annualCommission / rules.weeksPerAnnualCommission,
      annualCommission: g.annualCommission,
      farTiers: g.farTiers
    });
    g.rows.forEach((row) => {
      const share = g.annualCurrent > 0 ? row.annualCurrent / g.annualCurrent : 0;
      const rowAnnualCommission = g.annualCommission * share;
      const rowCommissionable = g.commissionableAnnual * share;
      const rowDeduction = g.revenueDeduction * share;
      const rowAnchorBonus = g.anchorBonus * share;
      const rowWeekly = rowAnnualCommission / rules.weeksPerAnnualCommission;
      const rowPerVisit = groupVisits > 0 ? rowAnnualCommission / groupVisits : 0;
      totalAnnualCommission += rowAnnualCommission;
      totalWeeklyCommission += rowWeekly;
      totalPerVisitCommission += rowPerVisit;
      totalPerVisitRevenue += row.annualCurrent;
      totalCommissionableRevenue += rowCommissionable;
      const rowAdjusted = row.annualCurrent * g.pricingMultiplier;
      const rowOriginal = row.annualOriginal;
      services.push({
        serviceName: row.serviceName,
        accountType: row.accountType,
        confidence: row.cacheEntry?.confidence || null,
        reason: row.cacheEntry?.reason || null,
        perVisitRevenue: row.annualCurrent,
        revenueDeduction: rowDeduction,
        commissionableRevenue: rowCommissionable,
        anchorBonus: rowAnchorBonus,
        annualOriginalRevenue: rowOriginal,
        priceRatio: g.priceRatio,
        pricingTierLabel: g.pricingTier.label,
        pricingMultiplier: g.pricingMultiplier,
        adjustedAnnualRevenue: rowAdjusted,
        frequencyNumber: row.freqNum,
        frequencyLabel: row.freqLabel,
        visitsPerYear: groupVisits,
        perVisitCommission: rowPerVisit,
        weeklyCommission: rowWeekly,
        annualCommission: rowAnnualCommission,
        farTiers: g.farTiers,
        formatted: {
          perVisitRevenue: formatCurrency(row.annualCurrent),
          revenueDeduction: formatCurrency(rowDeduction),
          commissionableRevenue: formatCurrency(rowCommissionable),
          annualOriginalRevenue: formatCurrency(rowOriginal),
          adjustedAnnualRevenue: formatCurrency(rowAdjusted),
          priceRatio: `${(g.priceRatio * 100).toFixed(1)}%`,
          pricingMultiplier: `${g.pricingMultiplier.toFixed(2)}\xD7`,
          perVisitCommission: formatCurrency(rowPerVisit),
          weeklyCommission: formatCurrency(rowWeekly),
          annualCommission: formatCurrency(rowAnnualCommission)
        }
      });
    });
  });
  return {
    totalPerVisitCommission,
    totalWeeklyCommission,
    totalAnnualCommission,
    totalPerVisitRevenue,
    totalCommissionableRevenue,
    totalQuotaCredit,
    totalFarAnnual,
    farIsGreenline: agreementIsGreenline,
    agreementMultiplier,
    effectiveCommissionRate,
    priorQuotaCredit,
    quotaTarget: rules.quotaTarget,
    quotaTierBreakdown,
    commissionTierBreakdown,
    services,
    groups: groupsList,
    formatted: {
      totalPerVisitCommission: formatCurrency(totalPerVisitCommission),
      totalWeeklyCommission: formatCurrency(totalWeeklyCommission),
      totalAnnualCommission: formatCurrency(totalAnnualCommission),
      totalPerVisitRevenue: formatCurrency(totalPerVisitRevenue),
      totalCommissionableRevenue: formatCurrency(totalCommissionableRevenue)
    },
    hasDetectedServices: services.some((s) => s.accountType !== null),
    serviceCount: services.length
  };
}
export {
  ACCOUNT_TYPE_DEDUCTIONS,
  BACKEND_TO_FREQUENCY,
  DEFAULT_COMMISSION_RULES_V2,
  FREQUENCY_TO_BACKEND,
  backendFrequencyToServiceFrequency,
  computeCommissionTiers,
  computeGlobalCommission,
  computeQuotaTierPortions,
  getAgreementMultiplier,
  getFrequencyNumber,
  getPricingTierFromList,
  getVisitsPerYearExtended,
  normalizeFrequencyKey,
  progressiveQuotaCommissionRate,
  resolveCommissionRules
};
