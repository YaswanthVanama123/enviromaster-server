/**
 * Commission Calculator Tests
 * Comprehensive test suite covering all commission calculation scenarios
 *
 * Run with: npm test -- --grep "Commission"
 * Or: npx jest src/tests/commission.test.js
 */

import { jest } from '@jest/globals';

// Mock the Commission calculation logic (same as in controller)
const DEFAULT_RULES = {
  quotaRates: {
    below: 3,
    above: 6,
    double: 9,
  },
  agreementMultipliers: {
    "3-year": 135,
    "1-year": 100,
    "MTM-with-install": 100,
    "MTM-no-install": 50,
  },
  accountTypeAdjustments: {
    Anchor: 0,
    Bread5: -1,
    Bread15: -0.5,
    Pit: 0,
  },
  greenlineBonus: 1,
  renewalBonusRate: 4,
  renewalMinYears: 2,
  insideSalesDeduction: -3,
  anchorMinMonthlyValue: 200,
};

/**
 * Calculate commission based on input and rules
 * This mirrors the backend calculation logic
 */
function calculateCommission(input, rules = DEFAULT_RULES) {
  // 1. Get base rate from quota level
  const baseRate = rules.quotaRates[input.quotaLevel] || 3;

  // 2. Get agreement multiplier
  const agreementMultiplier = rules.agreementMultipliers[input.agreementTerm] || 100;

  // 3. Get account type adjustment
  const accountTypeAdjustment = rules.accountTypeAdjustments[input.accountType] || 0;

  // 4. Calculate greenline bonus
  const greenlineBonus = input.pricingLine === "Greenline" ? rules.greenlineBonus : 0;

  // 5. Calculate renewal bonus
  const renewalBonus =
    input.businessType === "renewal" &&
    input.yearsAsCustomer &&
    input.yearsAsCustomer >= rules.renewalMinYears
      ? rules.renewalBonusRate
      : 0;

  // 6. Apply inside sales deduction
  const insideSalesDeduction = input.isInsideSales ? rules.insideSalesDeduction : 0;

  // Calculate effective base rate
  const effectiveBaseRate =
    baseRate + accountTypeAdjustment + greenlineBonus + renewalBonus + insideSalesDeduction;

  // Apply agreement multiplier
  const finalCommissionRate = effectiveBaseRate * (agreementMultiplier / 100);

  // Calculate dollar amounts
  const monthlyCommission = input.monthlyValue * (finalCommissionRate / 100);
  const annualCommission = monthlyCommission * 12;

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
    monthlyCommission,
    annualCommission,
    firstYearCommission: annualCommission,
  };
}

// ============================================================
// TEST SUITE: Quota Level Tests
// ============================================================
describe("Commission Calculator - Quota Levels", () => {
  const baseInput = {
    monthlyValue: 500,
    agreementTerm: "1-year",
    accountType: "Anchor",
    pricingLine: "Redline",
    businessType: "new",
    isInsideSales: false,
  };

  test("Below quota should use 3% base rate", () => {
    const result = calculateCommission({ ...baseInput, quotaLevel: "below" });
    expect(result.breakdown.baseRate).toBe(3);
    expect(result.finalCommissionRate).toBe(3); // 3% * 100% = 3%
    expect(result.monthlyCommission).toBe(15); // $500 * 3% = $15
  });

  test("Above quota should use 6% base rate", () => {
    const result = calculateCommission({ ...baseInput, quotaLevel: "above" });
    expect(result.breakdown.baseRate).toBe(6);
    expect(result.finalCommissionRate).toBe(6);
    expect(result.monthlyCommission).toBe(30); // $500 * 6% = $30
  });

  test("Double quota should use 9% base rate", () => {
    const result = calculateCommission({ ...baseInput, quotaLevel: "double" });
    expect(result.breakdown.baseRate).toBe(9);
    expect(result.finalCommissionRate).toBe(9);
    expect(result.monthlyCommission).toBe(45); // $500 * 9% = $45
  });
});

