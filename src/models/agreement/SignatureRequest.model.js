import mongoose from "mongoose";
import crypto from "crypto";

export const SIGNATURE_REQUEST_STATUS = {
  DRAFT: "draft",
  READY: "ready",
  IN_PROGRESS: "in_progress",
  DECLINED: "declined",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export const SIGNER_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  SIGNED: "signed",
  DECLINED: "declined",
};

export const SIGNATURE_METHOD = {
  DRAW: "draw",
  TYPE: "type",
};

export const SIGNED_VIA = {
  IN_PERSON: "in_person",
  REMOTE_LINK: "remote_link",
};

export const SIGNER_ROLE = {
  CUSTOMER: "customer",
  EM_FRANCHISEE: "em_franchisee",
  WITNESS: "witness",
  OTHER: "other",
};

export const SIGNATURE_TOKEN_TTL_DAYS = Number(
  process.env.SIGNATURE_TOKEN_TTL_DAYS || 30
);

export const SIGNATURE_RECEIPT_TTL_MINUTES = Number(
  process.env.SIGNATURE_RECEIPT_TTL_MINUTES || 60
);

export const SIGNATURE_EVENT = {
  CREATED: "created",
  SIGNER_ADDED: "signer_added",
  SIGNER_UPDATED: "signer_updated",
  SIGNER_REMOVED: "signer_removed",
  INVITE_SENT: "invite_sent",
  LINK_REVOKED: "link_revoked",
  VIEWED: "viewed",
  SIGNED: "signed",
  DECLINED: "declined",
  COMPLETED: "completed",
  FINALIZED: "finalized",
  VERSION_SYNCED: "version_synced",
};

const SignatureEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: Object.values(SIGNATURE_EVENT),
      required: true,
    },
    at: { type: Date, default: Date.now },
    actor: { type: String, default: null },
    signerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    signerName: { type: String, default: "" },
    detail: { type: String, default: "" },
    ipAddress: { type: String, default: null },
  },
  { _id: false }
);

const SignatureLocationSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["gps", "ip", "none"],
      default: "none",
    },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracyMeters: { type: Number, default: null },
    address: { type: String, default: "" },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    postalCode: { type: String, default: "" },
    country: { type: String, default: "" },
    capturedAt: { type: Date, default: null },
  },
  { _id: false }
);

const SignerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Signer name is required"],
      trim: true,
    },
    email: { type: String, default: "", trim: true, lowercase: true },
    title: { type: String, default: "", trim: true },
    role: {
      type: String,
      enum: Object.values(SIGNER_ROLE),
      default: SIGNER_ROLE.OTHER,
    },
    placement: { type: String, default: "", trim: true },
    order: { type: Number, default: 0 },

    status: {
      type: String,
      enum: Object.values(SIGNER_STATUS),
      default: SIGNER_STATUS.PENDING,
    },

    token: { type: String, default: null },
    tokenExpiresAt: { type: Date, default: null },
    receiptToken: { type: String, default: null },
    receiptExpiresAt: { type: Date, default: null },
    invitedAt: { type: Date, default: null },
    invitedBy: { type: String, default: null },
    inviteCount: { type: Number, default: 0 },

    signedAt: { type: Date, default: null },
    signedBy: { type: String, default: null },
    signatureId: { type: String, default: null },
    printedName: { type: String, default: "" },
    viewedAt: { type: Date, default: null },
    signedVia: {
      type: String,
      enum: [...Object.values(SIGNED_VIA), null],
      default: null,
    },
    signatureMethod: {
      type: String,
      enum: [...Object.values(SIGNATURE_METHOD), null],
      default: null,
    },
    signatureImage: { type: Buffer, default: null },
    signatureImageContentType: { type: String, default: "image/png" },
    typedName: { type: String, default: "" },
    typedFontFamily: { type: String, default: "" },
    consentAccepted: { type: Boolean, default: false },

    location: { type: SignatureLocationSchema, default: () => ({}) },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },

    declinedAt: { type: Date, default: null },
    declineReason: { type: String, default: "" },

    addedBy: { type: String, default: null },
  },
  { _id: true, timestamps: true }
);

