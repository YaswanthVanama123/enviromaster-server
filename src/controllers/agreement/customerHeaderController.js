/**
 * Customer Header Controller
 * Handles customer header document CRUD operations
 */

import mongoose from "mongoose";
import { compileCustomerHeader } from "../../services/pdfService.js";
import { CustomerHeaderDoc } from "../../models/agreement/index.js";
import { ZohoMapping } from "../../models/sync/index.js";
import { recalcCommissionForAgreementById } from "../../services/commissionAutomation.js";

export async function compileAndStoreCustomerHeader(req, res) {
  try {
    const body = req.body || {};
    let status = body.status || "draft";
    const isDraft = status === "draft";

    const payload = {
      headerTitle: body.headerTitle || "",
      headerRows: body.headerRows || [],
      products: body.products || {},
      services: body.services || {},
      agreement: body.agreement || {},
      serviceAgreement: body.serviceAgreement || null,
      summary: body.summary || null,
      includeProductsTable: body.includeProductsTable !== false,
      commission: body.commission || null,
    };

    let zohoData = {
      bigin: { dealId: null, fileId: null, url: null },
      crm: { dealId: null, fileId: null, url: null },
    };

    if (!isDraft) {
      console.log("📄 Non-draft mode: Agreement will be created, PDF will go to VersionPdf collection");
      console.log("💾 No immediate PDF compilation - PDF will be stored in VersionPdf collection");
    }

    const doc = await CustomerHeaderDoc.create({
      payload,
      pdf_meta: {
        sizeBytes: 0,
        contentType: "application/pdf",
        storedAt: null,
        pdfBuffer: null,
        externalUrl: null,
      },
      status,
      createdBy: req.user?.username || req.admin?.username || req.admin?.id || null,
      updatedBy: req.user?.username || req.admin?.username || req.admin?.id || null,
      zoho: zohoData,
    });

    console.log(`✅ Agreement document created: ${doc._id} (PDF will be stored in VersionPdf collection)`);

    res.setHeader("X-CustomerHeaderDoc-Id", doc._id.toString());
    return res.status(201).json({
      success: true,
      _id: doc._id.toString(),
      status: doc.status,
      createdAt: doc.createdAt,
      message: isDraft ? "Draft saved successfully" : "Agreement created successfully - PDF will be generated in version system"
    });
  } catch (err) {
    console.error("compileAndStoreCustomerHeader error:", err);

    const isMongoConnectionError = mongoose.connection.readyState === 0 ||
                                   err?.message?.includes('MongoDB') ||
                                   err?.message?.includes('mongoose') ||
                                   err?.message?.includes('Connection') ||
                                   err?.name === 'MongooseError';

    if (isMongoConnectionError) {
      console.log("⚠️ [TESTING MODE] MongoDB not connected - generating mock response for frontend testing");

      const mockDocId = new mongoose.Types.ObjectId().toString();
      res.setHeader("X-CustomerHeaderDoc-Id", mockDocId);

      const testStatus = req.body?.status || "draft";
      const isDraft = testStatus === "draft";

      if (isDraft) {
        return res.status(201).json({
          success: true,
          _id: mockDocId,
          status: "draft",
          createdAt: new Date().toISOString(),
          message: "Draft saved successfully",
          testing: true
        });
      } else {
        return res.status(201).json({
          success: true,
          _id: mockDocId,
          status: testStatus,
          createdAt: new Date().toISOString(),
          message: "Agreement created successfully - PDF will be generated in version system",
          testing: true
        });
      }
    }
    res.status(500).json({
      success: false,
      error: "Failed to save document",
      detail: err?.detail || err?.message || String(err),
    });
  }
}

export async function getCustomerHeaders(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    if (mongoose.connection.readyState === 0) {
      return res.json({ total: 0, page, limit, items: [] });
    }

    const filter = {};
    const total = await CustomerHeaderDoc.countDocuments(filter);
    const items = await CustomerHeaderDoc.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ total, page, limit, items });
  } catch (err) {
    console.error("getCustomerHeaders error:", err);

    if (err.message.includes('buffering timed out')) {
      console.log('⚠️ Database timeout, returning empty list for PDF testing');
      return res.json({ total: 0, page: 1, limit: 20, items: [] });
    }

    res.status(500).json({ error: "Failed to fetch docs", detail: String(err) });
  }
}