// ============================================================
// TEST SUITE: Agreement Term Multiplier Tests
// ============================================================
describe("Commission Calculator - Agreement Terms", () => {
  const baseInput = {
    monthlyValue: 1000,
    quotaLevel: "above", // 6% base
    accountType: "Anchor",
    pricingLine: "Redline",
    businessType: "new",
    isInsideSales: false,
  };

  test("3-year agreement should apply 135% multiplier", () => {
    const result = calculateCommission({ ...baseInput, agreementTerm: "3-year" });
    expect(result.breakdown.agreementMultiplier).toBe(135);
    expect(result.finalCommissionRate).toBeCloseTo(8.1, 2); // 6% * 135% = 8.1%
    expect(result.monthlyCommission).toBeCloseTo(81, 2); // $1000 * 8.1% = $81
    expect(result.annualCommission).toBeCloseTo(972, 2); // $81 * 12 = $972
  });

  test("1-year agreement should apply 100% multiplier", () => {
    const result = calculateCommission({ ...baseInput, agreementTerm: "1-year" });
    expect(result.breakdown.agreementMultiplier).toBe(100);
    expect(result.finalCommissionRate).toBe(6);
    expect(result.monthlyCommission).toBe(60);
  });

  test("MTM with install should apply 100% multiplier", () => {
    const result = calculateCommission({ ...baseInput, agreementTerm: "MTM-with-install" });
    expect(result.breakdown.agreementMultiplier).toBe(100);
    expect(result.finalCommissionRate).toBe(6);
    expect(result.monthlyCommission).toBe(60);
  });

  test("MTM no install should apply 50% multiplier", () => {
    const result = calculateCommission({ ...baseInput, agreementTerm: "MTM-no-install" });
    expect(result.breakdown.agreementMultiplier).toBe(50);
    expect(result.finalCommissionRate).toBe(3); // 6% * 50% = 3%
    expect(result.monthlyCommission).toBe(30);
  });
});

// ============================================================
// TEST SUITE: Account Type Adjustment Tests
// ============================================================
describe("Commission Calculator - Account Types", () => {
  const baseInput = {
    monthlyValue: 500,
    quotaLevel: "above", // 6% base
    agreementTerm: "1-year", // 100% multiplier
    pricingLine: "Redline",
    businessType: "new",
    isInsideSales: false,
  };

  test("Anchor account should have no adjustment (0%)", () => {
    const result = calculateCommission({ ...baseInput, accountType: "Anchor" });
    expect(result.breakdown.accountTypeAdjustment).toBe(0);
    expect(result.effectiveBaseRate).toBe(6);
    expect(result.finalCommissionRate).toBe(6);
  });

  test("Bread5 account should have -1% adjustment", () => {
    const result = calculateCommission({ ...baseInput, accountType: "Bread5" });
    expect(result.breakdown.accountTypeAdjustment).toBe(-1);
    expect(result.effectiveBaseRate).toBe(5); // 6% - 1% = 5%
    expect(result.finalCommissionRate).toBe(5);
    expect(result.monthlyCommission).toBe(25); // $500 * 5% = $25
  });

  test("Bread15 account should have -0.5% adjustment", () => {
    const result = calculateCommission({ ...baseInput, accountType: "Bread15" });
    expect(result.breakdown.accountTypeAdjustment).toBe(-0.5);
    expect(result.effectiveBaseRate).toBe(5.5); // 6% - 0.5% = 5.5%
    expect(result.finalCommissionRate).toBe(5.5);
    expect(result.monthlyCommission).toBe(27.5);
  });

  test("Pit account should have no adjustment (0%)", () => {
    const result = calculateCommission({ ...baseInput, accountType: "Pit" });
    expect(result.breakdown.accountTypeAdjustment).toBe(0);
    expect(result.effectiveBaseRate).toBe(6);
    expect(result.finalCommissionRate).toBe(6);
  });
});

// ============================================================
// TEST SUITE: Pricing Line Tests
// ============================================================
describe("Commission Calculator - Pricing Lines", () => {
  const baseInput = {
    monthlyValue: 1000,
    quotaLevel: "above", // 6% base
    agreementTerm: "1-year",
    accountType: "Anchor",
    businessType: "new",
    isInsideSales: false,
  };

  test("Redline pricing should have no bonus", () => {
    const result = calculateCommission({ ...baseInput, pricingLine: "Redline" });
    expect(result.breakdown.greenlineBonus).toBe(0);
    expect(result.effectiveBaseRate).toBe(6);
    expect(result.finalCommissionRate).toBe(6);
  });

  test("Greenline pricing should add 1% bonus", () => {
    const result = calculateCommission({ ...baseInput, pricingLine: "Greenline" });
    expect(result.breakdown.greenlineBonus).toBe(1);
    expect(result.effectiveBaseRate).toBe(7); // 6% + 1% = 7%
    expect(result.finalCommissionRate).toBe(7);
    expect(result.monthlyCommission).toBe(70); // $1000 * 7% = $70
  });
});

