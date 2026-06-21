/**
 * Payroll Controller
 * Handles payroll period calculations and employee payroll data
 */

import { AdminSettings, PayrollSnapshot } from "../../models/admin/index.js";
import { CustomerHeaderDoc } from "../../models/agreement/index.js";
import { compileRawTex } from "../../services/pdfService.js";
import logger from "../../utils/logger.js";

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
    logger.error("getPayrollPeriods error:", err);
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
  // A snapshot may already exist for an OPEN period if its payroll PDF was
  // downloaded (which finalizes/records it). Always honor an existing snapshot.
  const existing = await PayrollSnapshot.findOne({
    periodStart: period.start,
    periodEnd: period.end,
  }).lean().exec();

  if (existing) {
    return existing;
  }

  // Otherwise only auto-create snapshots for CLOSED (already ended) periods.
  if (period.end >= now) {
    return null;
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
    logger.error("getEmployeesPayroll error:", err);
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
        snapshotAt: snapshot?.snapshotAt || null,
        pdfGeneratedAt: snapshot?.pdfGeneratedAt || null,
        pdfCount: snapshot?.pdfCount || 0
      };
    });

    const history = await Promise.all(historyPromises);

    res.json({
      success: true,
      cycleType: cycleType || 'monthly',
      history
    });
  } catch (err) {
    logger.error("getPayrollHistory error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

function texEscape(value) {
  return String(value ?? "")
    .replace(/[\x00-\x1F\x7F-\xFF]/g, "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function texMoney(amount) {
  const num = Number(amount) || 0;
  return `\\$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function texDate(dateStr) {
  if (!dateStr) return "---";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "---";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function texDateLong(dateStr) {
  if (!dateStr) return "---";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "---";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const STATUS_PILL = {
  active: { bg: "stactivebg", fg: "stactivefg" },
  finalized: { bg: "stactivebg", fg: "stactivefg" },
  saved: { bg: "stsavedbg", fg: "stsavedfg" },
  pending_approval: { bg: "stpendbg", fg: "stpendfg" },
  approved: { bg: "stapprbg", fg: "stapprfg" },
  approved_salesman: { bg: "stapprbg", fg: "stapprfg" },
  approved_admin: { bg: "stapprbg", fg: "stapprfg" },
  draft: { bg: "stdraftbg", fg: "stdraftfg" },
};

function statusPill(status) {
  const key = String(status || "").toLowerCase();
  const c = STATUS_PILL[key] || STATUS_PILL.draft;
  const label = texEscape((status || "").replace(/_/g, " ").toUpperCase());
  return `\\colorbox{${c.bg}}{\\textcolor{${c.fg}}{\\scriptsize\\bfseries ${label}}}`;
}

function buildInfoBox(title, pairs) {
  const rows = pairs
    .map(([label, value]) => `{\\color{emgray}${label}} & \\textbf{\\color{emdark}${value}} \\\\ \\hline`)
    .join("\n");
  return `{\\arrayrulecolor{emborder}\\setlength{\\arrayrulewidth}{0.6pt}
\\begin{tabularx}{\\linewidth}{|@{\\hspace{8pt}}X >{\\RaggedLeft\\arraybackslash}p{3.7cm}@{\\hspace{8pt}}|}
\\hline
\\rowcolor{emindigo}\\multicolumn{2}{|@{\\hspace{8pt}}l@{\\hspace{8pt}}|}{\\color{white}\\bfseries\\footnotesize ${title}} \\\\ \\hline
${rows}
\\end{tabularx}}`;
}

/**
 * Build one payroll-statement page for a single employee, matching the design of
 * the individual payroll slip (header, info boxes, earnings table, NET PAY,
 * signatures).
 */
function buildEmployeeSlip(emp, period, now, isFirst) {
  const username = emp.username || "";
  const usernameTex = texEscape(username);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const checkNo = texEscape(`${yyyy}${mm}${username.toUpperCase().slice(0, 3)}`);
  const empId = texEscape(`EMP-${username.toUpperCase().slice(0, 4)}-001`);
  const payDate = texEscape(texDateLong(now.toISOString()));

  const empInfo = buildInfoBox("EMPLOYEE INFORMATION", [
    ["Employee Name", usernameTex],
    ["Employee ID", empId],
    ["Department", "Sales"],
    ["Position", "Sales Representative"],
  ]);
  const payPeriod = buildInfoBox("PAY PERIOD", [
    ["Period", texEscape(period.label)],
    ["Start Date", texEscape(texDate(period.start))],
    ["End Date", texEscape(texDate(period.end))],
    ["Payment Date", texEscape(texDate(now.toISOString()))],
  ]);

  const agreementRows = (emp.agreements || [])
    .filter(a => (Number(a.annualCommission) || 0) > 0)
    .map(a => {
      const name = texEscape(a.title || "Untitled");
      const created = texEscape(texDate(a.createdAt));
      return `\\textbf{\\color{emdark}${name}}\\newline{\\scriptsize\\color{emlight}Created: ${created}} & {\\color{emdark}${texMoney(a.monthlyValue)}/mo} & \\textcolor{empurple}{\\textbf{${texMoney(a.annualCommission)}}} \\\\ \\arrayrulecolor{emborder}\\hline`;
    })
    .join("\n");
  const rowsBlock =
    agreementRows ||
    `\\multicolumn{3}{|@{\\hspace{8pt}}c@{\\hspace{8pt}}|}{\\textit{\\color{emlight}No commissionable agreements in this period}} \\\\ \\arrayrulecolor{emborder}\\hline`;

  return `${isFirst ? "" : "\\newpage"}
\\thispagestyle{empty}
\\noindent
\\begin{minipage}[t]{0.60\\textwidth}
{\\fontsize{26}{28}\\selectfont\\bfseries\\color{emindigo}ENVIRO-MASTER}\\\\[4pt]
{\\footnotesize\\color{emgray}SERVICES INTERNATIONAL}\\\\[8pt]
{\\scriptsize\\color{emlight} 1234 Corporate Boulevard, Suite 500\\\\ Charlotte, NC 28202\\\\ Tel: (704) 555-0123}
\\end{minipage}\\hfill
\\begin{minipage}[t]{0.38\\textwidth}
\\RaggedLeft
{\\fontsize{22}{24}\\selectfont\\bfseries\\color{emindigo}PAYROLL}\\\\[10pt]
{\\small\\color{emgray}Pay Date: ${payDate}}\\\\[3pt]
{\\small\\color{emgray}Check No: ${checkNo}}
\\end{minipage}

\\vspace{10pt}
{\\color{emindigo}\\rule{\\textwidth}{2pt}}
\\vspace{18pt}

\\noindent
\\begin{minipage}[t]{0.48\\textwidth}
${empInfo}
\\end{minipage}\\hfill
\\begin{minipage}[t]{0.48\\textwidth}
${payPeriod}
\\end{minipage}

\\vspace{20pt}

\\noindent
{\\arrayrulecolor{emborder}\\setlength{\\arrayrulewidth}{0.6pt}
\\begin{longtable}{|@{\\hspace{8pt}}p{9.4cm} >{\\RaggedLeft\\arraybackslash}p{3.8cm} >{\\RaggedLeft\\arraybackslash}p{3.2cm}@{\\hspace{8pt}}|}
\\hline
\\rowcolor{emindigo}\\multicolumn{3}{|@{\\hspace{8pt}}l@{\\hspace{8pt}}|}{\\color{white}\\bfseries\\footnotesize COMMISSION EARNINGS} \\\\ \\hline
\\rowcolor{emtablehdr}{\\color{emgray}\\bfseries\\scriptsize DESCRIPTION} & {\\color{emgray}\\bfseries\\scriptsize CONTRACT VALUE} & {\\color{emgray}\\bfseries\\scriptsize COMMISSION} \\\\ \\arrayrulecolor{emborder}\\hline
\\endhead
${rowsBlock}
\\end{longtable}}

\\vspace{18pt}

\\noindent
{\\arrayrulecolor{emindigo}\\setlength{\\arrayrulewidth}{1pt}
\\begin{tabularx}{\\textwidth}{|@{\\hspace{14pt}}X >{\\RaggedLeft\\arraybackslash}p{6cm}@{\\hspace{14pt}}|}
\\hline
{\\color{emdark}Total Agreements} & \\textbf{${Number(emp.totalAgreements) || 0}} \\\\ \\hline
{\\color{emdark}Total Monthly Revenue} & \\textbf{${texMoney(emp.totalMonthlyRevenue)}} \\\\ \\hline
\\end{tabularx}}

\\vspace{-1pt}
\\noindent\\colorbox{emindigo}{\\parbox{\\dimexpr\\textwidth-2\\fboxsep\\relax}{\\vspace{3pt}\\hspace{8pt}{\\color{white}\\bfseries\\large NET PAY}\\hfill{\\color{white}\\bfseries\\LARGE ${texMoney(emp.totalAnnualCommission)}}\\hspace{8pt}\\vspace{3pt}}}

\\vspace{55pt}

\\noindent
\\begin{minipage}[t]{0.46\\textwidth}\\centering
\\rule{0.9\\linewidth}{0.6pt}\\\\[3pt]
\\textbf{${usernameTex}}\\\\{\\scriptsize\\color{emlight}Employee}
\\end{minipage}\\hfill
\\begin{minipage}[t]{0.46\\textwidth}\\centering
\\rule{0.9\\linewidth}{0.6pt}\\\\[3pt]
\\textbf{Authorized Signatory}\\\\{\\scriptsize\\color{emlight}Payroll Department}
\\end{minipage}
`;
}

/**
 * Build a single self-contained LaTeX document containing every employee's
 * payroll statement (one slip per page), matching the individual slip design.
 */
function buildPayrollLatex(employees, totals, period) {
  const now = new Date();
  const slips = employees
    .map((emp, idx) => buildEmployeeSlip(emp, period, now, idx === 0))
    .join("\n");

  return `\\documentclass[10pt]{article}
\\usepackage[a4paper,margin=1.6cm]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{helvet}
\\renewcommand{\\familydefault}{\\sfdefault}
\\usepackage{xcolor}
\\usepackage{array}
\\usepackage{tabularx}
\\usepackage{longtable}
\\usepackage{colortbl}
\\usepackage{ragged2e}
\\definecolor{emindigo}{HTML}{6366F1}
\\definecolor{emdark}{HTML}{1A202C}
\\definecolor{emgray}{HTML}{4A5568}
\\definecolor{emlight}{HTML}{718096}
\\definecolor{emborder}{HTML}{E2E8F0}
\\definecolor{empurple}{HTML}{7C3AED}
\\definecolor{emtablehdr}{HTML}{F7FAFC}
\\definecolor{stactivebg}{HTML}{EDE9FE}\\definecolor{stactivefg}{HTML}{7C3AED}
\\definecolor{stsavedbg}{HTML}{DBEAFE}\\definecolor{stsavedfg}{HTML}{2563EB}
\\definecolor{stpendbg}{HTML}{FEF3C7}\\definecolor{stpendfg}{HTML}{D97706}
\\definecolor{stapprbg}{HTML}{E0E7FF}\\definecolor{stapprfg}{HTML}{4338CA}
\\definecolor{stdraftbg}{HTML}{E2E8F0}\\definecolor{stdraftfg}{HTML}{4A5568}
\\setlength{\\parindent}{0pt}
\\renewcommand{\\arraystretch}{1.5}
\\setlength{\\tabcolsep}{6pt}
\\pagestyle{empty}
\\begin{document}
${slips}
\\end{document}
`;
}

/**
 * Download a payroll PDF for a period and record the payroll run in history.
 * Without `username` it produces one combined PDF for every employee; with
 * `username` it produces that single employee's payroll slip. Either way the
 * PDF is compiled on the LaTeX server.
 * GET /api/payroll/download-pdf
 * Query params: periodStart, periodEnd (optional), username (optional)
 */
export async function downloadPayrollPdf(req, res) {
  try {
    const settings = await AdminSettings.getSingleton();
    const periods = calculatePayrollPeriods(settings.payrollSettings);
    const cycleType = settings.payrollSettings?.cycleType || "monthly";

    const periodStart = req.query.periodStart ? new Date(req.query.periodStart) : periods.current.start;
    const periodEnd = req.query.periodEnd ? new Date(req.query.periodEnd) : periods.current.end;
    const periodLabel = formatPeriodLabel(periodStart, periodEnd);
    const username = req.query.username ? String(req.query.username) : null;

    const { totals, employees } = await computeEmployeesForPeriod(periodStart, periodEnd);

    if (!employees.length) {
      return res.status(404).json({ success: false, error: "No payroll data for this period." });
    }

    const pdfEmployees = username
      ? employees.filter(e => e.username === username)
      : employees;

    if (!pdfEmployees.length) {
      return res.status(404).json({ success: false, error: "No payroll data for this employee." });
    }

    const latex = buildPayrollLatex(pdfEmployees, totals, {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      label: periodLabel,
    });

    const { buffer } = await compileRawTex(latex);

    // Record this payroll run in history (creates/freezes the snapshot for the
    // period and stamps when the PDF was generated). The snapshot always stores
    // the full period, even for a single-employee download.
    try {
      await PayrollSnapshot.findOneAndUpdate(
        { periodStart, periodEnd },
        {
          $set: {
            periodLabel,
            cycleType,
            totals,
            employees,
            pdfGeneratedAt: new Date(),
          },
          $inc: { pdfCount: 1 },
          $setOnInsert: { snapshotAt: new Date() },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (snapErr) {
      logger.error("downloadPayrollPdf: failed to record snapshot:", snapErr.message);
    }

    const safeLabel = periodLabel.replace(/[^a-z0-9]+/gi, "-");
    const namePart = username ? `${username.replace(/[^a-z0-9]+/gi, "-")}-` : "";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="payroll-${namePart}${safeLabel}.pdf"`);
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  } catch (err) {
    logger.error("downloadPayrollPdf error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to generate payroll PDF" });
  }
}
