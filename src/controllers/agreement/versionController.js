import mongoose from "mongoose";
import { VersionPdf, CustomerHeaderDoc } from "../../models/agreement/index.js";
import { compileCustomerHeader } from "../../services/pdfService.js";
import logger from "../../utils/logger.js";

export async function getAllVersionPdfs(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.agreementId) {
      filter.agreementId = req.query.agreementId;
    }

    if (req.query.versionNumber) {
      filter.versionNumber = parseInt(req.query.versionNumber, 10);
    }

    if (req.query.includeDeleted !== 'true') {
      filter.isDeleted = { $ne: true };
    }

    logger.debug(`📋 [VERSIONS] Fetching versions with filter:`, filter);

    const total = await VersionPdf.countDocuments(filter);

    const versions = await VersionPdf.find(filter)
      .populate({
        path: 'agreementId',
        select: 'payload.headerTitle status createdAt'
      })
      .select({
        _id: 1,
        agreementId: 1,
        versionNumber: 1,
        versionLabel: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        createdBy: 1,
        changeNotes: 1,
        fileName: 1,
        'pdf_meta.sizeBytes': 1,
        'pdf_meta.storedAt': 1,
        'zoho.bigin.dealId': 1,
        'zoho.bigin.fileId': 1,
        'zoho.crm.dealId': 1,
        'zoho.crm.fileId': 1,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    logger.debug(`📋 [VERSIONS] Found ${versions.length} versions (total: ${total})`);

    const transformedVersions = versions.map(version => ({
      id: version._id,
      agreementId: version.agreementId._id,
      agreementTitle: version.agreementId.payload?.headerTitle || 'Untitled Agreement',
      versionNumber: version.versionNumber,
      versionLabel: version.versionLabel,
      fileName: version.fileName,
      status: version.status,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      createdBy: version.createdBy,
      changeNotes: version.changeNotes,
      fileSize: version.pdf_meta?.sizeBytes || 0,
      pdfStoredAt: version.pdf_meta?.storedAt || null,
      hasPdf: !!version.pdf_meta?.sizeBytes,
      zohoInfo: {
        biginDealId: version.zoho?.bigin?.dealId || null,
        biginFileId: version.zoho?.bigin?.fileId || null,
        crmDealId: version.zoho?.crm?.dealId || null,
        crmFileId: version.zoho?.crm?.fileId || null,
      }
    }));

    res.json({
      success: true,
      data: transformedVersions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    logger.error("❌ Failed to fetch versions:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getVersionPdfById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(id)
      .populate({
        path: 'agreementId',
        select: 'payload.headerTitle status',
        options: { lean: true }
      })
      .select('-pdf_meta.pdfBuffer')
      .lean()
      .exec();

    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    logger.debug(`📄 [VERSION] Retrieved version ${version.versionNumber} for agreement ${version.agreementId._id}`);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      success: true,
      data: {
        id: version._id,
        agreementId: version.agreementId._id,
        agreementTitle: version.agreementId.payload?.headerTitle || 'Untitled Agreement',
        versionNumber: version.versionNumber,
        versionLabel: version.versionLabel,
        fileName: version.fileName,
        status: version.status,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        createdBy: version.createdBy,
        changeNotes: version.changeNotes,
        payloadSnapshot: version.payloadSnapshot,
        fileSize: version.pdf_meta?.sizeBytes || 0,
        pdfStoredAt: version.pdf_meta?.storedAt || null,
        hasPdf: !!version.pdf_meta,
        zohoInfo: {
          biginDealId: version.zoho?.bigin?.dealId || null,
          biginFileId: version.zoho?.bigin?.fileId || null,
          crmDealId: version.zoho?.crm?.dealId || null,
          crmFileId: version.zoho?.crm?.fileId || null,
        }
      }
    });

  } catch (error) {
    logger.error("❌ Failed to fetch version:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function updateVersionStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    logger.debug(`🔄 [VERSION-STATUS] Updating version ${id} status to: ${status}`);

    const validStatuses = ["draft", "saved", "pending_approval", "approved_salesman", "approved_admin"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "bad_request",
        detail: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('_id versionNumber status updatedAt').lean();

    if (!version) {
      logger.debug(`❌ [VERSION-STATUS] Version not found: ${id}`);
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    logger.debug(`✅ [VERSION-STATUS] Updated version ${version.versionNumber} status to ${status}`);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      success: true,
      message: `Version ${version.versionNumber} status updated to ${status}`,
      data: {
        id: version._id,
        versionNumber: version.versionNumber,
        status: version.status,
        updatedAt: version.updatedAt
      }
    });

  } catch (error) {
    logger.error("❌ [VERSION-STATUS] Failed to update version status:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function downloadVersionPdf(req, res) {
  try {
    const { id } = req.params;
    const { watermark = 'false' } = req.query;
    const applyWatermark = watermark === 'true' || watermark === true;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(id).populate('agreementId');
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    logger.debug(`📥 [VERSION-DOWNLOAD] Downloading version ${version.versionNumber}:`, {
      fileName: version.fileName,
      watermark: applyWatermark,
      hasStoredPdf: !!version.pdf_meta?.pdfBuffer
    });

    logger.debug(`🔄 [ON-DEMAND] Regenerating PDF on-demand with watermark=${applyWatermark}`);

    const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, {
      watermark: applyWatermark
    });

    if (!compiledPdf || !compiledPdf.buffer) {
      throw new Error("Failed to compile PDF");
    }

    const fileName = applyWatermark
      ? version.fileName.replace('.pdf', '_DRAFT.pdf')
      : version.fileName;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', compiledPdf.buffer.length);

    res.end(compiledPdf.buffer);
    logger.debug(`📥 [VERSION-DOWNLOAD] Downloaded version ${version.versionNumber}: ${fileName}`);

  } catch (error) {
    logger.error("❌ Failed to download version:", error.message);


    if (error.detail) {
      try {
        const errorDetail = typeof error.detail === 'string' ? JSON.parse(error.detail) : error.detail;
        logger.error("📄 LaTeX Compilation Error Details:", JSON.stringify(errorDetail, null, 2));
      } catch (parseErr) {
        logger.error("📄 LaTeX Compilation Error Details (raw):", error.detail);
      }
    }

    const errorResponse = {
      success: false,
      message: error.message || "Failed to download PDF",
      error: error.message || "Failed to download PDF",
      codeVersion: 'v3_2025_full_error_details',
      timestamp: new Date().toISOString(),

      errorType: error.errorType || 'UNKNOWN',
      errorName: error.errorName || error.name || 'Error',
      originalError: error.originalError,
      url: error.url,
      httpStatus: error.httpStatus,
      timeout: error.timeout,
      detail: error.detail,
      latexError: error.latexError,
      stack: error.stack
    };

    res.status(500).json(errorResponse);
  }
}

export async function deleteVersionPdf(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(id);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    version.isDeleted = true;
    version.deletedAt = new Date();
    await version.save();

    logger.debug(`🗑️ [VERSION-DELETE] Soft deleted version ${version.versionNumber}`);

    res.json({
      success: true,
      message: `Version ${version.versionNumber} deleted successfully`,
      data: {
        id: version._id,
        versionNumber: version.versionNumber,
        deletedAt: version.deletedAt
      }
    });

  } catch (error) {
    logger.error("❌ Failed to delete version:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function checkVersionStatus(req, res) {
  try {
    const { agreementId } = req.params;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    const agreement = await CustomerHeaderDoc.findById(agreementId)
      .select('_id payload.headerTitle status currentVersionNumber pdf_meta.sizeBytes')
      .lean();
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    const versionSelectFields = '_id versionNumber versionLabel createdAt createdBy status pdf_meta.sizeBytes';

    const versions = await VersionPdf.find({
      agreementId: agreementId,
      isDeleted: { $ne: true }
    })
    .select(versionSelectFields)
    .sort({ versionNumber: -1 })
    .lean();

    const deletedVersions = await VersionPdf.find({
      agreementId: agreementId,
      isDeleted: true
    })
    .select('_id versionNumber versionLabel deletedAt')
    .sort({ versionNumber: -1 })
    .lean();

    const allVersionsForCount = await VersionPdf.find({
      agreementId: agreementId
    })
    .select('versionNumber')
    .sort({ versionNumber: -1 })
    .limit(1)
    .lean();

    const highestVersionNumber = allVersionsForCount.length > 0 ? allVersionsForCount[0].versionNumber : 0;
    const nextVersionNumber = highestVersionNumber + 1;

    const totalVersions = versions.length;
    const latestVersion = versions[0];
    const hasMainPdf = agreement.pdf_meta?.sizeBytes > 0;
    const isFirstTime = totalVersions === 0 && !hasMainPdf;

    let suggestedAction = 'create_version';
    if (isFirstTime) {
      suggestedAction = 'auto_create_v1';
    } else if (totalVersions > 0 && latestVersion &&
               new Date() - new Date(latestVersion.createdAt) < 1000 * 60 * 10) {
      suggestedAction = 'suggest_replace';
    }

    const versionStatus = {
      success: true,
      isFirstTime,
      hasMainPdf,
      totalVersions,
      nextVersionNumber,
      latestVersionNumber: latestVersion?.versionNumber || 0,
      suggestedAction,
      canCreateVersion: true,
      canReplace: totalVersions > 0,
      versions: versions.map(v => ({
        id: v._id,
        versionNumber: v.versionNumber,
        status: v.status,
        createdAt: v.createdAt
      })),
      agreement: {
        id: agreement._id,
        headerTitle: agreement.payload?.headerTitle || 'Untitled Agreement',
        status: agreement.status
      }
    };

    logger.debug(`📋 [VERSION-STATUS] Agreement ${agreementId}: ${totalVersions} active versions, ${deletedVersions.length} deleted, next version: v${nextVersionNumber}, action: ${suggestedAction}`);

    res.json(versionStatus);

  } catch (error) {
    logger.error("❌ Failed to check version status:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function createVersion(req, res) {
  try {
    const { agreementId } = req.params;
    const { changeNotes, createdBy: bodyCreatedBy, replaceRecent, isFirstTime, watermark = false } = req.body || {};

    // The actual person generating this version (for edit history only).
    const generatedBy = bodyCreatedBy || req.user?.username || req.admin?.username || null;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    logger.debug(`📝 [VERSION-CREATE] Creating version for agreement ${agreementId}`, {
      watermark,
      replaceRecent,
      isFirstTime
    });

    const agreement = await CustomerHeaderDoc.findById(agreementId)
      .select('-pdf_meta.pdfBuffer -attachedFiles -zoho')
      .lean();
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    // Ownership ALWAYS belongs to the agreement's original creator, regardless of
    // who edits or generates new versions. Version-level createdBy must never
    // change attribution (commissions, quota, payroll all key off this).
    const createdBy = agreement.createdBy || generatedBy;

    const existingVersions = await VersionPdf.find({
      agreementId: agreementId,
      isDeleted: { $ne: true }
    })
    .select('_id versionNumber createdAt status')
    .sort({ versionNumber: -1 })
    .lean();

    const allVersions = await VersionPdf.find({
      agreementId: agreementId
    })
    .select('versionNumber')
    .sort({ versionNumber: -1 })
    .limit(1)
    .lean();

    const highestVersionNumber = allVersions.length > 0 ? allVersions[0].versionNumber : 0;

    const totalVersions = existingVersions.length;
    const latestVersion = existingVersions[0];

    let versionNumber = 1;

    if (replaceRecent && latestVersion) {
      versionNumber = latestVersion.versionNumber;
      logger.debug(`🔄 [VERSION-CREATE] User requested replace - will replace v${versionNumber}`);
    } else {
      versionNumber = highestVersionNumber + 1;
      logger.debug(`✅ [VERSION-CREATE] Creating new version v${versionNumber}`);
    }

    const shouldApplyWatermark = watermark === true ||
                                  agreement.status === 'draft' ||
                                  agreement.status === 'pending_approval';

    logger.debug(`💧 [WATERMARK-CHECK] Watermark decision:`, {
      requestedWatermark: watermark,
      agreementStatus: agreement.status,
      shouldApplyWatermark
    });

    const compiledPdf = await compileCustomerHeader(agreement.payload, {
      watermark: shouldApplyWatermark
    });

    if (!compiledPdf || !compiledPdf.buffer) {
      throw new Error("Failed to compile PDF for version");
    }

    const versionData = {
      agreementId: agreementId,
      versionNumber: versionNumber,
      versionLabel: `v${versionNumber}`,
      fileName: `${agreement.payload?.headerTitle || 'Agreement'}_v${versionNumber}.pdf`,
      status: agreement.status || 'saved',
      createdBy: createdBy || null,
      generatedBy: generatedBy || null,
      changeNotes: changeNotes || `Version ${versionNumber} - ${isFirstTime ? 'Initial version' : 'Updated agreement'}`,
      payloadSnapshot: agreement.payload,
      pdf_meta: {
        sizeBytes: compiledPdf.buffer.length,
        storedAt: new Date(),
        pdfBuffer: compiledPdf.buffer,
        contentType: 'application/pdf'
      },
      zoho: {
        bigin: {},
        crm: {}
      }
    };

    logger.debug(`📋 [VERSION-CREATE] Creating version with status: ${versionData.status} (inherited from agreement)`);

    let version;
    let wasReplacement = false;

    if (replaceRecent && latestVersion && versionNumber === latestVersion.versionNumber) {
      version = await VersionPdf.findByIdAndUpdate(
        latestVersion._id,
        {
          ...versionData,
          updatedAt: new Date()
        },
        { new: true, runValidators: true }
      );

      if (version) {
        wasReplacement = true;
        logger.debug(`🔄 [VERSION-CREATE] Replaced version ${versionNumber} (atomic update)`);
      } else {
        version = new VersionPdf(versionData);
        version = await version.save();
        logger.debug(`✅ [VERSION-CREATE] Created new version ${versionNumber} (replacement target not found)`);
      }
    } else {
      version = new VersionPdf(versionData);
      version = await version.save();
      logger.debug(`✅ [VERSION-CREATE] Created new version ${versionNumber}`);
    }

    const updateData = {
      currentVersionNumber: versionNumber,
      totalVersions: wasReplacement ? totalVersions : totalVersions + 1
    };

    if (!wasReplacement) {
      updateData.$push = {
        versions: {
          versionId: version._id,
          versionNumber: versionNumber,
          versionLabel: `v${versionNumber}`,
          createdAt: version.createdAt,
          createdBy: createdBy || null,
          changeNotes: changeNotes || '',
          status: 'active'
        }
      };

      if (latestVersion && latestVersion.status === 'draft') {
        await VersionPdf.findByIdAndUpdate(latestVersion._id, { status: 'saved' });
        logger.debug(`✅ [VERSION-CREATE] Auto-updated previous draft (v${latestVersion.versionNumber}) to saved after creating v${versionNumber}`);
      }
    }

    await CustomerHeaderDoc.findByIdAndUpdate(agreementId, updateData);

    res.json({
      success: true,
      message: wasReplacement ?
        `Version ${versionNumber} replaced successfully` :
        `Version ${versionNumber} created successfully`,
      version: {
        id: version._id,
        versionNumber: version.versionNumber,
        status: version.status
      }
    });

  } catch (error) {
    logger.error("❌ Failed to create version:", error.message);

    if (error.detail) {
      try {
        const errorDetail = typeof error.detail === 'string' ? JSON.parse(error.detail) : error.detail;
        logger.error("📄 LaTeX Compilation Error Details:", JSON.stringify(errorDetail, null, 2));
      } catch (parseErr) {
        logger.error("📄 LaTeX Compilation Error Details (raw):", error.detail);
      }
    }

    res.status(500).json({
      success: false,
      error: error.message,
      detail: error.detail || undefined
    });
  }
}

export async function replaceMainPdf(req, res) {
  try {
    const { agreementId } = req.params;
    const { updatedBy } = req.body || {};

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    logger.debug(`🔄 [REPLACE-MAIN] Replacing main PDF for agreement ${agreementId}`);

    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    const compiledPdf = await compileCustomerHeader(agreement.payload);
    if (!compiledPdf || !compiledPdf.buffer) {
      throw new Error("Failed to compile PDF for main replacement");
    }

    agreement.pdf_meta = {
      sizeBytes: compiledPdf.buffer.length,
      storedAt: new Date(),
      pdfBuffer: compiledPdf.buffer,
      contentType: 'application/pdf'
    };

    agreement.updatedBy = updatedBy || null;
    await agreement.save();

    logger.debug(`✅ [REPLACE-MAIN] Replaced main PDF for agreement ${agreementId}`);

    res.json({
      success: true,
      message: "Main PDF replaced successfully",
      agreement: {
        id: agreement._id,
        headerTitle: agreement.payload?.headerTitle || 'Untitled Agreement',
        sizeBytes: agreement.pdf_meta.sizeBytes,
        updatedAt: agreement.updatedAt
      }
    });

  } catch (error) {
    logger.error("❌ Failed to replace main PDF:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function getVersionsList(req, res) {
  try {
    const { agreementId } = req.params;
    const includeArchived = req.query.includeArchived === 'true';

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid agreement ID format"
      });
    }

    const agreement = await CustomerHeaderDoc.findById(agreementId);
    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: "Agreement not found"
      });
    }

    const filter = {
      agreementId: agreementId,
      isDeleted: { $ne: true }
    };

    if (!includeArchived) {
      filter.status = { $ne: 'archived' };
    }

    const versions = await VersionPdf.find(filter)
      .sort({ versionNumber: -1 });

    const items = versions.map(v => ({
      id: v._id,
      type: 'version',
      versionNumber: v.versionNumber,
      versionLabel: v.versionLabel,
      fileName: v.fileName,
      sizeBytes: v.pdf_meta?.sizeBytes || 0,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      status: v.status,
      changeNotes: v.changeNotes,
      canEdit: v.status === 'draft',
      canUploadToZoho: ['draft', 'saved'].includes(v.status),
      zohoUploadStatus: {
        uploaded: !!(v.zoho?.bigin?.fileId || v.zoho?.crm?.fileId),
        dealId: v.zoho?.bigin?.dealId || v.zoho?.crm?.dealId || null,
        uploadedAt: v.zoho?.bigin?.uploadedAt || v.zoho?.crm?.uploadedAt || null
      }
    }));

    logger.debug(`📋 [VERSION-LIST] Found ${items.length} versions for agreement ${agreementId}`);

    res.json({
      success: true,
      agreementId,
      items,
      summary: {
        totalVersions: items.length,
        hasMainPdf: !!(agreement.pdf_meta?.pdfBuffer),
        agreementTitle: agreement.payload?.headerTitle || 'Untitled Agreement',
        agreementStatus: agreement.status
      }
    });

  } catch (error) {
    logger.error("❌ Failed to get versions list:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function viewVersionPdf(req, res) {
  try {
    const { versionId } = req.params;
    const { watermark = 'false' } = req.query;
    const applyWatermark = watermark === 'true' || watermark === true;

    if (!mongoose.isValidObjectId(versionId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(versionId);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    logger.debug(`👁️ [VERSION-VIEW] Viewing version ${version.versionNumber}:`, {
      fileName: version.fileName,
      watermark: applyWatermark,
      hasStoredPdf: !!version.pdf_meta?.pdfBuffer
    });

    logger.debug(`🔄 [ON-DEMAND] Regenerating PDF on-demand with watermark=${applyWatermark}`);

    const compiledPdf = await compileCustomerHeader(version.payloadSnapshot, {
      watermark: applyWatermark
    });

    if (!compiledPdf || !compiledPdf.buffer) {
      throw new Error("Failed to compile PDF");
    }

    const fileName = applyWatermark
      ? version.fileName.replace('.pdf', '_DRAFT.pdf')
      : version.fileName;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Content-Length', compiledPdf.buffer.length);

    res.end(compiledPdf.buffer);
    logger.debug(`👁️ [VERSION-VIEW] Viewed version ${version.versionNumber}: ${fileName}`);

  } catch (error) {
    logger.error("❌ Failed to view version:", error.message);

    const errorResponse = {
      success: false,
      message: error.message || "Failed to view PDF",
      error: error.message || "Failed to view PDF",
      codeVersion: 'v3_2025_full_error_details',
      timestamp: new Date().toISOString(),

      errorType: error.errorType || 'UNKNOWN',
      errorName: error.errorName || error.name || 'Error',
      originalError: error.originalError,
      url: error.url,
      httpStatus: error.httpStatus,
      timeout: error.timeout,
      detail: error.detail,
      latexError: error.latexError,
      stack: error.stack
    };

    res.status(500).json(errorResponse);
  }
}

export async function getVersionForEdit(req, res) {
  try {
    const { versionId } = req.params;

    if (!mongoose.isValidObjectId(versionId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid version ID format"
      });
    }

    const version = await VersionPdf.findById(versionId);
    if (!version) {
      return res.status(404).json({
        success: false,
        error: "Version not found"
      });
    }

    logger.debug(`📝 [VERSION-EDIT] Retrieved version ${version.versionNumber} for editing`);

    res.json({
      success: true,
      payload: version.payloadSnapshot,
      metadata: {
        versionId: version._id,
        agreementId: version.agreementId,
        versionNumber: version.versionNumber,
        versionLabel: version.versionLabel,
        status: version.status,
        createdAt: version.createdAt,
        createdBy: version.createdBy
      }
    });

  } catch (error) {
    logger.error("❌ Failed to get version for edit:", error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
