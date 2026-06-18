import {
  CustomerHeaderDoc,
  ZohoMapping,
  CommissionRules,
  Employee,
} from "#models";
import { CompanyMapping, BiginCompany } from "#models/customer/index.js";
import { refreshLocationTypeForCompany } from "#services/sync/locationTypeService.js";
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
  const { baseRate, quotaLevel, rules, isNewLocation, priorQuotaCredit, contractMonths, priorFarRedline, priorFarGreenline } = opts;
  const years = contractMonths > 0 ? contractMonths / 12 : 1;

  return {
    weeklyCommission: global.totalWeeklyCommission,
    annualCommission: global.totalAnnualCommission,
    contractCommission: global.totalAnnualCommission * years,
    finalCommissionRate: global.effectiveCommissionRate,
    rulesSnapshot: rules,
    isNewLocation,
    priorQuotaCredit,
    farAnnual: global.totalFarAnnual,
    farAnnualRedline: global.totalFarAnnualRedline,
    farAnnualGreenline: global.totalFarAnnualGreenline,
    priorFarRedline: Number(priorFarRedline) || 0,
    priorFarGreenline: Number(priorFarGreenline) || 0,
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
  const isNewLocation =
    deps.isExistingLocation !== undefined
      ? !deps.isExistingLocation
      : doc.isNewLocation ?? payload.commission?.isNewLocation ?? true;
  const frozenPriorRedline = payload.commission?.priorFarRedline;
  const frozenPriorGreenline = payload.commission?.priorFarGreenline;
  const priorLocationFarAnnualRedline =
    frozenPriorRedline != null && frozenPriorRedline !== undefined
      ? Number(frozenPriorRedline) || 0
      : Number(deps.priorLocationFarAnnualRedline) || 0;
  const priorLocationFarAnnualGreenline =
    frozenPriorGreenline != null && frozenPriorGreenline !== undefined
      ? Number(frozenPriorGreenline) || 0
      : Number(deps.priorLocationFarAnnualGreenline) || 0;

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
    priorLocationFarAnnualRedline,
    priorLocationFarAnnualGreenline,
  );

  if (!global.serviceCount) {
    return { commission: null, quotaCredit: 0, priorQuotaCredit, quotaLevel, farAnnualRedline: global.totalFarAnnualRedline, farAnnualGreenline: global.totalFarAnnualGreenline, global };
  }

  const commission = buildCommissionObject(global, {
    baseRate,
    quotaLevel,
    rules,
    isNewLocation,
    priorQuotaCredit,
    contractMonths,
    priorFarRedline: priorLocationFarAnnualRedline,
    priorFarGreenline: priorLocationFarAnnualGreenline,
  });

  return {
    commission,
    quotaCredit: Math.round((global.totalQuotaCredit || 0) * 100) / 100,
    priorQuotaCredit,
    quotaLevel,
    farAnnualRedline: global.totalFarAnnualRedline,
    farAnnualGreenline: global.totalFarAnnualGreenline,
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
    farAnnualRedline: result.farAnnualRedline || 0,
    farAnnualGreenline: result.farAnnualGreenline || 0,
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

  const company = await BiginCompany.findOne({ biginId: String(biginCompanyId) })
    .select("isExistingLocation")
    .lean();
  const isExistingLocation = !!company?.isExistingLocation;

  const docs = (await CustomerHeaderDoc.find({ _id: { $in: agreementIds }, isDeleted: { $ne: true } }))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let farSumRedline = 0;
  let farSumGreenline = 0;
  const results = [];

  for (const doc of docs) {
    try {
      const docIsExisting =
        doc.isNewLocation === null || doc.isNewLocation === undefined
          ? isExistingLocation
          : !doc.isNewLocation;
      if (doc.isNewLocation === null || doc.isNewLocation === undefined) {
        doc.isNewLocation = !docIsExisting;
        doc.locationTypeCheckedAt = new Date();
      }
      const priorLocationFarAnnualRedline = docIsExisting ? farSumRedline : 0;
      const priorLocationFarAnnualGreenline = docIsExisting ? farSumGreenline : 0;
      const r = await recalcCommissionForDoc(doc, {
        activeRules,
        isExistingLocation: docIsExisting,
        priorLocationFarAnnualRedline,
        priorLocationFarAnnualGreenline,
      });
      farSumRedline += r.farAnnualRedline || 0;
      farSumGreenline += r.farAnnualGreenline || 0;
      results.push(r);
    } catch (err) {
      results.push({ agreementId: String(doc._id), skipped: true, error: err?.message });
    }
  }

  return { biginCompanyId: String(biginCompanyId), agreementCount: agreementIds.length, results };
}

export async function isCompanyRouteStarMapped(biginId) {
  if (!biginId) return false;
  const mapping = await CompanyMapping.findOne({ biginId: String(biginId) }).lean();
  return !!(mapping && mapping.routeStarId && mapping.mappingStatus === "mapped");
}

export async function getPriorLocationFarAnnual(biginCompanyId, excludeAgreementId) {
  if (!biginCompanyId) return { redline: 0, greenline: 0 };
  const mappings = await ZohoMapping.find({ "zohoCompany.id": String(biginCompanyId) })
    .select("agreementId")
    .lean();
  const ids = mappings
    .map((m) => m.agreementId)
    .filter((id) => id && String(id) !== String(excludeAgreementId));
  if (!ids.length) return { redline: 0, greenline: 0 };
  const docs = await CustomerHeaderDoc.find({
    _id: { $in: ids },
    isDeleted: { $ne: true },
  })
    .select("payload.commission.farAnnual payload.commission.farAnnualRedline payload.commission.farAnnualGreenline payload.commission.farIsGreenline")
    .lean();
  let redline = 0;
  let greenline = 0;
  for (const d of docs) {
    const c = d.payload?.commission || {};
    if (c.farAnnualRedline != null || c.farAnnualGreenline != null) {
      redline += Number(c.farAnnualRedline) || 0;
      greenline += Number(c.farAnnualGreenline) || 0;
    } else {
      const far = Number(c.farAnnual) || 0;
      if (c.farIsGreenline) greenline += far;
      else redline += far;
    }
  }
  return { redline, greenline };
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

  // Only hit the Bigin pipeline API to freeze isNewLocation the first time. Once
  // frozen it never changes, so skip the call on every subsequent save/recalc.
  if (doc.isNewLocation === null || doc.isNewLocation === undefined) {
    let ltResult = null;
    try {
      ltResult = await refreshLocationTypeForCompany(biginCompanyId);
    } catch (err) {
      console.error(`[COMMISSION-AUTO] location-type refresh failed for ${biginCompanyId}:`, err?.message);
    }
    let existing;
    if (ltResult && ltResult.success) {
      existing = ltResult.isExistingLocation;
    } else {
      const company = await BiginCompany.findOne({ biginId: String(biginCompanyId) })
        .select("isExistingLocation")
        .lean();
      existing = !!company?.isExistingLocation;
    }
    doc.isNewLocation = !existing;
    doc.locationTypeCheckedAt = new Date();
    console.log(`[COMMISSION-AUTO] agreement ${agreementId}: froze isNewLocation=${doc.isNewLocation} at link time`);
  }

  const isExistingLocation = !doc.isNewLocation;
  const prior = isExistingLocation
    ? await getPriorLocationFarAnnual(biginCompanyId, agreementId)
    : { redline: 0, greenline: 0 };

  return recalcCommissionForDoc(doc, {
    isExistingLocation,
    priorLocationFarAnnualRedline: prior.redline,
    priorLocationFarAnnualGreenline: prior.greenline,
  });
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