export async function getCustomerHeaderById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "bad_request", detail: "Invalid id" });
    }

    if (mongoose.connection.readyState === 0) {
      return res.json({
        _id: id,
        payload: {
          headerTitle: "Sample Document",
          headerRows: [],
          products: { products: [], dispensers: [] },
          services: {},
          agreement: {}
        },
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const doc = await CustomerHeaderDoc.findById(id)
      .select('-pdf_meta.pdfBuffer -attachedFiles -versions -zoho')
      .lean();
    if (!doc) {
      return res.status(404).json({ error: "not_found", detail: "Document not found" });
    }

    res.json(doc);
  } catch (err) {
    console.error("getCustomerHeaderById error:", err);

    if (err.message.includes('buffering timed out')) {
      console.log('⚠️ Database timeout, returning mock data for PDF testing');
      return res.json({
        _id: req.params.id,
        payload: {
          headerTitle: "Sample Document",
          headerRows: [],
          products: { products: [], dispensers: [] },
          services: {},
          agreement: {}
        },
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    res.status(500).json({ error: "server_error", detail: err?.message || String(err) });
  }
}

/**
 * Get customer header in edit format
 * Returns full document data for editing purposes
 */
export async function getCustomerHeaderForEdit(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "bad_request", detail: "Invalid id" });
    }

    // Fetch document and ZohoMapping in parallel
    const [doc, zohoMapping] = await Promise.all([
      CustomerHeaderDoc.findById(id)
        .select('-pdf_meta.pdfBuffer -versions')
        .lean(),
      ZohoMapping.findOne({ agreementId: id })
        .select('zohoCompany.id zohoCompany.name zohoDeal.id zohoDeal.name currentVersion lastUploadedAt')
        .lean()
    ]);

    if (!doc) {
      return res.status(404).json({ error: "not_found", detail: "Document not found" });
    }

    // Determine Bigin connection status
    const isConnectedToBigin = !!zohoMapping;
    const biginCompanyId = zohoMapping?.zohoCompany?.id || null;

    // Return document with payload expanded for editing
    res.json({
      _id: doc._id,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      // Spread payload fields for direct access in editor
      headerTitle: doc.payload?.headerTitle || "",
      headerRows: doc.payload?.headerRows || [],
      products: doc.payload?.products || { products: [], dispensers: [] },
      services: doc.payload?.services || {},
      agreement: doc.payload?.agreement || {},
      serviceAgreement: doc.payload?.serviceAgreement || null,
      summary: doc.payload?.summary || null,
      includeProductsTable: doc.payload?.includeProductsTable !== false,
      commission: doc.payload?.commission || null,
      // Include saved account type cache for commission calculations
      accountTypeCache: doc.payload?.accountTypeCache || null,
      zoho: doc.zoho || null,
      // Bigin connection status for commission calculations
      isConnectedToBigin,
      biginCompanyId,
      // Include full mapping details if connected
      zohoMapping: zohoMapping ? {
        companyId: zohoMapping.zohoCompany?.id,
        companyName: zohoMapping.zohoCompany?.name,
        dealId: zohoMapping.zohoDeal?.id,
        dealName: zohoMapping.zohoDeal?.name,
        currentVersion: zohoMapping.currentVersion,
        lastUploadedAt: zohoMapping.lastUploadedAt
      } : null,
    });

    if (
      (doc.isNewLocation === null || doc.isNewLocation === undefined) &&
      isConnectedToBigin
    ) {
      recalcCommissionForAgreementById(String(doc._id))
        .then((r) => {
          if (!r?.skipped) {
            console.log(`[COMMISSION-AUTO] edit-open backfill froze isNewLocation for agreement ${doc._id}`);
          }
        })
        .catch((err) => {
          console.error(`[COMMISSION-AUTO] edit-open backfill failed for ${doc._id}:`, err?.message);
        });
    }

    // Debug: Log if accountTypeCache exists
    if (doc.payload?.accountTypeCache) {
      console.log('[ACCOUNT-TYPE-LOAD] Returning saved accountTypeCache with keys:', Object.keys(doc.payload.accountTypeCache));
    } else {
      console.log('[ACCOUNT-TYPE-LOAD] No accountTypeCache in document');
    }
  } catch (err) {
    console.error("getCustomerHeaderForEdit error:", err);
    res.status(500).json({ error: "server_error", detail: err?.message || String(err) });
  }
}

/**
 * Save only accountTypeCache to an agreement (used after auto-detection)
 * PATCH /api/pdf/customer/:id/account-type-cache
 */
export async function saveAccountTypeCache(req, res) {
  try {
    const { id } = req.params;
    const { accountTypeCache } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "bad_request", detail: "Invalid id" });
    }

    // Use findByIdAndUpdate to avoid issues with partial document loading
    const result = await CustomerHeaderDoc.findByIdAndUpdate(
      id,
      { $set: { 'payload.accountTypeCache': accountTypeCache } },
      { new: true, select: 'payload.accountTypeCache' }
    );

    if (!result) {
      return res.status(404).json({ error: "not_found", detail: "Document not found" });
    }

    console.log('[ACCOUNT-TYPE-SAVE] Saved accountTypeCache to agreement:', id, 'keys:', accountTypeCache ? Object.keys(accountTypeCache) : 'null');

    res.json({ success: true });
  } catch (err) {
    console.error("saveAccountTypeCache error:", err);
    res.status(500).json({ error: "server_error", detail: err?.message || String(err) });
  }
}