const SignatureRequestSchema = new mongoose.Schema(
  {
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerHeaderDoc",
      required: [true, "Agreement ID is required"],
      unique: true,
    },
    agreementTitle: { type: String, default: "" },

    envelopeId: {
      type: String,
      default: () => crypto.randomUUID().toUpperCase(),
      index: true,
    },

    signedPdf: {
      buffer: { type: Buffer, default: null },
      sizeBytes: { type: Number, default: 0 },
      contentType: { type: String, default: "application/pdf" },
      pageCount: { type: Number, default: 0 },
      generatedAt: { type: Date, default: null },
      sourceSha256: { type: String, default: null },
      sha256: { type: String, default: null },
      stale: { type: Boolean, default: false },
    },

    events: { type: [SignatureEventSchema], default: [] },

    versionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VersionPdf",
      default: null,
    },
    versionNumber: { type: Number, default: null },
    versionLabel: { type: String, default: "" },

    status: {
      type: String,
      enum: Object.values(SIGNATURE_REQUEST_STATUS),
      default: SIGNATURE_REQUEST_STATUS.DRAFT,
    },

    signers: { type: [SignerSchema], default: [] },

    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
    readyAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, default: null },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

SignatureRequestSchema.index({ "signers.token": 1 });
SignatureRequestSchema.index({ "signers.receiptToken": 1 });
SignatureRequestSchema.index({ status: 1, updatedAt: -1 });

SignatureRequestSchema.statics.generateToken = function () {
  return crypto.randomBytes(32).toString("hex");
};

SignatureRequestSchema.statics.generateSignatureId = function () {
  return crypto.randomBytes(8).toString("hex").toUpperCase();
};

SignatureRequestSchema.methods.recordEvent = function (type, details = {}) {
  this.events.push({
    type,
    at: new Date(),
    actor: details.actor || null,
    signerId: details.signerId || null,
    signerName: details.signerName || "",
    detail: details.detail || "",
    ipAddress: details.ipAddress || null,
  });
  if (this.events.length > 500) {
    this.events = this.events.slice(-500);
  }
};

SignatureRequestSchema.statics.tokenExpiry = function () {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + SIGNATURE_TOKEN_TTL_DAYS);
  return expiry;
};

SignatureRequestSchema.statics.receiptExpiry = function () {
  return new Date(Date.now() + SIGNATURE_RECEIPT_TTL_MINUTES * 60000);
};

SignatureRequestSchema.statics.findByReceiptToken = async function (token) {
  if (!token) return null;
  return await this.findOne({ "signers.receiptToken": token });
};

SignatureRequestSchema.statics.findByToken = async function (token) {
  if (!token) return null;
  return await this.findOne({ "signers.token": token });
};

SignatureRequestSchema.methods.recalculateStatus = function () {
  if (this.status === SIGNATURE_REQUEST_STATUS.CANCELLED) {
    return this.status;
  }

  const signers = this.signers || [];

  if (signers.length === 0) {
    this.status = SIGNATURE_REQUEST_STATUS.DRAFT;
    this.completedAt = null;
    return this.status;
  }

  const signedCount = signers.filter(
    (signer) => signer.status === SIGNER_STATUS.SIGNED
  ).length;

  if (signedCount === signers.length) {
    this.status = SIGNATURE_REQUEST_STATUS.COMPLETED;
    this.completedAt = this.completedAt || new Date();
    return this.status;
  }

  this.completedAt = null;

  const hasDeclined = signers.some(
    (signer) => signer.status === SIGNER_STATUS.DECLINED
  );

  if (hasDeclined) {
    this.status = SIGNATURE_REQUEST_STATUS.DECLINED;
    return this.status;
  }

  if (signedCount > 0) {
    this.status = SIGNATURE_REQUEST_STATUS.IN_PROGRESS;
    return this.status;
  }

  this.status = SIGNATURE_REQUEST_STATUS.READY;
  return this.status;
};

const SignatureRequest =
  mongoose.models.SignatureRequest ||
  mongoose.model("SignatureRequest", SignatureRequestSchema);

export default SignatureRequest;
