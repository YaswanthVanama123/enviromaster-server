/**
 * Bigin Company Routes
 * API routes for managing company data from Zoho Bigin
 */

import express from "express";
import {
  getAllCompanies,
  getCompanyById,
  getFetchStatus,
  startFetch,
  getCompanyStats,
  deleteCompany,
  updateCompany,
} from "../../controllers/customer/biginCompanyController.js";

const router = express.Router();

// Get all companies
router.get("/", getAllCompanies);

// Get company statistics
router.get("/stats", getCompanyStats);

// Get fetch status
router.get("/fetch/status", getFetchStatus);

// Start fetch from Bigin
router.post("/fetch/start", startFetch);

// Get company by ID
router.get("/:id", getCompanyById);

// Update company
router.put("/:id", updateCompany);

// Delete company
router.delete("/:id", deleteCompany);

export default router;