// ============================================================
// TEST SUITE: Business Type & Renewal Bonus Tests
// ============================================================
describe("Commission Calculator - Business Type & Renewals", () => {
  const baseInput = {
    monthlyValue: 1000,
    quotaLevel: "above", // 6% base
    agreementTerm: "1-year",
    accountType: "Anchor",
    pricingLine: "Redline",
    isInsideSales: false,
  };

  test("New business should have no renewal bonus", () => {
    const result = calculateCommission({ ...baseInput, businessType: "new" });
    expect(result.breakdown.renewalBonus).toBe(0);
    expect(result.effectiveBaseRate).toBe(6);
  });

  test("Renewal with 0 years should have no bonus", () => {
    const result = calculateCommission({
      ...baseInput,
      businessType: "renewal",
      yearsAsCustomer: 0,
    });
    expect(result.breakdown.renewalBonus).toBe(0);
    expect(result.effectiveBaseRate).toBe(6);
  });

  test("Renewal with 1 year should have no bonus (min is 2)", () => {
    const result = calculateCommission({
      ...baseInput,
      businessType: "renewal",
      yearsAsCustomer: 1,
    });
    expect(result.breakdown.renewalBonus).toBe(0);
    expect(result.effectiveBaseRate).toBe(6);
  });

  test("Renewal with 2 years should get 4% bonus", () => {
    const result = calculateCommission({
      ...baseInput,
      businessType: "renewal",
      yearsAsCustomer: 2,
    });
    expect(result.breakdown.renewalBonus).toBe(4);
    expect(result.effectiveBaseRate).toBe(10); // 6% + 4% = 10%
    expect(result.finalCommissionRate).toBe(10);
    expect(result.monthlyCommission).toBe(100); // $1000 * 10% = $100
  });

  test("Renewal with 5 years should get 4% bonus", () => {
    const result = calculateCommission({
      ...baseInput,
      businessType: "renewal",
      yearsAsCustomer: 5,
    });
    expect(result.breakdown.renewalBonus).toBe(4);
    expect(result.effectiveBaseRate).toBe(10);
  });
});

// ============================================================
// TEST SUITE: Inside Sales Deduction Tests
// ============================================================
describe("Commission Calculator - Inside Sales", () => {
  const baseInput = {
    monthlyValue: 1000,
    quotaLevel: "above", // 6% base
    agreementTerm: "1-year",
    accountType: "Anchor",
    pricingLine: "Redline",
    businessType: "new",
  };

  test("No inside sales should have no deduction", () => {
    const result = calculateCommission({ ...baseInput, isInsideSales: false });
    expect(result.breakdown.insideSalesDeduction).toBe(0);
    expect(result.effectiveBaseRate).toBe(6);
  });

  test("Inside sales should apply -3% deduction", () => {
    const result = calculateCommission({ ...baseInput, isInsideSales: true });
    expect(result.breakdown.insideSalesDeduction).toBe(-3);
    expect(result.effectiveBaseRate).toBe(3); // 6% - 3% = 3%
    expect(result.finalCommissionRate).toBe(3);
    expect(result.monthlyCommission).toBe(30); // $1000 * 3% = $30
  });
});

