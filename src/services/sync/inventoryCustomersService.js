import mongoose from "mongoose";
import { getInventoryConnection, isInventoryDbConfigured } from "../../config/inventoryDb.js";
import logger from "../../utils/logger.js";

const INVENTORY_CUSTOMER_COLLECTION = "routestarcustomers";

let InventoryCustomerModel = null;

function getInventoryCustomerModel() {
  if (InventoryCustomerModel) return InventoryCustomerModel;

  const conn = getInventoryConnection();
  const schema = new mongoose.Schema({}, { strict: false, collection: INVENTORY_CUSTOMER_COLLECTION });
  InventoryCustomerModel = conn.model("InventoryRouteStarCustomer", schema);
  return InventoryCustomerModel;
}

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return undefined;
};

const joinAddress = (...parts) => {
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

export function mapInventoryCustomer(doc) {
  const routeStarId = firstNonEmpty(doc.customerId, doc.routeStarId, doc._id);
  if (!routeStarId) return null;

  const name = firstNonEmpty(
    doc.customerName,
    doc.company,
    joinAddress(doc.firstName, doc.lastName),
    doc.contact
  );
  if (!name) return null;

  const mapped = {
    routeStarId,
    name,
    address: joinAddress(doc.serviceAddress1, doc.serviceAddress2, doc.serviceAddress3)
      ?? joinAddress(doc.billingAddress1, doc.billingAddress2, doc.billingAddress3),
    city: firstNonEmpty(doc.serviceCity, doc.billingCity),
    state: firstNonEmpty(doc.serviceState, doc.billingState),
    zipCode: firstNonEmpty(doc.serviceZip, doc.billingZip),
    phone: firstNonEmpty(doc.phone, doc.altPhone, doc.mobilePhone),
    email: firstNonEmpty(doc.email, doc.ccEmail),
    company: firstNonEmpty(doc.company),
    isActive: doc.active !== false,
    isPaperless: doc.paperless === true,
    status: firstNonEmpty(doc.status),
    notifyBy: firstNonEmpty(doc.notificationMethod),
    proofOfService: toFlagLabel(doc.proofOfService),
    preferredPaymentMethod: firstNonEmpty(doc.preferredPaymentMethod),
    grouping: firstNonEmpty(doc.grouping),
    onRoute: firstNonEmpty(doc.onRoute),
    zone: firstNonEmpty(doc.zone),
    account: firstNonEmpty(doc.accountNumber, doc.account),
    salesRep: firstNonEmpty(doc.salesRep),
    customerType: firstNonEmpty(doc.customerType),
    balance: toNumber(doc.balance) ?? 0,
    taxCode: firstNonEmpty(doc.taxCode),
    taxRate: toNumber(doc.taxRate) ?? 0,
    terms: firstNonEmpty(doc.terms),
    priceLevel: firstNonEmpty(doc.priceLevel),
    creditLimit: toNumber(doc.creditLimit) ?? 0,
    priceGrouping: firstNonEmpty(doc.priceGrouping),
    createdInRouteStar: toDate(doc.createdInRouteStar ?? doc.createdDate),
    lastSyncedAt: new Date(),
  };

  const accountNumber = firstNonEmpty(doc.accountNumber);
  if (accountNumber) {
    mapped.accountNumber = accountNumber;
    mapped.accountNumberFetchedAt = toDate(doc.lastSyncDate) ?? new Date();
  }

  for (const key of Object.keys(mapped)) {
    if (mapped[key] === undefined) delete mapped[key];
  }

  return mapped;
}

export async function countInventoryCustomers() {
  const Model = getInventoryCustomerModel();
  return Model.countDocuments({});
}

export async function streamInventoryCustomers(onBatch, { batchSize = 500 } = {}) {
  const Model = getInventoryCustomerModel();
  const total = await Model.countDocuments({});

  let read = 0;
  let mapped = 0;
  let skipped = 0;

  const cursor = Model.find({}).sort({ _id: 1 }).lean().cursor({ batchSize });
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    await onBatch(batch, { read, total });
    batch = [];
  };

  for await (const doc of cursor) {
    read++;
    const row = mapInventoryCustomer(doc);
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
    logger.warn(
      `[InventoryCustomers] Skipped ${skipped} inventory customer(s) with no usable id or name`
    );
  }

  return { total, read, mapped, skipped };
}

export { isInventoryDbConfigured };

export default {
  mapInventoryCustomer,
  countInventoryCustomers,
  streamInventoryCustomers,
  isInventoryDbConfigured,
};
