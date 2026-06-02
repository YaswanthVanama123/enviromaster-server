/**
 * AuditLog Model
 * General audit logging for system actions
 */

import mongoose from "mongoose";

// Audit Entity Types
export const AUDIT_ENTITIES = {
  PROPOSAL: "proposal",
  FILE_ASSET: "file_asset",
  USER: "user",
  AGREEMENT: "agreement",
  CUSTOMER: "customer",
  COMMISSION: "commission",
};

// Audit Actions
export const AUDIT_ACTIONS = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  VIEW: "view",
  EXPORT: "export",
  APPROVE: "approve",
  REJECT: "reject",
};

const AuditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    actorName: { type: String },
    action: { type: String, required: true },
    entity: {
      type: String,
      enum: Object.values(AUDIT_ENTITIES),
      required: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    entityName: { type: String },
    payload: { type: Object, default: {} },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

// Indexes
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", AuditLogSchema);

export default AuditLog;
