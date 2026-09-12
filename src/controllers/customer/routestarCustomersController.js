/**
 * RouteStar Customers Controller
 * Handles syncing and managing customers from RouteStar
 */

import { RouteStarCustomer } from "../../models/customer/index.js";
import { scrapeAccountNumbers } from "../../services/routestarScraper.js";
import {
  streamInventoryCustomers,
  isInventoryDbConfigured,
} from "../../services/sync/inventoryCustomersService.js";
import logger from "../../utils/logger.js";
import { acquireBrowserGate } from "../../utils/browserGate.js";
import { runAutoMapByAccountNumber } from "./companyMappingController.js";

const ACCOUNT_AUTOMATION_LABEL = "RouteStar account number sync";

// Track sync status in memory
let syncStatus = {
  isRunning: false,
  lastSyncAt: null,
  lastSyncResult: null,
  progress: 0,
  message: "",
};

let accountSyncStatus = {
  isRunning: false,
  lastSyncAt: null,
  lastSyncResult: null,
  progress: 0,
  message: "",
  total: 0,
  fetched: 0,
};

/**
 * Get all synced customers
 */
export const getAllCustomers = async (req, res) => {
  try {
    const { search, city, state, isActive, limit = 100, skip = 0 } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (city) filter.city = { $regex: city, $options: "i" };
    if (state) filter.state = state;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const total = await RouteStarCustomer.countDocuments(filter);
    const customers = await RouteStarCustomer.find(filter)
      .sort({ name: 1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: customers,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + customers.length < total,
      },
    });
  } catch (error) {
    logger.error("Error fetching customers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch customers",
    });
  }
};

/**
 * Get customer by ID
 */
export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await RouteStarCustomer.findOne({
      $or: [{ _id: id }, { routeStarId: id }],
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: "Customer not found",
      });
    }

    res.json({
      success: true,
      data: customer,
    });
  } catch (error) {
    logger.error("Error fetching customer:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch customer",
    });
  }
};

/**
 * Get sync status
 */
export const getSyncStatus = async (req, res) => {
  try {
    const totalCustomers = await RouteStarCustomer.countDocuments();

    res.json({
      success: true,
      data: {
        ...syncStatus,
        totalCustomers,
      },
    });
  } catch (error) {
    logger.error("Error getting sync status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get sync status",
    });
  }
};

/**
 * Start customer sync from RouteStar
 */
export const startSync = async (req, res) => {
  try {
    if (syncStatus.isRunning) {
      return res.status(400).json({
        success: false,
        error: "Sync already in progress",
      });
    }

    if (!isInventoryDbConfigured()) {
      return res.status(503).json({
        success: false,
        error:
          "INVENTORY_MONGO_URI is not configured. Customers are imported from the inventory database.",
      });
    }

    // Set sync status to running
    syncStatus = {
      isRunning: true,
      lastSyncAt: syncStatus.lastSyncAt,
      lastSyncResult: null,
      progress: 0,
      message: "Starting sync...",
    };

    // Respond immediately
    res.json({
      success: true,
      message: "Sync started",
      data: syncStatus,
    });

    // Run scraper in background (don't await)
    runSyncInBackground().catch((bgErr) => {
      logger.error("Background RouteStar sync crashed:", bgErr);
      syncStatus.isRunning = false;
      syncStatus.lastSyncResult = "failed";
      syncStatus.message = bgErr?.message || "Sync failed";
    });
  } catch (error) {
    logger.error("Error starting sync:", error);
    syncStatus.isRunning = false;
    res.status(500).json({
      success: false,
      error: "Failed to start sync",
    });
  }
};

/**
 * Run the sync process in background
 */
