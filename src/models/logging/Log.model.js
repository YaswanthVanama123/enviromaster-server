/**
 * Log Model (Version Change Log)
 * Tracks price changes and modifications to agreements
 */

import mongoose from "mongoose";

// Save Actions
export const SAVE_ACTIONS = {
  SAVE_DRAFT: "save_draft",
  GENERATE_PDF: "generate_pdf",
  MANUAL_SAVE: "manual_save",
};

// Change Types
export const CHANGE_TYPES = {
  NUMERIC: "numeric",
  TEXT: "text",
};

// Product Types
export const PRODUCT_TYPES = {
  PRODUCT: "product",
  DISPENSER: "dispenser",
  SERVICE: "service",
  AGREEMENT_TEXT: "agreement_text",
};

const FieldChangeSchema = new mongoose.Schema(
  {
    productKey: {
      type: String,
      required: [true, "Product key is required"],
    },
    productName: {
      type: String,
      required: [true, "Product name is required"],
    },
    productType: {
      type: String,
      enum: Object.values(PRODUCT_TYPES),
      required: [true, "Product type is required"],
    },
    fieldType: {
      type: String,
      required: [true, "Field type is required"],
    },
    fieldDisplayName: {
      type: String,
      required: [true, "Field display name is required"],
    },
    changeType: {
      type: String,
      enum: Object.values(CHANGE_TYPES),
      default: CHANGE_TYPES.NUMERIC,
    },
    originalValue: { type: Number, required: false },
    newValue: { type: Number, required: false },
    changeAmount: { type: Number, default: 0 },
    changePercentage: { type: Number, default: 0 },
    originalText: { type: String, default: "" },
    newText: { type: String, default: "" },
    quantity: { type: Number, default: 0 },
    frequency: { type: String, default: "" },
    timestamp: {
      type: String,
      default: () => new Date().toISOString(),
    },
  },
  { _id: false }
);

const LogSchema = new mongoose.Schema(
  {
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerHeaderDoc",
      required: [true, "Agreement ID is required"],
      index: true,
    },
    agreementTitle: { type: String, default: "" },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VersionPdf",
      required: [true, "Version ID is required"],
      index: true,
    },
    versionNumber: {
      type: Number,
      required: [true, "Version number is required"],
    },

    fileName: { type: String },
    fileSize: { type: Number, default: 0 },
    contentType: { type: String, default: "text/plain" },

    salespersonId: {
      type: String,
      required: [true, "Salesperson ID is required"],
      index: true,
    },
    salespersonName: {
      type: String,
      required: [true, "Salesperson name is required"],
    },

    changes: { type: [FieldChangeSchema], default: [] },
    currentChanges: { type: [FieldChangeSchema], default: [] },
    allPreviousChanges: { type: [FieldChangeSchema], default: [] },

    totalChanges: { type: Number, default: 0 },
    totalPriceImpact: { type: Number, default: 0 },
    hasSignificantChanges: { type: Boolean, default: false },

    saveAction: {
      type: String,
      enum: Object.values(SAVE_ACTIONS),
      required: [true, "Save action is required"],
    },

    documentTitle: {
      type: String,
      required: [true, "Document title is required"],
    },

    sessionId: {
      type: String,
      default: () => `session_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: String, default: null },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

// Pre-save: Calculate totals
LogSchema.pre("save", function (next) {
  const changesArray =
    this.currentChanges && this.currentChanges.length > 0
      ? this.currentChanges
      : this.changes;

  if (changesArray && changesArray.length > 0) {
    this.totalChanges = changesArray.length;

    this.totalPriceImpact = changesArray.reduce((total, change) => {
      return total + Math.abs(change.changeAmount);
    }, 0);

    this.hasSignificantChanges = changesArray.some((change) => {
      return (
        Math.abs(change.changePercentage) > 15 ||
        Math.abs(change.changeAmount) > 50
      );
    });
  }

  if (!this.fileName) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    this.fileName = `Version_${this.versionNumber}_Changes_${timestamp}.txt`;
  }

  next();
});

// Indexes
LogSchema.index({ agreementId: 1, versionNumber: -1 });
LogSchema.index({ agreementId: 1, createdAt: -1 });
LogSchema.index({ versionId: 1 });
LogSchema.index({ salespersonId: 1, createdAt: -1 });
LogSchema.index({ isDeleted: 1 });
LogSchema.index({ agreementId: 1, versionNumber: -1, createdAt: -1 });

// Static: Get logs for agreement
LogSchema.statics.getLogsForAgreement = function (agreementId, options = {}) {
  const filter = {
    agreementId: new mongoose.Types.ObjectId(agreementId),
    isDeleted: { $ne: true },
  };

  if (options.versionNumber) {
    filter.versionNumber = options.versionNumber;
  }

  if (options.salespersonId) {
    filter.salespersonId = options.salespersonId;
  }

  return this.find(filter)
    .sort({ versionNumber: -1, createdAt: -1 })
    .limit(options.limit || 100)
    .lean();
};

const Log = mongoose.model("Log", LogSchema);

export default Log;
