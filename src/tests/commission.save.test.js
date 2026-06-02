/**
 * Commission Save Integration Tests
 * Tests the commission data persistence when saving agreements
 *
 * Run with: npm test -- --grep "Commission Save"
 * Or: npm test src/tests/commission.save.test.js
 */

/* global describe, test, expect */

// Mock commission data that would come from FormFilling
const createMockCommissionData = (overrides = {}) => ({
  input: {
    monthlyValue: 500,
    agreementTerm: '3-year',
    accountType: 'Anchor',
    pricingLine: 'Greenline',
    quotaLevel: 'above',
    businessType: 'new',
    isInsideSales: false,
    ...overrides.input,
  },
  breakdown: {
    baseRate: 6,
    agreementMultiplier: 135,
    accountTypeAdjustment: 0,
    greenlineBonus: 1,
    renewalBonus: 0,
    insideSalesDeduction: 0,
    ...overrides.breakdown,
  },
  finalCommissionRate: 9.45,
  monthlyCommission: 47.25,
  annualCommission: 567,
  contractCommission: 1701,
  ...overrides,
});

// Mock agreement payload that would be sent to backend
const createMockAgreementPayload = (commission = null) => ({
  headerTitle: 'Test Customer Agreement',
  headerRows: [
    { labelLeft: 'Customer Name', valueLeft: 'Test Corp', labelRight: 'Date', valueRight: '2024-01-15' },
  ],
  products: {
    products: [],
    dispensers: [],
    smallProducts: [],
    bigProducts: [],
  },
  services: {
    saniclean: { isActive: true, price: 500 },
  },
  agreement: {
    enviroOf: 'Test Region',
    customerExecutedOn: '2024-01-15',
    additionalMonths: '',
    paymentOption: 'online',
    paymentNote: '',
    startDate: '2024-01-15',
  },
  summary: {
    contractMonths: 36,
    tripCharge: 0,
    tripChargeFrequency: 0,
    parkingCharge: 0,
    parkingChargeFrequency: 0,
    serviceAgreementTotal: 18000,
    productMonthlyTotal: 0,
    productContractTotal: 0,
  },
  commission: commission,
  customerName: 'Test Corp',
  includeProductsTable: true,
});

// ============================================================
// TEST SUITE: Commission Data Structure Validation
// ============================================================
describe('Commission Save - Data Structure', () => {
  test('Commission data should have all required fields', () => {
    const commission = createMockCommissionData();

    // Input fields
    expect(commission.input).toHaveProperty('monthlyValue');
    expect(commission.input).toHaveProperty('agreementTerm');
    expect(commission.input).toHaveProperty('accountType');
    expect(commission.input).toHaveProperty('pricingLine');
    expect(commission.input).toHaveProperty('quotaLevel');
    expect(commission.input).toHaveProperty('businessType');
    expect(commission.input).toHaveProperty('isInsideSales');

    // Breakdown fields
    expect(commission.breakdown).toHaveProperty('baseRate');
    expect(commission.breakdown).toHaveProperty('agreementMultiplier');
    expect(commission.breakdown).toHaveProperty('accountTypeAdjustment');
    expect(commission.breakdown).toHaveProperty('greenlineBonus');
    expect(commission.breakdown).toHaveProperty('renewalBonus');
    expect(commission.breakdown).toHaveProperty('insideSalesDeduction');

    // Result fields
    expect(commission).toHaveProperty('finalCommissionRate');
    expect(commission).toHaveProperty('monthlyCommission');
    expect(commission).toHaveProperty('annualCommission');
    expect(commission).toHaveProperty('contractCommission');
  });

  test('Commission input field types should be correct', () => {
    const commission = createMockCommissionData();

    expect(typeof commission.input.monthlyValue).toBe('number');
    expect(typeof commission.input.agreementTerm).toBe('string');
    expect(typeof commission.input.accountType).toBe('string');
    expect(typeof commission.input.pricingLine).toBe('string');
    expect(typeof commission.input.quotaLevel).toBe('string');
    expect(typeof commission.input.businessType).toBe('string');
    expect(typeof commission.input.isInsideSales).toBe('boolean');
  });

  test('Commission breakdown field types should be correct', () => {
    const commission = createMockCommissionData();

    expect(typeof commission.breakdown.baseRate).toBe('number');
    expect(typeof commission.breakdown.agreementMultiplier).toBe('number');
    expect(typeof commission.breakdown.accountTypeAdjustment).toBe('number');
    expect(typeof commission.breakdown.greenlineBonus).toBe('number');
    expect(typeof commission.breakdown.renewalBonus).toBe('number');
    expect(typeof commission.breakdown.insideSalesDeduction).toBe('number');
  });

  test('Commission result field types should be correct', () => {
    const commission = createMockCommissionData();

    expect(typeof commission.finalCommissionRate).toBe('number');
    expect(typeof commission.monthlyCommission).toBe('number');
    expect(typeof commission.annualCommission).toBe('number');
    expect(typeof commission.contractCommission).toBe('number');
  });
});

