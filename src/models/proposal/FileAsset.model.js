import mongoose from "mongoose";

export const FILE_KINDS = ["pdf", "image", "other"];
export const STORAGE_TYPES = ["local", "s3", "gcs", "azure"];

const FileAssetSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: FILE_KINDS, required: true },
    storage: { type: String, enum: STORAGE_TYPES, default: "local" },
    url: { type: String, required: true },
    key: { type: String, default: "" },
    fileName: { type: String, required: true },
    mimeType: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    checksum: { type: String, default: "" },
    meta: {
      pageCount: { type: Number, default: null },
      generator: { type: String, default: "" },
      version: { type: String, default: "" }
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

const FileAsset = mongoose.model("FileAsset", FileAssetSchema);
export default FileAsset;
