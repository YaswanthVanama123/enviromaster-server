/**
 * Quota Tracking Routes
 * Routes for sales person management, agreements, and quota tracking
 */

import express from "express";
import {
  // Sales Person
  getAllSalesPersons,
  getSalesPersonById,
  createSalesPerson,
  updateSalesPerson,
  updateSalesPersonQuota,
  // Agreements
  createAgreement,
  getAllAgreements,
  getAgreementById,
  updateAgreementStatus,
  // Quota
  getQuotaStatus,
  getQuotaHistory,
  getCurrentQuotaLevel,
  getLeaderboard,
} from "../../controllers/commission/quotaController.js";

const router = express.Router();

// ============================================================
// SALES PERSON ROUTES
// ============================================================

/**
 * @route   GET /api/quota/sales-persons
 * @desc    Get all sales persons
 * @query   active, role, search
 */
router.get("/sales-persons", getAllSalesPersons);

/**
 * @route   GET /api/quota/sales-persons/:id
 * @desc    Get a single sales person by ID or employeeId
 */
router.get("/sales-persons/:id", getSalesPersonById);

/**
 * @route   POST /api/quota/sales-persons
 * @desc    Create a new sales person
 * @body    employeeId, name, email, phone, role, quota, territory, hireDate
 */
router.post("/sales-persons", createSalesPerson);

/**
 * @route   PUT /api/quota/sales-persons/:id
 * @desc    Update a sales person
 */
router.put("/sales-persons/:id", updateSalesPerson);

/**
 * @route   PUT /api/quota/sales-persons/:id/quota
 * @desc    Update sales person quota target
 * @body    monthlyTarget, periodType, effectiveDate
 */
router.put("/sales-persons/:id/quota", updateSalesPersonQuota);

// ============================================================
// AGREEMENT ROUTES
// ============================================================

/**
 * @route   GET /api/quota/agreements
 * @desc    Get all agreements
 * @query   salesPersonId, status, startDate, endDate, limit, skip
 */
router.get("/agreements", getAllAgreements);

/**
 * @route   GET /api/quota/agreements/:id
 * @desc    Get agreement by ID or agreement number
 */
router.get("/agreements/:id", getAgreementById);

/**
 * @route   POST /api/quota/agreements
 * @desc    Create a new agreement
 * @body    salesPersonId, customer, agreementTerm, termMonths, monthlyValue, etc.
 */
router.post("/agreements", createAgreement);

/**
 * @route   PUT /api/quota/agreements/:id/status
 * @desc    Update agreement status
 * @body    status, approvedBy
 */
router.put("/agreements/:id/status", updateAgreementStatus);

// ============================================================
// QUOTA TRACKING ROUTES
// ============================================================

/**
 * @route   GET /api/quota/status/:salesPersonId
 * @desc    Get current quota status for a sales person
 * @query   periodType (monthly/quarterly/annual), date
 */
router.get("/status/:salesPersonId", getQuotaStatus);

/**
 * @route   GET /api/quota/history/:salesPersonId
 * @desc    Get quota history for a sales person
 * @query   limit
 */
router.get("/history/:salesPersonId", getQuotaHistory);

/**
 * @route   GET /api/quota/level/:salesPersonId
 * @desc    Get current quota level for commission calculation
 */
router.get("/level/:salesPersonId", getCurrentQuotaLevel);

/**
 * @route   GET /api/quota/leaderboard
 * @desc    Get sales leaderboard
 * @query   periodType, date
 */
router.get("/leaderboard", getLeaderboard);

export default router;
