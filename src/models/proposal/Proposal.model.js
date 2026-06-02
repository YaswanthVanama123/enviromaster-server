import mongoose from "mongoose";

const ExtraColSchema = new mongoose.Schema({ label: { type: String, required: true } }, { _id: false });

const SmallProductRowSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  isCustom: { type: Boolean, default: false },
  amountPerUnit: { type: Number, default: null },
  extras: [{ type: Number }]
}, { _id: false });

const DispenserRowSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  isCustom: { type: Boolean, default: false },
  qty: { type: Number, default: null },
  warrantyRate: { type: Number, default: null },
  replacementRate: { type: Number, default: null },
  extras: [{ type: Number }]
}, { _id: false });

const BigProductRowSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  isCustom: { type: Boolean, default: false },
  qty: { type: Number, default: null },
  amount: { type: Number, default: null },
  frequency: { type: String, default: "" },
  extras: [{ type: Number }]
}, { _id: false });

const ProductsSectionSchema = new mongoose.Schema({
  smallProducts: { rows: [SmallProductRowSchema], extraCols: [ExtraColSchema] },
  dispensers:    { rows: [DispenserRowSchema],   extraCols: [ExtraColSchema] },
  bigProducts:   { rows: [BigProductRowSchema],  extraCols: [ExtraColSchema] }
}, { _id: false });

const ServiceItemSchema = new mongoose.Schema({
  kind: { type: String, enum: ["text", "money", "calc"], required: true },
  label: { type: String, default: "" },
  isCustom: { type: Boolean, default: false },
  name: { type: String, default: null },
  qtyName: { type: String, default: null },
  rateName: { type: String, default: null },
  totalName: { type: String, default: null },
  value: { type: String, default: "" },
  amount: { type: Number, default: null },
  qty: { type: Number, default: null },
  rate: { type: Number, default: null },
  total: { type: Number, default: null }
}, { _id: false });

const ServiceGroupSchema = new mongoose.Schema({
  title: { type: String, required: true },
  isCustom: { type: Boolean, default: false },
  items: [ServiceItemSchema]
}, { _id: false });

const RpsLineSchema = new mongoose.Schema({
  label: { type: String, required: true },
  amount: { type: Number, default: null },
  freq: { type: String, default: "" }
}, { _id: false });

const ServicesSectionSchema = new mongoose.Schema({
  groups: [ServiceGroupSchema],
  refreshPowerScrub: { amounts: [RpsLineSchema], freqs: [RpsLineSchema] },
  serviceNotes: [{ type: String }]
}, { _id: false });

const CustomerFieldSchema = new mongoose.Schema(
  { key: { type: String, required: true }, label: { type: String, required: true }, value: { type: String, default: "" }, builtIn: { type: Boolean, default: false } },
  { _id: false }
);

const CustomerSectionSchema = new mongoose.Schema({ fields: [CustomerFieldSchema] }, { _id: false });

const ApprovalSchema = new mongoose.Schema({
  status: { type: String, enum: ["draft", "submitted", "under_review", "approved", "rejected", "archived"], default: "draft" },
  submittedAt: { type: Date },
  reviewedAt: { type: Date },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  notes: { type: String, default: "" }
}, { _id: false });

const PdfArtifactSchema = new mongoose.Schema({
  asset: { type: mongoose.Schema.Types.ObjectId, ref: "FileAsset" },
  htmlSnapshot: { type: Object, default: {} },
  jsonSnapshot: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
  versionTag: { type: String, default: "" }
}, { _id: false });

const ZohoSyncAttemptSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  status: { type: String, enum: ["queued", "success", "failed"], required: true },
  error: { type: String, default: "" },
  payload: { type: Object, default: {} }
}, { _id: false });

const ZohoIntegrationSchema = new mongoose.Schema({
  provider: { type: String, enum: ["zoho"], default: "zoho" },
  module: { type: String, default: "" },
  recordId: { type: String, default: "" },
  ownerId: { type: String, default: "" },
  attachmentId: { type: String, default: "" },
  status: { type: String, enum: ["not_synced", "pending", "synced", "failed"], default: "not_synced" },
  lastSyncAt: { type: Date },
  attempts: [ZohoSyncAttemptSchema],
  lastError: { type: String, default: "" },
  lastPayload: { type: Object, default: {} }
}, { _id: false });

export const APPROVAL_STATUS = ["draft", "submitted", "under_review", "approved", "rejected", "archived"];
export const SYNC_STATUS = ["not_synced", "pending", "synced", "failed"];

const ProposalSchema = new mongoose.Schema({
  title: { type: String, default: "Untitled" },
  publicRef: { type: String, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  approval: ApprovalSchema,
  customer: CustomerSectionSchema,
  products: ProductsSectionSchema,
  services: ServicesSectionSchema,
  pdf: PdfArtifactSchema,
  pdfHistory: [PdfArtifactSchema],
  crm: ZohoIntegrationSchema,
  meta: {
    version: { type: Number, default: 1 },
    notes: { type: String, default: "" }
  }
}, { timestamps: true });

const Proposal = mongoose.model("Proposal", ProposalSchema);
export default Proposal;
