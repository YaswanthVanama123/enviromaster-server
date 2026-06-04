/**
 * Payroll Controller
 * Handles payroll period calculations and employee payroll data
 */

import { AdminSettings } from "../../models/admin/index.js";
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

/**
 * Get all employees' payroll data for a specific period
 * GET /api/payroll/employees
 * Query params: periodStart, periodEnd (optional - defaults to current period)
 */
export async function getEmployeesPayroll(req, res) {
  try {
    const settings = await AdminSettings.getSingleton();
    const periods = calculatePayrollPeriods(settings.payrollSettings);

    // Use query params or default to current period
    let periodStart = req.query.periodStart ? new Date(req.query.periodStart) : periods.current.start;
    let periodEnd = req.query.periodEnd ? new Date(req.query.periodEnd) : periods.current.end;

    // Fetch all agreements within the period, grouped by createdBy (salesperson)
    const agreements = await CustomerHeaderDoc.find({
      isDeleted: { $ne: true },
      createdBy: { $ne: null, $exists: true, $ne: '' },
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
      .lean();

    // Group by employee
    const employeeMap = new Map();

    agreements.forEach(a => {
      const username = a.createdBy;
      if (!username) return;

      if (!employeeMap.has(username)) {
        employeeMap.set(username, {
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
        });
      }

      const emp = employeeMap.get(username);
      const summary = a.payload?.summary || {};
      const savedCommission = a.payload?.commission || {};

      // Calculate commission
      const monthlyValue = summary.serviceAgreementTotal || 0;
      let annualCommission = 0;
      let weeklyCommission = 0;

      if (savedCommission.annualCommission !== undefined) {
        annualCommission = savedCommission.annualCommission || 0;
        weeklyCommission = savedCommission.weeklyCommission || 0;
      } else {
        // Fallback calculation
        const monthlyCommission = monthlyValue * 0.06;
        annualCommission = monthlyCommission * 12;
        weeklyCommission = monthlyCommission / 4.33;
      }

      emp.totalAgreements++;
      emp.totalMonthlyRevenue += monthlyValue;
      emp.totalAnnualCommission += annualCommission;
      emp.totalWeeklyCommission += weeklyCommission;

      // Status counting
      if (a.status === 'draft') emp.statusCounts.draft++;
      else if (a.status === 'saved') emp.statusCounts.saved++;
      else if (a.status === 'pending_approval') emp.statusCounts.pending_approval++;
      else if (a.status === 'approved_salesman' || a.status === 'approved_admin') emp.statusCounts.approved++;
      else if (a.status === 'active' || a.status === 'finalized') emp.statusCounts.active++;

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

    // Convert to array and sort by total commission
    const employees = Array.from(employeeMap.values())
      .sort((a, b) => b.totalAnnualCommission - a.totalAnnualCommission);

    // Calculate totals
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

    res.json({
      success: true,
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        label: formatPeriodLabel(periodStart, periodEnd)
      },
      totals,
      employees
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

    // For each period, get aggregate data
    const historyPromises = periods.map(async (period) => {
      const result = await CustomerHeaderDoc.aggregate([
        {
          $match: {
            isDeleted: { $ne: true },
            createdBy: { $ne: null, $exists: true },
            createdAt: { $gte: period.start, $lte: period.end }
          }
        },
        {
          $addFields: {
            // Calculate commission: use saved annualCommission if exists, otherwise calculate from monthly revenue
            calculatedCommission: {
              $cond: {
                if: { $gt: ['$payload.commission.annualCommission', 0] },
                then: '$payload.commission.annualCommission',
                else: {
                  $multiply: [
                    { $ifNull: ['$payload.summary.serviceAgreementTotal', 0] },
                    12,  // monthly to annual
                    0.06 // commission rate
                  ]
                }
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            totalAgreements: { $sum: 1 },
            totalRevenue: {
              $sum: { $ifNull: ['$payload.summary.serviceAgreementTotal', 0] }
            },
            totalCommission: {
              $sum: '$calculatedCommission'
            },
            uniqueEmployees: { $addToSet: '$createdBy' }
          }
        }
      ]);

      const data = result[0] || {
        totalAgreements: 0,
        totalRevenue: 0,
        totalCommission: 0,
        uniqueEmployees: []
      };

      return {
        period: {
          start: period.start.toISOString(),
          end: period.end.toISOString(),
          label: formatPeriodLabel(period.start, period.end)
        },
        totalAgreements: data.totalAgreements,
        totalRevenue: data.totalRevenue,
        totalCommission: data.totalCommission,
        employeeCount: data.uniqueEmployees?.length || 0
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
