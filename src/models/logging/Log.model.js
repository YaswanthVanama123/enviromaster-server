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
      type: Date,
      default: Date.now,
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
    },
    agreementTitle: { type: String, default: "" },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VersionPdf",
      required: [true, "Version ID is required"],
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
LogSchema.index({ agreementId: 1, createdAt: -1 });
LogSchema.index({ versionId: 1 });
LogSchema.index({ salespersonId: 1, createdAt: -1 });
LogSchema.index({ isDeleted: 1 });
LogSchema.index({ agreementId: 1, versionNumber: -1, createdAt: -1 });

// Static: Get logs for agreement
LogSchema.statics.getLogsForAgreement = function (agreementId, options = {}) {
  const filter = {
    agreementId,
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

LogSchema.methods.generateTextContent = function () {
  const lines = [];

  lines.push("EnviroMaster - Version Change Log");
  lines.push("=".repeat(60));
  lines.push(`Document: ${this.documentTitle || ""}`);
  lines.push(`Agreement: ${this.agreementTitle || ""}`);
  lines.push(`Version: ${this.versionNumber}`);
  lines.push(`Salesperson: ${this.salespersonName || ""} (${this.salespersonId || ""})`);
  lines.push(`Save Action: ${this.saveAction || ""}`);
  lines.push(`Date: ${this.createdAt ? new Date(this.createdAt).toISOString() : ""}`);
  lines.push(`Total Changes: ${this.totalChanges || 0}`);
  lines.push(`Total Price Impact: $${Number(this.totalPriceImpact || 0).toFixed(2)}`);
  lines.push(`Significant Changes: ${this.hasSignificantChanges ? "Yes" : "No"}`);
  lines.push("");

  const formatChange = (change, index) => {
    const out = [];
    out.push(`${index}. ${change.productName || ""} - ${change.fieldDisplayName || ""}`);
    if (change.changeType === CHANGE_TYPES.TEXT || change.originalText || change.newText) {
      out.push(`   Original: ${change.originalText || ""}`);
      out.push(`   New: ${change.newText || ""}`);
    } else {
      out.push(`   Original: $${Number(change.originalValue || 0).toFixed(2)}`);
      out.push(`   New: $${Number(change.newValue || 0).toFixed(2)}`);
      out.push(
        `   Change: $${Number(change.changeAmount || 0).toFixed(2)} (${Number(
          change.changePercentage || 0
        ).toFixed(2)}%)`
      );
    }
    if (change.quantity) out.push(`   Quantity: ${change.quantity}`);
    if (change.frequency) out.push(`   Frequency: ${change.frequency}`);
    if (change.timestamp) out.push(`   Time: ${change.timestamp}`);
    return out.join("\n");
  };

  const current =
    this.currentChanges && this.currentChanges.length > 0
      ? this.currentChanges
      : this.changes;

  lines.push("CURRENT CHANGES");
  lines.push("-".repeat(60));
  if (current && current.length > 0) {
    current.forEach((change, i) => {
      lines.push(formatChange(change, i + 1));
      lines.push("");
    });
  } else {
    lines.push("No changes recorded.");
    lines.push("");
  }

  if (this.allPreviousChanges && this.allPreviousChanges.length > 0) {
    lines.push("PREVIOUS CHANGES");
    lines.push("-".repeat(60));
    this.allPreviousChanges.forEach((change, i) => {
      lines.push(formatChange(change, i + 1));
      lines.push("");
    });
  }

  return lines.join("\n");
};

const Log = mongoose.model("Log", LogSchema);

export default Log;
