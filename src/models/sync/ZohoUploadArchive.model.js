import mongoose from "mongoose";

const ZohoUploadArchiveSchema = new mongoose.Schema(
  {
    mappingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ZohoMapping",
      required: true,
    },
    agreementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerHeaderDoc",
    },
    field: {
      type: String,
      enum: ["uploads", "failedUploads"],
      required: true,
    },
    entry: { type: mongoose.Schema.Types.Mixed, required: true },
    archivedAt: { type: Date, default: Date.now },
  },
  { collection: "zoho_upload_archive" }
);

ZohoUploadArchiveSchema.index({ mappingId: 1, field: 1, archivedAt: -1 });

const ZohoUploadArchive = mongoose.model(
  "ZohoUploadArchive",
  ZohoUploadArchiveSchema
);

export default ZohoUploadArchive;
