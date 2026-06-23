/**
 * Quota Tracking Controller
 * Handles sales person management, agreements, and quota tracking
 * Uses Employee model from User Management for sales persons
 */

import mongoose from "mongoose";
import { Employee } from "../../models/user/index.js";
import { CustomerHeaderDoc } from "../../models/agreement/index.js";
import { AdminSettings } from "../../models/admin/index.js";
import logger from "../../utils/logger.js";
import {
  Agreement,
  QuotaPeriod,
  CommissionRules,
  DEFAULT_COMMISSION_RULES,
} from "../../models/commission/index.js";

// Helper: Check if string is valid ObjectId
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// Helper: Build query for finding employee by id or username
function buildEmployeeQuery(id) {
  if (isValidObjectId(id)) {
    return { $or: [{ _id: id }, { username: id }] };
  }
  return { username: id };
}

// Helper: Generate agreement number
function generateAgreementNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `AGR-${timestamp}-${random}`;
}

// Helper: Calculate quota level from percentage
function calculateQuotaLevel(percentage) {
  if (percentage >= 200) return "double";
  if (percentage >= 100) return "above";
  return "below";
}

// Pricing-tier multiplier from the current/redline ratio (percentage), matching
// the admin Pricing Tiers (Below Redline 0.5, Redline 1.0, 110% 1.25, 120% 1.5,
// Greenline 130%+ → 2.0).
function pricingMultiplierFromRatio(ratioPct) {
  if (ratioPct < 100) return 0.5;
  if (ratioPct <= 109) return 1.0;
  if (ratioPct <= 119) return 1.25;
  if (ratioPct <= 129) return 1.5;
  return 2.0;
}

// Quota credit for an agreement = annualized contract (contract total ÷ years) ×
// pricing-tier (redline/greenline) multiplier. e.g. $36,000 / 3yr × Greenline 2.0
// = $24,000. Prefers the value persisted by the commission engine; otherwise
// derives the multiplier from the saved services' current vs redline totals.
function quotaCreditFromPayload(payload) {
  const s = payload?.summary || {};
  if (typeof s.quotaCredit === "number" && s.quotaCredit > 0) {
    return s.quotaCredit;
  }

  const services = payload?.services || {};
  let current = 0;
  let original = 0;
  Object.values(services).forEach(sd => {
    if (!sd || typeof sd !== "object" || sd.isActive === false) return;
    const c = Number(sd.contractTotal) || 0;
    const o = Number(sd.originalContractTotal) || c;
    current += c;
    original += o;
  });

  if (current <= 0) {
    current = (s.serviceAgreementTotal || 0) + (s.productContractTotal || 0);
    original = current;
  }

  const months = s.contractMonths || 12;
  const years = months > 0 ? months / 12 : 1;
  const annual = years > 0 ? current / years : current;
  const ratioPct = original > 0 ? (current / original) * 100 : 100;
  return annual * pricingMultiplierFromRatio(ratioPct);
}

// Helper: Get period boundaries from payroll settings
async function getPayrollPeriodBoundaries(targetDate = new Date()) {
  const settings = await AdminSettings.getSingleton();
  const { startDate, cycleType, cycleDayOfWeek } = settings.payrollSettings || {};

  const now = targetDate;
  const baseDate = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);

  let start, end, label;

  switch (cycleType) {
    case 'weekly': {
      const daysSinceCycleDay = (now.getDay() - (cycleDayOfWeek || 1) + 7) % 7;
      start = new Date(now);
      start.setDate(now.getDate() - daysSinceCycleDay);
      start.setHours(0, 0, 0, 0);

      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      label = `${startStr} - ${endStr}`;
      break;
    }
    case 'biweekly': {
      const weeksSinceBase = Math.floor((now - baseDate) / (7 * 24 * 60 * 60 * 1000));
      const biweeklyPeriods = Math.floor(weeksSinceBase / 2);

      start = new Date(baseDate);
      start.setDate(baseDate.getDate() + (biweeklyPeriods * 14));
      start.setHours(0, 0, 0, 0);

      end = new Date(start);
      end.setDate(start.getDate() + 13);
      end.setHours(23, 59, 59, 999);

      const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      label = `${startStr} - ${endStr}`;
      break;
    }
    case 'monthly':
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      label = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      break;
    }
  }

  return { start, end, label, cycleType: cycleType || 'monthly' };
}

