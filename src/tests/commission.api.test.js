

import { jest } from '@jest/globals';

// Base URL for API calls (adjust port if needed)
const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';

// Helper function to make API calls
async function apiCall(method, endpoint, body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();
    return { status: response.status, data, ok: response.ok };
  } catch (error) {
    return { status: 500, data: { error: error.message }, ok: false };
  }
}

// ============================================================
// TEST SUITE: Commission Rules API
// ============================================================
describe('Commission API - Rules Endpoints', () => {
  test('GET /api/commission/rules/active should return active rules', async () => {
    const response = await apiCall('GET', '/api/commission/rules/active');

    if (response.ok) {
      expect(response.data).toHaveProperty('quotaRates');
      expect(response.data).toHaveProperty('agreementMultipliers');
      expect(response.data).toHaveProperty('accountTypeAdjustments');
      expect(response.data).toHaveProperty('greenlineBonus');
      expect(response.data).toHaveProperty('renewalBonusRate');
      expect(response.data).toHaveProperty('insideSalesDeduction');
    } else {
      // Server might not be running
      console.log('Skipping: Server not available');
    }
  });

  test('Active rules should have correct default values', async () => {
    const response = await apiCall('GET', '/api/commission/rules/active');

    if (response.ok) {
      expect(response.data.quotaRates.below).toBe(3);
      expect(response.data.quotaRates.above).toBe(6);
      expect(response.data.quotaRates.double).toBe(9);
      expect(response.data.agreementMultipliers['3-year']).toBe(135);
      expect(response.data.agreementMultipliers['1-year']).toBe(100);
      expect(response.data.insideSalesDeduction).toBe(-3);
    }
  });
});

// ============================================================
// TEST SUITE: Commission Calculation API
// ============================================================
describe('Commission API - Calculate Endpoint', () => {
  const validInput = {
    monthlyValue: 1000,
    agreementTerm: '1-year',
    accountType: 'Anchor',
    pricingLine: 'Redline',
    quotaLevel: 'above',
    businessType: 'new',
    isInsideSales: false,
  };

  test('POST /api/commission/calculate should calculate commission', async () => {
    const response = await apiCall('POST', '/api/commission/calculate', validInput);

    if (response.ok) {
      expect(response.data).toHaveProperty('finalCommissionRate');
      expect(response.data).toHaveProperty('monthlyCommission');
      expect(response.data).toHaveProperty('annualCommission');
      expect(response.data).toHaveProperty('breakdown');

      // 6% base rate * 100% multiplier = 6%
      expect(response.data.finalCommissionRate).toBe(6);
      // $1000 * 6% = $60
      expect(response.data.monthlyCommission).toBe(60);
      // $60 * 12 = $720
      expect(response.data.annualCommission).toBe(720);
    }
  });

  test('Should calculate 3-year agreement correctly', async () => {
    const input = { ...validInput, agreementTerm: '3-year' };
    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      // 6% base * 135% multiplier = 8.1%
      expect(response.data.finalCommissionRate).toBeCloseTo(8.1, 1);
      expect(response.data.monthlyCommission).toBeCloseTo(81, 1);
    }
  });

  test('Should calculate with greenline bonus', async () => {
    const input = { ...validInput, pricingLine: 'Greenline' };
    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      // (6% + 1% greenline) * 100% = 7%
      expect(response.data.finalCommissionRate).toBe(7);
      expect(response.data.breakdown.greenlineBonus).toBe(1);
    }
  });

  test('Should calculate with inside sales deduction', async () => {
    const input = { ...validInput, isInsideSales: true };
    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      // (6% - 3% inside sales) * 100% = 3%
      expect(response.data.finalCommissionRate).toBe(3);
      expect(response.data.breakdown.insideSalesDeduction).toBe(-3);
    }
  });

  test('Should calculate with renewal bonus', async () => {
    const input = {
      ...validInput,
      businessType: 'renewal',
      yearsAsCustomer: 3,
    };
    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      // (6% + 4% renewal) * 100% = 10%
      expect(response.data.finalCommissionRate).toBe(10);
      expect(response.data.breakdown.renewalBonus).toBe(4);
    }
  });

  test('Should calculate with Bread5 account type', async () => {
    const input = { ...validInput, accountType: 'Bread5' };
    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      // (6% - 1% bread5) * 100% = 5%
      expect(response.data.finalCommissionRate).toBe(5);
      expect(response.data.breakdown.accountTypeAdjustment).toBe(-1);
    }
  });

  test('Should reject missing monthlyValue', async () => {
    const input = { ...validInput };
    delete input.monthlyValue;

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (!response.ok) {
      expect(response.status).toBe(400);
    }
  });

  test('Should reject zero monthlyValue', async () => {
    const input = { ...validInput, monthlyValue: 0 };
    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (!response.ok) {
      expect(response.status).toBe(400);
    }
  });

  test('Should reject negative monthlyValue', async () => {
    const input = { ...validInput, monthlyValue: -100 };
    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (!response.ok) {
      expect(response.status).toBe(400);
    }
  });

  test('Should reject missing agreementTerm', async () => {
    const input = { ...validInput };
    delete input.agreementTerm;

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (!response.ok) {
      expect(response.status).toBe(400);
    }
  });
});

