/**
 * CustomerHeaderDoc Commission Schema Tests
 * Tests the commission schema in the CustomerHeaderDoc model
 *
 * Run with: npm test -- --grep "CustomerHeaderDoc Commission"
 * Or: npm test src/tests/commission.model.test.js
 */

/* global describe, test, expect */

import { CustomerHeaderDoc } from "../models/agreement/index.js";

// Helper to create valid commission data
const createValidCommission = (overrides = {}) => ({
  input: {
    monthlyValue: 500,
    agreementTerm: '1-year',
    accountType: 'Anchor',
    pricingLine: 'Redline',
    quotaLevel: 'above',
    businessType: 'new',
    yearsAsCustomer: 0,
    isInsideSales: false,
    ...overrides.input,
  },
  breakdown: {
    baseRate: 6,
    agreementMultiplier: 100,
    accountTypeAdjustment: 0,
    greenlineBonus: 0,
    renewalBonus: 0,
    insideSalesDeduction: 0,
    ...overrides.breakdown,
  },
  finalCommissionRate: 6,
  monthlyCommission: 30,
  annualCommission: 360,
  contractCommission: 360,
  ...overrides,
});

// Helper to create valid CustomerHeaderDoc
const createValidDocument = (commission = null) => ({
  payload: {
    headerTitle: 'Test Agreement',
    headerRows: [],
    products: {
      products: [],
      dispensers: [],
      smallProducts: [],
      bigProducts: [],
    },
    services: {},
    agreement: {
      enviroOf: 'Test',
      customerExecutedOn: '2024-01-01',
      additionalMonths: '',
      paymentOption: 'online',
      paymentNote: '',
      startDate: '2024-01-01',
    },
    summary: {
      contractMonths: 12,
      serviceAgreementTotal: 6000,
    },
    commission: commission,
  },
  status: 'saved',
});

// ============================================================
// TEST SUITE: Schema Definition Tests
// ============================================================
describe('CustomerHeaderDoc Commission - Schema Definition', () => {
  test('Commission field should exist in PayloadSchema', () => {
    const schema = CustomerHeaderDoc.schema;
    const payloadPath = schema.path('payload');

    expect(payloadPath).toBeDefined();

    // Check commission is part of payload schema - Mongoose returns 'real' for embedded schemas
    const commissionPathType = schema.pathType('payload.commission');
    expect(['nested', 'real']).toContain(commissionPathType);
  });

  test('Commission input schema should have correct fields', () => {
    const doc = new CustomerHeaderDoc(createValidDocument(createValidCommission()));

    expect(doc.payload.commission.input).toHaveProperty('monthlyValue');
    expect(doc.payload.commission.input).toHaveProperty('agreementTerm');
    expect(doc.payload.commission.input).toHaveProperty('accountType');
    expect(doc.payload.commission.input).toHaveProperty('pricingLine');
    expect(doc.payload.commission.input).toHaveProperty('quotaLevel');
    expect(doc.payload.commission.input).toHaveProperty('businessType');
    expect(doc.payload.commission.input).toHaveProperty('yearsAsCustomer');
    expect(doc.payload.commission.input).toHaveProperty('isInsideSales');
  });

  test('Commission breakdown schema should have correct fields', () => {
    const doc = new CustomerHeaderDoc(createValidDocument(createValidCommission()));

    expect(doc.payload.commission.breakdown).toHaveProperty('baseRate');
    expect(doc.payload.commission.breakdown).toHaveProperty('agreementMultiplier');
    expect(doc.payload.commission.breakdown).toHaveProperty('accountTypeAdjustment');
    expect(doc.payload.commission.breakdown).toHaveProperty('greenlineBonus');
    expect(doc.payload.commission.breakdown).toHaveProperty('renewalBonus');
    expect(doc.payload.commission.breakdown).toHaveProperty('insideSalesDeduction');
  });

  test('Commission result fields should exist', () => {
    const doc = new CustomerHeaderDoc(createValidDocument(createValidCommission()));

    expect(doc.payload.commission).toHaveProperty('finalCommissionRate');
    expect(doc.payload.commission).toHaveProperty('monthlyCommission');
    expect(doc.payload.commission).toHaveProperty('annualCommission');
    expect(doc.payload.commission).toHaveProperty('contractCommission');
  });
});

