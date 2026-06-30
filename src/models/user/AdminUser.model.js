/**
 * AdminUser Model
 * Admin users with authentication
 */

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import logger from "../../utils/logger.js";

const AdminUserSchema = new mongoose.Schema(
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
    email: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    permissions: {
      backupManagement: { type: Boolean, default: false },
      priceChanges: { type: Boolean, default: false },
    },
    lastLoginAt: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Static: Ensure default admin exists
AdminUserSchema.statics.ensureDefaultAdmin = async function () {
  const DEFAULT_USERNAME = "envimaster";
  const DEFAULT_PASSWORD = "9999999999";

  const existing = await this.findOne({ username: DEFAULT_USERNAME }).exec();
  if (existing) {
    logger.debug("[AdminUser] Default admin already exists");
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  await this.create({
    username: DEFAULT_USERNAME,
    passwordHash,
    isActive: true,
    permissions: { backupManagement: true, priceChanges: true },
  });

  logger.debug(
    "[AdminUser] Default admin created:",
    `username='${DEFAULT_USERNAME}' password='${DEFAULT_PASSWORD}'`
  );
};

// Instance: Compare password
AdminUserSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

const AdminUser = mongoose.model("AdminUser", AdminUserSchema);

export default AdminUser;
