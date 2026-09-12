import mongoose from "mongoose";
import {
  getBiConnection,
  isBiDbConfigured,
  getBiCollectionPrefix,
  getBiTenantCode,
} from "../../config/biDb.js";
import logger from "../../utils/logger.js";

const collectionFor = (name) => `${getBiCollectionPrefix()}${name}`;

let models = null;

function getBiModels() {
  if (models) return models;

  const conn = getBiConnection();
  const loose = (collection) =>
    new mongoose.Schema({}, { strict: false, collection, versionKey: false });

  models = {
    Tenant: conn.model("BiTenant", loose(collectionFor("tenants"))),
    Customer: conn.model("BiCustomer", loose(collectionFor("customers"))),
  };
  return models;
}

async function resolveTenantId() {
  const { Tenant } = getBiModels();
  const tenantCode = getBiTenantCode();
  const tenant = await Tenant.findOne({ tenantCode }).select("_id tenantCode").lean();

  if (!tenant) {
    const err = new Error(
      `BI tenant "${tenantCode}" was not found in ${collectionFor("tenants")}. Set BI_TENANT_CODE.`
    );
    err.code = "bi_tenant_not_found";
    throw err;
  }
  return tenant._id;
}

function buildPipeline(tenantId) {
  return [
    { $match: { tenantId } },
    { $sort: { _id: 1 } },
    {
      $lookup: {
        from: collectionFor("customerlocations"),
        let: { cid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$customerId", "$$cid"] },
              $or: [{ effectiveEnd: null }, { effectiveEnd: { $exists: false } }],
            },
          },
          {
            $addFields: {
              typeRank: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$locationType", "service"] }, then: 0 },
                    { case: { $eq: ["$locationType", "both"] }, then: 1 },
                  ],
                  default: 2,
                },
              },
            },
          },
          { $sort: { isActive: -1, typeRank: 1, updatedAt: -1 } },
          { $limit: 1 },
        ],
        as: "location",
      },
    },
    {
      $lookup: {
        from: collectionFor("customercontacts"),
        let: { cid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$cid"] } } },
          { $sort: { isPrimary: -1, updatedAt: -1 } },
          { $limit: 1 },
        ],
        as: "contact",
      },
    },
    {
      $addFields: {
        location: { $arrayElemAt: ["$location", 0] },
        contact: { $arrayElemAt: ["$contact", 0] },
      },
    },
  ];
}

const INACTIVE_STATUSES = new Set(["suspended", "stopped", "cancelled", "churned", "inactive"]);

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return undefined;
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

export function mapBiCustomer(doc) {
  const routeStarId = firstNonEmpty(doc.routeStarCustomerId);
  if (!routeStarId) return null;

  const name = firstNonEmpty(doc.customerName, doc.companyName);
  if (!name) return null;

  const location = doc.location || {};
  const contact = doc.contact || {};
  const status = String(doc.customerStatus || "").toLowerCase();
  const addressLines = Array.isArray(location.addressLines) ? location.addressLines : [];
  const address = addressLines
    .map((line) => (line === undefined || line === null ? "" : String(line).trim()))
    .filter((line) => line && line !== "(no address)")
    .join(", ");

  const city = firstNonEmpty(location.city);
  const postalCode = firstNonEmpty(location.postalCode);

  const mapped = {
    routeStarId,
    name,
    address: address || undefined,
    city: city === "UNKNOWN" ? undefined : city,
    state: firstNonEmpty(location.state),
    zipCode: postalCode === "00000" ? undefined : postalCode,
    phone: firstNonEmpty(contact.phone),
    email: firstNonEmpty(contact.email),
    company: firstNonEmpty(doc.companyName),
    isActive: !INACTIVE_STATUSES.has(status),
    status: firstNonEmpty(doc.sourceStatusText, doc.customerStatus),
    grouping: firstNonEmpty(doc.customerGrouping),
    zone: firstNonEmpty(location.zone),
    salesRep: firstNonEmpty(doc.salesRepresentative),
    customerType: firstNonEmpty(doc.customerCategory),
    terms: firstNonEmpty(doc.paymentTerms),
    taxCode: firstNonEmpty(doc.taxCode),
    taxRate: toNumber(doc.taxRate) ?? 0,
    balance: toNumber(doc.balance) ?? 0,
    detailUrl: firstNonEmpty(doc.source?.sourceUrl),
    createdInRouteStar: toDate(doc.source?.sourceCreatedAt),
    lastSyncedAt: new Date(),
  };

  const accountNumber = firstNonEmpty(doc.routeStarAccountNumber);
  if (accountNumber) {
    mapped.accountNumber = accountNumber;
    mapped.account = accountNumber;
    mapped.accountNumberFetchedAt = toDate(doc.source?.lastSyncedAt) ?? new Date();
  }

  for (const key of Object.keys(mapped)) {
    if (mapped[key] === undefined) delete mapped[key];
  }

  return mapped;
}

export async function countBiCustomers() {
  const { Customer } = getBiModels();
  const tenantId = await resolveTenantId();
  return Customer.countDocuments({ tenantId });
}

export async function streamBiCustomers(onBatch, { batchSize = 500 } = {}) {
  const { Customer } = getBiModels();
  const tenantId = await resolveTenantId();
  const total = await Customer.countDocuments({ tenantId });

  let read = 0;
  let mapped = 0;
  let skipped = 0;
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    await onBatch(batch, { read, total });
    batch = [];
  };

  const cursor = Customer.aggregate(buildPipeline(tenantId))
    .allowDiskUse(true)
    .cursor({ batchSize });

  for await (const doc of cursor) {
    read++;
    const row = mapBiCustomer(doc);
    if (!row) {
      skipped++;
      continue;
    }
    mapped++;
    batch.push(row);
    if (batch.length >= batchSize) await flush();
  }

  await flush();

  if (skipped > 0) {
    logger.warn(`[BiCustomers] Skipped ${skipped} BI customer(s) with no RouteStar id or name`);
  }

  return { total, read, mapped, skipped };
}

export { isBiDbConfigured };

export default {
  mapBiCustomer,
  countBiCustomers,
  streamBiCustomers,
  isBiDbConfigured,
};