// ============================================================
// TEST SUITE: Enum Validation Tests
// ============================================================
describe('CustomerHeaderDoc Commission - Enum Validation', () => {
  describe('Agreement Term Enum', () => {
    const validTerms = ['3-year', '1-year', 'MTM-with-install', 'MTM-no-install'];

    validTerms.forEach(term => {
      test(`Should accept valid agreement term: ${term}`, () => {
        const commission = createValidCommission({
          input: { agreementTerm: term },
        });
        const doc = new CustomerHeaderDoc(createValidDocument(commission));

        expect(doc.payload.commission.input.agreementTerm).toBe(term);
      });
    });

    test('Should reject invalid agreement term', async () => {
      const commission = createValidCommission({
        input: { agreementTerm: 'invalid-term' },
      });
      const doc = new CustomerHeaderDoc(createValidDocument(commission));

      const validationError = doc.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors['payload.commission.input.agreementTerm']).toBeDefined();
    });
  });

  describe('Account Type Enum', () => {
    const validTypes = ['Anchor', 'Bread5', 'Bread15', 'Pit'];

    validTypes.forEach(type => {
      test(`Should accept valid account type: ${type}`, () => {
        const commission = createValidCommission({
          input: { accountType: type },
        });
        const doc = new CustomerHeaderDoc(createValidDocument(commission));

        expect(doc.payload.commission.input.accountType).toBe(type);
      });
    });

    test('Should reject invalid account type', async () => {
      const commission = createValidCommission({
        input: { accountType: 'InvalidType' },
      });
      const doc = new CustomerHeaderDoc(createValidDocument(commission));

      const validationError = doc.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors['payload.commission.input.accountType']).toBeDefined();
    });
  });

  describe('Pricing Line Enum', () => {
    const validLines = ['Redline', 'Greenline'];

    validLines.forEach(line => {
      test(`Should accept valid pricing line: ${line}`, () => {
        const commission = createValidCommission({
          input: { pricingLine: line },
        });
        const doc = new CustomerHeaderDoc(createValidDocument(commission));

        expect(doc.payload.commission.input.pricingLine).toBe(line);
      });
    });

    test('Should reject invalid pricing line', async () => {
      const commission = createValidCommission({
        input: { pricingLine: 'Blueline' },
      });
      const doc = new CustomerHeaderDoc(createValidDocument(commission));

      const validationError = doc.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors['payload.commission.input.pricingLine']).toBeDefined();
    });
  });

  describe('Quota Level Enum', () => {
    const validLevels = ['below', 'above', 'double'];

    validLevels.forEach(level => {
      test(`Should accept valid quota level: ${level}`, () => {
        const commission = createValidCommission({
          input: { quotaLevel: level },
        });
        const doc = new CustomerHeaderDoc(createValidDocument(commission));

        expect(doc.payload.commission.input.quotaLevel).toBe(level);
      });
    });

    test('Should reject invalid quota level', async () => {
      const commission = createValidCommission({
        input: { quotaLevel: 'triple' },
      });
      const doc = new CustomerHeaderDoc(createValidDocument(commission));

      const validationError = doc.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors['payload.commission.input.quotaLevel']).toBeDefined();
    });
  });

  describe('Business Type Enum', () => {
    const validTypes = ['new', 'renewal'];

    validTypes.forEach(type => {
      test(`Should accept valid business type: ${type}`, () => {
        const commission = createValidCommission({
          input: { businessType: type },
        });
        const doc = new CustomerHeaderDoc(createValidDocument(commission));

        expect(doc.payload.commission.input.businessType).toBe(type);
      });
    });

    test('Should reject invalid business type', async () => {
      const commission = createValidCommission({
        input: { businessType: 'upgrade' },
      });
      const doc = new CustomerHeaderDoc(createValidDocument(commission));

      const validationError = doc.validateSync();
      expect(validationError).toBeDefined();
      expect(validationError.errors['payload.commission.input.businessType']).toBeDefined();
    });
  });
});

