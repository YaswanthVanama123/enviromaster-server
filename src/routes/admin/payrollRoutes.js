import express from 'express';
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import {
  getPayrollPeriods,
  getEmployeesPayroll,
  getPayrollHistory,
  downloadPayrollPdf
} from "../../controllers/admin/payrollController.js";
import {
  getPayrollEligibleAgreements,
  markAgreementCompleted
} from "../../controllers/admin/payrollAgreementsController.js";

const router = express.Router();

// Get current payroll periods
router.get('/periods', requireAdminAuth, getPayrollPeriods);

// Get all employees' payroll data for a period
router.get('/employees', requireAdminAuth, getEmployeesPayroll);

// Get payroll history (past periods)
router.get('/history', requireAdminAuth, getPayrollHistory);

// Download a combined payroll PDF for a period (and record it in history)
router.get('/download-pdf', requireAdminAuth, downloadPayrollPdf);

// Agreements eligible for payroll (Bigin-connected + commission calculated)
router.get('/agreements', requireAdminAuth, getPayrollEligibleAgreements);

// Mark one agreement "Completed" — lock its commission into the current period
router.post('/agreements/:id/complete', requireAdminAuth, markAgreementCompleted);

export default router;
