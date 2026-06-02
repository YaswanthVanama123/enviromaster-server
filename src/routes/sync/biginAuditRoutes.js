/**
 * Bigin Audit Routes
 * API routes for managing audit logs scraped from Zoho Bigin
 */

import express from "express";
import multer from "multer";
import {
  getAllAuditLogs,
  getAuditLogById,
  getScrapeStatus,
  startScrape,
  getAuditStats,
  getScrapeHistory,
  uploadCsv,
  deleteAllAuditLogs,
  deleteUnnecessaryData,
  checkInsideSalesEligibility,
} from "../../controllers/sync/biginAuditController.js";

const router = express.Router();

// Configure multer for CSV uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" ||
        file.originalname.endsWith(".csv") ||
        file.mimetype === "application/vnd.ms-excel") {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"), false);
    }
  },
});

// Get all audit logs
router.get("/", getAllAuditLogs);

// Get audit statistics
router.get("/stats", getAuditStats);

// Check inside sales eligibility for a Bigin ID
router.get("/check-inside-sales", checkInsideSalesEligibility);

// Get scrape status
router.get("/scrape/status", getScrapeStatus);

// Get scrape history
router.get("/scrape/history", getScrapeHistory);

// Start scrape from Bigin
router.post("/scrape/start", startScrape);

// Upload CSV file
router.post("/upload-csv", upload.single("file"), uploadCsv);

// Delete all audit logs
router.delete("/delete-all", deleteAllAuditLogs);

// Delete unnecessary audit logs (keeps Lisa Rothwell's records)
router.delete("/delete-unnecessary", deleteUnnecessaryData);

// Get audit log by ID
router.get("/:id", getAuditLogById);

export default router;
