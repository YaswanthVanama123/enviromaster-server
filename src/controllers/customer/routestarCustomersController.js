/**
 * RouteStar Customers Controller
 * Handles syncing and managing customers from RouteStar
 */

import { RouteStarCustomer } from "../../models/customer/index.js";
import { scrapeRouteStarCustomers } from "../../services/routestarScraper.js";
import logger from "../../utils/logger.js";
import { acquireBrowserGate } from "../../utils/browserGate.js";

const AUTOMATION_LABEL = "RouteStar customer sync";

// Track sync status in memory
let syncStatus = {
  isRunning: false,
  lastSyncAt: null,
  lastSyncResult: null,
  progress: 0,
  message: "",
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
  let releaseGate;
  try {
    releaseGate = await acquireBrowserGate(AUTOMATION_LABEL, {
      onQueued: (activeLabel) => {
        syncStatus.message = `Waiting for "${activeLabel}" to finish before starting...`;
      },
    });

    logger.debug("🚀 Starting RouteStar customer sync...");

    // Progress callback
    const onProgress = (progress, message) => {
      syncStatus.progress = progress;
      syncStatus.message = message;
    };

    // Stream each scraped page straight to MongoDB so RAM stays ~constant.
    const onBatch = (batch) => saveCustomersToDatabase(batch);

    // Run the scraper
    const result = await scrapeRouteStarCustomers(onProgress, onBatch);

    if (!result.success) {
      throw new Error(result.error || "Scrape failed");
    }

    const totalScraped = result.totalCount || 0;
    const savedCount = result.savedCount ?? 0;

    // Update final status
    syncStatus.isRunning = false;
    syncStatus.lastSyncAt = new Date();
    syncStatus.lastSyncResult = syncStatus.lastSyncResult === "partial" ? "partial" : "success";
    syncStatus.progress = 100;
    syncStatus.message = `Synced ${totalScraped} customers, saved/updated ${savedCount}`;

    logger.debug(`✅ Sync completed: ${totalScraped} customers, saved ${savedCount}`);
  } catch (error) {
    logger.error("❌ Sync failed:", error);
    syncStatus.isRunning = false;
    syncStatus.lastSyncAt = new Date();
    syncStatus.lastSyncResult = "failed";
    syncStatus.progress = 0;
    syncStatus.message = error.message || "Sync failed";
  } finally {
    releaseGate?.();
  }
}

/**
 * Save scraped customers to database
 */
async function saveCustomersToDatabase(customers) {
  logger.debug(`💾 Saving ${customers.length} customers to database...`);

  let saved = 0;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    try {
      // Parse date
      let createdDate = null;
      if (customer.createdInRouteStar) {
        const parsed = new Date(customer.createdInRouteStar);
        if (!isNaN(parsed.getTime())) {
          createdDate = parsed;
        }
      }

      const customerData = {
        routeStarId: customer.routeStarId,
        name: customer.name,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zipCode: customer.zipCode,
        phone: customer.phone,
        email: customer.email,
        company: customer.company,
        isActive: customer.isActive,
        isPaperless: customer.isPaperless,
        grouping: customer.grouping,
        onRoute: customer.onRoute,
        createdInRouteStar: createdDate,
        account: customer.account,
        salesRep: customer.salesRep,
        customerType: customer.customerType,
        balance: customer.balance || 0,
        detailUrl: customer.detailUrl,
        lastSyncedAt: new Date(),
      };

      const existing = await RouteStarCustomer.findOne({ routeStarId: customer.routeStarId });

      if (existing) {
        await RouteStarCustomer.updateOne({ routeStarId: customer.routeStarId }, customerData);
        updated++;
      } else {
        await RouteStarCustomer.create(customerData);
        saved++;
      }
    } catch (err) {
      logger.error(`Error saving customer ${customer.name}:`, err.message);
      errors++;
    }

    // Update progress (50-100%)
    const progress = 50 + Math.floor(((i + 1) / customers.length) * 50);
    syncStatus.progress = progress;
    syncStatus.message = `Saving customers... ${i + 1}/${customers.length}`;
  }

  logger.debug(`✅ Save complete: ${saved} new, ${updated} updated, ${errors} errors`);

  if (errors > 0) {
    syncStatus.lastSyncResult = "partial";
  }

  return saved + updated;
}

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
