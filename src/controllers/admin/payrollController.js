/**
 * Payroll Controller
 * Handles payroll period calculations and employee payroll data
 */

import { AdminSettings, PayrollSnapshot } from "../../models/admin/index.js";
import { CustomerHeaderDoc } from "../../models/agreement/index.js";

/**
 * Calculate the current and previous payroll periods based on settings
 */
function calculatePayrollPeriods(payrollSettings) {
  const now = new Date();
  const { startDate, cycleType, cycleDayOfWeek } = payrollSettings || {};

  // Default: if no start date, use beginning of current month
  const baseDate = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);

  let currentPeriodStart, currentPeriodEnd, previousPeriodStart, previousPeriodEnd;

  switch (cycleType) {
    case 'weekly': {
      // Find the most recent cycle day
      const daysSinceCycleDay = (now.getDay() - (cycleDayOfWeek || 1) + 7) % 7;
      currentPeriodStart = new Date(now);
      currentPeriodStart.setDate(now.getDate() - daysSinceCycleDay);
      currentPeriodStart.setHours(0, 0, 0, 0);

      currentPeriodEnd = new Date(currentPeriodStart);
      currentPeriodEnd.setDate(currentPeriodStart.getDate() + 6);
      currentPeriodEnd.setHours(23, 59, 59, 999);

      previousPeriodStart = new Date(currentPeriodStart);
      previousPeriodStart.setDate(currentPeriodStart.getDate() - 7);

      previousPeriodEnd = new Date(currentPeriodStart);
      previousPeriodEnd.setDate(currentPeriodStart.getDate() - 1);
      previousPeriodEnd.setHours(23, 59, 59, 999);
      break;
    }
    case 'biweekly': {
      // Calculate weeks since base date
      const weeksSinceBase = Math.floor((now - baseDate) / (7 * 24 * 60 * 60 * 1000));
      const biweeklyPeriods = Math.floor(weeksSinceBase / 2);

      currentPeriodStart = new Date(baseDate);
      currentPeriodStart.setDate(baseDate.getDate() + (biweeklyPeriods * 14));
      currentPeriodStart.setHours(0, 0, 0, 0);

      currentPeriodEnd = new Date(currentPeriodStart);
      currentPeriodEnd.setDate(currentPeriodStart.getDate() + 13);
      currentPeriodEnd.setHours(23, 59, 59, 999);

      previousPeriodStart = new Date(currentPeriodStart);
      previousPeriodStart.setDate(currentPeriodStart.getDate() - 14);

      previousPeriodEnd = new Date(currentPeriodStart);
      previousPeriodEnd.setDate(currentPeriodStart.getDate() - 1);
      previousPeriodEnd.setHours(23, 59, 59, 999);
      break;
    }
    case 'monthly':
    default: {
      currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    }
  }

  return {
    current: { start: currentPeriodStart, end: currentPeriodEnd },
    previous: { start: previousPeriodStart, end: previousPeriodEnd }
  };
}

/**
 * Get payroll periods information
 * GET /api/payroll/periods
 */
