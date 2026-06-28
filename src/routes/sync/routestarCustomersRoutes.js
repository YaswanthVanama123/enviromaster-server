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
  getAccountNumberSyncStatus,
  startAccountNumberSync,
  fetchCustomerAccountNumber,
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

// Account number backfill (only customers missing an account number)
router.get("/sync/account-numbers/status", getAccountNumberSyncStatus);
router.post("/sync/account-numbers/start", startAccountNumberSync);

// Fetch + store the account number for a single customer (by clicking a row)
router.post("/:id/account-number", fetchCustomerAccountNumber);

// Get customer by ID
router.get("/:id", getCustomerById);

export default router;
