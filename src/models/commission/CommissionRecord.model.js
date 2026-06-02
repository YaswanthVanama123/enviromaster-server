/**
 * CommissionRecord Model
 * Saved commission calculations
 */

import mongoose from "mongoose";

// Commission Record Status
export const COMMISSION_RECORD_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  PAID: "paid",
};

const CommissionRecordSchema = new mongoose.Schema(
  {
    // Full calculation result
    calculation: {
      input: {
        monthlyValue: Number,
        agreementTerm: String,
        accountType: String,
        pricingLine: String,
        quotaLevel: String,
        businessType: String,
        yearsAsCustomer: Number,
        isInsideSales: Boolean,
        salesPersonId: String,
        salesPersonName: String,
        customerName: String,
        notes: String,
      },
      breakdown: {
        baseRate: Number,
        agreementMultiplier: Number,
        accountTypeAdjustment: Number,
        greenlineBonus: Number,
        renewalBonus: Number,
        insideSalesDeduction: Number,
      },
      effectiveBaseRate: Number,
      finalCommissionRate: Number,
      weeklyCommission: Number,
      annualCommission: Number,
      firstYearCommission: Number,
      calculatedAt: String,
    },
    // Sales person info
    salesPersonId: {
      type: String,
      required: true,
    },
    salesPersonName: {
      type: String,
      required: true,
    },
    customerName: String,
    // Creator
    createdBy: {
      type: String,
      required: true,
    },
    // Status
    status: {
      type: String,
      enum: Object.values(COMMISSION_RECORD_STATUS),
      default: COMMISSION_RECORD_STATUS.DRAFT,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
CommissionRecordSchema.index({ salesPersonId: 1, createdAt: -1 });
CommissionRecordSchema.index({ status: 1, createdAt: -1 });
CommissionRecordSchema.index({ customerName: "text" });

const CommissionRecord = mongoose.model("CommissionRecord", CommissionRecordSchema);

export default CommissionRecord;
