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
  refreshLocationTypes,
  refreshLocationTypeById,
  getLocationTypeStatus,
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

// Determine new-vs-existing location for all undetermined companies (pipeline count)
router.post("/location-types/refresh", refreshLocationTypes);

// Status of the location-type detection job (for progress polling)
router.get("/location-types/status", getLocationTypeStatus);

// Determine new-vs-existing location for a single company by Bigin id
router.post("/location-types/refresh/:biginId", refreshLocationTypeById);

// Get company by ID
router.get("/:id", getCompanyById);

// Update company
router.put("/:id", updateCompany);

// Delete company
router.delete("/:id", deleteCompany);

export default router;