// ============================================================
// TEST SUITE: Default Values Tests
// ============================================================
describe('CustomerHeaderDoc Commission - Default Values', () => {
  test('Commission input should have sensible defaults', () => {
    const doc = new CustomerHeaderDoc(createValidDocument({
      input: {},
      breakdown: {},
    }));

    // Check defaults are applied
    expect(doc.payload.commission.input.monthlyValue).toBe(0);
    expect(doc.payload.commission.input.agreementTerm).toBe('1-year');
    expect(doc.payload.commission.input.accountType).toBe('Anchor');
    expect(doc.payload.commission.input.pricingLine).toBe('Redline');
    expect(doc.payload.commission.input.quotaLevel).toBe('below');
    expect(doc.payload.commission.input.businessType).toBe('new');
    expect(doc.payload.commission.input.yearsAsCustomer).toBe(0);
    expect(doc.payload.commission.input.isInsideSales).toBe(false);
  });

  test('Commission breakdown should have sensible defaults', () => {
    const doc = new CustomerHeaderDoc(createValidDocument({
      input: {},
      breakdown: {},
    }));

    expect(doc.payload.commission.breakdown.baseRate).toBe(0);
    expect(doc.payload.commission.breakdown.agreementMultiplier).toBe(100);
    expect(doc.payload.commission.breakdown.accountTypeAdjustment).toBe(0);
    expect(doc.payload.commission.breakdown.greenlineBonus).toBe(0);
    expect(doc.payload.commission.breakdown.renewalBonus).toBe(0);
    expect(doc.payload.commission.breakdown.insideSalesDeduction).toBe(0);
  });

  test('Commission result fields should default to zero', () => {
    const doc = new CustomerHeaderDoc(createValidDocument({
      input: {},
      breakdown: {},
    }));

    expect(doc.payload.commission.finalCommissionRate).toBe(0);
    expect(doc.payload.commission.monthlyCommission).toBe(0);
    expect(doc.payload.commission.annualCommission).toBe(0);
    expect(doc.payload.commission.contractCommission).toBe(0);
  });

  test('Null commission should be allowed', () => {
    const doc = new CustomerHeaderDoc(createValidDocument(null));

    expect(doc.payload.commission).toBeNull();
    expect(doc.validateSync()).toBeUndefined(); // Should be valid
  });
});

// ============================================================
// TEST SUITE: Data Type Tests
// ============================================================
describe('CustomerHeaderDoc Commission - Data Types', () => {
  test('Numeric fields should accept numbers', () => {
    const commission = createValidCommission({
      input: { monthlyValue: 1234.56 },
      breakdown: { baseRate: 6.5 },
      finalCommissionRate: 8.775,
      monthlyCommission: 108.26,
    });
    const doc = new CustomerHeaderDoc(createValidDocument(commission));

    expect(typeof doc.payload.commission.input.monthlyValue).toBe('number');
    expect(typeof doc.payload.commission.breakdown.baseRate).toBe('number');
    expect(typeof doc.payload.commission.finalCommissionRate).toBe('number');
    expect(typeof doc.payload.commission.monthlyCommission).toBe('number');
  });

  test('Boolean fields should accept booleans', () => {
    const commission = createValidCommission({
      input: { isInsideSales: true },
    });
    const doc = new CustomerHeaderDoc(createValidDocument(commission));

    expect(typeof doc.payload.commission.input.isInsideSales).toBe('boolean');
    expect(doc.payload.commission.input.isInsideSales).toBe(true);
  });

  test('String fields should accept strings', () => {
    const commission = createValidCommission({
      input: {
        agreementTerm: '3-year',
        accountType: 'Bread5',
        pricingLine: 'Greenline',
        quotaLevel: 'double',
        businessType: 'renewal',
      },
    });
    const doc = new CustomerHeaderDoc(createValidDocument(commission));

    expect(typeof doc.payload.commission.input.agreementTerm).toBe('string');
    expect(typeof doc.payload.commission.input.accountType).toBe('string');
    expect(typeof doc.payload.commission.input.pricingLine).toBe('string');
    expect(typeof doc.payload.commission.input.quotaLevel).toBe('string');
    expect(typeof doc.payload.commission.input.businessType).toBe('string');
  });
});

