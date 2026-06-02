import mongoose from "mongoose";

const { Schema } = mongoose;

const HeaderRowSchema = new Schema(
  {
    labelLeft: { type: String, default: "" },
    valueLeft: { type: String, default: "" },
    labelRight: { type: String, default: "" },
    valueRight: { type: String, default: "" },
  },
  { _id: false }
);

const AgreementSchema = new Schema(
  {
    enviroOf: { type: String, default: "" },
    customerExecutedOn: { type: String, default: "" },
    additionalMonths: { type: String, default: "" },
  },
  { _id: false }
);

const PdfMetaSchema = new Schema(
  {
    sizeBytes: { type: Number },
    contentType: { type: String, default: "application/pdf" },
    storedAt: { type: Date, default: Date.now },
    externalUrl: { type: String },
  },
  { _id: false }
);

const ZohoBiginInfoSchema = new Schema(
  {
    recordId: { type: String },
    module: { type: String },
    fileId: { type: String },
    downloadUrl: { type: String },
    lastPushedAt: { type: Date },
    lastError: { type: String },
  },
  { _id: false }
);

const AdminHeaderDocSchema = new Schema(
  {
    headerTitle: { type: String, default: "" },

    headerRows: {
      type: [HeaderRowSchema],
      default: [],
    },

    products: {
      type: Schema.Types.Mixed,
      default: {},
    },

    services: {
      type: Schema.Types.Mixed,
      default: {},
    },

    agreement: {
      type: AgreementSchema,
      default: () => ({}),
    },

    pdfMeta: {
      type: PdfMetaSchema,
      default: null,
    },

    zohoBigin: {
      type: ZohoBiginInfoSchema,
      default: () => ({}),
    },

    status: {
      type: String,
      default: "draft",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "AdminUser",
      default: null,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "AdminUser",
      default: null,
    },

    label: {
      type: String,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const AdminHeaderDoc = mongoose.model("AdminHeaderDoc", AdminHeaderDocSchema);

export default AdminHeaderDoc;
