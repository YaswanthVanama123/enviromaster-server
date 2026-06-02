import {
  CommissionRules,
  CommissionRecord,
  DEFAULT_COMMISSION_RULES,
} from "../../models/commission/index.js";

/**
 * Calculate commission based on input and rules
 */
function calculateCommission(input, rules) {
  // 1. Get base rate from quota level (3%, 6%, or 9%)
  const baseRate = rules.quotaRates[input.quotaLevel] || 3;

  // 2. Get agreement multiplier (50%, 100%, or 135%)
  const agreementMultiplier = rules.agreementMultipliers[input.agreementTerm] || 100;

  // 3. Get account type adjustment (Bread locations get reduction)
  const accountTypeAdjustment = rules.accountTypeAdjustments[input.accountType] || 0;

  // 4. Calculate greenline bonus (if premium pricing)
  const greenlineBonus = input.pricingLine === "Greenline" ? rules.greenlineBonus : 0;

  // 5. Calculate renewal bonus (4% if 2+ years customer)
  const renewalBonus =
    input.businessType === "renewal" &&
    input.yearsAsCustomer &&
    input.yearsAsCustomer >= rules.renewalMinYears
      ? rules.renewalBonusRate
      : 0;

  // 6. Apply inside sales deduction (-3%)
  const insideSalesDeduction = input.isInsideSales ? rules.insideSalesDeduction : 0;

  // Calculate effective base rate (sum of all adjustments before multiplier)
  const effectiveBaseRate =
    baseRate + accountTypeAdjustment + greenlineBonus + renewalBonus + insideSalesDeduction;

  // Apply agreement multiplier
  const finalCommissionRate = effectiveBaseRate * (agreementMultiplier / 100);

  // Calculate dollar amounts (weekly basis)
  const weeklyRevenue = input.monthlyValue / 4.33;
  const weeklyCommission = weeklyRevenue * (finalCommissionRate / 100);
  const annualCommission = weeklyCommission * 52;

  return {
    input,
    breakdown: {
      baseRate,
      agreementMultiplier,
      accountTypeAdjustment,
      greenlineBonus,
      renewalBonus,
      insideSalesDeduction,
    },
    effectiveBaseRate,
    finalCommissionRate,
    weeklyCommission,
    annualCommission,
    firstYearCommission: annualCommission,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Get active commission rules
 */
export async function getActiveRules(req, res) {
  try {
    let rules = await CommissionRules.findOne({ isActive: true }).lean();

    // If no rules exist, create default rules
    if (!rules) {
      rules = await CommissionRules.create(DEFAULT_COMMISSION_RULES);
      rules = rules.toObject();
    }

    res.json(rules);
  } catch (error) {
    console.error("Error fetching commission rules:", error);
    res.status(500).json({ error: "Failed to fetch commission rules" });
  }
}

/**
 * Get all commission rules (for admin)
 */
export async function getAllRules(req, res) {
  try {
    const rules = await CommissionRules.find().sort({ createdAt: -1 }).lean();
    res.json(rules);
  } catch (error) {
    console.error("Error fetching all commission rules:", error);
    res.status(500).json({ error: "Failed to fetch commission rules" });
  }
}

/**
 * Update commission rules (admin only)
 */
export async function updateRules(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;

    const rules = await CommissionRules.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!rules) {
      return res.status(404).json({ error: "Commission rules not found" });
    }

    res.json(rules);
  } catch (error) {
    console.error("Error updating commission rules:", error);
    res.status(500).json({ error: "Failed to update commission rules" });
  }
}

/**
 * Create new commission rules (admin only)
 */
export async function createRules(req, res) {
  try {
    const rulesData = req.body;

    // If this is set as active, deactivate other rules
    if (rulesData.isActive) {
      await CommissionRules.updateMany({}, { $set: { isActive: false } });
    }

    const rules = await CommissionRules.create(rulesData);
    res.status(201).json(rules);
  } catch (error) {
    console.error("Error creating commission rules:", error);
    res.status(500).json({ error: "Failed to create commission rules" });
  }
}