// Quota is WEEKLY and resets every week (2 weekly quota periods per biweekly
// payroll). The week is anchored to the payroll cycle day-of-week.
async function getWeeklyQuotaBoundaries(targetDate = new Date()) {
  const settings = await AdminSettings.getSingleton();
  const { cycleDayOfWeek } = settings.payrollSettings || {};
  const now = new Date(targetDate);
  const daysSinceCycleDay = (now.getDay() - (cycleDayOfWeek ?? 1) + 7) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceCycleDay);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return { start, end, label: `${startStr} - ${endStr}` };
}

// Helper: Get period boundaries (legacy - kept for backward compatibility)
function getPeriodBoundaries(date, periodType) {
  const d = new Date(date);
  let start, end, label;

  if (periodType === "monthly") {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    label = d.toLocaleString("default", { month: "long", year: "numeric" });
  } else if (periodType === "quarterly") {
    const quarter = Math.floor(d.getMonth() / 3);
    start = new Date(d.getFullYear(), quarter * 3, 1);
    end = new Date(d.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
    label = `Q${quarter + 1} ${d.getFullYear()}`;
  } else {
    start = new Date(d.getFullYear(), 0, 1);
    end = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
    label = d.getFullYear().toString();
  }

  return { start, end, label };
}

// Helper: Calculate commission for an agreement
async function calculateAgreementCommission(agreementData, quotaLevel) {
  // Get active commission rules
  let rules = await CommissionRules.findOne({ isActive: true });
  if (!rules) {
    rules = DEFAULT_COMMISSION_RULES;
  }

  const baseRate = rules.quotaRates[quotaLevel] || 3;
  const agreementMultiplier = rules.agreementMultipliers[agreementData.agreementTerm] || 100;
  const accountTypeAdjustment = rules.accountTypeAdjustments[agreementData.accountType] || 0;
  const greenlineBonus = agreementData.pricingLine === "Greenline" ? rules.greenlineBonus : 0;
  const renewalBonus =
    agreementData.businessType === "renewal" &&
    agreementData.yearsAsCustomer >= rules.renewalMinYears
      ? rules.renewalBonusRate
      : 0;
  const insideSalesDeduction = agreementData.insideSales?.involved
    ? rules.insideSalesDeduction
    : 0;

  const effectiveBaseRate =
    baseRate + accountTypeAdjustment + greenlineBonus + renewalBonus + insideSalesDeduction;
  const finalCommissionRate = effectiveBaseRate * (agreementMultiplier / 100);
  // Calculate weekly commission
  const weeklyRevenue = agreementData.monthlyValue / 4.33;
  const weeklyCommission = weeklyRevenue * (finalCommissionRate / 100);
  const annualCommission = weeklyCommission * 52;
  // Commission is always paid for 12 months only
  const totalCommission = annualCommission;

  return {
    quotaLevelAtTime: quotaLevel,
    effectiveBaseRate,
    finalCommissionRate,
    weeklyCommission,
    annualCommission,
    totalCommission,
    breakdown: {
      baseRate,
      agreementMultiplier,
      accountTypeAdjustment,
      greenlineBonus,
      renewalBonus,
      insideSalesDeduction,
    },
  };
}

// ============================================================
// SALES PERSON MANAGEMENT (Using Employee model)
// ============================================================

/**
 * Get all sales persons (employees)
 */
export const getAllSalesPersons = async (req, res) => {
  try {
    const { active, role, search } = req.query;
    const filter = {};

    if (active !== undefined) {
      filter.isActive = active === "true";
    }
    if (role && role !== "all") {
      filter.salesRole = role;
    }
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    const employees = await Employee.find(filter)
      .select("-passwordHash")
      .sort({ fullName: 1 });

    // Map to expected format for frontend
    const salesPersons = employees.map((emp) => ({
      _id: emp._id,
      employeeId: emp.username,
      name: emp.fullName,
      email: emp.email || "",
      phone: emp.phone || "",
      department: "Sales",
      role: emp.salesRole || "field_sales",
      isActive: emp.isActive,
      quota: {
        monthlyTarget: emp.quota?.monthlyTarget || 50000,
        effectiveDate: emp.quota?.effectiveDate || emp.createdAt,
        periodType: emp.quota?.periodType || "monthly",
      },
      managerId: emp.managerId,
      territory: emp.territory || "",
      hireDate: emp.hireDate || emp.createdAt,
      createdAt: emp.createdAt,
      updatedAt: emp.updatedAt,
    }));

    res.json({
      success: true,
      data: salesPersons,
      count: salesPersons.length,
    });
  } catch (error) {
    logger.error("Error fetching sales persons:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch sales persons",
    });
  }
};

