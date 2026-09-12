import mongoose from "mongoose";
import {
  getBiConnection,
  isBiDbConfigured,
  getBiCollectionPrefix,
} from "../../config/biDb.js";
import logger from "../../utils/logger.js";

const SOURCE_CUSTOMERS = "routestarcustomers";
const SOURCE_ROUTES = "routestarcustomerroutes";
const biCollection = (name) => `${getBiCollectionPrefix()}${name}`;

let models = null;

function getBiModels() {
  if (models) return models;

  const conn = getBiConnection();
  const loose = (collection) =>
    new mongoose.Schema({}, { strict: false, collection, versionKey: false });

  models = {
    SourceCustomer: conn.model("BiSourceCustomer", loose(SOURCE_CUSTOMERS)),
    CustomerAccount: conn.model("BiCustomerAccount", loose(biCollection("customeraccounts"))),
  };
  return models;
}

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return undefined;
};

const joinParts = (...parts) => {
  const joined = parts
    .map((p) => (p === undefined || p === null ? "" : String(p).trim()))
    .filter(Boolean)
    .join(", ");
  return joined || undefined;
};

const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toDate = (value) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? undefined : parsed;
};

const toFlagLabel = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).trim() || undefined;
};

export function isChurnedName(name) {
  return /^zzz/i.test(String(name || "").trim());
}

export function mapBiCustomer(doc) {
  const account = Array.isArray(doc.account) ? doc.account[0] || {} : doc.account || {};
  const routes = Array.isArray(doc.routes) ? doc.routes : [];

  const routeStarId = firstNonEmpty(doc.customerId, account.customerId);
  if (!routeStarId) return null;

  const name = firstNonEmpty(
    doc.customerName,
    doc.company,
    doc.contact,
    account.customerName,
    account.company
  );
  if (!name) return null;

  const statusText = String(doc.status || "").toLowerCase();
  const isInactive =
    doc.active === false ||
    isChurnedName(name) ||
    ["cancel", "suspend", "stop", "churn", "inactiv"].some((token) => statusText.includes(token));

  const routeName = firstNonEmpty(
    ...routes.map((r) => r?.routeName),
    ...(Array.isArray(account.routes) ? account.routes.map((r) => r?.Route ?? r?.route) : []),
    doc.onRoute
  );

  const mapped = {
    routeStarId,
    name,
    address:
      joinParts(doc.serviceAddress1, doc.serviceAddress2, doc.serviceAddress3) ??
      joinParts(account.serviceAddress1, account.serviceAddress2, account.serviceAddress3) ??
      joinParts(doc.billingAddress1, doc.billingAddress2, doc.billingAddress3),
    city: firstNonEmpty(doc.serviceCity, account.serviceCity, doc.billingCity),
    state: firstNonEmpty(doc.serviceState, account.serviceState, doc.billingState),
    zipCode: firstNonEmpty(doc.serviceZip, account.serviceZip, doc.billingZip),
    phone: firstNonEmpty(doc.phone, doc.altPhone, doc.mobilePhone),
    email: firstNonEmpty(doc.email, doc.ccEmail),
    company: firstNonEmpty(doc.company, account.company),
    isActive: !isInactive,
    status: firstNonEmpty(doc.status),
    isPaperless: doc.paperless === true,
    notifyBy: firstNonEmpty(doc.notificationMethod),
    proofOfService: toFlagLabel(doc.proofOfService),
    preferredPaymentMethod: firstNonEmpty(doc.preferredPaymentMethod),
    grouping: firstNonEmpty(doc.grouping),
    onRoute: routeName,
    zone: firstNonEmpty(doc.zone, account.zone),
    salesRep: firstNonEmpty(doc.salesRep),
    customerType: firstNonEmpty(doc.customerType),
    terms: firstNonEmpty(doc.terms),
    taxCode: firstNonEmpty(doc.taxCode),
    taxRate: toNumber(doc.taxRate) ?? 0,
    balance: toNumber(doc.balance) ?? 0,
    priceLevel: firstNonEmpty(doc.priceLevel),
    priceGrouping: firstNonEmpty(doc.priceGrouping),
    creditLimit: toNumber(doc.creditLimit) ?? 0,
    detailUrl: firstNonEmpty(account.detailUrl, doc.detailUrl),
    createdInRouteStar: toDate(doc.createdDate ?? account.createdDate),
    lastSyncedAt: new Date(),
  };

  const accountNumber = firstNonEmpty(doc.accountNumber, account.accountNumber);
  if (accountNumber) {
    mapped.accountNumber = accountNumber;
    mapped.account = accountNumber;
    mapped.accountNumberFetchedAt = toDate(account.updatedAt ?? doc.lastSyncDate) ?? new Date();
  }

  for (const key of Object.keys(mapped)) {
    if (mapped[key] === undefined) delete mapped[key];
  }

  return mapped;
}

export async function countBiCustomers() {
  const { SourceCustomer } = getBiModels();
  return SourceCustomer.countDocuments({});
}

export async function streamBiCustomers(onBatch, { batchSize = 500 } = {}) {
  const { SourceCustomer, CustomerAccount } = getBiModels();

  const [sourceTotal, accountTotal] = await Promise.all([
    SourceCustomer.countDocuments({}),
    CustomerAccount.countDocuments({}),
  ]);
  const total = Math.max(sourceTotal, accountTotal);

  const seen = new Set();
  let read = 0;
  let mapped = 0;
  let skipped = 0;
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    await onBatch(batch, { read, total });
    batch = [];
  };

  const consume = async (doc) => {
    read++;
    const row = mapBiCustomer(doc);
    if (!row) {
      skipped++;
      return;
    }
    seen.add(row.routeStarId);
    mapped++;
    batch.push(row);
    if (batch.length >= batchSize) await flush();
  };

  const sourceCursor = SourceCustomer.aggregate([
    { $sort: { _id: 1 } },
    {
      $lookup: {
        from: biCollection("customeraccounts"),
        localField: "customerId",
        foreignField: "customerId",
        as: "account",
      },
    },
    {
      $lookup: {
        from: SOURCE_ROUTES,
        localField: "customerId",
        foreignField: "customerId",
        as: "routes",
      },
    },
  ])
    .allowDiskUse(true)
    .cursor({ batchSize });

  for await (const doc of sourceCursor) await consume(doc);
  await flush();

  let accountOnly = 0;
  const accountCursor = CustomerAccount.find({}).sort({ _id: 1 }).lean().cursor({ batchSize });

  for await (const acct of accountCursor) {
    const id = firstNonEmpty(acct.customerId);
    if (!id || seen.has(id)) continue;
    accountOnly++;
    await consume({ ...acct, account: [acct], routes: [] });
  }
  await flush();

  if (skipped > 0) {
    logger.warn(`[BiCustomers] Skipped ${skipped} customer(s) with no id or name`);
  }
  if (accountOnly > 0) {
    logger.info(
      `[BiCustomers] Included ${accountOnly} customer(s) present only in ${biCollection("customeraccounts")}`
    );
  }

  return { total, read, mapped, skipped, accountOnly, sourceTotal, accountTotal };
}

export { isBiDbConfigured };

export default {
  mapBiCustomer,
  countBiCustomers,
  streamBiCustomers,
  isBiDbConfigured,
};
