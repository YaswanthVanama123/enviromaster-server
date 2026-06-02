/**
 * Company Mapping Routes
 * Routes for mapping Bigin Companies to RouteStar Customers
 */

import express from "express";
import {
  getAllMappings,
  getMappingStats,
  getMappingById,
  saveMapping,
  updateMapping,
  deleteMapping,
  bulkSaveMapping,
  initializeMappings,
  getAvailableRouteStarCustomers,
  syncMappings,
} from "../../controllers/customer/companyMappingController.js";

const router = express.Router();

// Get all mappings with filters and pagination
router.get("/", getAllMappings);

// Get mapping statistics
router.get("/stats", getMappingStats);

// Get available RouteStar customers (not yet mapped)
router.get("/routestar-available", getAvailableRouteStarCustomers);

// Initialize mapping records from Bigin companies
router.post("/initialize", initializeMappings);

// Sync mapping info from Bigin companies
router.post("/sync", syncMappings);

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
