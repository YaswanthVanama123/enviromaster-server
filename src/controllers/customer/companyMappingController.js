/**
 * Company Mapping Controller
 * Handles mapping between Bigin Companies and RouteStar Customers
 */

import { CompanyMapping, BiginCompany, RouteStarCustomer } from "../../models/customer/index.js";
import { recalcCommissionForCompany, getPriorLocationFarAnnual } from "../../services/commissionAutomation.js";

function triggerCommissionRecalc(biginId) {
  if (!biginId) return;
  Promise.resolve()
    .then(() => recalcCommissionForCompany(biginId))
    .then((summary) => {
      const updated = summary.results.filter((r) => !r.skipped).length;
      console.log(
        `[COMMISSION-AUTO] Recalculated ${updated}/${summary.agreementCount} agreement(s) for Bigin company ${biginId}`,
      );
    })
    .catch((err) => {
      console.error(`[COMMISSION-AUTO] Recalc failed for Bigin company ${biginId}:`, err?.message);
    });
}

/**
 * Get all company mappings with filters and pagination
 * Fetches directly from BiginCompany and joins with mapping data
 */
export const getAllMappings = async (req, res) => {
  try {
    const {
      search,
      status, // 'all', 'mapped', 'unmapped'
      limit = 50,
      skip = 0,
    } = req.query;

    // Build filter for BiginCompany
    const biginFilter = {};
    if (search) {
      biginFilter.$or = [
        { companyName: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    // Fetch all Bigin companies
    let biginCompanies = await BiginCompany.find(biginFilter)
      .sort({ companyName: 1 })
      .lean();

    // Fetch all existing mappings
    const existingMappings = await CompanyMapping.find({}).lean();
    const mappingsByBiginId = {};
    existingMappings.forEach(m => {
      mappingsByBiginId[m.biginId] = m;
    });

    // Combine Bigin companies with their mappings
    let combinedData = biginCompanies.map(company => {
      const mapping = mappingsByBiginId[company.biginId];
      return {
        _id: mapping?._id || company._id,
        biginCompanyId: company._id,
        biginId: company.biginId,
        biginCompanyName: company.companyName,
        biginPhone: company.phone,
        biginCity: company.city,
        biginState: company.state,
        routeStarCustomerId: mapping?.routeStarCustomerId || null,
        routeStarId: mapping?.routeStarId || null,
        routeStarCustomerName: mapping?.routeStarCustomerName || null,
        routeStarCompany: mapping?.routeStarCompany || null,
        routeStarCity: mapping?.routeStarCity || null,
        mappingStatus: mapping?.routeStarId ? "mapped" : "unmapped",
        mappedBy: mapping?.mappedBy || null,
        mappedAt: mapping?.mappedAt || null,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      };
    });

    // Filter by mapping status
    if (status === "mapped") {
      combinedData = combinedData.filter(item => item.mappingStatus === "mapped");
    } else if (status === "unmapped") {
      combinedData = combinedData.filter(item => item.mappingStatus === "unmapped");
    }

    // Apply pagination
    const total = combinedData.length;
    const paginatedData = combinedData.slice(parseInt(skip), parseInt(skip) + parseInt(limit));

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: parseInt(skip) + paginatedData.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching company mappings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch company mappings",
    });
  }
};

/**
 * Get mapping statistics
 */
export const getMappingStats = async (req, res) => {
  try {
    // Get total Bigin companies
    const total = await BiginCompany.countDocuments();

    // Get count of mapped (where mapping exists with routeStarId)
    const mapped = await CompanyMapping.countDocuments({
      routeStarId: { $ne: null, $exists: true }
    });

    // Unmapped is total minus mapped
    const unmapped = total - mapped;

    res.json({
      success: true,
      data: { total, mapped, unmapped },
    });
  } catch (error) {
    console.error("Error fetching mapping stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch mapping stats",
    });
  }
};

/**
 * Get a single mapping by ID
 */
export const getMappingById = async (req, res) => {
  try {
    const { id } = req.params;
    const mapping = await CompanyMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: "Mapping not found",
      });
    }

    res.json({
      success: true,
      data: mapping,
    });
  } catch (error) {
    console.error("Error fetching mapping:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch mapping",
    });
  }
};

/**
 * Get the RouteStar mapping status for a single Bigin company.
 * Used by the agreement form to decide whether commission/quota may be counted:
 * an agreement only counts once its Bigin company is mapped to a RouteStar customer.
 */
