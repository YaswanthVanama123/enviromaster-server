/**
 * Bigin Company Controller
 * Handles fetching and managing company data from Zoho Bigin using REST API
 */

import { BiginCompany } from "../../models/customer/index.js";
import { v4 as uuidv4 } from "uuid";

// Track fetch status in memory
let fetchStatus = {
  isRunning: false,
  lastFetchAt: null,
  lastFetchResult: null,
  progress: 0,
  message: "",
  currentSessionId: null,
};

/**
 * Get all companies with pagination and filters
 */
export const getAllCompanies = async (req, res) => {
  try {
    const {
      search,
      city,
      state,
      industry,
      owner,
      limit = 50,
      skip = 0,
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { companyName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
      ];
    }
    if (city) filter.city = { $regex: city, $options: "i" };
    if (state) filter.state = { $regex: state, $options: "i" };
    if (industry) filter.industry = { $regex: industry, $options: "i" };
    if (owner) filter.owner = { $regex: owner, $options: "i" };

    const total = await BiginCompany.countDocuments(filter);
    const companies = await BiginCompany.find(filter)
      .sort({ companyName: 1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: companies,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + companies.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch companies",
    });
  }
};

/**
 * Get company by ID
 */
export const getCompanyById = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await BiginCompany.findById(id);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    res.json({
      success: true,
      data: company,
    });
  } catch (error) {
    console.error("Error fetching company:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch company",
    });
  }
};

/**
 * Get fetch status
 */
export const getFetchStatus = async (req, res) => {
  try {
    const totalCompanies = await BiginCompany.countDocuments();
    const latestCompany = await BiginCompany.findOne().sort({ lastSyncedAt: -1 });

    res.json({
      success: true,
      data: {
        ...fetchStatus,
        totalCompanies,
        lastSyncedAt: latestCompany?.lastSyncedAt || null,
      },
    });
  } catch (error) {
    console.error("Error getting fetch status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get fetch status",
    });
  }
};

/**
 * Start company fetch from Bigin using REST API
 */
export const startFetch = async (req, res) => {
  try {
    if (fetchStatus.isRunning) {
      return res.status(400).json({
        success: false,
        error: "Fetch already in progress",
      });
    }

    const sessionId = uuidv4();

    // Set fetch status to running
    fetchStatus = {
      isRunning: true,
      lastFetchAt: fetchStatus.lastFetchAt,
      lastFetchResult: null,
      progress: 0,
      message: "Starting fetch...",
      currentSessionId: sessionId,
    };

    // Respond immediately
    res.json({
      success: true,
      message: "Fetch started",
      data: {
        sessionId,
        ...fetchStatus,
      },
    });

    // Run fetch in background (don't await)
    runFetchInBackground(sessionId);
  } catch (error) {
    console.error("Error starting fetch:", error);
    fetchStatus.isRunning = false;
    res.status(500).json({
      success: false,
      error: "Failed to start fetch",
    });
  }
};

/**
 * Run the fetch process in background using Bigin REST API
 */
async function runFetchInBackground(sessionId) {
  try {
    console.log("🚀 Starting Bigin company fetch via REST API...");

    fetchStatus.progress = 10;
    fetchStatus.message = "Connecting to Bigin API...";

    // Use the existing zohoService function to get all companies
    const result = await getAllBiginCompanies();

    if (!result.success) {
      throw new Error(result.error || "Failed to fetch companies from Bigin API");
    }

    const companies = result.companies || [];
    console.log(`📋 Fetched ${companies.length} companies from Bigin API`);

    fetchStatus.progress = 50;
    fetchStatus.message = `Saving ${companies.length} companies to database...`;

    // Save companies to database
    const savedCount = await saveCompaniesToDatabase(companies, sessionId);

    // Update final status
    fetchStatus.isRunning = false;
    fetchStatus.lastFetchAt = new Date();
    fetchStatus.lastFetchResult = "success";
    fetchStatus.progress = 100;
    fetchStatus.message = `Fetched ${companies.length} companies, saved/updated ${savedCount}`;
    fetchStatus.currentSessionId = null;

    console.log(`✅ Fetch completed: ${companies.length} companies from API, ${savedCount} saved/updated`);
  } catch (error) {
    console.error("❌ Fetch failed:", error);
    fetchStatus.isRunning = false;
    fetchStatus.lastFetchAt = new Date();
    fetchStatus.lastFetchResult = "failed";
    fetchStatus.progress = 0;
    fetchStatus.message = error.message || "Fetch failed";
    fetchStatus.currentSessionId = null;
  }
}

