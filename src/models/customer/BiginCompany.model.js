/**
 * BiginCompany Model
 * Company data fetched from Zoho Bigin CRM
 */

import mongoose from "mongoose";

// Bigin Pipeline Stages
export const BIGIN_STAGES = {
  LEAD: "lead",
  QUALIFIED: "qualified",
  PROPOSAL: "proposal",
  WON: "won",
  LOST: "lost",
};

const BiginCompanySchema = new mongoose.Schema(
  {
    // Bigin-specific fields
    biginId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // Contact information
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    website: {
      type: String,
      trim: true,
    },
    // Address
    street: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    zipCode: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    // Business details
    industry: {
      type: String,
      trim: true,
    },
    accountType: {
      type: String,
      trim: true,
    },
    // Owner
    owner: {
      type: String,
      trim: true,
    },
    ownerEmail: {
      type: String,
      trim: true,
    },
    // Pipeline info
    pipeline: {
      type: String,
      trim: true,
    },
    stage: {
      type: String,
      trim: true,
    },
    // Additional info
    description: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    // Bigin timestamps
    biginCreatedAt: {
      type: Date,
    },
    biginModifiedAt: {
      type: Date,
    },
    // Raw data from Bigin for reference
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Whether this company/location already had pipelines before the current
    // agreement connected (>1 pipeline => existing location, <=1 => new location).
    isExistingLocation: {
      type: Boolean,
      default: false,
    },
    locationTypeCheckedAt: {
      type: Date,
      default: null,
    },
    // Sync tracking
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
    syncSessionId: {
      type: String,
    },
  },
  {
    timestamps: true,
    collection: "bigin_companies",
  }
);

// Indexes
BiginCompanySchema.index({ companyName: "text", email: "text", city: "text" });
BiginCompanySchema.index({ stage: 1 });
BiginCompanySchema.index({ owner: 1 });
BiginCompanySchema.index({ isExistingLocation: 1 });

const BiginCompany = mongoose.model("BiginCompany", BiginCompanySchema);

export default BiginCompany;
