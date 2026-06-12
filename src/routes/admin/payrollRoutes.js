import express from 'express';
import { requireAdminAuth } from "../../middleware/adminAuth.js";
import {
  getPayrollPeriods,
  getEmployeesPayroll,
  getPayrollHistory,
  downloadPayrollPdf
} from "../../controllers/admin/payrollController.js";

const router = express.Router();

// Get current payroll periods
router.get('/periods', requireAdminAuth, getPayrollPeriods);

// Get all employees' payroll data for a period
router.get('/employees', requireAdminAuth, getEmployeesPayroll);

// Get payroll history (past periods)
router.get('/history', requireAdminAuth, getPayrollHistory);

// Download a combined payroll PDF for a period (and record it in history)
router.get('/download-pdf', requireAdminAuth, downloadPayrollPdf);

export default router;
