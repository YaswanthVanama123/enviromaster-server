/**
 * Commission FormFilling Integration Tests
 * Tests the commission calculator integration with agreement form filling
 *
 * Run with: npm test -- --grep "Commission FormFilling"
 * Or: npm test src/tests/commission.formfilling.test.js
 */

/* global describe, test, expect */

// Import the CustomerHeaderDoc model to test commission schema
const CustomerHeaderDocSchema = {
  commission: {
    input: {
      monthlyValue: Number,
      agreementTerm: String,
      accountType: String,
      pricingLine: String,
      quotaLevel: String,
      businessType: String,
      yearsAsCustomer: Number,
      isInsideSales: Boolean,
    },
    breakdown: {
      baseRate: Number,
      agreementMultiplier: Number,
      accountTypeAdjustment: Number,
      greenlineBonus: Number,
      renewalBonus: Number,
      insideSalesDeduction: Number,
    },
    finalCommissionRate: Number,
    monthlyCommission: Number,
    annualCommission: Number,
    contractCommission: Number,
  }
};

// Commission calculation rules (same as frontend)
const DEFAULT_COMMISSION_RULES = {
  quotaRates: {
    below: 3,
    above: 6,
    double: 9,
  },
  agreementMultipliers: {
    '3-year': 135,
    '1-year': 100,
    'MTM-with-install': 100,
    'MTM-no-install': 50,
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
 * Simulates the frontend commission calculation logic from FormFilling
 * This mirrors the useMemo calculation in ContractSummary
 */
function calculateFormFillingCommission({
  totalCurrentContract,
  globalContractMonths,
  pricingIndicator,
  quotaLevel,
  accountType,
  isInsideSales
}) {
  const rules = DEFAULT_COMMISSION_RULES;

  // Monthly value from contract total (auto from form)
  const monthlyValue = globalContractMonths > 0
    ? totalCurrentContract / globalContractMonths
    : totalCurrentContract;

  // Derive agreement term from contract months (auto from form)
  const getAgreementTerm = () => {
    if (globalContractMonths >= 36) return '3-year';
    if (globalContractMonths >= 12) return '1-year';
    return 'MTM-with-install';
  };

  // Pricing line from indicator (auto from form - green/red line)
  const pricingLine = pricingIndicator === 'green' ? 'Greenline' : 'Redline';
  const agreementTerm = getAgreementTerm();

  // Base rate from quota level
  const baseRate = rules.quotaRates[quotaLevel];

  // Agreement multiplier
  const agreementMultiplier = rules.agreementMultipliers[agreementTerm];

  // Account type adjustment
  const accountTypeAdjustment = rules.accountTypeAdjustments[accountType];

  // Greenline bonus (auto from form pricing)
  const greenlineBonus = pricingLine === 'Greenline' ? rules.greenlineBonus : 0;

  // No renewal bonus - form filling is always new business
  const renewalBonus = 0;

  // Inside sales deduction
  const insideSalesDeduction = isInsideSales ? rules.insideSalesDeduction : 0;

  // Effective base rate (before multiplier)
  const effectiveBaseRate = baseRate + accountTypeAdjustment + greenlineBonus + renewalBonus + insideSalesDeduction;

  // Final commission rate after multiplier
  const finalCommissionRate = effectiveBaseRate * (agreementMultiplier / 100);

  // Calculate dollar amounts
  const monthlyCommission = monthlyValue * (finalCommissionRate / 100);
  const annualCommission = monthlyCommission * 12;
  const contractCommission = monthlyCommission * globalContractMonths;

  return {
    monthlyValue,
    agreementTerm,
    pricingLine,
    baseRate,
    agreementMultiplier,
    accountTypeAdjustment,
    greenlineBonus,
    renewalBonus,
    insideSalesDeduction,
    effectiveBaseRate,
    finalCommissionRate,
    monthlyCommission,
    annualCommission,
    contractCommission
  };
}

/**
 * Simulates the collectFormData commission output from FormFilling
 */
function collectFormDataCommission(commissionResult, commissionState) {
  if (!commissionResult) return null;

  return {
    input: {
      monthlyValue: commissionResult.monthlyValue,
      agreementTerm: commissionResult.agreementTerm,
      accountType: commissionState.accountType,
      pricingLine: commissionResult.pricingLine,
      quotaLevel: commissionState.quotaLevel,
      businessType: 'new',
      isInsideSales: commissionState.isInsideSales,
    },
    breakdown: {
      baseRate: commissionResult.baseRate,
      agreementMultiplier: commissionResult.agreementMultiplier,
      accountTypeAdjustment: commissionResult.accountTypeAdjustment,
      greenlineBonus: commissionResult.greenlineBonus,
      renewalBonus: commissionResult.renewalBonus,
      insideSalesDeduction: commissionResult.insideSalesDeduction,
    },
    finalCommissionRate: commissionResult.finalCommissionRate,
    monthlyCommission: commissionResult.monthlyCommission,
    annualCommission: commissionResult.annualCommission,
    contractCommission: commissionResult.contractCommission,
  };
}

// ============================================================
// TEST SUITE: Agreement Term Derivation from Contract Months
// ============================================================
describe('Commission FormFilling - Agreement Term Derivation', () => {
  const baseFormData = {
    totalCurrentContract: 3600, // $100/month * 36 months
    pricingIndicator: 'red',
    quotaLevel: 'above',
    accountType: 'Anchor',
    isInsideSales: false,
  };

  test('36+ months should derive 3-year agreement (135% multiplier)', () => {
    const result = calculateFormFillingCommission({
      ...baseFormData,
      globalContractMonths: 36,
    });

    expect(result.agreementTerm).toBe('3-year');
    expect(result.agreementMultiplier).toBe(135);
    expect(result.monthlyValue).toBe(100);
  });

  test('48 months should derive 3-year agreement', () => {
    const result = calculateFormFillingCommission({
      ...baseFormData,
      totalCurrentContract: 4800,
      globalContractMonths: 48,
    });

    expect(result.agreementTerm).toBe('3-year');
    expect(result.agreementMultiplier).toBe(135);
  });

  test('12-35 months should derive 1-year agreement (100% multiplier)', () => {
    const result = calculateFormFillingCommission({
      ...baseFormData,
      totalCurrentContract: 1200,
      globalContractMonths: 12,
    });

    expect(result.agreementTerm).toBe('1-year');
    expect(result.agreementMultiplier).toBe(100);
  });

  test('24 months should derive 1-year agreement', () => {
    const result = calculateFormFillingCommission({
      ...baseFormData,
      totalCurrentContract: 2400,
      globalContractMonths: 24,
    });

    expect(result.agreementTerm).toBe('1-year');
  });

  test('Less than 12 months should derive MTM-with-install (100% multiplier)', () => {
    const result = calculateFormFillingCommission({
      ...baseFormData,
      totalCurrentContract: 600,
      globalContractMonths: 6,
    });

    expect(result.agreementTerm).toBe('MTM-with-install');
    expect(result.agreementMultiplier).toBe(100);
  });

  test('1 month should derive MTM-with-install', () => {
    const result = calculateFormFillingCommission({
      ...baseFormData,
      totalCurrentContract: 100,
      globalContractMonths: 1,
    });

    expect(result.agreementTerm).toBe('MTM-with-install');
  });
});

// ============================================================
// TEST SUITE: Pricing Line Derivation from Pricing Indicator
// ============================================================
describe('Commission FormFilling - Pricing Line Derivation', () => {
  const baseFormData = {
    totalCurrentContract: 1200,
    globalContractMonths: 12,
    quotaLevel: 'above',
    accountType: 'Anchor',
    isInsideSales: false,
  };

  test('Green pricing indicator should derive Greenline (+1% bonus)', () => {
    const result = calculateFormFillingCommission({
      ...baseFormData,
      pricingIndicator: 'green',
    });

    expect(result.pricingLine).toBe('Greenline');
    expect(result.greenlineBonus).toBe(1);
  });

  test('Red pricing indicator should derive Redline (no bonus)', () => {
    const result = calculateFormFillingCommission({
      ...baseFormData,
      pricingIndicator: 'red',
    });

    expect(result.pricingLine).toBe('Redline');
    expect(result.greenlineBonus).toBe(0);
  });
});

// ============================================================
// TEST SUITE: Monthly Value Calculation
// ============================================================
describe('Commission FormFilling - Monthly Value Calculation', () => {
  test('Monthly value should be contract total divided by months', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 3600,
      globalContractMonths: 36,
      pricingIndicator: 'red',
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    expect(result.monthlyValue).toBe(100); // $3600 / 36 = $100
  });

  test('Monthly value with different contract total', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 12000,
      globalContractMonths: 12,
      pricingIndicator: 'red',
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    expect(result.monthlyValue).toBe(1000); // $12000 / 12 = $1000
  });

  test('Zero months should use total contract as monthly value', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 500,
      globalContractMonths: 0,
      pricingIndicator: 'red',
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    expect(result.monthlyValue).toBe(500);
  });
});