/**
 * Get a single sales person by ID (employee)
 */
export const getSalesPersonById = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findOne(buildEmployeeQuery(id)).select("-passwordHash");

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    // Map to expected format
    const salesPerson = {
      _id: employee._id,
      employeeId: employee.username,
      name: employee.fullName,
      email: employee.email || "",
      phone: employee.phone || "",
      department: "Sales",
      role: employee.salesRole || "field_sales",
      isActive: employee.isActive,
      quota: {
        monthlyTarget: employee.quota?.monthlyTarget || 50000,
        effectiveDate: employee.quota?.effectiveDate || employee.createdAt,
        periodType: employee.quota?.periodType || "monthly",
      },
      managerId: employee.managerId,
      territory: employee.territory || "",
      hireDate: employee.hireDate || employee.createdAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };

    res.json({
      success: true,
      data: salesPerson,
    });
  } catch (error) {
    logger.error("Error fetching sales person:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch sales person",
    });
  }
};

/**
 * Create a new sales person - redirects to user management
 * Sales persons are created through User Management
 */
export const createSalesPerson = async (req, res) => {
  res.status(400).json({
    success: false,
    error: "Sales persons are managed through User Management. Please create an employee there first.",
  });
};

/**
 * Update a sales person (employee quota/sales fields)
 */
export const updateSalesPerson = async (req, res) => {
  try {
    const { id } = req.params;
    const { salesRole, territory, managerId, phone } = req.body;

    const employee = await Employee.findOne(buildEmployeeQuery(id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    // Update only sales-related fields
    if (salesRole !== undefined) employee.salesRole = salesRole;
    if (territory !== undefined) employee.territory = territory;
    if (managerId !== undefined) employee.managerId = managerId;
    if (phone !== undefined) employee.phone = phone;

    await employee.save();

    // Return mapped format
    const salesPerson = {
      _id: employee._id,
      employeeId: employee.username,
      name: employee.fullName,
      email: employee.email || "",
      phone: employee.phone || "",
      department: "Sales",
      role: employee.salesRole || "field_sales",
      isActive: employee.isActive,
      quota: {
        monthlyTarget: employee.quota?.monthlyTarget || 50000,
        effectiveDate: employee.quota?.effectiveDate || employee.createdAt,
        periodType: employee.quota?.periodType || "monthly",
      },
      managerId: employee.managerId,
      territory: employee.territory || "",
      hireDate: employee.hireDate || employee.createdAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };

    res.json({
      success: true,
      data: salesPerson,
      message: "Sales person updated successfully",
    });
  } catch (error) {
    logger.error("Error updating sales person:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update sales person",
    });
  }
};

/**
 * Update sales person quota
 */
export const updateSalesPersonQuota = async (req, res) => {
  try {
    const { id } = req.params;
    const { monthlyTarget, periodType, effectiveDate } = req.body;

    const employee = await Employee.findOne(buildEmployeeQuery(id));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    // Update quota
    if (!employee.quota) {
      employee.quota = {};
    }
    if (monthlyTarget !== undefined) employee.quota.monthlyTarget = monthlyTarget;
    if (periodType !== undefined) employee.quota.periodType = periodType;
    if (effectiveDate !== undefined) employee.quota.effectiveDate = effectiveDate;

    await employee.save();

    // Return mapped format
    const salesPerson = {
      _id: employee._id,
      employeeId: employee.username,
      name: employee.fullName,
      email: employee.email || "",
      phone: employee.phone || "",
      department: "Sales",
      role: employee.salesRole || "field_sales",
      isActive: employee.isActive,
      quota: {
        monthlyTarget: employee.quota?.monthlyTarget || 50000,
        effectiveDate: employee.quota?.effectiveDate || employee.createdAt,
        periodType: employee.quota?.periodType || "monthly",
      },
      managerId: employee.managerId,
      territory: employee.territory || "",
      hireDate: employee.hireDate || employee.createdAt,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };

    res.json({
      success: true,
      data: salesPerson,
      message: "Quota updated successfully",
    });
  } catch (error) {
    logger.error("Error updating quota:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update quota",
    });
  }
};

// ============================================================
// AGREEMENT MANAGEMENT
// ============================================================

/**
 * Create a new agreement
 */
