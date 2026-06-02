/**
 * AdminSettings Model
 * Global admin settings singleton
 */

import mongoose from "mongoose";

const AdminSettingsSchema = new mongoose.Schema(
  {
    // Singleton key — there is only one document
    key: { type: String, default: "global", unique: true },

    // Default owner for auto-created approval tasks
    defaultApprovalTaskOwner: {
      id: { type: String, default: null },
      name: { type: String, default: null },
    },

    // Task subject template ({{agreementTitle}} replaced at runtime)
    approvalTaskSubject: {
      type: String,
      default: 'Agreement "{{agreementTitle}}" needs your approval',
    },

    // Email settings
    emailSettings: {
      smtpEnabled: { type: Boolean, default: false },
      fromAddress: { type: String, default: null },
      replyToAddress: { type: String, default: null },
    },

    // Sync settings
    syncSettings: {
      routeStarAutoSync: { type: Boolean, default: false },
      routeStarSyncInterval: { type: Number, default: 3600000 }, // 1 hour
      biginAutoSync: { type: Boolean, default: false },
      biginSyncInterval: { type: Number, default: 3600000 },
    },

    // Commission settings
    commissionSettings: {
      autoCalculate: { type: Boolean, default: true },
      requireApproval: { type: Boolean, default: true },
      approvalThreshold: { type: Number, default: 1000 },
    },

    // Payroll settings
    payrollSettings: {
      // The start date for payroll calculations (commissions tracked from this date)
      startDate: { type: Date, default: null },
      // Optional: payroll cycle type (weekly, biweekly, monthly)
      cycleType: { type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'biweekly' },
      // Day of week for weekly/biweekly cycles (0=Sunday, 1=Monday, etc.)
      cycleDayOfWeek: { type: Number, default: 1 }, // Monday
    },
  },
  { timestamps: true }
);

// Static: Get-or-create the singleton
AdminSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({ key: "global" });
  if (!doc) {
    doc = await this.create({ key: "global" });
  }
  return doc;
};

// Static: Update settings
AdminSettingsSchema.statics.updateSettings = async function (updates) {
  const doc = await this.getSingleton();
  Object.assign(doc, updates);
  return doc.save();
};

const AdminSettings = mongoose.model("AdminSettings", AdminSettingsSchema);

export default AdminSettings;
