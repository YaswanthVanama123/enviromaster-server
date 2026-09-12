import mongoose from "mongoose";
import logger from "../utils/logger.js";

let connection = null;

export function isInventoryDbConfigured() {
  return Boolean(process.env.INVENTORY_MONGO_URI);
}

export function getInventoryConnection() {
  if (!isInventoryDbConfigured()) {
    const err = new Error(
      "INVENTORY_MONGO_URI is not configured. Set it to the inventory cluster before syncing customers."
    );
    err.code = "inventory_db_not_configured";
    throw err;
  }

  if (connection) return connection;

  connection = mongoose.createConnection(process.env.INVENTORY_MONGO_URI, {
    dbName: process.env.INVENTORY_MONGO_DB || "inventory_db",
    maxPoolSize: Number(process.env.INVENTORY_MONGO_MAX_POOL) || 5,
    minPoolSize: 0,
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
    maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_TIME_MS) || 60000,
  });

  connection.on("connected", () =>
    logger.info(
      `Inventory MongoDB connected (database: ${process.env.INVENTORY_MONGO_DB || "inventory_db"})`
    )
  );
  connection.on("error", (err) =>
    logger.error("Inventory MongoDB connection error:", err.message)
  );

  return connection;
}

export async function closeInventoryConnection() {
  if (!connection) return;
  await connection.close();
  connection = null;
}

export default { getInventoryConnection, isInventoryDbConfigured, closeInventoryConnection };