export const createAgreement = async (req, res) => {
  try {
    const {
      salesPersonId,
      customer,
      insideSales,
      agreementTerm,
      termMonths,
      monthlyValue,
      perVisitRevenue,
      accountType,
      pricingLine,
      businessType,
      yearsAsCustomer,
      distanceToAnchor,
      startDate,
      endDate,
      signedDate,
      notes,
    } = req.body;

    // Get the employee (sales person)
    const employee = await Employee.findOne(buildEmployeeQuery(salesPersonId));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    // Get or create current quota period
    const periodType = employee.quota?.periodType || "monthly";
    const { start, end, label } = getPeriodBoundaries(new Date(), periodType);

    let quotaPeriod = await QuotaPeriod.findOne({
      salesPersonId: employee.username,
      periodStart: start,
      periodType,
    });

    if (!quotaPeriod) {
      quotaPeriod = new QuotaPeriod({
        salesPersonId: employee.username,
        salesPersonName: employee.fullName,
        periodType,
        periodStart: start,
        periodEnd: end,
        periodLabel: label,
        quotaTarget: employee.quota?.monthlyTarget || 50000,
        status: "in_progress",
      });
      await quotaPeriod.save();
    }

    // Calculate current quota level
    const quotaPercentage =
      quotaPeriod.quotaTarget > 0
        ? (quotaPeriod.actualSales / quotaPeriod.quotaTarget) * 100
        : 0;
    const currentQuotaLevel = calculateQuotaLevel(quotaPercentage);

    // Calculate commission for this agreement
    const commission = await calculateAgreementCommission(
      {
        agreementTerm,
        accountType,
        pricingLine: pricingLine || "Redline",
        businessType: businessType || "new",
        yearsAsCustomer: yearsAsCustomer || 0,
        insideSales,
        monthlyValue,
        termMonths,
      },
      currentQuotaLevel
    );

    // Create agreement
    const agreement = new Agreement({
      agreementNumber: generateAgreementNumber(),
      customer,
      salesPerson: {
        id: employee.username,
        name: employee.fullName,
      },
      insideSales: insideSales || { involved: false },
      agreementTerm,
      termMonths,
      monthlyValue,
      totalContractValue: monthlyValue * termMonths,
      perVisitRevenue,
      accountType,
      pricingLine: pricingLine || "Redline",
      businessType: businessType || "new",
      yearsAsCustomer: yearsAsCustomer || 0,
      distanceToAnchor,
      commission,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      signedDate: signedDate ? new Date(signedDate) : new Date(),
      status: "active",
      notes,
    });

    await agreement.save();

    // Update quota period
    quotaPeriod.actualSales += monthlyValue;
    quotaPeriod.agreementCount += 1;
    if (businessType === "renewal") {
      quotaPeriod.renewalCount += 1;
    } else {
      quotaPeriod.newBusinessCount += 1;
    }
    quotaPeriod.totalCommissionEarned += commission.weeklyCommission;

    // Recalculate quota level
    const newPercentage =
      quotaPeriod.quotaTarget > 0
        ? (quotaPeriod.actualSales / quotaPeriod.quotaTarget) * 100
        : 0;
    quotaPeriod.quotaPercentage = newPercentage;
    quotaPeriod.quotaLevel = calculateQuotaLevel(newPercentage);

    await quotaPeriod.save();

    res.status(201).json({
      success: true,
      data: {
        agreement,
        quotaPeriod: {
          actualSales: quotaPeriod.actualSales,
          quotaTarget: quotaPeriod.quotaTarget,
          quotaPercentage: quotaPeriod.quotaPercentage,
          quotaLevel: quotaPeriod.quotaLevel,
        },
      },
      message: "Agreement created successfully",
    });
  } catch (error) {
    logger.error("Error creating agreement:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create agreement",
    });
  }
};

/**
 * Get all agreements
 */
export const getAllAgreements = async (req, res) => {
  try {
    const { salesPersonId, status, startDate, endDate, limit = 50, skip = 0 } = req.query;
    const filter = {};

    if (salesPersonId) {
      filter["salesPerson.id"] = salesPersonId;
    }
    if (status) {
      filter.status = status;
    }
    if (startDate || endDate) {
      filter.signedDate = {};
      if (startDate) filter.signedDate.$gte = new Date(startDate);
      if (endDate) filter.signedDate.$lte = new Date(endDate);
    }

    const total = await Agreement.countDocuments(filter);
    const agreements = await Agreement.find(filter)
      .sort({ signedDate: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: agreements,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + agreements.length < total,
      },
    });
  } catch (error) {
    logger.error("Error fetching agreements:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch agreements",
    });
  }
};

/**
 * Get agreement by ID
 */