async function runSyncInBackground() {
  try {
    logger.debug("🚀 Starting RouteStar customer import from the inventory database...");

    syncStatus.progress = 5;
    syncStatus.message = "Reading customers from the inventory database...";

    let savedCount = 0;

    const stats = await streamInventoryCustomers(async (batch, { read, total }) => {
      savedCount += await saveCustomersToDatabase(batch);
      const pct = total > 0 ? Math.min(95, 5 + Math.floor((read / total) * 90)) : 50;
      syncStatus.progress = pct;
      syncStatus.message = `Imported ${read}/${total} customers from inventory...`;
    });

    let mappedCount = 0;
    try {
      const mapSummary = await runAutoMapByAccountNumber();
      mappedCount = mapSummary.mapped;
    } catch (mapErr) {
      logger.error("Auto-map by account number failed:", mapErr?.message || mapErr);
    }

    syncStatus.isRunning = false;
    syncStatus.lastSyncAt = new Date();
    syncStatus.lastSyncResult = syncStatus.lastSyncResult === "partial" ? "partial" : "success";
    syncStatus.progress = 100;
    syncStatus.message =
      `Imported ${stats.mapped} customers from inventory, saved/updated ${savedCount}` +
      (stats.skipped ? ` (${stats.skipped} skipped)` : "") +
      ` · auto-mapped ${mappedCount}`;

    logger.debug(
      `✅ Inventory customer import completed: read ${stats.read}, mapped ${stats.mapped}, saved ${savedCount}`
    );
  } catch (error) {
    logger.error("❌ Inventory customer import failed:", error);
    syncStatus.isRunning = false;
    syncStatus.lastSyncAt = new Date();
    syncStatus.lastSyncResult = "failed";
    syncStatus.progress = 0;
    syncStatus.message = error.message || "Import failed";
  }
}

/**
 * Save scraped customers to database
 */
async function saveCustomersToDatabase(customers) {
  if (!customers.length) return 0;

  logger.debug(`💾 Saving ${customers.length} customers to database...`);

  const operations = customers.map((customer) => ({
    updateOne: {
      filter: { routeStarId: customer.routeStarId },
      update: { $set: customer },
      upsert: true,
    },
  }));

  try {
    const result = await RouteStarCustomer.bulkWrite(operations, { ordered: false });
    const inserted = result.upsertedCount ?? 0;
    const updated = result.modifiedCount ?? 0;
    logger.debug(`✅ Save complete: ${inserted} new, ${updated} updated`);
    return inserted + updated;
  } catch (err) {
    const writeErrors = err?.writeErrors?.length ?? 0;
    const partial = err?.result?.nUpserted ?? 0;
    const partialModified = err?.result?.nModified ?? 0;
    logger.error(`Error saving customer batch (${writeErrors} write errors):`, err.message);
    syncStatus.lastSyncResult = "partial";
    return partial + partialModified;
  }
}

const ACCOUNT_MISSING_FILTER = {
  isActive: true,
  $or: [{ accountNumber: { $in: [null, ""] } }, { accountNumber: { $exists: false } }],
};

export const getAccountNumberSyncStatus = async (req, res) => {
  try {
    const remaining = await RouteStarCustomer.countDocuments(ACCOUNT_MISSING_FILTER);
    res.json({ success: true, data: { ...accountSyncStatus, remaining } });
  } catch (error) {
    logger.error("Error getting account number sync status:", error);
    res.status(500).json({ success: false, error: "Failed to get account number sync status" });
  }
};

export const startAccountNumberSync = async (req, res) => {
  try {
    if (accountSyncStatus.isRunning) {
      return res.status(400).json({ success: false, error: "Account number sync already in progress" });
    }

    const customers = await RouteStarCustomer.find(ACCOUNT_MISSING_FILTER)
      .select("routeStarId name")
      .lean();

    if (customers.length === 0) {
      return res.json({
        success: true,
        message: "All active customers already have account numbers",
        remaining: 0,
      });
    }

    accountSyncStatus = {
      isRunning: true,
      lastSyncAt: accountSyncStatus.lastSyncAt,
      lastSyncResult: null,
      progress: 0,
      message: "Starting account number sync...",
      total: customers.length,
      fetched: 0,
    };

    res.json({ success: true, message: "Account number sync started", total: customers.length });

    runAccountNumberSyncInBackground(customers).catch((bgErr) => {
      logger.error("Background account number sync crashed:", bgErr);
      accountSyncStatus.isRunning = false;
      accountSyncStatus.lastSyncResult = "failed";
      accountSyncStatus.message = bgErr?.message || "Account number sync failed";
    });
  } catch (error) {
    logger.error("Error starting account number sync:", error);
    accountSyncStatus.isRunning = false;
    res.status(500).json({ success: false, error: "Failed to start account number sync" });
  }
};