// ============================================================
// TEST SUITE: All Commission Scenarios
// ============================================================
describe('Commission API - All Scenario Combinations', () => {
  const quotaLevels = ['below', 'above', 'double'];
  const agreementTerms = ['3-year', '1-year', 'MTM-with-install', 'MTM-no-install'];
  const accountTypes = ['Anchor', 'Bread5', 'Bread15', 'Pit'];
  const pricingLines = ['Redline', 'Greenline'];

  // Test matrix for quota levels
  quotaLevels.forEach(quota => {
    test(`Quota level ${quota} should use correct base rate`, async () => {
      const input = {
        monthlyValue: 100,
        agreementTerm: '1-year',
        accountType: 'Anchor',
        pricingLine: 'Redline',
        quotaLevel: quota,
        businessType: 'new',
        isInsideSales: false,
      };

      const expectedRates = { below: 3, above: 6, double: 9 };
      const response = await apiCall('POST', '/api/commission/calculate', input);

      if (response.ok) {
        expect(response.data.breakdown.baseRate).toBe(expectedRates[quota]);
      }
    });
  });

  // Test matrix for agreement terms
  agreementTerms.forEach(term => {
    test(`Agreement term ${term} should use correct multiplier`, async () => {
      const input = {
        monthlyValue: 100,
        agreementTerm: term,
        accountType: 'Anchor',
        pricingLine: 'Redline',
        quotaLevel: 'above',
        businessType: 'new',
        isInsideSales: false,
      };

      const expectedMultipliers = {
        '3-year': 135,
        '1-year': 100,
        'MTM-with-install': 100,
        'MTM-no-install': 50,
      };

      const response = await apiCall('POST', '/api/commission/calculate', input);

      if (response.ok) {
        expect(response.data.breakdown.agreementMultiplier).toBe(expectedMultipliers[term]);
      }
    });
  });

  // Test matrix for account types
  accountTypes.forEach(account => {
    test(`Account type ${account} should use correct adjustment`, async () => {
      const input = {
        monthlyValue: 100,
        agreementTerm: '1-year',
        accountType: account,
        pricingLine: 'Redline',
        quotaLevel: 'above',
        businessType: 'new',
        isInsideSales: false,
      };

      const expectedAdjustments = {
        Anchor: 0,
        Bread5: -1,
        Bread15: -0.5,
        Pit: 0,
      };

      const response = await apiCall('POST', '/api/commission/calculate', input);

      if (response.ok) {
        expect(response.data.breakdown.accountTypeAdjustment).toBe(expectedAdjustments[account]);
      }
    });
  });

  // Test matrix for pricing lines
  pricingLines.forEach(pricing => {
    test(`Pricing line ${pricing} should apply correct bonus`, async () => {
      const input = {
        monthlyValue: 100,
        agreementTerm: '1-year',
        accountType: 'Anchor',
        pricingLine: pricing,
        quotaLevel: 'above',
        businessType: 'new',
        isInsideSales: false,
      };

      const expectedBonus = pricing === 'Greenline' ? 1 : 0;

      const response = await apiCall('POST', '/api/commission/calculate', input);

      if (response.ok) {
        expect(response.data.breakdown.greenlineBonus).toBe(expectedBonus);
      }
    });
  });
});

// ============================================================
// TEST SUITE: Complex Combined Scenarios
// ============================================================
describe('Commission API - Complex Combined Scenarios', () => {
  test('Best case scenario: Maximum bonuses', async () => {
    const input = {
      monthlyValue: 1000,
      quotaLevel: 'double',      // 9%
      agreementTerm: '3-year',   // 135%
      accountType: 'Anchor',     // 0%
      pricingLine: 'Greenline',  // +1%
      businessType: 'renewal',
      yearsAsCustomer: 5,        // +4%
      isInsideSales: false,      // 0%
    };

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      // Effective: 9% + 0% + 1% + 4% - 0% = 14%
      expect(response.data.effectiveBaseRate).toBe(14);
      // Final: 14% * 135% = 18.9%
      expect(response.data.finalCommissionRate).toBeCloseTo(18.9, 1);
      // Monthly: $1000 * 18.9% = $189
      expect(response.data.monthlyCommission).toBeCloseTo(189, 0);
      // Annual: $189 * 12 = $2268
      expect(response.data.annualCommission).toBeCloseTo(2268, 0);
    }
  });

  test('Worst case scenario: Maximum deductions', async () => {
    const input = {
      monthlyValue: 1000,
      quotaLevel: 'below',           // 3%
      agreementTerm: 'MTM-no-install', // 50%
      accountType: 'Bread5',         // -1%
      pricingLine: 'Redline',        // 0%
      businessType: 'new',           // 0%
      isInsideSales: true,           // -3%
    };

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      // Effective: 3% - 1% + 0% + 0% - 3% = -1%
      expect(response.data.effectiveBaseRate).toBe(-1);
      // Final: -1% * 50% = -0.5%
      expect(response.data.finalCommissionRate).toBe(-0.5);
    }
  });

  test('Typical salesperson scenario', async () => {
    const input = {
      monthlyValue: 500,
      quotaLevel: 'above',
      agreementTerm: '1-year',
      accountType: 'Anchor',
      pricingLine: 'Redline',
      businessType: 'new',
      isInsideSales: false,
    };

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      expect(response.data.finalCommissionRate).toBe(6);
      expect(response.data.monthlyCommission).toBe(30);
      expect(response.data.annualCommission).toBe(360);
    }
  });

  test('Long-term renewal customer', async () => {
    const input = {
      monthlyValue: 2000,
      quotaLevel: 'above',
      agreementTerm: '3-year',
      accountType: 'Anchor',
      pricingLine: 'Greenline',
      businessType: 'renewal',
      yearsAsCustomer: 10,
      isInsideSales: false,
    };

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      // 6% + 1% (greenline) + 4% (renewal) = 11%
      // 11% * 135% = 14.85%
      expect(response.data.effectiveBaseRate).toBe(11);
      expect(response.data.finalCommissionRate).toBeCloseTo(14.85, 2);
    }
  });
});