export const getMappingStatusByBigin = async (req, res) => {
  try {
    const { biginId } = req.params;
    const mapping = await CompanyMapping.findOne({ biginId }).lean();
    const isMapped = !!(mapping && mapping.routeStarId && mapping.mappingStatus === "mapped");
    const company = await BiginCompany.findOne({ biginId })
      .select("isExistingLocation locationTypeCheckedAt")
      .lean();
    res.json({
      success: true,
      data: {
        biginId,
        isMapped,
        routeStarId: mapping?.routeStarId || null,
        routeStarCustomerName: mapping?.routeStarCustomerName || null,
        isExistingLocation: !!company?.isExistingLocation,
        locationTypeChecked: !!company?.locationTypeCheckedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching mapping status:", error);
    res.status(500).json({ success: false, error: "Failed to fetch mapping status" });
  }
};

/**
 * Prior same-location far (>15 min) revenue for a company, split by pricing line.
 * Used by the live form to show the prior per-visit total in the Pit/Anchor breakdown.
 */
export const getPriorFarByBigin = async (req, res) => {
  try {
    const { biginId } = req.params;
    const { excludeAgreementId } = req.query;
    const prior = await getPriorLocationFarAnnual(biginId, excludeAgreementId || null);
    res.json({ success: true, data: prior });
  } catch (error) {
    console.error("Error fetching prior far revenue:", error);
    res.status(500).json({ success: false, error: "Failed to fetch prior far revenue" });
  }
};

/**
 * Create or update a mapping
 */
export const saveMapping = async (req, res) => {
  try {
    const { biginId, routeStarId, mappedBy = "admin" } = req.body;

    if (!biginId) {
      return res.status(400).json({
        success: false,
        error: "biginId is required",
      });
    }

    // Find the mapping record or create one if it doesn't exist
    let mapping = await CompanyMapping.findByBiginId(biginId);

    if (!mapping) {
      // Find the Bigin company to get its details
      const biginCompany = await BiginCompany.findOne({ biginId });

      if (!biginCompany) {
        return res.status(404).json({
          success: false,
          error: "Bigin company not found",
        });
      }

      // Create a new mapping record
      mapping = new CompanyMapping({
        biginCompanyId: biginCompany._id,
        biginId: biginCompany.biginId,
        biginCompanyName: biginCompany.companyName,
        biginPhone: biginCompany.phone,
        biginCity: biginCompany.city,
        biginState: biginCompany.state,
        mappingStatus: "unmapped",
      });
      await mapping.save();
    }

    // If routeStarId is provided, set the mapping
    if (routeStarId) {
      // Find the RouteStar customer
      const routeStarCustomer = await RouteStarCustomer.findOne({ routeStarId });

      if (!routeStarCustomer) {
        return res.status(404).json({
          success: false,
          error: "RouteStar customer not found",
        });
      }

      // Check if this RouteStar customer is already mapped to another Bigin company
      const existingMapping = await CompanyMapping.findOne({
        routeStarId,
        biginId: { $ne: biginId },
      });

      if (existingMapping) {
        return res.status(400).json({
          success: false,
          error: `This RouteStar customer is already mapped to ${existingMapping.biginCompanyName}`,
        });
      }

      await mapping.setMapping(routeStarCustomer, mappedBy);
    } else {
      // Clear the mapping
      await mapping.clearMapping(mappedBy);
    }

    res.json({
      success: true,
      data: mapping,
      message: routeStarId ? "Mapping created successfully" : "Mapping cleared successfully",
    });

    if (routeStarId) triggerCommissionRecalc(biginId);
  } catch (error) {
    console.error("Error saving mapping:", error);
    res.status(500).json({
      success: false,
      error: "Failed to save mapping",
    });
  }
};

/**
 * Update an existing mapping by ID
 */
export const updateMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const { routeStarId, mappedBy = "admin" } = req.body;

    const mapping = await CompanyMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: "Mapping not found",
      });
    }

    if (routeStarId) {
      const routeStarCustomer = await RouteStarCustomer.findOne({ routeStarId });

      if (!routeStarCustomer) {
        return res.status(404).json({
          success: false,
          error: "RouteStar customer not found",
        });
      }

      // Check if already mapped to another company
      const existingMapping = await CompanyMapping.findOne({
        routeStarId,
        _id: { $ne: id },
      });

      if (existingMapping) {
        return res.status(400).json({
          success: false,
          error: `This RouteStar customer is already mapped to ${existingMapping.biginCompanyName}`,
        });
      }

      await mapping.setMapping(routeStarCustomer, mappedBy);
    } else {
      await mapping.clearMapping(mappedBy);
    }

    res.json({
      success: true,
      data: mapping,
    });

    if (routeStarId) triggerCommissionRecalc(mapping.biginId);
  } catch (error) {
    console.error("Error updating mapping:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update mapping",
    });
  }
};

/**
 * Delete/clear a mapping
 */
export const deleteMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const { unmappedBy = "admin" } = req.body;

    const mapping = await CompanyMapping.findById(id);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: "Mapping not found",
      });
    }

    await mapping.clearMapping(unmappedBy);

    res.json({
      success: true,
      message: "Mapping cleared successfully",
    });
  } catch (error) {
    console.error("Error deleting mapping:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete mapping",
    });
  }
};

/**
 * Bulk save mappings
 */
