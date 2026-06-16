import {
  CustomerHeaderDoc,
  ZohoMapping,
  CommissionRules,
  Employee,
} from "#models";
import { CompanyMapping } from "#models/customer/index.js";
import {
  computeGlobalCommission,
  resolveCommissionRules,
} from "#shared/commission-engine/engine.mjs";

const QUOTA_COMMISSION_RATES = { below: 3, above: 6, double: 9 };
const DEFAULT_QUOTA_TARGET = 50000;

function calculateQuotaLevel(percentage) {
  if (percentage >= 200) return "double";
  if (percentage >= 100) return "above";
  return "below";
}

function quotaCreditFromPayload(payload) {
  const s = payload?.summary || {};
  if (typeof s.quotaCredit === "number" && s.quotaCredit > 0) {
    return s.quotaCredit;
  }
  return 0;
}

async function getActiveResolvedRules() {
  const dbRules = await CommissionRules.findOne({ isActive: true }).lean();
  return resolveCommissionRules(dbRules || null);
}

async function getQuotaContext(salesPersonUsername, excludeAgreementId) {
  let quotaTarget = DEFAULT_QUOTA_TARGET;
  let priorQuotaCredit = 0;

  if (salesPersonUsername) {
    const employee = await Employee.findOne({ username: salesPersonUsername }).lean();
    quotaTarget = employee?.quota?.monthlyTarget || DEFAULT_QUOTA_TARGET;

    const others = await CustomerHeaderDoc.find({
      createdBy: salesPersonUsername,
      isDeleted: { $ne: true },
      _id: { $ne: excludeAgreementId },
    })
      .select("payload.summary")
      .lean();

    for (const other of others) {
      priorQuotaCredit += quotaCreditFromPayload(other.payload);
    }
  }

  const percentage = quotaTarget > 0 ? (priorQuotaCredit / quotaTarget) * 100 : 0;
  const quotaLevel = calculateQuotaLevel(percentage);

  return { priorQuotaCredit, quotaLevel, quotaTarget };
}

function buildCommissionObject(global, opts) {
  const { baseRate, quotaLevel, rules, isNewLocation, priorQuotaCredit, contractMonths } = opts;
  const years = contractMonths > 0 ? contractMonths / 12 : 1;

  return {
    weeklyCommission: global.totalWeeklyCommission,
    annualCommission: global.totalAnnualCommission,
    contractCommission: global.totalAnnualCommission * years,
    finalCommissionRate: global.effectiveCommissionRate,
    rulesSnapshot: rules,
    isNewLocation,
    priorQuotaCredit,
    breakdown: {
      baseRate,
      agreementMultiplier: global.agreementMultiplier,
      quotaLevel,
    },
    input: { baseRate, quotaLevel },
    serviceBreakdown: global.services.map((s) => ({
      serviceName: s.serviceName,
      accountType: s.accountType,
      perVisitRevenue: s.perVisitRevenue,
      commissionableRevenue: s.commissionableRevenue,
      weeklyCommission: s.weeklyCommission,
      annualCommission: s.annualCommission,
    })),
  };
}

export async function computeCommissionForDoc(doc, deps = {}) {
  const payload =
    doc.payload && typeof doc.payload.toObject === "function"
      ? doc.payload.toObject()
      : doc.payload || {};
  const servicesState = payload.services || {};
  const accountTypeCache = payload.accountTypeCache || {};
  const contractMonths = Number(payload.summary?.contractMonths) || 12;
  const isNewLocation = payload.commission?.isNewLocation ?? true;

  const rules =
    payload.commission?.rulesSnapshot ||
    deps.activeRules ||
    (await getActiveResolvedRules());

  const { priorQuotaCredit, quotaLevel } = await getQuotaContext(
    doc.createdBy,
    doc._id,
  );
  const baseRate = QUOTA_COMMISSION_RATES[quotaLevel];

  const global = computeGlobalCommission(
    servicesState,
    accountTypeCache,
    contractMonths,
    baseRate,
    rules,
    priorQuotaCredit,
    isNewLocation,
  );

  if (!global.serviceCount) {
    return { commission: null, quotaCredit: 0, priorQuotaCredit, quotaLevel, global };
  }

  const commission = buildCommissionObject(global, {
    baseRate,
    quotaLevel,
    rules,
    isNewLocation,
    priorQuotaCredit,
    contractMonths,
  });

  return {
    commission,
    quotaCredit: Math.round((global.totalQuotaCredit || 0) * 100) / 100,
    priorQuotaCredit,
    quotaLevel,
    global,
  };
}

