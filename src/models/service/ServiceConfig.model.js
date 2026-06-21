/**
 * ServiceConfig Model
 * Service configuration and definitions
 */

import mongoose from "mongoose";

// Service IDs
export const SERVICE_IDS = {
  SANICLEAN: "saniclean",
  FOAMING_DRAIN: "foamingDrain",
  SANISCRUB: "saniscrub",
  MICROFIBER_MOPPING: "microfiberMopping",
  RPM_WINDOWS: "rpmWindows",
  REFRESH_POWER_SCRUB: "refreshPowerScrub",
  SANIPOD: "sanipod",
  CARPET_CLEAN: "carpetclean",
  JANITORIAL: "janitorial",
  STRIP_WAX: "stripwax",
  GREASE_TRAP: "greaseTrap",
  CUSTOM_SERVICES: "customServices",
};

// Image Schema
const ImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    caption: { type: String, default: "" },
  },
  { _id: false }
);

// Link Schema
const LinkSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const ServiceConfigSchema = new mongoose.Schema(
  {
    serviceId: { type: String, required: true },
    version: { type: String, required: true },
    label: { type: String },
    description: { type: String },

    // Configuration (flexible JSON)
    config: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Default form state
    defaultFormState: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Display settings
    isActive: { type: Boolean, default: false },
    adminByDisplay: { type: Boolean, default: true },

    // Categorization
    tags: [{ type: String }],

    // Media
    images: [ImageSchema],
    links: [LinkSchema],
  },
  {
    timestamps: true,
  }
);

// Indexes
ServiceConfigSchema.index({ serviceId: 1, isActive: 1 });
ServiceConfigSchema.index({ serviceId: 1, version: 1 }, { unique: true });
ServiceConfigSchema.index({ serviceId: 1, createdAt: -1 });

// Static: Get active config for a service
ServiceConfigSchema.statics.getActiveConfig = function (serviceId) {
  return this.findOne({ serviceId, isActive: true }).sort({ createdAt: -1 });
};

// Static: Get all active services
ServiceConfigSchema.statics.getAllActiveServices = function () {
  return this.find({ isActive: true }).sort({ serviceId: 1 });
};

const ServiceConfig = mongoose.model("ServiceConfig", ServiceConfigSchema);

export default ServiceConfig;