export async function getPayrollPeriods(req, res) {
  try {
    const settings = await AdminSettings.getSingleton();
    const periods = calculatePayrollPeriods(settings.payrollSettings);

    res.json({
      success: true,
      settings: settings.payrollSettings || {
        startDate: null,
        cycleType: 'biweekly',
        cycleDayOfWeek: 1
      },
      periods: {
        current: {
          start: periods.current.start.toISOString(),
          end: periods.current.end.toISOString(),
          label: formatPeriodLabel(periods.current.start, periods.current.end)
        },
        previous: {
          start: periods.previous.start.toISOString(),
          end: periods.previous.end.toISOString(),
          label: formatPeriodLabel(periods.previous.start, periods.previous.end)
        }
      }
    });
  } catch (err) {
    console.error("getPayrollPeriods error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

function formatPeriodLabel(start, end) {
  const options = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', options);
  const endStr = end.toLocaleDateString('en-US', { ...options, year: 'numeric' });
  return `${startStr} - ${endStr}`;
}

function createEmployeeRecord(username) {
  return {
    username,
    agreements: [],
    totalAgreements: 0,
    totalMonthlyRevenue: 0,
    totalAnnualCommission: 0,
    totalWeeklyCommission: 0,
    statusCounts: {
      draft: 0,
      saved: 0,
      pending_approval: 0,
      approved: 0,
      active: 0
    }
  };
}

function calculateCommission(summary, savedCommission) {
  const monthlyValue = summary.serviceAgreementTotal || 0;

  // Commission is only counted when it was actually saved with the agreement, which
  // only happens when the agreement is connected to Bigin. If there is no saved
  // commission (not connected to Bigin), there is NO payroll commission — we do not
  // invent one from revenue.
  if (savedCommission && savedCommission.annualCommission !== undefined) {
    return {
      annualCommission: savedCommission.annualCommission || 0,
      weeklyCommission: savedCommission.weeklyCommission || 0,
      monthlyValue,
    };
  }

  return { annualCommission: 0, weeklyCommission: 0, monthlyValue };
}

function incrementStatusCount(emp, status) {
  if (status === 'draft') emp.statusCounts.draft++;
  else if (status === 'saved') emp.statusCounts.saved++;
  else if (status === 'pending_approval') emp.statusCounts.pending_approval++;
  else if (status === 'approved_salesman' || status === 'approved_admin') emp.statusCounts.approved++;
  else if (status === 'active' || status === 'finalized') emp.statusCounts.active++;
}

/**
 * Compute every employee's payroll for a given period window (live, from agreements).
 * Returns { totals, employees } in the same shape the API exposes.
 */
async function computeEmployeesForPeriod(periodStart, periodEnd) {
  const agreements = await CustomerHeaderDoc.find({
    isDeleted: { $ne: true },
    createdBy: { $nin: [null, ""], $exists: true },
    createdAt: { $gte: periodStart, $lte: periodEnd }
  })
    .select({
      _id: 1,
      'payload.headerTitle': 1,
      'payload.summary': 1,
      'payload.commission': 1,
      status: 1,
      createdBy: 1,
      createdAt: 1
    })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  const employeeMap = new Map();

  agreements.forEach(a => {
    const username = a.createdBy;
    if (!username) return;

    if (!employeeMap.has(username)) {
      employeeMap.set(username, createEmployeeRecord(username));
    }

    const emp = employeeMap.get(username);
    const summary = a.payload?.summary || {};
    const savedCommission = a.payload?.commission || {};
    const { annualCommission, weeklyCommission, monthlyValue } = calculateCommission(summary, savedCommission);

    emp.totalAgreements++;
    emp.totalMonthlyRevenue += monthlyValue;
    emp.totalAnnualCommission += annualCommission;
    emp.totalWeeklyCommission += weeklyCommission;

    incrementStatusCount(emp, a.status);

    emp.agreements.push({
      id: a._id.toString(),
      title: a.payload?.headerTitle || 'Untitled',
      status: a.status,
      createdAt: a.createdAt,
      monthlyValue,
      annualCommission,
      weeklyCommission
    });
  });

  const employees = Array.from(employeeMap.values())
    .sort((a, b) => b.totalAnnualCommission - a.totalAnnualCommission);

  const totals = employees.reduce((acc, emp) => {
    acc.totalAgreements += emp.totalAgreements;
    acc.totalMonthlyRevenue += emp.totalMonthlyRevenue;
    acc.totalAnnualCommission += emp.totalAnnualCommission;
    acc.totalWeeklyCommission += emp.totalWeeklyCommission;
    return acc;
  }, {
    totalEmployees: employees.length,
    totalAgreements: 0,
    totalMonthlyRevenue: 0,
    totalAnnualCommission: 0,
    totalWeeklyCommission: 0
  });

  return { totals, employees };
}

/**
 * For a CLOSED (already ended) period, return the stored snapshot, creating it on
 * first access. Returns null for an open period (caller should live-compute).
 */
async function getOrCreateSnapshot(period, cycleType, now) {
  if (period.end >= now) {
    return null;
  }

  const existing = await PayrollSnapshot.findOne({
    periodStart: period.start,
    periodEnd: period.end,
  }).lean().exec();

  if (existing) {
    return existing;
  }

  const { totals, employees } = await computeEmployeesForPeriod(period.start, period.end);

  try {
    const created = await PayrollSnapshot.create({
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: formatPeriodLabel(period.start, period.end),
      cycleType: cycleType || 'monthly',
      totals,
      employees,
    });
    return created.toObject();
  } catch (err) {
    // Concurrent request already created it (unique index) — read it back.
    if (err && err.code === 11000) {
      return await PayrollSnapshot.findOne({
        periodStart: period.start,
        periodEnd: period.end,
      }).lean().exec();
    }
    throw err;
  }
}

/**
 * Get all employees' payroll data for a specific period
 * GET /api/payroll/employees
 * Query params: periodStart, periodEnd (optional - defaults to current period)
 */
export async function getEmployeesPayroll(req, res) {
  try {
    const settings = await AdminSettings.getSingleton();
    const periods = calculatePayrollPeriods(settings.payrollSettings);
    const cycleType = settings.payrollSettings?.cycleType;

    const periodStart = req.query.periodStart ? new Date(req.query.periodStart) : periods.current.start;
    const periodEnd = req.query.periodEnd ? new Date(req.query.periodEnd) : periods.current.end;

    const now = new Date();
    const period = { start: periodStart, end: periodEnd };

    const snapshot = await getOrCreateSnapshot(period, cycleType, now);

    let resolvedTotals;
    let resolvedEmployees;
    if (snapshot) {
      resolvedTotals = snapshot.totals;
      resolvedEmployees = snapshot.employees;
    } else {
      const live = await computeEmployeesForPeriod(periodStart, periodEnd);
      resolvedTotals = live.totals;
      resolvedEmployees = live.employees;
    }

    res.json({
      success: true,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        label: formatPeriodLabel(periodStart, periodEnd)
      },
      finalized: !!snapshot,
      snapshotAt: snapshot?.snapshotAt || null,
      totals: resolvedTotals,
      employees: resolvedEmployees
    });
  } catch (err) {
    console.error("getEmployeesPayroll error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Get payroll history (list of past payroll periods with totals)
 * GET /api/payroll/history
 */
export async function getPayrollHistory(req, res) {
  try {
    const settings = await AdminSettings.getSingleton();
    const { cycleType } = settings.payrollSettings || {};
    const limit = parseInt(req.query.limit) || 12;

    // Generate past periods
    const periods = [];
    const now = new Date();

    for (let i = 0; i < limit; i++) {
      let periodStart, periodEnd;

      switch (cycleType) {
        case 'weekly': {
          periodStart = new Date(now);
          periodStart.setDate(now.getDate() - (i * 7) - now.getDay());
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setDate(periodStart.getDate() + 6);
          periodEnd.setHours(23, 59, 59, 999);
          break;
        }
        case 'biweekly': {
          periodStart = new Date(now);
          periodStart.setDate(now.getDate() - (i * 14) - now.getDay());
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setDate(periodStart.getDate() + 13);
          periodEnd.setHours(23, 59, 59, 999);
          break;
        }
        case 'monthly':
        default: {
          periodStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
          periodEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
          break;
        }
      }

      periods.push({ start: periodStart, end: periodEnd });
    }

    // For each period: closed periods read (and auto-create) a frozen snapshot;
    // the current open period is computed live.
    const historyPromises = periods.map(async (period) => {
      const snapshot = await getOrCreateSnapshot(period, cycleType, now);

      let totalAgreements;
      let totalRevenue;
      let totalCommission;
      let employeeCount;

      if (snapshot) {
        totalAgreements = snapshot.totals.totalAgreements;
        totalRevenue = snapshot.totals.totalMonthlyRevenue;
        totalCommission = snapshot.totals.totalAnnualCommission;
        employeeCount = snapshot.totals.totalEmployees;
      } else {
        const live = await computeEmployeesForPeriod(period.start, period.end);
        totalAgreements = live.totals.totalAgreements;
        totalRevenue = live.totals.totalMonthlyRevenue;
        totalCommission = live.totals.totalAnnualCommission;
        employeeCount = live.totals.totalEmployees;
      }

      return {
        period: {
          start: period.start.toISOString(),
          end: period.end.toISOString(),
          label: formatPeriodLabel(period.start, period.end)
        },
        totalAgreements,
        totalRevenue,
        totalCommission,
        employeeCount,
        finalized: !!snapshot,
        snapshotAt: snapshot?.snapshotAt || null
      };
    });

    const history = await Promise.all(historyPromises);

    res.json({
      success: true,
      cycleType: cycleType || 'monthly',
      history
    });
  } catch (err) {
    console.error("getPayrollHistory error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