export async function recalcCommissionForDoc(doc, deps = {}) {
  const result = await computeCommissionForDoc(doc, deps);

  if (!result.commission) {
    return { agreementId: String(doc._id), skipped: true, reason: "no_active_services" };
  }

  doc.payload.commission = result.commission;
  if (!doc.payload.summary) doc.payload.summary = {};
  doc.payload.summary.quotaCredit = result.quotaCredit;
  doc.payload.summary.priorQuotaCredit = result.priorQuotaCredit;
  doc.markModified("payload");
  await doc.save();

  return {
    agreementId: String(doc._id),
    skipped: false,
    annualCommission: result.commission.annualCommission,
    finalCommissionRate: result.commission.finalCommissionRate,
    quotaCredit: result.quotaCredit,
    quotaLevel: result.quotaLevel,
  };
}

export async function recalcCommissionForCompany(biginCompanyId) {
  if (!biginCompanyId) {
    return { biginCompanyId, agreementCount: 0, results: [] };
  }

  const mappings = await ZohoMapping.find({ "zohoCompany.id": String(biginCompanyId) })
    .select("agreementId")
    .lean();

  const agreementIds = mappings.map((m) => m.agreementId).filter(Boolean);
  const activeRules = await getActiveResolvedRules();
  const results = [];

  for (const agreementId of agreementIds) {
    try {
      const doc = await CustomerHeaderDoc.findById(agreementId);
      if (!doc || doc.isDeleted) continue;
      results.push(await recalcCommissionForDoc(doc, { activeRules }));
    } catch (err) {
      results.push({ agreementId: String(agreementId), skipped: true, error: err?.message });
    }
  }

  return { biginCompanyId: String(biginCompanyId), agreementCount: agreementIds.length, results };
}

export async function isCompanyRouteStarMapped(biginId) {
  if (!biginId) return false;
  const mapping = await CompanyMapping.findOne({ biginId: String(biginId) }).lean();
  return !!(mapping && mapping.routeStarId && mapping.mappingStatus === "mapped");
}

export async function recalcCommissionForAgreement(agreementId, biginCompanyId) {
  if (!agreementId) {
    return { agreementId: null, skipped: true, reason: "no_agreement_id" };
  }
  const mapping = biginCompanyId
    ? await CompanyMapping.findOne({ biginId: String(biginCompanyId) }).lean()
    : null;
  const mapped = !!(mapping && mapping.routeStarId && mapping.mappingStatus === "mapped");
  console.log(
    `[COMMISSION-AUTO] agreement ${agreementId}: biginCompanyId=${biginCompanyId} companyMappingFound=${!!mapping} mappingStatus=${mapping?.mappingStatus || "none"} routeStarId=${mapping?.routeStarId || "none"} mapped=${mapped}`,
  );
  if (!mapped) {
    return { agreementId: String(agreementId), skipped: true, reason: "company_not_routestar_mapped" };
  }
  const doc = await CustomerHeaderDoc.findById(agreementId);
  if (!doc || doc.isDeleted) {
    return { agreementId: String(agreementId), skipped: true, reason: "not_found" };
  }
  return recalcCommissionForDoc(doc);
}

export async function recalcCommissionForAgreementById(agreementId) {
  if (!agreementId) {
    return { agreementId: null, skipped: true, reason: "no_agreement_id" };
  }
  const zoho = await ZohoMapping.findOne({ agreementId }).select("zohoCompany.id").lean();
  const companyId = zoho?.zohoCompany?.id || null;
  if (!companyId) {
    return { agreementId: String(agreementId), skipped: true, reason: "not_connected_to_bigin" };
  }
  return recalcCommissionForAgreement(agreementId, companyId);
}

export default {
  recalcCommissionForCompany,
  recalcCommissionForAgreement,
  recalcCommissionForAgreementById,
  recalcCommissionForDoc,
  computeCommissionForDoc,
  isCompanyRouteStarMapped,
};