export const getAgreementById = async (req, res) => {
  try {
    const { id } = req.params;
    const agreement = await Agreement.findOne({
      $or: [{ _id: id }, { agreementNumber: id }],
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found",
      });
    }

    res.json({
      success: true,
      data: agreement,
    });
  } catch (error) {
    logger.error("Error fetching agreement:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch agreement",
    });
  }
};

/**
 * Update agreement status
 */
export const updateAgreementStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, approvedBy } = req.body;

    const agreement = await Agreement.findById(id);

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found",
      });
    }

    agreement.status = status;
    if (status === "approved" && approvedBy) {
      agreement.approvedBy = approvedBy;
      agreement.approvedAt = new Date();
    }

    await agreement.save();

    res.json({
      success: true,
      data: agreement,
      message: "Agreement status updated",
    });
  } catch (error) {
    logger.error("Error updating agreement status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update agreement status",
    });
  }
};

// ============================================================
// QUOTA TRACKING
// ============================================================

/**
 * Get quota status for a sales person
 */
export const getQuotaStatus = async (req, res) => {
  try {
    const { salesPersonId } = req.params;
    const { date } = req.query;

    // Get employee
    const employee = await Employee.findOne(buildEmployeeQuery(salesPersonId));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    const targetDate = date ? new Date(date) : new Date();
    // Quota is WEEKLY and resets every week.
    const { start, end, label } = await getWeeklyQuotaBoundaries(targetDate);

    // Weekly target comes from admin commission rules (falls back to employee/default).
    const statusRules = await CommissionRules.findOne({ isActive: true });
    const quotaTarget = statusRules?.quotaTarget || employee.quota?.monthlyTarget || 50000;

    // Query SavedPDFs (CustomerHeaderDoc) created by this user in the current period
    const savedPdfs = await CustomerHeaderDoc.find({
      createdBy: employee.username,
      isDeleted: { $ne: true },
      createdAt: { $gte: start, $lte: end },
      // Only Bigin-connected agreements count toward quota. Drafts saved before
      // Bigin connect have no commission, so they must not inflate quota.
      'payload.commission': { $ne: null },
    })
      .sort({ createdAt: -1 })
      .select({
        _id: 1,
        status: 1,
        createdAt: 1,
        'payload.headerTitle': 1,
        'payload.summary.contractMonths': 1,
        'payload.summary.serviceAgreementTotal': 1,
        'payload.summary.productMonthlyTotal': 1,
        'payload.summary.productContractTotal': 1,
        'payload.summary.quotaCredit': 1,
        'payload.services': 1,
        'payload.commission': 1,
        'payload.agreement.accountType': 1,
      })
      .lean();

    // Calculate actual sales from SavedPDFs
    // Monthly value = (serviceAgreementTotal / contractMonths) + productMonthlyTotal
    let actualSales = 0;
    let totalCommissionEarned = 0;
    let agreementCount = savedPdfs.length;
    let newBusinessCount = 0;
    let renewalCount = 0;

    const recentAgreements = savedPdfs.slice(0, 5).map(pdf => {
      // serviceAgreementTotal is already the MONTHLY value (same as My Commissions)
      const serviceMonthlyValue = pdf.payload?.summary?.serviceAgreementTotal || 0;
      const productMonthlyTotal = pdf.payload?.summary?.productMonthlyTotal || 0;
      const monthlyValue = serviceMonthlyValue + productMonthlyTotal;

      // Quota credit = annualized contract × greenline multiplier (NOT the raw total).
      actualSales += quotaCreditFromPayload(pdf.payload);

      // Get commission earned - use annualCommission to match My Commissions page
      const commission = pdf.payload?.commission;
      const contractMonthsForComm = pdf.payload?.summary?.contractMonths || 12;
      const years = contractMonthsForComm / 12;

      // Check if annualCommission exists and is a valid positive number
      if (commission?.annualCommission && typeof commission.annualCommission === 'number' && commission.annualCommission > 0) {
        totalCommissionEarned += commission.annualCommission;
        logger.debug(`[QUOTA] Agreement ${pdf._id}: Using annualCommission = ${commission.annualCommission}`);
      } else if (commission?.contractCommission && typeof commission.contractCommission === 'number' && commission.contractCommission > 0) {
        // Fallback: convert contract commission to annual
        const annualFromContract = commission.contractCommission / years;
        totalCommissionEarned += annualFromContract;
        logger.debug(`[QUOTA] Agreement ${pdf._id}: Using contractCommission/years = ${commission.contractCommission}/${years} = ${annualFromContract}`);
      } else {
        logger.debug(`[QUOTA] Agreement ${pdf._id}: No valid commission found`, commission);
      }

      // Count business types (for now, treat all as new business)
      newBusinessCount++;

      return {
        _id: pdf._id,
        customer: { name: pdf.payload?.headerTitle || 'Untitled' },
        monthlyValue,
        signedDate: pdf.createdAt,
        status: pdf.status,
        accountType: pdf.payload?.agreement?.accountType || 'Anchor',
      };
    });

    // Also count remaining PDFs for totals
    savedPdfs.slice(5).forEach(pdf => {
      const contractMonths = pdf.payload?.summary?.contractMonths || 12;
      // serviceAgreementTotal is already the MONTHLY value (same as My Commissions)
      const serviceMonthlyValue = pdf.payload?.summary?.serviceAgreementTotal || 0;
      const productMonthlyTotal = pdf.payload?.summary?.productMonthlyTotal || 0;
      const monthlyValue = serviceMonthlyValue + productMonthlyTotal;

      // Quota credit = annualized contract × greenline multiplier (NOT the raw total).
      actualSales += quotaCreditFromPayload(pdf.payload);

      // Use annualCommission to match My Commissions page
      const commission = pdf.payload?.commission;
      const years = contractMonths / 12;

      // Check if annualCommission exists and is a valid positive number
      if (commission?.annualCommission && typeof commission.annualCommission === 'number' && commission.annualCommission > 0) {
        totalCommissionEarned += commission.annualCommission;
      } else if (commission?.contractCommission && typeof commission.contractCommission === 'number' && commission.contractCommission > 0) {
        // Fallback: convert contract commission to annual
        totalCommissionEarned += commission.contractCommission / years;
      }

      newBusinessCount++;
    });

    // Calculate quota percentage and level
    const quotaPercentage = quotaTarget > 0 ? (actualSales / quotaTarget) * 100 : 0;
    const quotaLevel = calculateQuotaLevel(quotaPercentage);

    // Get commission rate for current level
    let rules = await CommissionRules.findOne({ isActive: true });
    if (!rules) {
      rules = DEFAULT_COMMISSION_RULES;
    }
    const commissionRate = rules.quotaRates[quotaLevel] || 3;

    // Calculate progress
    const toReachQuota = Math.max(0, quotaTarget - actualSales);
    const toReachDouble = Math.max(0, quotaTarget * 2 - actualSales);

    res.json({
      success: true,
      data: {
        salesPerson: {
          id: employee.username,
          name: employee.fullName,
          role: employee.salesRole || "field_sales",
        },
        period: {
          type: "weekly",
          label,
          start: start.toISOString(),
          end: end.toISOString(),
        },
        quota: {
          target: quotaTarget,
          actual: actualSales,
          percentage: quotaPercentage,
          level: quotaLevel,
          commissionRate,
        },
        progress: {
          toReachQuota,
          toReachDouble,
          agreementCount,
          newBusinessCount,
          renewalCount,
        },
        commission: {
          earned: totalCommissionEarned,
        },
        recentAgreements,
      },
    });
  } catch (error) {
    logger.error("Error fetching quota status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch quota status",
    });
  }
};