export async function updateCustomerHeader(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const recompile = req.query.recompile === "true";

    const doc = await CustomerHeaderDoc.findById(id).select('-pdf_meta.pdfBuffer');
    if (!doc) {
      return res.status(404).json({ success: false, error: "Not found", detail: "CustomerHeaderDoc not found" });
    }

    const previousStatus = doc.status;
    const newStatus = body.status || doc.status;
    const statusChanged = previousStatus !== newStatus;
    const wasDraft = previousStatus === "draft";
    const isNowFinal = newStatus !== "draft";

    doc.payload ||= {};
    if (body.headerTitle !== undefined) doc.payload.headerTitle = body.headerTitle;
    if (body.headerRows !== undefined) doc.payload.headerRows = body.headerRows;
    if (body.products !== undefined) doc.payload.products = body.products;
    if (body.services !== undefined) doc.payload.services = body.services;
    if (body.agreement !== undefined) doc.payload.agreement = body.agreement;
    if (body.customColumns !== undefined) doc.payload.customColumns = body.customColumns;
    if (body.serviceAgreement !== undefined) doc.payload.serviceAgreement = body.serviceAgreement;
    if (body.summary !== undefined) doc.payload.summary = body.summary;
    if (body.includeProductsTable !== undefined) doc.payload.includeProductsTable = body.includeProductsTable;
    if (body.commission !== undefined) {
      doc.payload.commission = body.commission;
      doc.markModified('payload.commission');
      console.log('[COMMISSION-SAVE] Saving commission data:', {
        weeklyCommission: body.commission?.weeklyCommission,
        annualCommission: body.commission?.annualCommission,
        contractCommission: body.commission?.contractCommission,
        finalCommissionRate: body.commission?.finalCommissionRate,
        hasRulesSnapshot: !!body.commission?.rulesSnapshot,
      });
    }
    // Save account type cache for commission calculations
    if (body.accountTypeCache !== undefined) {
      doc.payload.accountTypeCache = body.accountTypeCache;
      console.log('[ACCOUNT-TYPE-SAVE] Saving accountTypeCache with keys:', body.accountTypeCache ? Object.keys(body.accountTypeCache) : 'null');
    }
    doc.status = newStatus;

    doc.zoho ||= { bigin: {}, crm: {} };
    if (body.zoho?.bigin) {
      doc.zoho.bigin = { ...doc.zoho.bigin, ...body.zoho.bigin };
    }
    if (body.zoho?.crm) {
      doc.zoho.crm = { ...doc.zoho.crm, ...body.zoho.crm };
    }

    doc.updatedBy = req.user?.username || req.admin?.username || doc.updatedBy;

    const shouldCompilePdf = recompile || (statusChanged && wasDraft && isNowFinal);

    let buffer = null;
    let filename = "customer-header.pdf";

    if (shouldCompilePdf) {
      console.log(`Compiling PDF for document ${id}...`);

      const productsData = body.products || doc.payload.products;

      const pdfResult = await compileCustomerHeader({
        headerTitle: doc.payload.headerTitle,
        headerRows: doc.payload.headerRows,
        products: productsData,
        services: body.services || doc.payload.services,
        agreement: doc.payload.agreement,
        customColumns: doc.payload.products?.customColumns || body.products?.customColumns || { products: [], dispensers: [] },
        serviceAgreement: body.serviceAgreement || doc.payload.serviceAgreement,
        summary: body.summary || doc.payload.summary,
        includeProductsTable: doc.payload.includeProductsTable !== false,
      });

      buffer = pdfResult.buffer;
      filename = pdfResult.filename || filename;

      doc.pdf_meta = {
        sizeBytes: buffer.length,
        contentType: "application/pdf",
        storedAt: new Date(),
        pdfBuffer: buffer,
        externalUrl: doc.pdf_meta?.externalUrl || null,
      };

      console.log(`✅ PDF updated in MongoDB: ${doc._id} (${buffer.length} bytes)`);
    }

    await doc.save();

    console.log(`Document ${id} updated, status: ${doc.status}, compiled: ${shouldCompilePdf}`);

    if (buffer) {
      console.log("✅ [UPDATE SUCCESS] Returning PDF response");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      return res.send(buffer);
    } else {
      return res.json({
        success: true,
        doc: {
          _id: doc._id,
          status: doc.status,
          updatedAt: doc.updatedAt
        }
      });
    }
  } catch (err) {
    console.error("updateCustomerHeader error:", err);
    if (err.detail) {
      console.error("📄 LaTeX Compilation Error Details:", err.detail);
    }
    res.status(500).json({
      success: false,
      error: "Failed to update document",
      detail: err?.message || String(err),
      latexError: err?.detail || undefined
    });
  }
}

export async function updateCustomerHeaderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "bad_request", detail: "Invalid id" });
    }

    const validStatuses = ["saved", "draft", "pending_approval", "approved_admin", "approved_salesman"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: "bad_request",
        detail: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    const doc = await CustomerHeaderDoc.findById(id).select('-pdf_meta.pdfBuffer');
    if (!doc) {
      return res.status(404).json({ error: "not_found", detail: "Document not found" });
    }

    doc.status = status;
    doc.updatedBy = req.user?.username || req.admin?.username || doc.updatedBy;
    await doc.save();

    res.json({
      success: true,
      doc: {
        _id: doc._id,
        status: doc.status,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (err) {
    console.error("updateCustomerHeaderStatus error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update status",
      detail: err?.message || String(err),
    });
  }
}
