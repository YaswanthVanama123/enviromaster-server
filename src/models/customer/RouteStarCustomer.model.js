/**
 * RouteStarCustomer Model
 * Customer data synced from RouteStar
 */

import mongoose from "mongoose";

// Customer Status Enum
export const CUSTOMER_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  PENDING: "pending",
  CANCELLED: "cancelled",
};

const RouteStarCustomerSchema = new mongoose.Schema(
  {
    routeStarId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Address
    address: {
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
    // Contact
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    company: {
      type: String,
      trim: true,
    },
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      trim: true,
    },
    // Preferences
    isPaperless: {
      type: Boolean,
      default: false,
    },
    notifyBy: {
      type: String,
      trim: true,
    },
    proofOfService: {
      type: String,
      trim: true,
    },
    preferredPaymentMethod: {
      type: String,
      trim: true,
    },
    // Grouping & Routing
    grouping: {
      type: String,
      trim: true,
    },
    onRoute: {
      type: String,
      trim: true,
    },
    zone: {
      type: String,
      trim: true,
    },
    // Account Details
    account: {
      type: String,
      trim: true,
    },
    salesRep: {
      type: String,
      trim: true,
    },
    customerType: {
      type: String,
      trim: true,
    },
    // Financial
    balance: {
      type: Number,
      default: 0,
    },
    taxCode: {
      type: String,
      trim: true,
    },
    taxRate: {
      type: Number,
      default: 0,
    },
    terms: {
      type: String,
      trim: true,
    },
    priceLevel: {
      type: String,
      trim: true,
    },
    creditLimit: {
      type: Number,
      default: 0,
    },
    priceGrouping: {
      type: String,
      trim: true,
    },
    // RouteStar Timestamps
    createdInRouteStar: {
      type: Date,
    },
    // Integration
    detailUrl: {
      type: String,
      trim: true,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
RouteStarCustomerSchema.index({ name: "text", company: "text", email: "text" });
RouteStarCustomerSchema.index({ city: 1, state: 1 });
RouteStarCustomerSchema.index({ isActive: 1 });

const RouteStarCustomer = mongoose.model("RouteStarCustomer", RouteStarCustomerSchema);

export default RouteStarCustomer;
