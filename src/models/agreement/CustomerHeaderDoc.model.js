/**
 * CustomerHeaderDoc Model
 * Full agreement documents with products, services, and PDF
 */

import mongoose from "mongoose";

// Document Status
export const DOCUMENT_STATUS = {
  SAVED: "saved",
  DRAFT: "draft",
  IN_PROGRESS: "in_progress",
  ACTIVE: "active",
  COMPLETED: "completed",
  PENDING_APPROVAL: "pending_approval",
  APPROVED_SALESMAN: "approved_salesman",
  APPROVED_ADMIN: "approved_admin",
};

// ============================================================
// SUB-SCHEMAS
// ============================================================

const ZohoRefSchema = new mongoose.Schema(
  {
    dealId: { type: String, default: null },
    fileId: { type: String, default: null },
    url: { type: String, default: null },
  },
  { _id: false }
);

const ProductRowSchema = new mongoose.Schema(
  {
    id: String,
    productKey: String,
    displayName: String,
    customName: String,
    qty: Number,
    unitPrice: Number,
    unitPriceOverride: Number,
    warrantyRate: Number,
    warrantyPriceOverride: Number,
    replacementRate: Number,
    replacementPriceOverride: Number,
    amount: Number,
    amountOverride: Number,
    frequency: { type: String, default: "" },
    total: Number,
    totalOverride: Number,
    extPrice: Number,
    isCustom: Boolean,
    isDefault: Boolean,
    _productType: { type: String, enum: ["small", "big", "dispenser"], default: null },
    customFields: mongoose.Schema.Types.Mixed,
  },
  { _id: false, strict: false }
);

const ProductsSchema = new mongoose.Schema(
  {
    products: [ProductRowSchema],
    dispensers: [ProductRowSchema],
    smallProducts: [ProductRowSchema],
    bigProducts: [ProductRowSchema],
    headers: [String],
    rows: [[String]],
    customColumns: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ products: [], dispensers: [] }),
    },
  },
  { _id: false, strict: false }
);

const ServicesSchema = new mongoose.Schema(
  {
    saniclean: { type: mongoose.Schema.Types.Mixed, default: null },
    foamingDrain: { type: mongoose.Schema.Types.Mixed, default: null },
    saniscrub: { type: mongoose.Schema.Types.Mixed, default: null },
    microfiberMopping: { type: mongoose.Schema.Types.Mixed, default: null },
    rpmWindows: { type: mongoose.Schema.Types.Mixed, default: null },
    refreshPowerScrub: { type: mongoose.Schema.Types.Mixed, default: null },
    sanipod: { type: mongoose.Schema.Types.Mixed, default: null },
    carpetclean: { type: mongoose.Schema.Types.Mixed, default: null },
    janitorial: { type: mongoose.Schema.Types.Mixed, default: null },
    stripwax: { type: mongoose.Schema.Types.Mixed, default: null },
    greaseTrap: { type: mongoose.Schema.Types.Mixed, default: null },
    customServices: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false, strict: false }
);

const ServiceAgreementSchema = new mongoose.Schema(
  {
    includeInPdf: { type: Boolean, default: false },
    retainDispensers: { type: Boolean, default: true },
    disposeDispensers: { type: Boolean, default: false },
    customerContactName: { type: String, default: "" },
    customerSignature: { type: String, default: "" },
    customerSignatureDate: { type: String, default: "" },
    emFranchisee: { type: String, default: "" },
    emSignature: { type: String, default: "" },
    emSignatureDate: { type: String, default: "" },
    insideSalesRepresentative: { type: String, default: "" },
    emSalesRepresentative: { type: String, default: "" },
    term1: { type: String, default: "" },
    term2: { type: String, default: "" },
    term3: { type: String, default: "" },
    term4: { type: String, default: "" },
    term5: { type: String, default: "" },
    term6: { type: String, default: "" },
    term7: { type: String, default: "" },
    noteText: { type: String, default: "" },
    titleText: { type: String, default: "SERVICE AGREEMENT" },
    subtitleText: { type: String, default: "Terms and Conditions" },
    retainDispensersLabel: { type: String, default: "Customer desires to retain existing dispensers" },
    disposeDispensersLabel: { type: String, default: "Customer desires to dispose of existing dispensers" },
    emSalesRepLabel: { type: String, default: "EM Sales Representative" },
    insideSalesRepLabel: { type: String, default: "Inside Sales Representative" },
    authorityText: { type: String, default: "I HEREBY REPRESENT THAT I HAVE THE AUTHORITY TO SIGN THIS AGREEMENT:" },
    customerContactLabel: { type: String, default: "Customer Contact Name:" },
    customerSignatureLabel: { type: String, default: "Signature:" },
    customerDateLabel: { type: String, default: "Date:" },
    emFranchiseeLabel: { type: String, default: "EM Franchisee:" },
    emSignatureLabel: { type: String, default: "Signature:" },
    emDateLabel: { type: String, default: "Date:" },
  },
  { _id: false }
);

const AgreementInfoSchema = new mongoose.Schema(
  {
    enviroOf: { type: String, default: "" },
    customerExecutedOn: { type: String, default: "" },
    additionalMonths: { type: String, default: "" },
    paymentOption: {
      type: String,
      enum: ["online", "cash", "others"],
      default: "online",
    },
    paymentNote: { type: String, default: "" },
    startDate: { type: String, default: null },
  },
  { _id: false }
);

const GlobalSummarySchema = new mongoose.Schema(
  {
    contractMonths: { type: Number, default: null },
    tripCharge: { type: Number, default: null },
    tripChargeFrequency: { type: Number, default: null },
    parkingCharge: { type: Number, default: null },
    parkingChargeFrequency: { type: Number, default: null },
    serviceAgreementTotal: { type: Number, default: null },
    productMonthlyTotal: { type: Number, default: null },
    productContractTotal: { type: Number, default: null },
    quotaCredit: { type: Number, default: null },
    priorQuotaCredit: { type: Number, default: null },
  },
  { _id: false, strict: false }
);

