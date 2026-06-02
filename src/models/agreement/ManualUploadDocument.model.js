/**
 * ManualUploadDocument Model
 * Manually uploaded PDF documents
 */

import mongoose from "mongoose";

// Upload Status
export const UPLOAD_STATUS = {
  UPLOADED: "uploaded",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  PENDING_APPROVAL: "pending_approval",
  APPROVED_SALESMAN: "approved_salesman",
  APPROVED_ADMIN: "approved_admin",
};

const ZohoRefSchema = new mongoose.Schema(
  {
    dealId: { type: String, default: null },
    fileId: { type: String, default: null },
    url: { type: String, default: null },
  },
  { _id: false }
);

const ManualUploadDocumentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
    },
    originalFileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      default: "application/pdf",
    },
    description: {
      type: String,
      default: "",
    },
    uploadedBy: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(UPLOAD_STATUS),
      default: UPLOAD_STATUS.UPLOADED,
    },
    pdfBuffer: {
      type: Buffer,
      required: true,
    },
    zoho: {
      bigin: { type: ZohoRefSchema, default: () => ({}) },
      crm: { type: ZohoRefSchema, default: () => ({}) },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

// Indexes
ManualUploadDocumentSchema.index({ uploadedBy: 1, createdAt: -1 });
ManualUploadDocumentSchema.index({ status: 1 });
ManualUploadDocumentSchema.index({ _id: 1, isDeleted: 1 });

const ManualUploadDocument = mongoose.model(
  "ManualUploadDocument",
  ManualUploadDocumentSchema
);

export default ManualUploadDocument;