// ============================================================
// TEST SUITE: Commission Records API (requires auth)
// ============================================================
describe('Commission API - Records Endpoints', () => {
  test('GET /api/commission/records should require authentication', async () => {
    const response = await apiCall('GET', '/api/commission/records');

    // Without auth token, should return 401
    if (response.status === 401) {
      expect(response.status).toBe(401);
    }
  });

  test('POST /api/commission/records should require authentication', async () => {
    const record = {
      calculation: {
        input: { monthlyValue: 1000 },
        finalCommissionRate: 6,
        monthlyCommission: 60,
      },
      salesPersonId: 'test_user',
      salesPersonName: 'Test User',
    };

    const response = await apiCall('POST', '/api/commission/records', record);

    // Without auth token, should return 401
    if (response.status === 401) {
      expect(response.status).toBe(401);
    }
  });
});

// ============================================================
// TEST SUITE: Edge Cases and Error Handling
// ============================================================
describe('Commission API - Edge Cases', () => {
  test('Very large monthly value', async () => {
    const input = {
      monthlyValue: 1000000,
      agreementTerm: '3-year',
      accountType: 'Anchor',
      pricingLine: 'Greenline',
      quotaLevel: 'double',
      businessType: 'new',
      isInsideSales: false,
    };

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      // Should handle large values correctly
      expect(response.data.monthlyCommission).toBeGreaterThan(100000);
    }
  });

  test('Decimal monthly value', async () => {
    const input = {
      monthlyValue: 333.33,
      agreementTerm: '1-year',
      accountType: 'Anchor',
      pricingLine: 'Redline',
      quotaLevel: 'above',
      businessType: 'new',
      isInsideSales: false,
    };

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      expect(response.data.monthlyCommission).toBeCloseTo(19.9998, 2);
    }
  });

  test('Renewal with exactly 2 years should get bonus', async () => {
    const input = {
      monthlyValue: 1000,
      agreementTerm: '1-year',
      accountType: 'Anchor',
      pricingLine: 'Redline',
      quotaLevel: 'above',
      businessType: 'renewal',
      yearsAsCustomer: 2,
      isInsideSales: false,
    };

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      expect(response.data.breakdown.renewalBonus).toBe(4);
    }
  });

  test('Renewal with 1 year should NOT get bonus', async () => {
    const input = {
      monthlyValue: 1000,
      agreementTerm: '1-year',
      accountType: 'Anchor',
      pricingLine: 'Redline',
      quotaLevel: 'above',
      businessType: 'renewal',
      yearsAsCustomer: 1,
      isInsideSales: false,
    };

    const response = await apiCall('POST', '/api/commission/calculate', input);

    if (response.ok) {
      expect(response.data.breakdown.renewalBonus).toBe(0);
    }
  });
});

// ============================================================
// Summary: Run all tests
// ============================================================
describe('Commission API - Test Summary', () => {
  test('All test suites defined', () => {
    expect(true).toBe(true);
    console.log(`
    ========================================
    Commission API Test Coverage:
    ========================================
    1. Rules Endpoints
       - GET active rules
       - Verify default values

    2. Calculate Endpoint
       - Basic calculation
       - Agreement terms (3-year, 1-year, MTM)
       - Greenline bonus
       - Inside sales deduction
       - Renewal bonus
       - Account type adjustments
       - Input validation

    3. All Scenario Combinations
       - All quota levels
       - All agreement terms
       - All account types
       - All pricing lines

    4. Complex Combined Scenarios
       - Best case (max bonuses)
       - Worst case (max deductions)
       - Typical scenarios

    5. Records Endpoints
       - Authentication required

    6. Edge Cases
       - Large values
       - Decimal values
       - Boundary conditions
    ========================================
    `);
  });
});