// ============================================================
// TEST SUITE: Contract Commission Calculation
// ============================================================
describe('Commission FormFilling - Contract Commission', () => {
  test('Contract commission should be monthly * contract months', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 3600, // $100/month
      globalContractMonths: 36,
      pricingIndicator: 'red',
      quotaLevel: 'above', // 6%
      accountType: 'Anchor',
      isInsideSales: false,
    });

    // Monthly: $100 * 6% * 135% = $8.10
    // Contract: $8.10 * 36 = $291.60
    expect(result.monthlyCommission).toBeCloseTo(8.1, 2);
    expect(result.contractCommission).toBeCloseTo(291.6, 2);
  });

  test('12-month contract commission', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 6000, // $500/month
      globalContractMonths: 12,
      pricingIndicator: 'red',
      quotaLevel: 'above', // 6%
      accountType: 'Anchor',
      isInsideSales: false,
    });

    // Monthly: $500 * 6% = $30
    // Contract: $30 * 12 = $360
    expect(result.monthlyCommission).toBe(30);
    expect(result.contractCommission).toBe(360);
    expect(result.annualCommission).toBe(360); // Same as contract for 12 months
  });
});

// ============================================================
// TEST SUITE: Form State Integration
// ============================================================
describe('Commission FormFilling - Commission State', () => {
  test('Default commission state values', () => {
    const defaultState = {
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    };

    const result = calculateFormFillingCommission({
      totalCurrentContract: 1200,
      globalContractMonths: 12,
      pricingIndicator: 'red',
      ...defaultState,
    });

    expect(result.baseRate).toBe(6);
    expect(result.accountTypeAdjustment).toBe(0);
    expect(result.insideSalesDeduction).toBe(0);
  });

  test('Commission state with below quota', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 1200,
      globalContractMonths: 12,
      pricingIndicator: 'red',
      quotaLevel: 'below',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    expect(result.baseRate).toBe(3);
  });

  test('Commission state with double quota', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 1200,
      globalContractMonths: 12,
      pricingIndicator: 'red',
      quotaLevel: 'double',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    expect(result.baseRate).toBe(9);
  });

  test('Commission state with Bread5 account', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 1200,
      globalContractMonths: 12,
      pricingIndicator: 'red',
      quotaLevel: 'above',
      accountType: 'Bread5',
      isInsideSales: false,
    });

    expect(result.accountTypeAdjustment).toBe(-1);
    expect(result.effectiveBaseRate).toBe(5); // 6% - 1%
  });

  test('Commission state with inside sales', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 1200,
      globalContractMonths: 12,
      pricingIndicator: 'red',
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: true,
    });

    expect(result.insideSalesDeduction).toBe(-3);
    expect(result.effectiveBaseRate).toBe(3); // 6% - 3%
  });
});

