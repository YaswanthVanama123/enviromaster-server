/**
 * Zoho Upload Controller
 * Handles all Zoho Bigin upload operations
 */

import mongoose from "mongoose";
import { ZohoMapping } from "../../models/sync/index.js";
import { CustomerHeaderDoc } from "../../models/agreement/index.js";
import {
  getAllBiginCompanies,
  searchBiginCompanies,
  createBiginCompany,
  getBiginDealsByCompany,
  createBiginTask,
  getBiginUsers,
  getBiginModules,
  getBiginPipelineStages,
  validatePipelineStage,
} from "../../services/zohoService.js";

/**
 * Get upload status for an agreement
 */
export async function getUploadStatus(req, res) {
  try {
    const { agreementId } = req.params;

    console.log(`🔍 Checking upload status for agreement: ${agreementId}`);

    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format",
      });
    }

    const [agreement, mapping] = await Promise.all([
      CustomerHeaderDoc.findById(agreementId)
        .select("_id payload.headerTitle status")
        .lean()
        .exec(),
      ZohoMapping.findOne({ agreementId })
        .select("zohoCompany.id zohoCompany.name zohoDeal.id zohoDeal.name currentVersion lastUploadedAt")
        .lean()
        .exec(),
    ]);

    if (!agreement) {
      console.error(`❌ CustomerHeaderDoc not found: ${agreementId}`);
      return res.status(404).json({
        success: false,
        error: "Agreement not found",
      });
    }

    console.log(`✅ Found CustomerHeaderDoc: ${agreement._id}`);

    if (mapping) {
      const nextVersion = (mapping.currentVersion || 0) + 1;

      console.log(`✅ Existing mapping - UPDATE mode (v${mapping.currentVersion} → v${nextVersion})`);

      return res.json({
        success: true,
        isFirstTime: false,
        mapping: {
          companyName: mapping.zohoCompany.name,
          companyId: mapping.zohoCompany.id,
          dealName: mapping.zohoDeal.name,
          dealId: mapping.zohoDeal.id,
          currentVersion: mapping.currentVersion,
          nextVersion: nextVersion,
          lastUploadedAt: mapping.lastUploadedAt,
        },
        agreement: {
          id: agreement._id,
          headerTitle: agreement.payload?.headerTitle || "Customer Agreement",
          status: agreement.status,
        },
      });
    } else {
      console.log(`🆕 No mapping - FIRST-TIME upload`);

      return res.json({
        success: true,
        isFirstTime: true,
        agreement: {
          id: agreement._id,
          headerTitle: agreement.payload?.headerTitle || "Customer Agreement",
          status: agreement.status,
        },
      });
    }
  } catch (error) {
    console.error("❌ Failed to check upload status:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get companies from Bigin
 */
export async function getCompanies(req, res) {
  try {
    const { search } = req.query;

    console.log(`📋 Fetching companies for selection (search: "${search || "none"}")`);

    let result;

    if (search && search.trim()) {
      result = await searchBiginCompanies(search.trim());
    } else {
      result = await getAllBiginCompanies();
    }

    if (result.success) {
      res.json({
        success: true,
        companies: result.companies,
        pagination: result.pagination || null,
        isSearch: !!search,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Failed to fetch companies:", error.message);

    if (error.message === "ZOHO_AUTH_REQUIRED") {
      return res.status(401).json({
        success: false,
        error: "Zoho integration not configured. Please contact administrator to set up Zoho Bigin access.",
      });
    }

    if (error.message?.includes("credentials") || error.message?.includes("token")) {
      return res.status(401).json({
        success: false,
        error: "Zoho authentication failed. Please contact administrator to reconfigure Zoho access.",
      });
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get Bigin users
 */
export async function getUsers(req, res) {
  try {
    console.log("👥 Fetching Bigin users");
    const result = await getBiginUsers();
    return res.json(result);
  } catch (error) {
    console.error("❌ Failed to fetch users:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Create a new company in Bigin
 */
export async function createCompany(req, res) {
  try {
    const { name, phone, email, website, address } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Company name is required",
      });
    }

    console.log(`🏢 Creating new company: ${name}`);

    const result = await createBiginCompany({
      name: name.trim(),
      phone: phone || "",
      email: email || "",
      website: website || "",
      address: address || "",
    });

    if (result.success) {
      console.log(`✅ Company created successfully: ${result.company.id}`);
      res.json({
        success: true,
        company: result.company,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Failed to create company:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get upload history for an agreement
 */
export async function getUploadHistory(req, res) {
  try {
    const { agreementId } = req.params;

    console.log(`📋 Fetching upload history for agreement: ${agreementId}`);

    const mapping = await ZohoMapping.findByAgreementId(agreementId);
    if (!mapping) {
      return res.json({
        success: true,
        hasHistory: false,
        message: "No Zoho upload history found for this agreement",
      });
    }

    res.json({
      success: true,
      hasHistory: true,
      company: {
        id: mapping.zohoCompany.id,
        name: mapping.zohoCompany.name,
      },
      deal: {
        id: mapping.zohoDeal.id,
        name: mapping.zohoDeal.name,
        pipelineName: mapping.zohoDeal.pipelineName,
        stage: mapping.zohoDeal.stage,
      },
      uploads: mapping.uploads.map((upload) => ({
        version: upload.version,
        fileName: upload.fileName,
        noteText: upload.noteText,
        uploadedAt: upload.uploadedAt,
        uploadedBy: upload.uploadedBy,
      })),
      totalVersions: mapping.uploads.length,
      currentVersion: mapping.currentVersion,
      lastUploadedAt: mapping.lastUploadedAt,
    });
  } catch (error) {
    console.error("❌ Failed to fetch upload history:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get Bigin modules
 */
export async function getModules(req, res) {
  try {
    console.log(`📋 Fetching Zoho Bigin modules...`);

    const result = await getBiginModules();

    if (result.success) {
      res.json({
        success: true,
        modules: result.modules,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Failed to fetch modules:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get pipeline options for a company
 */
export async function getPipelineOptionsForCompany(req, res) {
  try {
    const { companyId } = req.params;
    console.log(`📋 Fetching pipeline options for company: ${companyId}`);

    const result = await getBiginPipelineStages();

    if (result.success) {
      res.json({
        success: true,
        pipelines: result.pipelines,
        stages: result.stages,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Failed to fetch pipeline options:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get pipeline options
 */
export async function getPipelineOptions(req, res) {
  try {
    console.log(`📋 Fetching pipeline options...`);

    const result = await getBiginPipelineStages();

    if (result.success) {
      res.json({
        success: true,
        pipelines: result.pipelines,
        stages: result.stages,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Failed to fetch pipeline options:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Get deals for a company
 */
export async function getDealsForCompany(req, res) {
  try {
    const { companyId } = req.params;
    console.log(`📋 Fetching deals for company: ${companyId}`);

    const result = await getBiginDealsByCompany(companyId);

    if (result.success) {
      res.json({
        success: true,
        deals: result.deals,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Failed to fetch deals:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Validate deal fields
 */
export async function validateDealFields(req, res) {
  try {
    const { pipelineName, stage } = req.body;

    console.log(`🔍 Validating deal fields: pipeline="${pipelineName}", stage="${stage}"`);

    const result = await validatePipelineStage(pipelineName, stage);

    res.json(result);
  } catch (error) {
    console.error("❌ Failed to validate deal fields:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Cleanup failed uploads
 */
export async function cleanupFailed(req, res) {
  try {
    const { agreementId } = req.body;

    if (!agreementId) {
      return res.status(400).json({
        success: false,
        error: "Agreement ID is required",
      });
    }

    console.log(`🧹 Cleaning up failed mapping for agreement: ${agreementId}`);

    const mapping = await ZohoMapping.findOne({ agreementId, lastUploadStatus: "failed" });

    if (!mapping) {
      return res.json({
        success: true,
        message: "No failed mapping found to clean up",
      });
    }

    await ZohoMapping.findByIdAndDelete(mapping._id);

    console.log(`✅ Cleaned up failed mapping: ${mapping._id}`);

    res.json({
      success: true,
      message: "Failed mapping cleaned up successfully",
      deletedMappingId: mapping._id,
    });
  } catch (error) {
    console.error("❌ Failed to cleanup:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Create a task for an agreement
 */
export async function createTaskForAgreement(req, res) {
  try {
    const { agreementId } = req.params;
    const { subject, dueDate, priority, description, assignTo } = req.body;

    console.log(`📝 Creating task for agreement: ${agreementId}`);

    const mapping = await ZohoMapping.findByAgreementId(agreementId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: "No Zoho mapping found for this agreement",
      });
    }

    const result = await createBiginTask({
      dealId: mapping.zohoDeal.id,
      subject: subject || "Follow up on agreement",
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      priority: priority || "Normal",
      description: description || "",
      assignTo: assignTo || null,
    });

    if (result.success) {
      res.json({
        success: true,
        task: result.task,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Failed to create task:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Create task for a company
 */
export async function createTaskForCompany(req, res) {
  try {
    const { companyId } = req.params;
    const { subject, dueDate, priority, description, assignTo } = req.body;

    console.log(`📝 Creating task for company: ${companyId}`);

    const result = await createBiginTask({
      companyId,
      subject: subject || "Follow up",
      dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      priority: priority || "Normal",
      description: description || "",
      assignTo: assignTo || null,
    });

    if (result.success) {
      res.json({
        success: true,
        task: result.task,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Failed to create task:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Create auto-approval task
 */
export async function createAutoApprovalTask(req, res) {
  try {
    const { agreementId } = req.params;
    const { assignTo } = req.body;

    console.log(`📝 Creating auto-approval task for agreement: ${agreementId}`);

    const mapping = await ZohoMapping.findByAgreementId(agreementId);
    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: "No Zoho mapping found for this agreement",
      });
    }

    const result = await createBiginTask({
      dealId: mapping.zohoDeal.id,
      subject: "Review and approve agreement",
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      priority: "High",
      description: "Please review and approve the uploaded agreement documents.",
      assignTo: assignTo || null,
    });

    if (result.success) {
      res.json({
        success: true,
        task: result.task,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("❌ Failed to create auto-approval task:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