export const bulkSaveMapping = async (req, res) => {
  try {
    const { mappings, mappedBy = "admin" } = req.body;

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return res.status(400).json({
        success: false,
        error: "mappings array is required",
      });
    }

    let saved = 0;
    let errors = [];

    for (const item of mappings) {
      try {
        let mapping = await CompanyMapping.findByBiginId(item.biginId);

        // Create mapping record if it doesn't exist
        if (!mapping) {
          const biginCompany = await BiginCompany.findOne({ biginId: item.biginId });

          if (!biginCompany) {
            errors.push({ biginId: item.biginId, error: "Bigin company not found" });
            continue;
          }

          mapping = new CompanyMapping({
            biginCompanyId: biginCompany._id,
            biginId: biginCompany.biginId,
            biginCompanyName: biginCompany.companyName,
            biginPhone: biginCompany.phone,
            biginCity: biginCompany.city,
            biginState: biginCompany.state,
            mappingStatus: "unmapped",
          });
          await mapping.save();
        }

        if (item.routeStarId) {
          const routeStarCustomer = await RouteStarCustomer.findOne({
            routeStarId: item.routeStarId,
          });

          if (!routeStarCustomer) {
            errors.push({
              biginId: item.biginId,
              error: "RouteStar customer not found",
            });
            continue;
          }

          // Check for duplicate mapping
          const existingMapping = await CompanyMapping.findOne({
            routeStarId: item.routeStarId,
            biginId: { $ne: item.biginId },
          });

          if (existingMapping) {
            errors.push({
              biginId: item.biginId,
              error: `RouteStar customer already mapped to ${existingMapping.biginCompanyName}`,
            });
            continue;
          }

          await mapping.setMapping(routeStarCustomer, mappedBy);
        } else {
          await mapping.clearMapping(mappedBy);
        }

        saved++;
      } catch (err) {
        errors.push({ biginId: item.biginId, error: err.message });
      }
    }

    res.json({
      success: true,
      data: {
        total: mappings.length,
        saved,
        errors: errors.length,
        errorDetails: errors,
      },
    });
  } catch (error) {
    console.error("Error bulk saving mappings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to bulk save mappings",
    });
  }
};

/**
 * Initialize mapping records from Bigin companies
 * Creates unmapped records for all Bigin companies that don't have a mapping
 */
export const initializeMappings = async (req, res) => {
  try {
    const biginCompanies = await BiginCompany.find({});
    let created = 0;
    let skipped = 0;

    for (const company of biginCompanies) {
      // Check if mapping already exists
      const existing = await CompanyMapping.findOne({
        biginCompanyId: company._id,
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create new mapping record
      await CompanyMapping.create({
        biginCompanyId: company._id,
        biginId: company.biginId,
        biginCompanyName: company.companyName,
        biginPhone: company.phone,
        biginCity: company.city,
        biginState: company.state,
        mappingStatus: "unmapped",
      });

      created++;
    }

    res.json({
      success: true,
      data: {
        total: biginCompanies.length,
        created,
        skipped,
      },
      message: `Initialized ${created} new mapping records, skipped ${skipped} existing`,
    });
  } catch (error) {
    console.error("Error initializing mappings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to initialize mappings",
    });
  }
};

/**
 * Get available RouteStar customers (not yet mapped)
 */
export const getAvailableRouteStarCustomers = async (req, res) => {
  try {
    const { search, limit = 50, includeAll = "false" } = req.query;

    // Get all mapped RouteStar IDs
    const mappedRouteStarIds = await CompanyMapping.distinct("routeStarId", {
      mappingStatus: "mapped",
      routeStarId: { $ne: null },
    });

    const filter = {};

    // Exclude already mapped customers unless includeAll is true
    if (includeAll !== "true" && mappedRouteStarIds.length > 0) {
      filter.routeStarId = { $nin: mappedRouteStarIds };
    }

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
      ];
    }

    const customers = await RouteStarCustomer.find(filter)
      .sort({ name: 1 })
      .limit(parseInt(limit))
      .select("_id routeStarId name company city state phone isActive");

    res.json({
      success: true,
      data: customers,
    });
  } catch (error) {
    console.error("Error fetching available RouteStar customers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch available RouteStar customers",
    });
  }
};

/**
 * Sync mappings - update Bigin company info from BiginCompany collection
 */
export const syncMappings = async (req, res) => {
  try {
    const mappings = await CompanyMapping.find({});
    let updated = 0;

    for (const mapping of mappings) {
      const biginCompany = await BiginCompany.findById(mapping.biginCompanyId);

      if (biginCompany) {
        mapping.biginCompanyName = biginCompany.companyName;
        mapping.biginPhone = biginCompany.phone;
        mapping.biginCity = biginCompany.city;
        mapping.biginState = biginCompany.state;
        await mapping.save();
        updated++;
      }
    }

    res.json({
      success: true,
      data: { updated },
      message: `Synced ${updated} mapping records`,
    });
  } catch (error) {
    console.error("Error syncing mappings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to sync mappings",
    });
  }
};