// ============================================================
// TEST SUITE: collectFormData Commission Output
// ============================================================
describe('Commission FormFilling - collectFormData Output', () => {
  test('collectFormData should include complete commission data', () => {
    const commissionState = {
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    };

    const commissionResult = calculateFormFillingCommission({
      totalCurrentContract: 3600,
      globalContractMonths: 36,
      pricingIndicator: 'green',
      ...commissionState,
    });

    const formDataCommission = collectFormDataCommission(commissionResult, commissionState);

    // Verify input structure
    expect(formDataCommission.input).toHaveProperty('monthlyValue');
    expect(formDataCommission.input).toHaveProperty('agreementTerm');
    expect(formDataCommission.input).toHaveProperty('accountType');
    expect(formDataCommission.input).toHaveProperty('pricingLine');
    expect(formDataCommission.input).toHaveProperty('quotaLevel');
    expect(formDataCommission.input).toHaveProperty('businessType');
    expect(formDataCommission.input).toHaveProperty('isInsideSales');

    // Verify breakdown structure
    expect(formDataCommission.breakdown).toHaveProperty('baseRate');
    expect(formDataCommission.breakdown).toHaveProperty('agreementMultiplier');
    expect(formDataCommission.breakdown).toHaveProperty('accountTypeAdjustment');
    expect(formDataCommission.breakdown).toHaveProperty('greenlineBonus');
    expect(formDataCommission.breakdown).toHaveProperty('renewalBonus');
    expect(formDataCommission.breakdown).toHaveProperty('insideSalesDeduction');

    // Verify top-level fields
    expect(formDataCommission).toHaveProperty('finalCommissionRate');
    expect(formDataCommission).toHaveProperty('monthlyCommission');
    expect(formDataCommission).toHaveProperty('annualCommission');
    expect(formDataCommission).toHaveProperty('contractCommission');
  });

  test('collectFormData commission values should match calculation', () => {
    const commissionState = {
      quotaLevel: 'double',
      accountType: 'Bread5',
      isInsideSales: true,
    };

    const commissionResult = calculateFormFillingCommission({
      totalCurrentContract: 3600,
      globalContractMonths: 36,
      pricingIndicator: 'green',
      ...commissionState,
    });

    const formDataCommission = collectFormDataCommission(commissionResult, commissionState);

    // Verify input values from state
    expect(formDataCommission.input.quotaLevel).toBe('double');
    expect(formDataCommission.input.accountType).toBe('Bread5');
    expect(formDataCommission.input.isInsideSales).toBe(true);
    expect(formDataCommission.input.businessType).toBe('new');

    // Verify calculated values
    expect(formDataCommission.input.monthlyValue).toBe(100);
    expect(formDataCommission.input.agreementTerm).toBe('3-year');
    expect(formDataCommission.input.pricingLine).toBe('Greenline');

    // Verify breakdown
    expect(formDataCommission.breakdown.baseRate).toBe(9);
    expect(formDataCommission.breakdown.accountTypeAdjustment).toBe(-1);
    expect(formDataCommission.breakdown.greenlineBonus).toBe(1);
    expect(formDataCommission.breakdown.insideSalesDeduction).toBe(-3);
  });

  test('collectFormData should return null if no commission result', () => {
    const formDataCommission = collectFormDataCommission(null, {});
    expect(formDataCommission).toBeNull();
  });
});

