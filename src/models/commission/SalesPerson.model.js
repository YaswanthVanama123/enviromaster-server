/**
 * SalesPerson Model
 * Sales representatives and their quotas
 */

import mongoose from "mongoose";

// Sales Roles
export const SALES_PERSON_ROLES = {
  FIELD_SALES: "field_sales",
  INSIDE_SALES: "inside_sales",
  ACCOUNT_MANAGER: "account_manager",
  SALES_MANAGER: "sales_manager",
};

// Quota Period Types
export const QUOTA_PERIOD_TYPES = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUAL: "annual",
};

const SalesPersonSchema = new mongoose.Schema(
  {
    // Basic info
    employeeId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: String,
    department: {
      type: String,
      default: "Sales",
    },
    role: {
      type: String,
      enum: Object.values(SALES_PERSON_ROLES),
      default: SALES_PERSON_ROLES.FIELD_SALES,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Quota configuration
    quota: {
      monthlyTarget: {
        type: Number,
        required: true,
        default: 50000,
      },
      effectiveDate: {
        type: Date,
        default: Date.now,
      },
      periodType: {
        type: String,
        enum: Object.values(QUOTA_PERIOD_TYPES),
        default: QUOTA_PERIOD_TYPES.MONTHLY,
      },
    },
    // Manager reference
    managerId: {
      type: String,
      default: null,
    },
    // Territory/region assignment
    territory: String,
    // Hire date
    hireDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
SalesPersonSchema.index({ employeeId: 1 });
SalesPersonSchema.index({ email: 1 });
SalesPersonSchema.index({ isActive: 1, name: 1 });
SalesPersonSchema.index({ managerId: 1 });

const SalesPerson = mongoose.model("SalesPerson", SalesPersonSchema);

export default SalesPerson;
