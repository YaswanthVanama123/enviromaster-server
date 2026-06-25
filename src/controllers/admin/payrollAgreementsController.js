/**
 * Payroll Agreements Controller
 * Admin screen: list agreements that are connected to Bigin AND have commission
 * calculated, and let an admin mark one "Completed" — which LOCKS its commission
 * into the current payroll period for the creating employee. Once locked, later
 * edits to the agreement never change the payroll amount, and it is never added
 * to payroll twice.
 */

import mongoose from "mongoose";
import { AdminSettings } from "../../models/admin/index.js";
import { CustomerHeaderDoc } from "../../models/agreement/index.js";
import {
  calculatePayrollPeriods,
  formatPeriodLabel,
} from "./payrollController.js";
import logger from "../../utils/logger.js";

function eligibleFilter() {
  return {
    isDeleted: { $ne: true },
    createdBy: { $nin: [null, ""], $exists: true },
    "payload.commission.annualCommission": { $gt: 0 },
  };
}

/**
 * GET /api/payroll/agreements
 * List Bigin-connected + commission-calculated agreements with their payroll
 * lock status, plus the current payroll period a "Complete" would target.
 */
export async function getPayrollEligibleAgreements(req, res) {
  try {
    const settings = await AdminSettings.getSingleton();
    const periods = calculatePayrollPeriods(settings.payrollSettings);
    const currentPeriod = {
      start: periods.current.start.toISOString(),
      end: periods.current.end.toISOString(),
      label: formatPeriodLabel(periods.current.start, periods.current.end),
    };

    const docs = await CustomerHeaderDoc.find(eligibleFilter())
      .select({
        _id: 1,
        "payload.headerTitle": 1,
        "payload.summary.serviceAgreementTotal": 1,
        "payload.commission.annualCommission": 1,
        "payload.commission.weeklyCommission": 1,
        "zoho.bigin.dealId": 1,
        status: 1,
        createdBy: 1,
        createdAt: 1,
        payrollLock: 1,
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const agreements = docs.map((a) => {
      const lock = a.payrollLock || {};
      return {
        id: a._id.toString(),
        title: a.payload?.headerTitle || "Untitled",
        createdBy: a.createdBy,
        status: a.status,
        biginDealId: a.zoho?.bigin?.dealId || null,
        monthlyValue: a.payload?.summary?.serviceAgreementTotal || 0,
        annualCommission: a.payload?.commission?.annualCommission || 0,
        weeklyCommission: a.payload?.commission?.weeklyCommission || 0,
        createdAt: a.createdAt,
        addedToPayroll: !!lock.addedToPayroll,
        payrollAddedAt: lock.addedAt || null,
        payrollPeriodLabel: lock.periodLabel || null,
        lockedAnnualCommission: lock.lockedAnnualCommission ?? null,
        lockedWeeklyCommission: lock.lockedWeeklyCommission ?? null,
      };
    });

    res.json({ success: true, currentPeriod, agreements });
  } catch (err) {
    logger.error("getPayrollEligibleAgreements error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/payroll/agreements/:id/complete
 * Lock the agreement's commission into the current payroll period. Idempotent:
 * if already added, returns 409 and does not change the locked amount.
 */
export async function markAgreementCompleted(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: "Invalid agreement id" });
    }

    const doc = await CustomerHeaderDoc.findById(id)
      .select({
        "payload.headerTitle": 1,
        "payload.summary.serviceAgreementTotal": 1,
        "payload.commission.annualCommission": 1,
        "payload.commission.weeklyCommission": 1,
        "zoho.bigin.dealId": 1,
        createdBy: 1,
        payrollLock: 1,
        isDeleted: 1,
      })
      .lean()
      .exec();

    if (!doc || doc.isDeleted) {
      return res.status(404).json({ success: false, error: "Agreement not found" });
    }

    if (doc.payrollLock && doc.payrollLock.addedToPayroll) {
      return res.status(409).json({
        success: false,
        error: "Agreement is already added to payroll",
        payrollPeriodLabel: doc.payrollLock.periodLabel || null,
      });
    }

    const annualCommission = doc.payload?.commission?.annualCommission || 0;
    if (!(annualCommission > 0)) {
      return res.status(400).json({
        success: false,
        error: "Agreement must have commission calculated (connect to Bigin first)",
      });
    }

    const settings = await AdminSettings.getSingleton();
    const periods = calculatePayrollPeriods(settings.payrollSettings);
    const periodStart = periods.current.start;
    const periodEnd = periods.current.end;
    const periodLabel = formatPeriodLabel(periodStart, periodEnd);

    const payrollLock = {
      addedToPayroll: true,
      addedAt: new Date(),
      addedBy: req.admin?.username || "admin",
      employeeUsername: doc.createdBy,
      periodStart,
      periodEnd,
      periodLabel,
      lockedAnnualCommission: annualCommission,
      lockedWeeklyCommission: doc.payload?.commission?.weeklyCommission || 0,
      lockedMonthlyValue: doc.payload?.summary?.serviceAgreementTotal || 0,
    };

    await CustomerHeaderDoc.updateOne({ _id: id }, { $set: { payrollLock } });

    res.json({
      success: true,
      message: "Agreement added to payroll",
      payrollLock,
    });
  } catch (err) {
    logger.error("markAgreementCompleted error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