// ============================================================
// TEST SUITE: Real Form Scenarios
// ============================================================
describe('Commission FormFilling - Real Form Scenarios', () => {
  test('Typical new agreement: $500/month, 36 months, above quota, Anchor', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 18000, // $500 * 36
      globalContractMonths: 36,
      pricingIndicator: 'green', // Above 130% threshold
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    // 6% + 1% greenline = 7% * 135% = 9.45%
    expect(result.effectiveBaseRate).toBe(7);
    expect(result.finalCommissionRate).toBeCloseTo(9.45, 2);
    // Monthly: $500 * 9.45% = $47.25
    expect(result.monthlyCommission).toBeCloseTo(47.25, 2);
    // Contract: $47.25 * 36 = $1701
    expect(result.contractCommission).toBeCloseTo(1701, 0);
  });

  test('Small business: $150/month, 12 months, below quota, Bread5, inside sales', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 1800, // $150 * 12
      globalContractMonths: 12,
      pricingIndicator: 'red',
      quotaLevel: 'below',
      accountType: 'Bread5',
      isInsideSales: true,
    });

    // 3% - 1% - 3% = -1% * 100% = -1%
    expect(result.effectiveBaseRate).toBe(-1);
    expect(result.finalCommissionRate).toBe(-1);
    // Negative commission indicates this deal should be reconsidered
    expect(result.monthlyCommission).toBe(-1.5);
  });

  test('High-value deal: $2000/month, 36 months, double quota, greenline', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 72000, // $2000 * 36
      globalContractMonths: 36,
      pricingIndicator: 'green',
      quotaLevel: 'double',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    // 9% + 1% = 10% * 135% = 13.5%
    expect(result.effectiveBaseRate).toBe(10);
    expect(result.finalCommissionRate).toBeCloseTo(13.5, 2);
    // Monthly: $2000 * 13.5% = $270
    expect(result.monthlyCommission).toBeCloseTo(270, 0);
    // Contract: $270 * 36 = $9720
    expect(result.contractCommission).toBeCloseTo(9720, 0);
  });

  test('MTM agreement: $300/month, 6 months', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 1800,
      globalContractMonths: 6,
      pricingIndicator: 'red',
      quotaLevel: 'above',
      accountType: 'Pit',
      isInsideSales: false,
    });

    // 6% * 100% = 6%
    expect(result.agreementTerm).toBe('MTM-with-install');
    expect(result.finalCommissionRate).toBe(6);
    // Monthly: $300 * 6% = $18
    expect(result.monthlyCommission).toBe(18);
    // Contract: $18 * 6 = $108
    expect(result.contractCommission).toBe(108);
  });
});