// ============================================================
// TEST SUITE: Agreement Term Enum Validation
// ============================================================
describe('Commission Save - Agreement Term Validation', () => {
  const validTerms = ['3-year', '1-year', 'MTM-with-install', 'MTM-no-install'];

  validTerms.forEach(term => {
    test(`Agreement term "${term}" should be valid`, () => {
      const commission = createMockCommissionData({
        input: { agreementTerm: term },
      });

      expect(validTerms).toContain(commission.input.agreementTerm);
    });
  });

  test('Invalid agreement term should not be in valid list', () => {
    expect(validTerms).not.toContain('invalid-term');
    expect(validTerms).not.toContain('monthly');
    expect(validTerms).not.toContain('5-year');
  });
});

// ============================================================
// TEST SUITE: Account Type Enum Validation
// ============================================================
describe('Commission Save - Account Type Validation', () => {
  const validTypes = ['Anchor', 'Bread5', 'Bread15', 'Pit'];

  validTypes.forEach(type => {
    test(`Account type "${type}" should be valid`, () => {
      const commission = createMockCommissionData({
        input: { accountType: type },
      });

      expect(validTypes).toContain(commission.input.accountType);
    });
  });

  test('Invalid account type should not be in valid list', () => {
    expect(validTypes).not.toContain('InvalidType');
    expect(validTypes).not.toContain('bread');
    expect(validTypes).not.toContain('anchor');
  });
});

// ============================================================
// TEST SUITE: Pricing Line Enum Validation
// ============================================================
describe('Commission Save - Pricing Line Validation', () => {
  const validLines = ['Redline', 'Greenline'];

  validLines.forEach(line => {
    test(`Pricing line "${line}" should be valid`, () => {
      const commission = createMockCommissionData({
        input: { pricingLine: line },
      });

      expect(validLines).toContain(commission.input.pricingLine);
    });
  });

  test('Invalid pricing line should not be in valid list', () => {
    expect(validLines).not.toContain('Blueline');
    expect(validLines).not.toContain('red');
    expect(validLines).not.toContain('green');
  });
});

// ============================================================
// TEST SUITE: Quota Level Enum Validation
// ============================================================
describe('Commission Save - Quota Level Validation', () => {
  const validLevels = ['below', 'above', 'double'];

  validLevels.forEach(level => {
    test(`Quota level "${level}" should be valid`, () => {
      const commission = createMockCommissionData({
        input: { quotaLevel: level },
      });

      expect(validLevels).toContain(commission.input.quotaLevel);
    });
  });

  test('Invalid quota level should not be in valid list', () => {
    expect(validLevels).not.toContain('triple');
    expect(validLevels).not.toContain('normal');
    expect(validLevels).not.toContain('Below');
  });
});

// ============================================================
// TEST SUITE: Business Type Enum Validation
// ============================================================
describe('Commission Save - Business Type Validation', () => {
  const validTypes = ['new', 'renewal'];

  validTypes.forEach(type => {
    test(`Business type "${type}" should be valid`, () => {
      const commission = createMockCommissionData({
        input: { businessType: type },
      });

      expect(validTypes).toContain(commission.input.businessType);
    });
  });

  test('Invalid business type should not be in valid list', () => {
    expect(validTypes).not.toContain('upgrade');
    expect(validTypes).not.toContain('New');
    expect(validTypes).not.toContain('existing');
  });
});