// ============================================================
// TEST SUITE: Combined Scenarios
// ============================================================
describe("Commission Calculator - Combined Scenarios", () => {
  test("Best case: Double quota + 3-year + Greenline + Renewal + Anchor", () => {
    const result = calculateCommission({
      monthlyValue: 1000,
      quotaLevel: "double", // 9%
      agreementTerm: "3-year", // 135%
      accountType: "Anchor", // 0%
      pricingLine: "Greenline", // +1%
      businessType: "renewal",
      yearsAsCustomer: 3, // +4%
      isInsideSales: false, // 0%
    });

    // Effective base: 9% + 0% + 1% + 4% + 0% = 14%
    expect(result.effectiveBaseRate).toBe(14);
    // Final rate: 14% * 135% = 18.9%
    expect(result.finalCommissionRate).toBeCloseTo(18.9, 2);
    // Monthly: $1000 * 18.9% = $189
    expect(result.monthlyCommission).toBeCloseTo(189, 2);
    // Annual: $189 * 12 = $2268
    expect(result.annualCommission).toBeCloseTo(2268, 2);
  });

  test("Worst case: Below quota + MTM no install + Bread5 + Inside sales", () => {
    const result = calculateCommission({
      monthlyValue: 1000,
      quotaLevel: "below", // 3%
      agreementTerm: "MTM-no-install", // 50%
      accountType: "Bread5", // -1%
      pricingLine: "Redline", // 0%
      businessType: "new", // 0%
      isInsideSales: true, // -3%
    });

    // Effective base: 3% - 1% + 0% + 0% - 3% = -1%
    expect(result.effectiveBaseRate).toBe(-1);
    // Final rate: -1% * 50% = -0.5%
    expect(result.finalCommissionRate).toBe(-0.5);
    // Monthly: $1000 * -0.5% = -$5 (negative commission!)
    expect(result.monthlyCommission).toBe(-5);
  });

  test("Typical scenario: Above quota + 1-year + Anchor + New business", () => {
    const result = calculateCommission({
      monthlyValue: 500,
      quotaLevel: "above", // 6%
      agreementTerm: "1-year", // 100%
      accountType: "Anchor", // 0%
      pricingLine: "Redline", // 0%
      businessType: "new", // 0%
      isInsideSales: false, // 0%
    });

    expect(result.effectiveBaseRate).toBe(6);
    expect(result.finalCommissionRate).toBe(6);
    expect(result.monthlyCommission).toBe(30);
    expect(result.annualCommission).toBe(360);
  });

  test("All bonuses: Double + 3-year + Greenline + 5yr renewal + Anchor", () => {
    const result = calculateCommission({
      monthlyValue: 2000,
      quotaLevel: "double", // 9%
      agreementTerm: "3-year", // 135%
      accountType: "Anchor", // 0%
      pricingLine: "Greenline", // +1%
      businessType: "renewal",
      yearsAsCustomer: 5, // +4%
      isInsideSales: false,
    });

    // 9% + 1% + 4% = 14% effective
    // 14% * 135% = 18.9% final
    // $2000 * 18.9% = $378 monthly
    expect(result.effectiveBaseRate).toBe(14);
    expect(result.finalCommissionRate).toBeCloseTo(18.9, 2);
    expect(result.monthlyCommission).toBeCloseTo(378, 2);
    expect(result.annualCommission).toBeCloseTo(4536, 2);
  });

  test("All deductions: Below + MTM + Bread5 + Inside sales", () => {
    const result = calculateCommission({
      monthlyValue: 300,
      quotaLevel: "below", // 3%
      agreementTerm: "MTM-no-install", // 50%
      accountType: "Bread5", // -1%
      pricingLine: "Redline", // 0%
      businessType: "new", // 0%
      isInsideSales: true, // -3%
    });

    // 3% - 1% - 3% = -1% effective
    // -1% * 50% = -0.5% final
    expect(result.effectiveBaseRate).toBe(-1);
    expect(result.finalCommissionRate).toBe(-0.5);
    expect(result.monthlyCommission).toBe(-1.5);
  });
});

// ============================================================
// TEST SUITE: Edge Cases
// ============================================================
describe("Commission Calculator - Edge Cases", () => {
  test("Zero monthly value should result in zero commission", () => {
    const result = calculateCommission({
      monthlyValue: 0,
      quotaLevel: "double",
      agreementTerm: "3-year",
      accountType: "Anchor",
      pricingLine: "Greenline",
      businessType: "renewal",
      yearsAsCustomer: 5,
      isInsideSales: false,
    });

    expect(result.monthlyCommission).toBe(0);
    expect(result.annualCommission).toBe(0);
  });

  test("Very large monthly value", () => {
    const result = calculateCommission({
      monthlyValue: 100000,
      quotaLevel: "above", // 6%
      agreementTerm: "1-year", // 100%
      accountType: "Anchor",
      pricingLine: "Redline",
      businessType: "new",
      isInsideSales: false,
    });

    expect(result.finalCommissionRate).toBe(6);
    expect(result.monthlyCommission).toBe(6000);
    expect(result.annualCommission).toBe(72000);
  });

  test("Decimal monthly value", () => {
    const result = calculateCommission({
      monthlyValue: 333.33,
      quotaLevel: "above", // 6%
      agreementTerm: "1-year",
      accountType: "Anchor",
      pricingLine: "Redline",
      businessType: "new",
      isInsideSales: false,
    });

    // $333.33 * 6% = $19.9998
    expect(result.monthlyCommission).toBeCloseTo(19.9998, 2);
  });

  test("Renewal with undefined years should not get bonus", () => {
    const result = calculateCommission({
      monthlyValue: 1000,
      quotaLevel: "above",
      agreementTerm: "1-year",
      accountType: "Anchor",
      pricingLine: "Redline",
      businessType: "renewal",
      yearsAsCustomer: undefined,
      isInsideSales: false,
    });

    expect(result.breakdown.renewalBonus).toBe(0);
  });
});

