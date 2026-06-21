/**
 * Agreement Model (Commission)
 * Tracking deals/agreements for commission purposes
 */

import mongoose from "mongoose";

// Agreement Status
export const AGREEMENT_STATUS = {
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const CustomerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    id: String,
    address: String,
    city: String,
    state: String,
    zipCode: String,
  },
  { _id: false }
);

const SalesPersonRefSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const InsideSalesSchema = new mongoose.Schema(
  {
    involved: { type: Boolean, default: false },
    personId: String,
    personName: String,
  },
  { _id: false }
);

const DistanceToAnchorSchema = new mongoose.Schema(
  {
    miles: Number,
    drivingTimeMinutes: Number,
    nearestAnchorId: String,
    nearestAnchorName: String,
  },
  { _id: false }
);

const CommissionBreakdownSchema = new mongoose.Schema(
  {
    baseRate: Number,
    agreementMultiplier: Number,
    accountTypeAdjustment: Number,
    greenlineBonus: Number,
    renewalBonus: Number,
    insideSalesDeduction: Number,
  },
  { _id: false }
);

const CommissionSnapshotSchema = new mongoose.Schema(
  {
    quotaLevelAtTime: {
      type: String,
      enum: ["below", "above", "double"],
      required: true,
    },
    effectiveBaseRate: Number,
    finalCommissionRate: Number,
    weeklyCommission: Number,
    annualCommission: Number,
    totalCommission: Number,
    breakdown: CommissionBreakdownSchema,
  },
  { _id: false }
);

const AgreementSchema = new mongoose.Schema(
  {
    // Agreement identification
    agreementNumber: {
      type: String,
      required: true,
      unique: true,
    },
    // Customer info
    customer: CustomerSchema,
    // Sales person who closed the deal
    salesPerson: SalesPersonRefSchema,
    // Inside sales involvement
    insideSales: InsideSalesSchema,
    // Agreement details
    agreementTerm: {
      type: String,
      enum: ["3-year", "1-year", "MTM-with-install", "MTM-no-install"],
      required: true,
    },
    termMonths: {
      type: Number,
      required: true,
    },
    // Financial details
    monthlyValue: {
      type: Number,
      required: true,
    },
    totalContractValue: {
      type: Number,
      required: true,
    },
    perVisitRevenue: Number,
    // Account classification
    accountType: {
      type: String,
      enum: ["Anchor", "Bread5", "Bread15", "Pit"],
      required: true,
    },
    pricingLine: {
      type: String,
      enum: ["Redline", "Greenline"],
      default: "Redline",
    },
    // Business type
    businessType: {
      type: String,
      enum: ["new", "renewal"],
      default: "new",
    },
    yearsAsCustomer: {
      type: Number,
      default: 0,
    },
    // Distance data (from RouteSTAR)
    distanceToAnchor: DistanceToAnchorSchema,
    // Commission calculation snapshot
    commission: CommissionSnapshotSchema,
    // Agreement dates
    startDate: {
      type: Date,
      required: true,
    },
    endDate: Date,
    signedDate: {
      type: Date,
      default: Date.now,
    },
    // Status tracking
    status: {
      type: String,
      enum: Object.values(AGREEMENT_STATUS),
      default: AGREEMENT_STATUS.DRAFT,
    },
    // Approval workflow
    approvedBy: String,
    approvedAt: Date,
    // Notes
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
AgreementSchema.index({ "salesPerson.id": 1, signedDate: -1 });
AgreementSchema.index({ status: 1, startDate: -1 });
AgreementSchema.index({ "customer.name": "text" });

const Agreement = mongoose.model("Agreement", AgreementSchema);

export default Agreement;