async function runAccountNumberSyncInBackground(customers) {
  let releaseGate;
  try {
    releaseGate = await acquireBrowserGate(ACCOUNT_AUTOMATION_LABEL, {
      onQueued: (activeLabel) => {
        accountSyncStatus.message = `Waiting for "${activeLabel}" to finish before starting...`;
      },
    });

    const onProgress = (progress, message) => {
      accountSyncStatus.progress = progress;
      accountSyncStatus.message = message;
    };

    const onBatch = async (batch) => {
      let saved = 0;
      for (const row of batch) {
        const update = { accountNumberFetchedAt: new Date() };
        if (row.accountNumber) {
          update.accountNumber = row.accountNumber;
          saved++;
        }
        await RouteStarCustomer.updateOne({ routeStarId: row.routeStarId }, { $set: update });
      }
      accountSyncStatus.fetched += saved;
      return saved;
    };

    const result = await scrapeAccountNumbers(customers, onProgress, onBatch);
    if (!result.success) {
      throw new Error(result.error || "Account number sync failed");
    }

    let mappedCount = 0;
    try {
      const mapSummary = await runAutoMapByAccountNumber();
      mappedCount = mapSummary.mapped;
    } catch (mapErr) {
      logger.error("Auto-map by account number failed:", mapErr?.message || mapErr);
    }

    accountSyncStatus.isRunning = false;
    accountSyncStatus.lastSyncAt = new Date();
    accountSyncStatus.lastSyncResult = "success";
    accountSyncStatus.progress = 100;
    accountSyncStatus.message = `Fetched ${accountSyncStatus.fetched}/${result.total} account numbers · auto-mapped ${mappedCount}`;
  } catch (error) {
    logger.error("❌ Account number sync failed:", error);
    accountSyncStatus.isRunning = false;
    accountSyncStatus.lastSyncAt = new Date();
    accountSyncStatus.lastSyncResult = "failed";
    accountSyncStatus.message = error.message || "Account number sync failed";
  } finally {
    releaseGate?.();
  }
}

export const fetchCustomerAccountNumber = async (req, res) => {
  try {
    const { id } = req.params;
    let customer = await RouteStarCustomer.findOne({ routeStarId: id });
    if (!customer) customer = await RouteStarCustomer.findById(id).catch(() => null);

    if (!customer) {
      return res.status(404).json({ success: false, error: "Customer not found" });
    }

    let releaseGate;
    try {
      releaseGate = await acquireBrowserGate(ACCOUNT_AUTOMATION_LABEL);
      const result = await scrapeAccountNumbers([{ routeStarId: customer.routeStarId }]);
      const row = (result.results && result.results[0]) || {};

      customer.accountNumberFetchedAt = new Date();
      if (row.accountNumber) customer.accountNumber = row.accountNumber;
      await customer.save();

      return res.json({
        success: true,
        data: {
          _id: customer._id,
          routeStarId: customer.routeStarId,
          accountNumber: customer.accountNumber || null,
        },
      });
    } finally {
      releaseGate?.();
    }
  } catch (error) {
    logger.error("Error fetching customer account number:", error);
    res.status(500).json({ success: false, error: "Failed to fetch account number" });
  }
};

/**
 * Get customer statistics
 */
export const getCustomerStats = async (req, res) => {
  try {
    const total = await RouteStarCustomer.countDocuments();
    const active = await RouteStarCustomer.countDocuments({ isActive: true });
    const inactive = await RouteStarCustomer.countDocuments({ isActive: false });

    // Get unique cities and states
    const cities = await RouteStarCustomer.distinct("city");
    const states = await RouteStarCustomer.distinct("state");

    // Get recent customers (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentCount = await RouteStarCustomer.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    res.json({
      success: true,
      data: {
        total,
        active,
        inactive,
        uniqueCities: cities.length,
        uniqueStates: states.length,
        recentlyAdded: recentCount,
        states: states.filter((s) => s).sort(),
      },
    });
  } catch (error) {
    logger.error("Error getting customer stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get customer stats",
    });
  }
};