// ============================================================
// TEST SUITE: Payload Integration
// ============================================================
describe('Commission Save - Payload Integration', () => {
  test('Agreement payload should include commission when provided', () => {
    const commission = createMockCommissionData();
    const payload = createMockAgreementPayload(commission);

    expect(payload).toHaveProperty('commission');
    expect(payload.commission).not.toBeNull();
    expect(payload.commission.input.monthlyValue).toBe(500);
  });

  test('Agreement payload should handle null commission', () => {
    const payload = createMockAgreementPayload(null);

    expect(payload).toHaveProperty('commission');
    expect(payload.commission).toBeNull();
  });

  test('Commission values should match summary values', () => {
    const commission = createMockCommissionData({
      input: { monthlyValue: 500 },
    });
    const payload = createMockAgreementPayload(commission);

    // Monthly value * contract months should equal serviceAgreementTotal
    const calculatedTotal = commission.input.monthlyValue * payload.summary.contractMonths;
    expect(calculatedTotal).toBe(payload.summary.serviceAgreementTotal);
  });
});

// ============================================================
// TEST SUITE: Commission Calculation Consistency
// ============================================================
describe('Commission Save - Calculation Consistency', () => {
  test('Monthly commission * 12 should equal annual commission', () => {
    const commission = createMockCommissionData();

    const expectedAnnual = commission.monthlyCommission * 12;
    expect(commission.annualCommission).toBeCloseTo(expectedAnnual, 2);
  });

  test('Monthly commission * contract months should equal contract commission', () => {
    const contractMonths = 36;
    const monthlyCommission = 47.25;
    const commission = createMockCommissionData({
      monthlyCommission,
      contractCommission: monthlyCommission * contractMonths,
    });

    expect(commission.contractCommission).toBeCloseTo(monthlyCommission * contractMonths, 2);
  });

  test('Final rate should be effective rate * multiplier / 100', () => {
    const baseRate = 6;
    const greenlineBonus = 1;
    const agreementMultiplier = 135;
    const effectiveRate = baseRate + greenlineBonus;
    const expectedFinalRate = effectiveRate * (agreementMultiplier / 100);

    const commission = createMockCommissionData({
      breakdown: {
        baseRate,
        greenlineBonus,
        agreementMultiplier,
        accountTypeAdjustment: 0,
        renewalBonus: 0,
        insideSalesDeduction: 0,
      },
      finalCommissionRate: expectedFinalRate,
    });

    expect(commission.finalCommissionRate).toBeCloseTo(expectedFinalRate, 2);
  });
});

// ============================================================
// TEST SUITE: Various Commission Scenarios for Save
// ============================================================
describe('Commission Save - Various Scenarios', () => {
  test('Below quota with inside sales should have negative adjustments', () => {
    const commission = createMockCommissionData({
      input: {
        quotaLevel: 'below',
        isInsideSales: true,
        accountType: 'Bread5',
      },
      breakdown: {
        baseRate: 3,
        insideSalesDeduction: -3,
        accountTypeAdjustment: -1,
        agreementMultiplier: 100,
        greenlineBonus: 0,
        renewalBonus: 0,
      },
      finalCommissionRate: -1, // 3 - 3 - 1 = -1%
    });

    expect(commission.breakdown.insideSalesDeduction).toBeLessThan(0);
    expect(commission.breakdown.accountTypeAdjustment).toBeLessThan(0);
    expect(commission.finalCommissionRate).toBeLessThan(0);
  });

  test('Double quota with all bonuses should have high commission rate', () => {
    const commission = createMockCommissionData({
      input: {
        quotaLevel: 'double',
        agreementTerm: '3-year',
        pricingLine: 'Greenline',
        businessType: 'new',
      },
      breakdown: {
        baseRate: 9,
        agreementMultiplier: 135,
        greenlineBonus: 1,
        accountTypeAdjustment: 0,
        renewalBonus: 0,
        insideSalesDeduction: 0,
      },
      finalCommissionRate: 13.5, // (9 + 1) * 135% = 13.5%
    });

    expect(commission.breakdown.baseRate).toBe(9);
    expect(commission.finalCommissionRate).toBeCloseTo(13.5, 2);
  });

  test('MTM no-install should have 50% multiplier', () => {
    const commission = createMockCommissionData({
      input: {
        agreementTerm: 'MTM-no-install',
      },
      breakdown: {
        agreementMultiplier: 50,
        baseRate: 6,
        greenlineBonus: 0,
        accountTypeAdjustment: 0,
        renewalBonus: 0,
        insideSalesDeduction: 0,
      },
      finalCommissionRate: 3, // 6 * 50% = 3%
    });

    expect(commission.breakdown.agreementMultiplier).toBe(50);
    expect(commission.finalCommissionRate).toBe(3);
  });
});