const CommissionInputSchema = new mongoose.Schema(
  {
    monthlyValue: { type: Number, default: 0 },
    agreementTerm: {
      type: String,
      enum: ["3-year", "1-year", "MTM-with-install", "MTM-no-install"],
      default: "1-year",
    },
    accountType: {
      type: String,
      enum: ["Anchor", "Bread5", "Bread15", "Pit"],
      default: "Anchor",
    },
    pricingLine: {
      type: String,
      enum: ["Redline", "Greenline"],
      default: "Redline",
    },
    quotaLevel: {
      type: String,
      enum: ["below", "above", "double"],
      default: "below",
    },
    businessType: {
      type: String,
      enum: ["new", "renewal"],
      default: "new",
    },
    yearsAsCustomer: { type: Number, default: 0 },
    isInsideSales: { type: Boolean, default: false },
  },
  { _id: false }
);

const CommissionBreakdownSchema = new mongoose.Schema(
  {
    baseRate: { type: Number, default: 0 },
    agreementMultiplier: { type: Number, default: 100 },
    accountTypeAdjustment: { type: Number, default: 0 },
    greenlineBonus: { type: Number, default: 0 },
    renewalBonus: { type: Number, default: 0 },
    insideSalesDeduction: { type: Number, default: 0 },
  },
  { _id: false }
);

const CommissionSchema = new mongoose.Schema(
  {
    input: { type: CommissionInputSchema, default: () => ({}) },
    breakdown: { type: CommissionBreakdownSchema, default: () => ({}) },
    finalCommissionRate: { type: Number, default: 0 },
    weeklyCommission: { type: Number, default: 0 },
    annualCommission: { type: Number, default: 0 },
    contractCommission: { type: Number, default: 0 },
    rulesSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false, strict: false }
);

const HeaderRowSchema = new mongoose.Schema(
  {
    labelLeft: { type: String, default: "" },
    valueLeft: { type: String, default: "" },
    labelRight: { type: String, default: "" },
    valueRight: { type: String, default: "" },
  },
  { _id: false }
);

const VersionRefSchema = new mongoose.Schema(
  {
    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VersionPdf",
      required: true,
    },
    versionNumber: { type: Number, required: true },
    versionLabel: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: String, default: null },
    changeNotes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["active", "superseded", "archived"],
      default: "active",
    },
    zohoUploadStatus: {
      uploaded: { type: Boolean, default: false },
      dealId: { type: String, default: null },
      fileId: { type: String, default: null },
      noteId: { type: String, default: null },
      uploadedAt: { type: Date, default: null },
    },
  },
  { _id: false }
);

const AttachedFileSchema = new mongoose.Schema(
  {
    manualDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ManualUploadDocument",
      required: [true, "Manual document ID is required for attached files"],
    },
    fileName: {
      type: String,
      required: [true, "File name is required for attached files"],
      trim: true,
    },
    fileSize: { type: Number, default: 0 },
    description: { type: String, default: "", trim: true },
    attachedAt: { type: Date, default: Date.now },
    attachedBy: { type: String, default: null, trim: true },
    displayOrder: { type: Number, default: 0 },
  },
  { _id: true, timestamps: true }
);

const PayloadSchema = new mongoose.Schema(
  {
    headerTitle: { type: String, default: "" },
    headerRows: [HeaderRowSchema],
    products: {
      type: ProductsSchema,
      default: () => ({ smallProducts: [], dispensers: [], bigProducts: [] }),
    },
    includeProductsTable: { type: Boolean, default: true },
    services: { type: ServicesSchema, default: () => ({}) },
    agreement: { type: AgreementInfoSchema, default: () => ({}) },
    serviceAgreement: { type: ServiceAgreementSchema, default: null },
    summary: { type: GlobalSummarySchema, default: null },
    commission: { type: CommissionSchema, default: null },
    // Account type cache for commission calculations (keyed by frequency number)
    accountTypeCache: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

// ============================================================
// MAIN SCHEMA
// ============================================================

const CustomerHeaderDocSchema = new mongoose.Schema(
  {
    payload: { type: PayloadSchema, required: true },

    pdf_meta: {
      sizeBytes: { type: Number, default: 0 },
      contentType: { type: String, default: "application/pdf" },
      storedAt: { type: Date, default: null },
      pdfBuffer: { type: Buffer, default: null },
      externalUrl: { type: String, default: null },
    },

    attachedFiles: {
      type: [AttachedFileSchema],
      default: [],
    },

    versions: {
      type: [VersionRefSchema],
      default: [],
    },

    currentVersionNumber: { type: Number, default: 0 },
    totalVersions: { type: Number, default: 0 },

    status: {
      type: String,
      enum: Object.values(DOCUMENT_STATUS),
      default: DOCUMENT_STATUS.SAVED,
      index: true,
    },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },

    zoho: {
      bigin: { type: ZohoRefSchema, default: () => ({}) },
      crm: { type: ZohoRefSchema, default: () => ({}) },
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

// Indexes
CustomerHeaderDocSchema.index({ createdAt: -1 });
CustomerHeaderDocSchema.index({ isDeleted: 1, createdAt: -1 });
CustomerHeaderDocSchema.index({ "payload.headerTitle": "text" });
CustomerHeaderDocSchema.index({ status: 1, createdAt: -1 });

const CustomerHeaderDoc =
  mongoose.models.CustomerHeaderDoc ||
  mongoose.model("CustomerHeaderDoc", CustomerHeaderDocSchema);

export default CustomerHeaderDoc;
