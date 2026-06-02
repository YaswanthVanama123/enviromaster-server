/**
 * RouteStar Customers Routes
 * API routes for managing customers synced from RouteStar
 */

import express from "express";
import {
  getAllCustomers,
  getCustomerById,
  getSyncStatus,
  startSync,
  getCustomerStats,
} from "../../controllers/customer/routestarCustomersController.js";

const router = express.Router();

// Get all customers
router.get("/", getAllCustomers);

// Get customer statistics
router.get("/stats", getCustomerStats);

// Get sync status
router.get("/sync/status", getSyncStatus);

// Start sync from RouteStar
router.post("/sync/start", startSync);

// Get customer by ID
router.get("/:id", getCustomerById);

export default router;