/**
 * Get quota history for a sales person
 */
export const getQuotaHistory = async (req, res) => {
  try {
    const { salesPersonId } = req.params;
    const { limit = 12 } = req.query;

    // Get employee
    const employee = await Employee.findOne(buildEmployeeQuery(salesPersonId));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    const quotaTarget = employee.quota?.monthlyTarget || 50000;

    // Get payroll settings for period calculation
    const settings = await AdminSettings.getSingleton();
    const { startDate, cycleType, cycleDayOfWeek } = settings.payrollSettings || {};
    const baseDate = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    // Generate past periods based on payroll cycle
    const periods = [];
    const now = new Date();
    const limitNum = parseInt(limit);

    for (let i = 0; i < limitNum; i++) {
      let periodStart, periodEnd, periodLabel;

      switch (cycleType) {
        case 'weekly': {
          periodStart = new Date(now);
          periodStart.setDate(now.getDate() - (i * 7) - ((now.getDay() - (cycleDayOfWeek || 1) + 7) % 7));
          periodStart.setHours(0, 0, 0, 0);
          periodEnd = new Date(periodStart);
          periodEnd.setDate(periodStart.getDate() + 6);
          periodEnd.setHours(23, 59, 59, 999);
          break;
        }
        case 'biweekly': {
          const weeksSinceBase = Math.floor((now - baseDate) / (7 * 24 * 60 * 60 * 1000));
          const currentBiweeklyPeriod = Math.floor(weeksSinceBase / 2) - i;
          periodStart = new Date(baseDate);
          periodStart.setDate(baseDate.getDate() + (currentBiweeklyPeriod * 14));
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

      const startStr = periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      periodLabel = cycleType === 'monthly'
        ? periodStart.toLocaleString('default', { month: 'long', year: 'numeric' })
        : `${startStr} - ${endStr}`;

      periods.push({ start: periodStart, end: periodEnd, label: periodLabel });
    }

    // Get all SavedPDFs for this user
    const savedPdfs = await CustomerHeaderDoc.find({
      createdBy: employee.username,
      isDeleted: { $ne: true },
      // Only Bigin-connected agreements count toward quota (drafts excluded).
      'payload.commission': { $ne: null },
    })
      .sort({ createdAt: -1 })
      .select({
        _id: 1,
        createdAt: 1,
        'payload.summary.contractMonths': 1,
        'payload.summary.serviceAgreementTotal': 1,
        'payload.summary.productMonthlyTotal': 1,
        'payload.summary.productContractTotal': 1,
        'payload.summary.quotaCredit': 1,
        'payload.services': 1,
        'payload.commission': 1,
      })
      .lean();

    // Group PDFs by period
    const quotaPeriods = periods.map((period, index) => {
      const periodData = {
        _id: `period-${index}`,
        salesPersonId: employee.username,
        salesPersonName: employee.fullName,
        periodType: cycleType || 'monthly',
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        periodLabel: period.label,
        quotaTarget,
        actualSales: 0,
        agreementCount: 0,
        newBusinessCount: 0,
        renewalCount: 0,
        quotaLevel: 'below',
        quotaPercentage: 0,
        totalCommissionEarned: 0,
        status: index === 0 ? 'in_progress' : 'closed',
      };

      // Find PDFs in this period
      savedPdfs.forEach(pdf => {
        const pdfDate = new Date(pdf.createdAt);
        if (pdfDate >= period.start && pdfDate <= period.end) {
          const serviceMonthlyValue = pdf.payload?.summary?.serviceAgreementTotal || 0;
          const productMonthlyTotal = pdf.payload?.summary?.productMonthlyTotal || 0;
          const monthlyValue = serviceMonthlyValue + productMonthlyTotal;

          periodData.actualSales += quotaCreditFromPayload(pdf.payload);
          periodData.agreementCount += 1;
          periodData.newBusinessCount += 1;

          const commission = pdf.payload?.commission;
          const contractMonths = pdf.payload?.summary?.contractMonths || 12;
          if (commission?.annualCommission) {
            periodData.totalCommissionEarned += commission.annualCommission;
          } else if (commission?.contractCommission) {
            const years = contractMonths / 12;
            periodData.totalCommissionEarned += commission.contractCommission / years;
          }
        }
      });

      // Calculate quota percentage and level
      periodData.quotaPercentage = periodData.quotaTarget > 0
        ? (periodData.actualSales / periodData.quotaTarget) * 100
        : 0;
      periodData.quotaLevel = calculateQuotaLevel(periodData.quotaPercentage);

      return periodData;
    });

    res.json({
      success: true,
      data: quotaPeriods,
    });
  } catch (error) {
    logger.error("Error fetching quota history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch quota history",
    });
  }
};

/**
 * Get current quota level for commission calculation
 */
export const getCurrentQuotaLevel = async (req, res) => {
  try {
    const { salesPersonId } = req.params;
    const { excludeAgreementId } = req.query;

    const employee = await Employee.findOne(buildEmployeeQuery(salesPersonId));

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Sales person not found",
      });
    }

    // Quota is WEEKLY and resets every week (mirror getQuotaStatus).
    const { start, end } = await getWeeklyQuotaBoundaries(new Date());
    // Weekly target comes from admin commission rules (falls back to employee/default).
    const levelRules = await CommissionRules.findOne({ isActive: true });
    const quotaTarget = levelRules?.quotaTarget || employee.quota?.monthlyTarget || 50000;

    const periodFilter = {
      createdBy: employee.username,
      isDeleted: { $ne: true },
      createdAt: { $gte: start, $lte: end },
      'payload.commission': { $ne: null },
    };
    if (excludeAgreementId && mongoose.Types.ObjectId.isValid(excludeAgreementId)) {
      periodFilter._id = { $ne: excludeAgreementId };
    }
    const savedPdfs = await CustomerHeaderDoc.find(periodFilter)
      .select({
        'payload.summary.contractMonths': 1,
        'payload.summary.serviceAgreementTotal': 1,
        'payload.summary.productMonthlyTotal': 1,
        'payload.summary.productContractTotal': 1,
        'payload.summary.quotaCredit': 1,
        'payload.services': 1,
      })
      .lean();

    // Quota credit = annualized contract × pricing multiplier (NOT raw monthly).
    let actualSales = 0;
    savedPdfs.forEach(pdf => {
      actualSales += quotaCreditFromPayload(pdf.payload);
    });

    const quotaPercentage = quotaTarget > 0 ? (actualSales / quotaTarget) * 100 : 0;

    res.json({
      success: true,
      data: {
        salesPersonId: employee.username,
        salesPersonName: employee.fullName,
        quotaLevel: calculateQuotaLevel(quotaPercentage),
        quotaPercentage,
        quotaTarget,
        actualSales,
      },
    });
  } catch (error) {
    logger.error("Error fetching quota level:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch quota level",
    });
  }
};