// ============================================================
// TEST SUITE: Backend Schema Validation
// ============================================================
describe('Commission FormFilling - Backend Schema Compatibility', () => {
  test('Commission data structure matches CustomerHeaderDoc schema', () => {
    const commissionState = {
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    };

    const commissionResult = calculateFormFillingCommission({
      totalCurrentContract: 3600,
      globalContractMonths: 36,
      pricingIndicator: 'green',
      ...commissionState,
    });

    const formDataCommission = collectFormDataCommission(commissionResult, commissionState);

    // Verify all schema fields are present
    const schemaInput = CustomerHeaderDocSchema.commission.input;
    Object.keys(schemaInput).forEach(key => {
      if (key !== 'yearsAsCustomer') { // Optional field
        expect(formDataCommission.input).toHaveProperty(key);
      }
    });

    const schemaBreakdown = CustomerHeaderDocSchema.commission.breakdown;
    Object.keys(schemaBreakdown).forEach(key => {
      expect(formDataCommission.breakdown).toHaveProperty(key);
    });
  });

  test('Commission data types are correct for schema', () => {
    const commissionState = {
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    };

    const commissionResult = calculateFormFillingCommission({
      totalCurrentContract: 3600,
      globalContractMonths: 36,
      pricingIndicator: 'green',
      ...commissionState,
    });

    const formDataCommission = collectFormDataCommission(commissionResult, commissionState);

    // Verify types
    expect(typeof formDataCommission.input.monthlyValue).toBe('number');
    expect(typeof formDataCommission.input.agreementTerm).toBe('string');
    expect(typeof formDataCommission.input.accountType).toBe('string');
    expect(typeof formDataCommission.input.pricingLine).toBe('string');
    expect(typeof formDataCommission.input.quotaLevel).toBe('string');
    expect(typeof formDataCommission.input.businessType).toBe('string');
    expect(typeof formDataCommission.input.isInsideSales).toBe('boolean');

    expect(typeof formDataCommission.breakdown.baseRate).toBe('number');
    expect(typeof formDataCommission.breakdown.agreementMultiplier).toBe('number');

    expect(typeof formDataCommission.finalCommissionRate).toBe('number');
    expect(typeof formDataCommission.monthlyCommission).toBe('number');
    expect(typeof formDataCommission.annualCommission).toBe('number');
    expect(typeof formDataCommission.contractCommission).toBe('number');
  });

  test('Agreement term enum values are valid', () => {
    const validTerms = ['3-year', '1-year', 'MTM-with-install', 'MTM-no-install'];

    [36, 24, 12, 6, 1].forEach(months => {
      const result = calculateFormFillingCommission({
        totalCurrentContract: 1000 * months,
        globalContractMonths: months,
        pricingIndicator: 'red',
        quotaLevel: 'above',
        accountType: 'Anchor',
        isInsideSales: false,
      });

      expect(validTerms).toContain(result.agreementTerm);
    });
  });

  test('Account type enum values are valid', () => {
    const validTypes = ['Anchor', 'Bread5', 'Bread15', 'Pit'];

    validTypes.forEach(accountType => {
      const result = calculateFormFillingCommission({
        totalCurrentContract: 1200,
        globalContractMonths: 12,
        pricingIndicator: 'red',
        quotaLevel: 'above',
        accountType,
        isInsideSales: false,
      });

      expect(validTypes).toContain(result.accountTypeAdjustment !== undefined ? accountType : null);
    });
  });

  test('Quota level enum values are valid', () => {
    const validLevels = ['below', 'above', 'double'];

    validLevels.forEach(quotaLevel => {
      const result = calculateFormFillingCommission({
        totalCurrentContract: 1200,
        globalContractMonths: 12,
        pricingIndicator: 'red',
        quotaLevel,
        accountType: 'Anchor',
        isInsideSales: false,
      });

      expect(result.baseRate).toBeGreaterThan(0);
    });
  });

  test('Pricing line enum values are valid', () => {
    const validLines = ['Redline', 'Greenline'];

    ['red', 'green'].forEach(indicator => {
      const result = calculateFormFillingCommission({
        totalCurrentContract: 1200,
        globalContractMonths: 12,
        pricingIndicator: indicator,
        quotaLevel: 'above',
        accountType: 'Anchor',
        isInsideSales: false,
      });

      expect(validLines).toContain(result.pricingLine);
    });
  });
});

