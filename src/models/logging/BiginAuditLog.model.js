/**
 * BiginAuditLog Model
 * Audit log entries scraped from Zoho Bigin CRM
 */

import mongoose from "mongoose";

const BiginAuditLogSchema = new mongoose.Schema(
  {
    // Original ID from Bigin (if available)
    biginId: { type: String, index: true },

    // Timestamp from Bigin audit log
    timestamp: { type: Date, required: true },

    // User who performed the action
    user: { type: String, required: true },
    userEmail: { type: String },

    // Action performed (e.g., Created, Updated, Deleted)
    action: { type: String, required: true },

    // Module affected (e.g., Contacts, Deals, Pipelines)
    module: { type: String },

    // Record name/identifier affected
    recordName: { type: String },
    recordId: { type: String },

    // Details of the change
    details: { type: String },

    // IP address of the user
    ipAddress: { type: String },

    // Additional metadata from scraping
    rawData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Scrape session info
    scrapeSessionId: { type: String },
    scrapedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "bigin_audit_logs",
  }
);

// Indexes
BiginAuditLogSchema.index({ timestamp: -1, user: 1 });
BiginAuditLogSchema.index({ module: 1, action: 1 });
BiginAuditLogSchema.index({ scrapedAt: -1 });
BiginAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

const BiginAuditLog = mongoose.model("BiginAuditLog", BiginAuditLogSchema);

export default BiginAuditLog;