/**
 * Get leaderboard
 */
export const getLeaderboard = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    // Quota is WEEKLY and resets every week (mirror getQuotaStatus).
    const { start, end, label } = await getWeeklyQuotaBoundaries(targetDate);

    // Get all active employees
    const employees = await Employee.find({ isActive: true })
      .select('username fullName quota')
      .lean();
    // Weekly target comes from admin commission rules (falls back to employee/default).
    const boardRules = await CommissionRules.findOne({ isActive: true });

    // Get all SavedPDFs in the current period
    const savedPdfs = await CustomerHeaderDoc.find({
      isDeleted: { $ne: true },
      createdAt: { $gte: start, $lte: end },
      // Only Bigin-connected agreements count toward quota (drafts excluded).
      'payload.commission': { $ne: null },
    })
      .select({
        createdBy: 1,
        'payload.summary.contractMonths': 1,
        'payload.summary.serviceAgreementTotal': 1,
        'payload.summary.productMonthlyTotal': 1,
        'payload.summary.productContractTotal': 1,
        'payload.summary.quotaCredit': 1,
        'payload.services': 1,
        'payload.commission': 1,
      })
      .lean();

    // Group PDFs by creator
    const salesByEmployee = {};
    savedPdfs.forEach(pdf => {
      const creator = pdf.createdBy;
      if (!salesByEmployee[creator]) {
        salesByEmployee[creator] = {
          actualSales: 0,
          agreementCount: 0,
          totalCommission: 0,
        };
      }

      const contractMonths = pdf.payload?.summary?.contractMonths || 12;
      // Quota credit = annualized contract × pricing multiplier (NOT raw monthly).
      const monthlyValue = quotaCreditFromPayload(pdf.payload);

      salesByEmployee[creator].actualSales += monthlyValue;
      salesByEmployee[creator].agreementCount += 1;

      // Use annualCommission to match My Commissions page
      const commission = pdf.payload?.commission;
      if (commission?.annualCommission) {
        salesByEmployee[creator].totalCommission += commission.annualCommission;
      } else if (commission?.contractCommission) {
        // Fallback: convert contract commission to annual
        const years = contractMonths / 12;
        salesByEmployee[creator].totalCommission += commission.contractCommission / years;
      }
    });

    // Build leaderboard from employees
    const leaderboardData = employees.map(emp => {
      const sales = salesByEmployee[emp.username] || {
        actualSales: 0,
        agreementCount: 0,
        totalCommission: 0,
      };
      const quotaTarget = boardRules?.quotaTarget || emp.quota?.monthlyTarget || 50000;
      const quotaPercentage = quotaTarget > 0 ? (sales.actualSales / quotaTarget) * 100 : 0;

      return {
        salesPersonId: emp.username,
        salesPersonName: emp.fullName,
        actualSales: sales.actualSales,
        quotaTarget,
        quotaPercentage,
        quotaLevel: calculateQuotaLevel(quotaPercentage),
        agreementCount: sales.agreementCount,
        totalCommission: sales.totalCommission,
      };
    });

    // Sort by actual sales descending and add rank
    leaderboardData.sort((a, b) => b.actualSales - a.actualSales);
    const leaderboard = leaderboardData.map((entry, index) => ({
      rank: index + 1,
      ...entry,
    }));

    res.json({
      success: true,
      data: {
        period: label,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        leaderboard,
      },
    });
  } catch (error) {
    logger.error("Error fetching leaderboard:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch leaderboard",
    });
  }
};