// ============================================================
// TEST SUITE: Edge Cases
// ============================================================
describe('CustomerHeaderDoc Commission - Edge Cases', () => {
  test('Should handle zero values', () => {
    const commission = createValidCommission({
      input: { monthlyValue: 0 },
      monthlyCommission: 0,
      annualCommission: 0,
      contractCommission: 0,
    });
    const doc = new CustomerHeaderDoc(createValidDocument(commission));

    expect(doc.payload.commission.input.monthlyValue).toBe(0);
    expect(doc.payload.commission.monthlyCommission).toBe(0);
    expect(doc.validateSync()).toBeUndefined();
  });

  test('Should handle negative values (for deductions)', () => {
    const commission = createValidCommission({
      breakdown: {
        insideSalesDeduction: -3,
        accountTypeAdjustment: -1,
      },
      finalCommissionRate: -1,
      monthlyCommission: -5,
    });
    const doc = new CustomerHeaderDoc(createValidDocument(commission));

    expect(doc.payload.commission.breakdown.insideSalesDeduction).toBe(-3);
    expect(doc.payload.commission.finalCommissionRate).toBe(-1);
    expect(doc.validateSync()).toBeUndefined();
  });

  test('Should handle large values', () => {
    const commission = createValidCommission({
      input: { monthlyValue: 1000000 },
      monthlyCommission: 60000,
      annualCommission: 720000,
      contractCommission: 2160000,
    });
    const doc = new CustomerHeaderDoc(createValidDocument(commission));

    expect(doc.payload.commission.input.monthlyValue).toBe(1000000);
    expect(doc.payload.commission.monthlyCommission).toBe(60000);
    expect(doc.validateSync()).toBeUndefined();
  });

  test('Should handle decimal values', () => {
    const commission = createValidCommission({
      input: { monthlyValue: 333.33 },
      breakdown: { baseRate: 6.5 },
      finalCommissionRate: 8.775,
      monthlyCommission: 29.24,
    });
    const doc = new CustomerHeaderDoc(createValidDocument(commission));

    expect(doc.payload.commission.input.monthlyValue).toBeCloseTo(333.33, 2);
    expect(doc.payload.commission.breakdown.baseRate).toBeCloseTo(6.5, 2);
    expect(doc.validateSync()).toBeUndefined();
  });
});

// ============================================================
// TEST SUITE: Integration with Document
// ============================================================
describe('CustomerHeaderDoc Commission - Document Integration', () => {
  test('Commission should be part of full document structure', () => {
    const commission = createValidCommission();
    const doc = new CustomerHeaderDoc(createValidDocument(commission));

    // Verify full structure
    expect(doc.payload).toBeDefined();
    expect(doc.payload.headerTitle).toBe('Test Agreement');
    expect(doc.payload.commission).toBeDefined();
    expect(doc.payload.commission.input.monthlyValue).toBe(500);
    expect(doc.status).toBe('saved');
  });

  test('Document without commission should be valid', () => {
    const doc = new CustomerHeaderDoc(createValidDocument(null));

    expect(doc.payload.commission).toBeNull();
    const error = doc.validateSync();
    expect(error).toBeUndefined();
  });

  test('Commission values should persist through toObject()', () => {
    const commission = createValidCommission({
      input: { quotaLevel: 'double' },
      breakdown: { baseRate: 9 },
      finalCommissionRate: 12.15,
    });
    const doc = new CustomerHeaderDoc(createValidDocument(commission));
    const obj = doc.toObject();

    expect(obj.payload.commission.input.quotaLevel).toBe('double');
    expect(obj.payload.commission.breakdown.baseRate).toBe(9);
    expect(obj.payload.commission.finalCommissionRate).toBe(12.15);
  });

  test('Commission values should persist through toJSON()', () => {
    const commission = createValidCommission({
      input: { accountType: 'Bread15' },
      breakdown: { accountTypeAdjustment: -0.5 },
    });
    const doc = new CustomerHeaderDoc(createValidDocument(commission));
    const json = doc.toJSON();

    expect(json.payload.commission.input.accountType).toBe('Bread15');
    expect(json.payload.commission.breakdown.accountTypeAdjustment).toBe(-0.5);
  });
});

// Export helpers for other tests
export { createValidCommission, createValidDocument };