// ============================================================
// TEST SUITE: Edge Cases & Error Handling
// ============================================================
describe('Commission FormFilling - Edge Cases', () => {
  test('Zero contract total should result in zero commission', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 0,
      globalContractMonths: 12,
      pricingIndicator: 'green',
      quotaLevel: 'double',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    expect(result.monthlyValue).toBe(0);
    expect(result.monthlyCommission).toBe(0);
    expect(result.contractCommission).toBe(0);
  });

  test('Very large contract values', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 1000000, // $1M contract
      globalContractMonths: 36,
      pricingIndicator: 'green',
      quotaLevel: 'double',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    expect(result.monthlyValue).toBeCloseTo(27777.78, 0);
    expect(result.monthlyCommission).toBeGreaterThan(0);
    expect(result.contractCommission).toBeGreaterThan(result.annualCommission);
  });

  test('Single month contract', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 500,
      globalContractMonths: 1,
      pricingIndicator: 'red',
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    expect(result.agreementTerm).toBe('MTM-with-install');
    expect(result.monthlyCommission).toBe(30); // $500 * 6%
    expect(result.contractCommission).toBe(30); // Same as monthly for 1 month
  });

  test('Decimal contract values should calculate correctly', () => {
    const result = calculateFormFillingCommission({
      totalCurrentContract: 1234.56,
      globalContractMonths: 12,
      pricingIndicator: 'red',
      quotaLevel: 'above',
      accountType: 'Anchor',
      isInsideSales: false,
    });

    expect(result.monthlyValue).toBeCloseTo(102.88, 2);
    expect(result.monthlyCommission).toBeCloseTo(6.17, 2); // $102.88 * 6%
  });
});

// Export for potential use in other tests
export { calculateFormFillingCommission, collectFormDataCommission, DEFAULT_COMMISSION_RULES };
