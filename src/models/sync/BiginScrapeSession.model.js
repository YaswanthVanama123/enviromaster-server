/**
 * BiginScrapeSession Model
 * Tracks Bigin audit scrape sessions
 */

import mongoose from "mongoose";

// Scrape Session Status
export const SCRAPE_SESSION_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
};

const BiginScrapeSessionSchema = new mongoose.Schema(
  {
    // Session identifier
    sessionId: { type: String, required: true, unique: true },

    // Status of the scrape
    status: {
      type: String,
      enum: Object.values(SCRAPE_SESSION_STATUS),
      default: SCRAPE_SESSION_STATUS.PENDING,
    },

    // Progress tracking
    progress: { type: Number, default: 0, min: 0, max: 100 },
    progressMessage: { type: String, default: "" },

    // Results
    logsScraped: { type: Number, default: 0 },
    logsStored: { type: Number, default: 0 },

    // Timing
    startedAt: { type: Date },
    completedAt: { type: Date },

    // Error info if failed
    error: { type: String },
    errorDetails: { type: Object },

    // Who triggered the scrape
    triggeredBy: { type: String, default: "manual" },
  },
  {
    timestamps: true,
    collection: "bigin_scrape_sessions",
  }
);

// Indexes
BiginScrapeSessionSchema.index({ status: 1, createdAt: -1 });
BiginScrapeSessionSchema.index({ sessionId: 1 });

const BiginScrapeSession = mongoose.model(
  "BiginScrapeSession",
  BiginScrapeSessionSchema
);

export default BiginScrapeSession;
