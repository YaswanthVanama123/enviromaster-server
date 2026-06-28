/**
 * Company Mapping Routes
 * Routes for mapping Bigin Companies to RouteStar Customers
 */

import express from "express";
import {
  getAllMappings,
  getMappingStats,
  getMappingById,
  getMappingStatusByBigin,
  getPriorFarByBigin,
  getConnectedCompanies,
  recalcCompanyFar,
  getFarBreakdown,
  saveMapping,
  updateMapping,
  deleteMapping,
  bulkSaveMapping,
  initializeMappings,
  getAvailableRouteStarCustomers,
  syncMappings,
  autoMapByAccountNumber,
} from "../../controllers/customer/companyMappingController.js";

const router = express.Router();

// Get all mappings with filters and pagination
router.get("/", getAllMappings);

// Get mapping statistics
router.get("/stats", getMappingStats);

// Get available RouteStar customers (not yet mapped)
router.get("/routestar-available", getAvailableRouteStarCustomers);

// Companies that have agreements connected to Bigin
router.get("/connected-companies", getConnectedCompanies);

// Recompute a company's agreements and return refreshed prior far totals
router.post("/recalc-far/:biginId", recalcCompanyFar);

// Per-agreement Pit far breakdown for a company
router.get("/far-breakdown/:biginId", getFarBreakdown);

// Get RouteStar mapping status for a single Bigin company
router.get("/status/:biginId", getMappingStatusByBigin);

// Prior same-location far revenue (redline/greenline) for a company
router.get("/prior-far/:biginId", getPriorFarByBigin);

// Initialize mapping records from Bigin companies
router.post("/initialize", initializeMappings);

// Sync mapping info from Bigin companies
router.post("/sync", syncMappings);

// Auto-map Bigin companies to RouteStar customers by account number
// (only where no manual mapping exists)
router.post("/auto-map-by-account", autoMapByAccountNumber);

// Bulk save mappings
router.post("/bulk", bulkSaveMapping);

// Get single mapping by ID
router.get("/:id", getMappingById);

// Create or update a mapping
router.post("/", saveMapping);

// Update mapping by ID
router.put("/:id", updateMapping);

// Delete/clear mapping by ID
router.delete("/:id", deleteMapping);

export default router;
