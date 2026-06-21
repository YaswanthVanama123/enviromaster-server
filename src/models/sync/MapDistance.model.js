/**
 * MapDistance Models
 * Distance records and sync jobs from RouteStar
 */

import mongoose from "mongoose";

// ============================================================
// FREQUENCY MAPPING
// ============================================================

export const FREQUENCY_MAP = {
  1: "Weekly",
  2: "Bi-Weekly",
  3: "Monthly",
  4: "Quarterly",
  5: "Bi-Annual",
  6: "Annual",
  7: "One Time",
  8: "EOW Odd",
  9: "EOW Even",
  10: "Every 4 Weeks",
  11: "Every 6 Weeks",
  12: "Every 8 Weeks",
  14: "Bi-Monthly",
  0: "Unknown",
};

export const FREQUENCY_REVERSE_MAP = Object.fromEntries(
  Object.entries(FREQUENCY_MAP).map(([k, v]) => [v.toLowerCase(), parseInt(k)])
);

// ============================================================
// DAY OF WEEK MAPPING
// ============================================================

export const DAY_OF_WEEK_MAP = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Unknown",
};

export const DAY_OF_WEEK_REVERSE_MAP = Object.fromEntries(
  Object.entries(DAY_OF_WEEK_MAP).map(([k, v]) => [v.toLowerCase(), parseInt(k)])
);

// ============================================================
// SYNC JOB STATUS
// ============================================================

export const SYNC_JOB_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  PAUSED: "paused",
};

export const SYNC_JOB_TYPE = {
  SINGLE_FETCH: "single_fetch",
  FULL_SYNC: "full_sync",
  UPDATE_SYNC: "update_sync",
};

// ============================================================
// MAP DISTANCE RECORD SCHEMA
// ============================================================

const MapDistanceRecordSchema = new mongoose.Schema(
  {
    // Reference to SOURCE customer
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RouteStarCustomer",
      required: true,
      index: true,
    },
    // DESTINATION customer name
    destinationCustomerName: {
      type: String,
      trim: true,
      index: true,
    },
    // Assigned technician/driver
    assignedTo: {
      type: String,
      trim: true,
    },
    // Service frequency (stored as number)
    frequency: {
      type: Number,
      default: 0,
      index: true,
    },
    // Service date
    serviceDate: {
      type: Date,
      index: true,
    },
    // Day of week (0-6)
    dayOfWeek: {
      type: Number,
      default: 7,
    },
    // Stop number on route
    stopNumber: {
      type: Number,
    },
    // Distance in miles
    distanceMiles: {
      type: Number,
      index: true,
    },
    // Sync job that created this record
    syncJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MapDistanceSyncJob",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
MapDistanceRecordSchema.index({ customerId: 1, serviceDate: -1 });
MapDistanceRecordSchema.index({ assignedTo: 1, serviceDate: -1 });

// ============================================================
// MAP DISTANCE SYNC JOB SCHEMA
// ============================================================

const MapDistanceSyncJobSchema = new mongoose.Schema(
  {
    // Job type
    jobType: {
      type: String,
      enum: Object.values(SYNC_JOB_TYPE),
      default: SYNC_JOB_TYPE.FULL_SYNC,
      index: true,
    },
    // Sync status
    status: {
      type: String,
      enum: Object.values(SYNC_JOB_STATUS),
      default: SYNC_JOB_STATUS.PENDING,
      index: true,
    },
    // Customer IDs to process
    customerIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RouteStarCustomer",
      },
    ],
    // Processed customer IDs
    processedCustomerIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "RouteStarCustomer",
      },
    ],
    // Progress tracking
    totalCustomers: { type: Number, default: 0 },
    processedCustomers: { type: Number, default: 0 },
    successfulCustomers: { type: Number, default: 0 },
    failedCustomers: { type: Number, default: 0 },
    // Current customer being processed
    currentCustomerName: { type: String, trim: true },
    // Records created
    recordsCreated: { type: Number, default: 0 },
    // Fetched data (for single_fetch jobs)
    fetchedData: { type: mongoose.Schema.Types.Mixed, default: null },
    // Timestamps
    startedAt: { type: Date },
    completedAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now },
    // Errors (limited to last 50)
    errors: [
      {
        customerName: String,
        error: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    // Who started the sync
    startedBy: { type: String, trim: true },
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true,
  }
);

// Pre-save: Limit errors array
MapDistanceSyncJobSchema.pre("save", function (next) {
  if (this.errors && this.errors.length > 50) {
    this.errors = this.errors.slice(-50);
  }
  next();
});

const MapDistanceRecord = mongoose.model(
  "MapDistanceRecord",
  MapDistanceRecordSchema
);
const MapDistanceSyncJob = mongoose.model(
  "MapDistanceSyncJob",
  MapDistanceSyncJobSchema
);

export { MapDistanceRecord, MapDistanceSyncJob };
export default { MapDistanceRecord, MapDistanceSyncJob };