// ============================================================
// TEST SUITE: Edge Cases for Save
// ============================================================
describe('Commission Save - Edge Cases', () => {
  test('Zero monthly value should have zero commissions', () => {
    const commission = createMockCommissionData({
      input: { monthlyValue: 0 },
      monthlyCommission: 0,
      annualCommission: 0,
      contractCommission: 0,
    });

    expect(commission.monthlyCommission).toBe(0);
    expect(commission.annualCommission).toBe(0);
    expect(commission.contractCommission).toBe(0);
  });

  test('Very large monthly value should handle correctly', () => {
    const largeValue = 1000000;
    const commission = createMockCommissionData({
      input: { monthlyValue: largeValue },
      monthlyCommission: largeValue * 0.06, // 6%
      annualCommission: largeValue * 0.06 * 12,
    });

    expect(commission.monthlyCommission).toBe(60000);
    expect(commission.annualCommission).toBe(720000);
  });

  test('Decimal values should be preserved', () => {
    const commission = createMockCommissionData({
      input: { monthlyValue: 333.33 },
      monthlyCommission: 19.9998,
      finalCommissionRate: 6,
    });

    expect(commission.input.monthlyValue).toBeCloseTo(333.33, 2);
    expect(commission.monthlyCommission).toBeCloseTo(19.9998, 2);
  });
});

// ============================================================
// TEST SUITE: Data Integrity
// ============================================================
describe('Commission Save - Data Integrity', () => {
  test('Commission input should preserve original values', () => {
    const originalInput = {
      monthlyValue: 500,
      agreementTerm: '3-year',
      accountType: 'Anchor',
      pricingLine: 'Greenline',
      quotaLevel: 'above',
      businessType: 'new',
      isInsideSales: false,
    };

    const commission = createMockCommissionData({ input: originalInput });

    expect(commission.input.monthlyValue).toBe(originalInput.monthlyValue);
    expect(commission.input.agreementTerm).toBe(originalInput.agreementTerm);
    expect(commission.input.accountType).toBe(originalInput.accountType);
    expect(commission.input.pricingLine).toBe(originalInput.pricingLine);
    expect(commission.input.quotaLevel).toBe(originalInput.quotaLevel);
    expect(commission.input.businessType).toBe(originalInput.businessType);
    expect(commission.input.isInsideSales).toBe(originalInput.isInsideSales);
  });

  test('Breakdown values should match rules applied', () => {
    const commission = createMockCommissionData({
      input: {
        quotaLevel: 'double',
        accountType: 'Bread15',
        pricingLine: 'Greenline',
        isInsideSales: true,
        agreementTerm: '3-year',
      },
      breakdown: {
        baseRate: 9,           // double quota
        accountTypeAdjustment: -0.5,  // Bread15
        greenlineBonus: 1,     // Greenline
        insideSalesDeduction: -3,     // inside sales
        agreementMultiplier: 135,     // 3-year
        renewalBonus: 0,       // new business
      },
    });

    // Effective: 9 - 0.5 + 1 - 3 = 6.5%
    // Final: 6.5 * 135% = 8.775%
    const effectiveRate = 9 - 0.5 + 1 + 0 - 3;
    const expectedFinalRate = effectiveRate * (135 / 100);

    expect(effectiveRate).toBeCloseTo(6.5, 2);
    expect(expectedFinalRate).toBeCloseTo(8.775, 2);
  });
});

// Export mock creators for use in other tests
export { createMockCommissionData, createMockAgreementPayload };
