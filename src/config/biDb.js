import mongoose from "mongoose";
import logger from "../utils/logger.js";

let connection = null;

export function getBiCollectionPrefix() {
  return process.env.BI_COLLECTION_PREFIX ?? "bi_";
}

export function getBiTenantCode() {
  return process.env.BI_TENANT_CODE || "EM-NRV";
}

export function getBiDbName() {
  return process.env.BI_MONGO_DB || "inventory_db";
}

export function isBiDbConfigured() {
  return Boolean(process.env.BI_MONGO_URI);
}

export function getBiConnection() {
  if (!isBiDbConfigured()) {
    const err = new Error(
      "BI_MONGO_URI is not configured. Set it to the BI cluster before syncing customers."
    );
    err.code = "bi_db_not_configured";
    throw err;
  }

  if (connection) return connection;

  connection = mongoose.createConnection(process.env.BI_MONGO_URI, {
    dbName: getBiDbName(),
    maxPoolSize: Number(process.env.BI_MONGO_MAX_POOL) || 5,
    minPoolSize: 0,
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
    maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_TIME_MS) || 60000,
  });

  connection.on("connected", () =>
    logger.info(`BI MongoDB connected (database: ${getBiDbName()})`)
  );
  connection.on("error", (err) => logger.error("BI MongoDB connection error:", err.message));

  return connection;
}

export async function closeBiConnection() {
  if (!connection) return;
  await connection.close();
  connection = null;
}

export default {
  getBiConnection,
  isBiDbConfigured,
  closeBiConnection,
  getBiCollectionPrefix,
  getBiTenantCode,
  getBiDbName,
};