// ============================================================
// TEST SUITE: Breakdown Validation
// ============================================================
describe("Commission Calculator - Breakdown Accuracy", () => {
  test("All breakdown fields should be present", () => {
    const result = calculateCommission({
      monthlyValue: 1000,
      quotaLevel: "above",
      agreementTerm: "3-year",
      accountType: "Bread5",
      pricingLine: "Greenline",
      businessType: "renewal",
      yearsAsCustomer: 3,
      isInsideSales: true,
    });

    expect(result.breakdown).toHaveProperty("baseRate");
    expect(result.breakdown).toHaveProperty("agreementMultiplier");
    expect(result.breakdown).toHaveProperty("accountTypeAdjustment");
    expect(result.breakdown).toHaveProperty("greenlineBonus");
    expect(result.breakdown).toHaveProperty("renewalBonus");
    expect(result.breakdown).toHaveProperty("insideSalesDeduction");
  });

  test("Breakdown values should match applied rules", () => {
    const result = calculateCommission({
      monthlyValue: 1000,
      quotaLevel: "double", // 9%
      agreementTerm: "3-year", // 135%
      accountType: "Bread15", // -0.5%
      pricingLine: "Greenline", // +1%
      businessType: "renewal",
      yearsAsCustomer: 2, // +4%
      isInsideSales: true, // -3%
    });

    expect(result.breakdown.baseRate).toBe(9);
    expect(result.breakdown.agreementMultiplier).toBe(135);
    expect(result.breakdown.accountTypeAdjustment).toBe(-0.5);
    expect(result.breakdown.greenlineBonus).toBe(1);
    expect(result.breakdown.renewalBonus).toBe(4);
    expect(result.breakdown.insideSalesDeduction).toBe(-3);

    // Verify effective rate: 9 - 0.5 + 1 + 4 - 3 = 10.5%
    expect(result.effectiveBaseRate).toBe(10.5);
    // Final rate: 10.5% * 135% = 14.175%
    expect(result.finalCommissionRate).toBeCloseTo(14.175, 3);
  });
});

// ============================================================
// TEST SUITE: Annual Commission Calculation
// ============================================================
describe("Commission Calculator - Annual Calculations", () => {
  test("Annual commission should be 12x monthly", () => {
    const result = calculateCommission({
      monthlyValue: 500,
      quotaLevel: "above",
      agreementTerm: "1-year",
      accountType: "Anchor",
      pricingLine: "Redline",
      businessType: "new",
      isInsideSales: false,
    });

    expect(result.annualCommission).toBe(result.monthlyCommission * 12);
  });

  test("First year commission should equal annual commission", () => {
    const result = calculateCommission({
      monthlyValue: 1000,
      quotaLevel: "double",
      agreementTerm: "3-year",
      accountType: "Anchor",
      pricingLine: "Greenline",
      businessType: "new",
      isInsideSales: false,
    });

    expect(result.firstYearCommission).toBe(result.annualCommission);
  });
});

// ============================================================
// TEST SUITE: Input Validation Scenarios
// ============================================================
describe("Commission Calculator - Input Variations", () => {
  const testCases = [
    { quota: "below", term: "1-year", account: "Anchor", expectedBase: 3 },
    { quota: "below", term: "1-year", account: "Bread5", expectedBase: 2 },
    { quota: "below", term: "3-year", account: "Anchor", expectedRate: 4.05 },
    { quota: "above", term: "MTM-no-install", account: "Pit", expectedRate: 3 },
    { quota: "double", term: "MTM-with-install", account: "Bread15", expectedRate: 8.5 },
  ];

  testCases.forEach(({ quota, term, account, expectedBase, expectedRate }) => {
    test(`${quota} + ${term} + ${account}`, () => {
      const result = calculateCommission({
        monthlyValue: 100,
        quotaLevel: quota,
        agreementTerm: term,
        accountType: account,
        pricingLine: "Redline",
        businessType: "new",
        isInsideSales: false,
      });

      if (expectedBase !== undefined) {
        expect(result.effectiveBaseRate).toBe(expectedBase);
      }
      if (expectedRate !== undefined) {
        expect(result.finalCommissionRate).toBeCloseTo(expectedRate, 2);
      }
    });
  });
});

// ============================================================
// Export for use in other test files
// ============================================================
export { calculateCommission, DEFAULT_RULES };