/**
 * Save companies to database (upsert)
 */
async function saveCompaniesToDatabase(companies, sessionId) {
  console.log(`💾 Saving ${companies.length} companies to database...`);

  let saved = 0;
  let updated = 0;

  for (const company of companies) {
    try {
      const companyData = {
        biginId: company.id || null,
        companyName: (company.name || "Unknown").trim(),
        phone: company.phone?.trim() || null,
        email: company.email?.trim() || null,
        website: company.website?.trim() || null,
        // The API returns 'address' field (mapped from Billing_Street)
        street: company.address?.trim() || company.street?.trim() || null,
        city: company.city?.trim() || null,
        state: company.state?.trim() || null,
        zipCode: company.zipCode?.trim() || null,
        country: company.country?.trim() || null,
        industry: company.industry?.trim() || null,
        owner: company.owner?.trim() || null,
        description: company.description?.trim() || null,
        rawData: company,
        lastSyncedAt: new Date(),
        syncSessionId: sessionId,
      };

      // Try to find existing company by biginId
      const existing = await BiginCompany.findOne({ biginId: companyData.biginId });

      if (existing) {
        // Update existing
        await BiginCompany.updateOne(
          { _id: existing._id },
          { $set: companyData }
        );
        updated++;
      } else {
        // Create new
        await BiginCompany.create(companyData);
        saved++;
      }
    } catch (err) {
      console.error(`Error saving company:`, err.message);
    }
  }

  console.log(`✅ Save complete: ${saved} new, ${updated} updated`);
  return saved + updated;
}

/**
 * Get company statistics
 */
export const getCompanyStats = async (req, res) => {
  try {
    const total = await BiginCompany.countDocuments();

    // Get unique cities
    const cities = await BiginCompany.distinct("city");

    // Get unique states
    const states = await BiginCompany.distinct("state");

    // Get unique industries
    const industries = await BiginCompany.distinct("industry");

    // Get unique owners
    const owners = await BiginCompany.distinct("owner");

    // Get city breakdown
    const cityBreakdown = await BiginCompany.aggregate([
      { $match: { city: { $nin: [null, ""] } } },
      { $group: { _id: "$city", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Get owner breakdown
    const ownerBreakdown = await BiginCompany.aggregate([
      { $match: { owner: { $nin: [null, ""] } } },
      { $group: { _id: "$owner", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      data: {
        total,
        uniqueCities: cities.filter(c => c).length,
        uniqueStates: states.filter(s => s).length,
        uniqueIndustries: industries.filter(i => i).length,
        uniqueOwners: owners.filter(o => o).length,
        cities: cities.filter(c => c).sort(),
        states: states.filter(s => s).sort(),
        industries: industries.filter(i => i).sort(),
        owners: owners.filter(o => o).sort(),
        cityBreakdown: cityBreakdown.map(c => ({
          city: c._id || "Unknown",
          count: c.count,
        })),
        ownerBreakdown: ownerBreakdown.map(o => ({
          owner: o._id || "Unknown",
          count: o.count,
        })),
      },
    });
  } catch (error) {
    console.error("Error getting company stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get company stats",
    });
  }
};

/**
 * Delete a company
 */
export const deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;

    const company = await BiginCompany.findByIdAndDelete(id);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    res.json({
      success: true,
      message: "Company deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting company:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete company",
    });
  }
};

/**
 * Update a company
 */
export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const company = await BiginCompany.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        error: "Company not found",
      });
    }

    res.json({
      success: true,
      data: company,
    });
  } catch (error) {
    console.error("Error updating company:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update company",
    });
  }
};
