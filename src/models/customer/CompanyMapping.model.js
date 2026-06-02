/**
 * CompanyMapping Model
 * Maps Bigin Companies to RouteStar Customers
 */

import mongoose from "mongoose";

// Mapping Status Enum
export const MAPPING_STATUS = {
  MAPPED: "mapped",
  UNMAPPED: "unmapped",
};

const PreviousMappingSchema = new mongoose.Schema(
  {
    routeStarId: String,
    routeStarCustomerName: String,
    routeStarCompany: String,
    unmappedAt: Date,
    unmappedBy: String,
  },
  { _id: false }
);

const CompanyMappingSchema = new mongoose.Schema(
  {
    // Bigin Company reference
    biginCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BiginCompany",
      required: true,
    },
    biginId: {
      type: String,
      required: true,
    },
    biginCompanyName: {
      type: String,
      required: true,
    },
    biginPhone: {
      type: String,
    },
    biginCity: {
      type: String,
    },
    biginState: {
      type: String,
    },

    // RouteStar Customer reference (nullable when unmapped)
    routeStarCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RouteStarCustomer",
    },
    routeStarId: {
      type: String,
    },
    routeStarCustomerName: {
      type: String,
    },
    routeStarCompany: {
      type: String,
    },
    routeStarCity: {
      type: String,
    },

    // Mapping status
    mappingStatus: {
      type: String,
      enum: Object.values(MAPPING_STATUS),
      default: MAPPING_STATUS.UNMAPPED,
    },

    // Audit fields
    mappedBy: {
      type: String,
    },
    mappedAt: {
      type: Date,
    },

    // History of previous mappings
    previousMappings: [PreviousMappingSchema],
  },
  {
    timestamps: true,
  }
);

// Indexes
CompanyMappingSchema.index({ biginId: 1 }, { unique: true });
CompanyMappingSchema.index({ biginCompanyId: 1 }, { unique: true });
CompanyMappingSchema.index({ routeStarId: 1 });
CompanyMappingSchema.index({ routeStarCustomerId: 1 });
CompanyMappingSchema.index({ mappingStatus: 1 });
CompanyMappingSchema.index(
  { biginCompanyName: "text", routeStarCustomerName: "text" },
  { name: "company_mapping_text_index" }
);

// Static: Get mapping stats
CompanyMappingSchema.statics.getStats = async function () {
  const total = await this.countDocuments();
  const mapped = await this.countDocuments({ mappingStatus: MAPPING_STATUS.MAPPED });
  const unmapped = await this.countDocuments({ mappingStatus: MAPPING_STATUS.UNMAPPED });
  return { total, mapped, unmapped };
};

// Static: Find by biginId
CompanyMappingSchema.statics.findByBiginId = function (biginId) {
  return this.findOne({ biginId });
};

// Static: Find by routeStarId
CompanyMappingSchema.statics.findByRouteStarId = function (routeStarId) {
  return this.findOne({ routeStarId });
};

// Instance: Set mapping
CompanyMappingSchema.methods.setMapping = function (routeStarCustomer, mappedBy = "system") {
  // If already mapped, save to history
  if (this.mappingStatus === MAPPING_STATUS.MAPPED && this.routeStarId) {
    this.previousMappings.push({
      routeStarId: this.routeStarId,
      routeStarCustomerName: this.routeStarCustomerName,
      routeStarCompany: this.routeStarCompany,
      unmappedAt: new Date(),
      unmappedBy: mappedBy,
    });
  }

  // Set new mapping
  this.routeStarCustomerId = routeStarCustomer._id;
  this.routeStarId = routeStarCustomer.routeStarId;
  this.routeStarCustomerName = routeStarCustomer.name;
  this.routeStarCompany = routeStarCustomer.company;
  this.routeStarCity = routeStarCustomer.city;
  this.mappingStatus = MAPPING_STATUS.MAPPED;
  this.mappedBy = mappedBy;
  this.mappedAt = new Date();

  return this.save();
};

// Instance: Clear mapping
CompanyMappingSchema.methods.clearMapping = function (unmappedBy = "system") {
  if (this.mappingStatus === MAPPING_STATUS.MAPPED && this.routeStarId) {
    this.previousMappings.push({
      routeStarId: this.routeStarId,
      routeStarCustomerName: this.routeStarCustomerName,
      routeStarCompany: this.routeStarCompany,
      unmappedAt: new Date(),
      unmappedBy: unmappedBy,
    });
  }

  this.routeStarCustomerId = null;
  this.routeStarId = null;
  this.routeStarCustomerName = null;
  this.routeStarCompany = null;
  this.routeStarCity = null;
  this.mappingStatus = MAPPING_STATUS.UNMAPPED;
  this.mappedBy = null;
  this.mappedAt = null;

  return this.save();
};

const CompanyMapping = mongoose.model("CompanyMapping", CompanyMappingSchema);

export default CompanyMapping;
