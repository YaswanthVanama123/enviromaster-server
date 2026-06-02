/**
 * QuotaPeriod Model
 * Tracks quota performance over time
 */

import mongoose from "mongoose";

// Quota Period Status
export const QUOTA_PERIOD_STATUS = {
  IN_PROGRESS: "in_progress",
  CLOSED: "closed",
  FINALIZED: "finalized",
};

const QuotaPeriodSchema = new mongoose.Schema(
  {
    salesPersonId: {
      type: String,
      required: true,
      ref: "SalesPerson",
    },
    salesPersonName: {
      type: String,
      required: true,
    },
    // Period definition
    periodType: {
      type: String,
      enum: ["monthly", "quarterly", "annual"],
      required: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    // Period label (e.g., "January 2024", "Q1 2024")
    periodLabel: {
      type: String,
      required: true,
    },
    // Quota target for this period
    quotaTarget: {
      type: Number,
      required: true,
    },
    // Actual performance
    actualSales: {
      type: Number,
      default: 0,
    },
    // Agreement counts
    agreementCount: {
      type: Number,
      default: 0,
    },
    newBusinessCount: {
      type: Number,
      default: 0,
    },
    renewalCount: {
      type: Number,
      default: 0,
    },
    // Calculated quota level
    quotaLevel: {
      type: String,
      enum: ["below", "above", "double"],
      default: "below",
    },
    quotaPercentage: {
      type: Number,
      default: 0,
    },
    // Commission totals for this period
    totalCommissionEarned: {
      type: Number,
      default: 0,
    },
    // Status
    status: {
      type: String,
      enum: Object.values(QUOTA_PERIOD_STATUS),
      default: QUOTA_PERIOD_STATUS.IN_PROGRESS,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
QuotaPeriodSchema.index({ salesPersonId: 1, periodStart: -1 });
QuotaPeriodSchema.index({ periodType: 1, periodStart: 1 });
QuotaPeriodSchema.index({ status: 1 });

// Static: Get current period for sales person
QuotaPeriodSchema.statics.getCurrentPeriod = function (salesPersonId) {
  const now = new Date();
  return this.findOne({
    salesPersonId,
    periodStart: { $lte: now },
    periodEnd: { $gte: now },
    status: QUOTA_PERIOD_STATUS.IN_PROGRESS,
  });
};

// Instance: Calculate quota level
QuotaPeriodSchema.methods.calculateQuotaLevel = function () {
  if (this.quotaTarget <= 0) {
    this.quotaPercentage = 0;
    this.quotaLevel = "below";
    return;
  }

  this.quotaPercentage = (this.actualSales / this.quotaTarget) * 100;

  if (this.quotaPercentage >= 200) {
    this.quotaLevel = "double";
  } else if (this.quotaPercentage >= 100) {
    this.quotaLevel = "above";
  } else {
    this.quotaLevel = "below";
  }
};

const QuotaPeriod = mongoose.model("QuotaPeriod", QuotaPeriodSchema);

export default QuotaPeriod;
