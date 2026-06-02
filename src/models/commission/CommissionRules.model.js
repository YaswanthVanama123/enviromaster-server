/**
 * Commission Rules Model
 * Commission calculation rules and configuration
 */

import mongoose from "mongoose";

// Quota Levels
export const QUOTA_LEVELS = {
  BELOW: "below",
  ABOVE: "above",
  DOUBLE: "double",
};

// Agreement Terms
export const AGREEMENT_TERMS = {
  THREE_YEAR: "3-year",
  ONE_YEAR: "1-year",
  MTM_WITH_INSTALL: "MTM-with-install",
  MTM_NO_INSTALL: "MTM-no-install",
};

// Account Types
export const ACCOUNT_TYPES = {
  ANCHOR: "Anchor",
  BREAD5: "Bread5",
  BREAD15: "Bread15",
  PIT: "Pit",
};

// Pricing Lines
export const PRICING_LINES = {
  REDLINE: "Redline",
  GREENLINE: "Greenline",
};

// Business Types
export const BUSINESS_TYPES = {
  NEW: "new",
  RENEWAL: "renewal",
};

const CommissionRulesSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      default: "2.0.0",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Base commission rates by quota level (percentages)
    quotaRates: {
      below: { type: Number, default: 3 },
      above: { type: Number, default: 6 },
      double: { type: Number, default: 9 },
    },
    // Agreement term multipliers (percentages)
    agreementMultipliers: {
      "3-year": { type: Number, default: 135 },
      "1-year": { type: Number, default: 100 },
      "MTM-with-install": { type: Number, default: 100 },
      "MTM-no-install": { type: Number, default: 50 },
    },
    // V1 LEGACY — Account type adjustments as % reduction.
    // Kept for back-compat; V2 uses per-visit penalties below instead.
    accountTypeAdjustments: {
      Anchor: { type: Number, default: 0 },
      Bread5: { type: Number, default: -1 },
      Bread15: { type: Number, default: -0.5 },
      Pit: { type: Number, default: 0 },
    },
    // V2 — Per-visit penalties (Solange Draft):
    //   "5 minutes (Bread5) subtract first $50 in revenue"
    //   "15 minutes (Bread15) subtract first $75 in revenue"
    //   "First $100 is a Pit. No commission."
    perVisitPenalties: {
      Bread5: { type: Number, default: 50 },
      Bread15: { type: Number, default: 75 },
      Pit: { type: Number, default: 100 },
    },
    // V2 — Anchor tiered-calc thresholds + bonus (per visit).
    // Anchor minimum is the qualifier ($200 normal, $100 if Greenline).
    // The tiered calc uses pitPerVisitThreshold ($100, no commission below)
    // and anchorPerVisitThreshold ($200, 150% bonus above).
    anchorMinPerVisit: { type: Number, default: 200 },
    anchorMinGreenline: { type: Number, default: 100 },
    pitPerVisitThreshold: { type: Number, default: 100 },
    anchorPerVisitThreshold: { type: Number, default: 200 },
    anchorBonusMultiplier: { type: Number, default: 1.5 },
    // V1 LEGACY (kept for back-compat with old monthly-threshold check)
    anchorMinMonthlyValue: { type: Number, default: 200 },
    // V1 LEGACY — flat Greenline bonus % (now superseded by pricingTiers below)
    greenlineBonus: { type: Number, default: 1 },
    // V2 — Pricing tiers driving the multiplier on commission base + quota credit.
    // Spec: "$1 per $1 at Redline, $2 per dollar at Greenline. Below Redline
    // is half value." minRatio is inclusive, maxRatio is exclusive (Infinity
    // for Greenline). requiresApproval flags below-redline deals.
    pricingTiers: {
      type: [
        {
          minRatio: { type: Number, required: true },
          maxRatio: { type: Number, required: true },
          quotaMultiplier: { type: Number, required: true },
          label: { type: String, required: true },
          requiresApproval: { type: Boolean, default: false },
        },
      ],
      default: [
        { minRatio: 0,    maxRatio: 0.99,     quotaMultiplier: 0.5,  label: "Below Redline",       requiresApproval: true  },
        { minRatio: 1.00, maxRatio: 1.09,     quotaMultiplier: 1.0,  label: "Redline",              requiresApproval: false },
        { minRatio: 1.10, maxRatio: 1.19,     quotaMultiplier: 1.25, label: "110% Premium",         requiresApproval: false },
        { minRatio: 1.20, maxRatio: 1.29,     quotaMultiplier: 1.5,  label: "120% Premium",         requiresApproval: false },
        { minRatio: 1.30, maxRatio: Infinity, quotaMultiplier: 2.0,  label: "Greenline (130%+)",    requiresApproval: false },
      ],
    },
    // V2 — Visits per year by frequency. Spec: "weekly = 50 weeks (holidays
    // excluded), monthly = 12, quarterly = 4."
    frequencyVisitsPerYear: {
      weekly: { type: Number, default: 50 },
      biweekly: { type: Number, default: 25 },
      monthly: { type: Number, default: 12 },
      quarterly: { type: Number, default: 4 },
      "one-time": { type: Number, default: 1 },
    },
    // V2 — Divisor used when displaying annual commission as a weekly figure.
    // Default 52 (calendar weeks). Admin may want to align with frequencyVisitsPerYear.weekly
    // (e.g. 50 to exclude holiday weeks) so the displayed weekly equals the
    // commission earned during a billed week, not a calendar week.
    weeksPerAnnualCommission: { type: Number, default: 52 },
    // V2 — Quota tier cutoffs (admin-editable). Used for the piecewise
    // commission rate split: below cutoff → 3%, above → 6%, double → 9%.
    // Defaults match Solange Draft Month 5+ tier ($10K) and 2× ($20K).
    quotaTierCutoffs: {
      aboveQuota: { type: Number, default: 10000 },
      doubleQuota: { type: Number, default: 20000 },
    },
    // Renewal bonus rate
    renewalBonusRate: {
      type: Number,
      default: 4,
    },
    // Minimum years for renewal bonus
    renewalMinYears: {
      type: Number,
      default: 2,
    },
    // Inside sales deduction (percentage points)
    insideSalesDeduction: {
      type: Number,
      default: -3,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
CommissionRulesSchema.index({ isActive: 1 });
CommissionRulesSchema.index({ version: 1 });

// Static: Get active rules
CommissionRulesSchema.statics.getActiveRules = function () {
  return this.findOne({ isActive: true }).sort({ createdAt: -1 });
};

// Default commission rules (V2 spec-faithful)
export const DEFAULT_COMMISSION_RULES = {
  version: "2.0.0",
  isActive: true,
  quotaRates: {
    below: 3,
    above: 6,
    double: 9,
  },
  agreementMultipliers: {
    "3-year": 135,
    "1-year": 100,
    "MTM-with-install": 100,
    "MTM-no-install": 50,
  },
  accountTypeAdjustments: {
    Anchor: 0,
    Bread5: -1,
    Bread15: -0.5,
    Pit: 0,
  },
  perVisitPenalties: {
    Bread5: 50,
    Bread15: 75,
    Pit: 100,
  },
  anchorMinPerVisit: 200,
  anchorMinGreenline: 100,
  pitPerVisitThreshold: 100,
  anchorPerVisitThreshold: 200,
  anchorBonusMultiplier: 1.5,
  anchorMinMonthlyValue: 200,
  greenlineBonus: 1,
  pricingTiers: [
    { minRatio: 0,    maxRatio: 0.99, quotaMultiplier: 0.5,  label: "Below Redline",     requiresApproval: true  },
    { minRatio: 1.00, maxRatio: 1.09, quotaMultiplier: 1.0,  label: "Redline",            requiresApproval: false },
    { minRatio: 1.10, maxRatio: 1.19, quotaMultiplier: 1.25, label: "110% Premium",       requiresApproval: false },
    { minRatio: 1.20, maxRatio: 1.29, quotaMultiplier: 1.5,  label: "120% Premium",       requiresApproval: false },
    { minRatio: 1.30, maxRatio: Number.POSITIVE_INFINITY, quotaMultiplier: 2.0, label: "Greenline (130%+)", requiresApproval: false },
  ],
  frequencyVisitsPerYear: {
    weekly: 50,
    biweekly: 25,
    monthly: 12,
    quarterly: 4,
    "one-time": 1,
  },
  weeksPerAnnualCommission: 52,
  quotaTierCutoffs: {
    aboveQuota: 10000,
    doubleQuota: 20000,
  },
  renewalBonusRate: 4,
  renewalMinYears: 2,
  insideSalesDeduction: -3,
};

const CommissionRules = mongoose.model("CommissionRules", CommissionRulesSchema);

export default CommissionRules;