/**
 * Calculate commission endpoint
 */
export async function calculate(req, res) {
  try {
    const input = req.body;

    // Validate required fields
    if (!input.monthlyValue || input.monthlyValue <= 0) {
      return res.status(400).json({ error: "Monthly value must be greater than 0" });
    }

    if (!input.agreementTerm) {
      return res.status(400).json({ error: "Agreement term is required" });
    }

    if (!input.accountType) {
      return res.status(400).json({ error: "Account type is required" });
    }

    if (!input.pricingLine) {
      return res.status(400).json({ error: "Pricing line is required" });
    }

    if (!input.quotaLevel) {
      return res.status(400).json({ error: "Quota level is required" });
    }

    if (!input.businessType) {
      return res.status(400).json({ error: "Business type is required" });
    }

    // Get active rules
    let rules = await CommissionRules.findOne({ isActive: true }).lean();

    // If no rules exist, use defaults
    if (!rules) {
      rules = DEFAULT_COMMISSION_RULES;
    }

    // Calculate commission
    const result = calculateCommission(input, rules);

    res.json(result);
  } catch (error) {
    console.error("Error calculating commission:", error);
    res.status(500).json({ error: "Failed to calculate commission" });
  }
}

/**
 * Save a commission record
 */
export async function saveRecord(req, res) {
  try {
    const { calculation, salesPersonId, salesPersonName, customerName, status } = req.body;

    if (!calculation || !salesPersonId || !salesPersonName) {
      return res.status(400).json({
        error: "calculation, salesPersonId, and salesPersonName are required",
      });
    }

    const createdBy = req.user?.username || "system";

    const record = await CommissionRecord.create({
      calculation,
      salesPersonId,
      salesPersonName,
      customerName,
      createdBy,
      status: status || "draft",
    });

    res.status(201).json(record);
  } catch (error) {
    console.error("Error saving commission record:", error);
    res.status(500).json({ error: "Failed to save commission record" });
  }
}

/**
 * Get commission records
 */
export async function getRecords(req, res) {
  try {
    const { salesPersonId, status, limit = 50, page = 1 } = req.query;

    const query = {};

    if (salesPersonId) {
      query.salesPersonId = salesPersonId;
    }

    if (status) {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      CommissionRecord.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      CommissionRecord.countDocuments(query),
    ]);

    res.json({
      records,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error("Error fetching commission records:", error);
    res.status(500).json({ error: "Failed to fetch commission records" });
  }
}

/**
 * Get a single commission record by ID
 */
export async function getRecordById(req, res) {
  try {
    const { id } = req.params;

    const record = await CommissionRecord.findById(id).lean();

    if (!record) {
      return res.status(404).json({ error: "Commission record not found" });
    }

    res.json(record);
  } catch (error) {
    console.error("Error fetching commission record:", error);
    res.status(500).json({ error: "Failed to fetch commission record" });
  }
}

/**
 * Update commission record status
 */
export async function updateRecordStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["draft", "submitted", "approved", "paid"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const record = await CommissionRecord.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true }
    ).lean();

    if (!record) {
      return res.status(404).json({ error: "Commission record not found" });
    }

    res.json(record);
  } catch (error) {
    console.error("Error updating commission record status:", error);
    res.status(500).json({ error: "Failed to update commission record status" });
  }
}

/**
 * Delete a commission record
 */
export async function deleteRecord(req, res) {
  try {
    const { id } = req.params;

    const record = await CommissionRecord.findByIdAndDelete(id);

    if (!record) {
      return res.status(404).json({ error: "Commission record not found" });
    }

    res.json({ message: "Commission record deleted successfully" });
  } catch (error) {
    console.error("Error deleting commission record:", error);
    res.status(500).json({ error: "Failed to delete commission record" });
  }
}
