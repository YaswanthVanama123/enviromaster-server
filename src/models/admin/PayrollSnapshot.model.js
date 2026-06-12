/**
 * Payroll Snapshot Model
 * A frozen, point-in-time record of a single payroll period's commissions for
 * every employee. Created automatically the first time a CLOSED (past) period is
 * accessed, so finalized history never changes even if the underlying agreements
 * are later edited or deleted. The current open period is never snapshotted.
 */

import mongoose from "mongoose";

const SnapshotAgreementSchema = new mongoose.Schema(
  {
    id: String,
    title: String,
    status: String,
    createdAt: Date,
    monthlyValue: Number,
    annualCommission: Number,
    weeklyCommission: Number,
  },
  { _id: false }
);

const SnapshotEmployeeSchema = new mongoose.Schema(
  {
    username: String,
    totalAgreements: Number,
    totalMonthlyRevenue: Number,
    totalAnnualCommission: Number,
    totalWeeklyCommission: Number,
    statusCounts: {
      draft: { type: Number, default: 0 },
      saved: { type: Number, default: 0 },
      pending_approval: { type: Number, default: 0 },
      approved: { type: Number, default: 0 },
      active: { type: Number, default: 0 },
    },
    agreements: [SnapshotAgreementSchema],
  },
  { _id: false }
);

const PayrollSnapshotSchema = new mongoose.Schema(
  {
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    periodLabel: { type: String },
    cycleType: { type: String },
    totals: {
      totalEmployees: { type: Number, default: 0 },
      totalAgreements: { type: Number, default: 0 },
      totalMonthlyRevenue: { type: Number, default: 0 },
      totalAnnualCommission: { type: Number, default: 0 },
      totalWeeklyCommission: { type: Number, default: 0 },
    },
    employees: [SnapshotEmployeeSchema],
    snapshotAt: { type: Date, default: Date.now },
    pdfGeneratedAt: { type: Date, default: null },
    pdfCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

PayrollSnapshotSchema.index({ periodStart: 1, periodEnd: 1 }, { unique: true });

const PayrollSnapshot = mongoose.model("PayrollSnapshot", PayrollSnapshotSchema);

export default PayrollSnapshot;
