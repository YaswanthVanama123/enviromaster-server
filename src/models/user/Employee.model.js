/**
 * Employee Model
 * Sales employees with quotas and roles
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Sales Role Enum
export const SALES_ROLES = {
  FIELD_SALES: "field_sales",
  INSIDE_SALES: "inside_sales",
  ACCOUNT_MANAGER: "account_manager",
  SALES_MANAGER: "sales_manager",
  NONE: "none",
};

// Quota Period Types
export const QUOTA_PERIOD_TYPES = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUAL: "annual",
};

const EmployeeQuotaSchema = new mongoose.Schema(
  {
    monthlyTarget: {
      type: Number,
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
  { _id: false }
);

const EmployeeSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
    // Sales/Quota related fields
    salesRole: {
      type: String,
      enum: Object.values(SALES_ROLES),
      default: SALES_ROLES.FIELD_SALES,
    },
    territory: {
      type: String,
      trim: true,
    },
    managerId: {
      type: String,
      default: null,
    },
    hireDate: {
      type: Date,
      default: Date.now,
    },
    // Quota configuration
    quota: {
      type: EmployeeQuotaSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// Static: Create employee with hashed password
EmployeeSchema.statics.createEmployee = async function (data) {
  const { username, password, fullName, email, ...rest } = data;
  const passwordHash = await bcrypt.hash(password, 10);

  return this.create({
    username,
    passwordHash,
    fullName,
    email,
    isActive: true,
    ...rest,
  });
};

// Instance: Compare password
EmployeeSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

// Index for search
EmployeeSchema.index({ fullName: "text", email: "text" });
EmployeeSchema.index({ isActive: 1, salesRole: 1 });

const Employee = mongoose.model("Employee", EmployeeSchema);

export default Employee;
