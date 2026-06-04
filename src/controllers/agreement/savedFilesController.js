/**
 * Saved Files Controller
 * Handles saved files list, grouped views, and file attachments
 */

import mongoose from "mongoose";
import { CustomerHeaderDoc, ManualUploadDocument } from "../../models/agreement/index.js";

export async function getSavedFilesList(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    if (mongoose.connection.readyState === 0) {
      console.log('Database not connected, returning empty list for saved files');
      return res.json({
        total: 0,
        page,
        limit,
        files: []
      });
    }

    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.search) {
      filter['payload.headerTitle'] = {
        $regex: req.query.search,
        $options: 'i'
      };
    }
    if (req.query.isDeleted !== undefined) {
      const isDeletedParam = req.query.isDeleted === 'true';
      if (isDeletedParam) {
        filter.isDeleted = true;
      } else {
        filter.isDeleted = { $ne: true };
      }
    } else {
      filter.isDeleted = { $ne: true };
    }

    const total = await CustomerHeaderDoc.countDocuments(filter);

    const files = await CustomerHeaderDoc.find(filter)
      .select({
        _id: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
        createdBy: 1,
        updatedBy: 1,
        'payload.headerTitle': 1,
        'pdf_meta.sizeBytes': 1,
        'pdf_meta.storedAt': 1,
        'zoho.bigin.dealId': 1,
        'zoho.bigin.fileId': 1,
        'zoho.crm.dealId': 1,
        'zoho.crm.fileId': 1,
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();


    const transformedFiles = files.map(file => ({
      id: file._id,
      title: file.payload?.headerTitle || 'Untitled Document',
      status: file.status,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      createdBy: file.createdBy,
      updatedBy: file.updatedBy,
      fileSize: file.pdf_meta?.sizeBytes || 0,
      pdfStoredAt: file.pdf_meta?.storedAt || null,
      hasPdf: !!(
        (file.zoho?.bigin?.fileId && !file.zoho.bigin.fileId.includes('MOCK_')) ||
        (file.zoho?.crm?.fileId && !file.zoho.crm.fileId.includes('MOCK_')) ||
        (file.pdf_meta?.sizeBytes && file.pdf_meta.sizeBytes > 0)
      ),
      isEditable: file.status === 'draft' || file.status === 'saved',
      zohoInfo: {
        biginDealId: file.zoho?.bigin?.dealId || null,
        biginFileId: file.zoho?.bigin?.fileId || null,
        crmDealId: file.zoho?.crm?.dealId || null,
        crmFileId: file.zoho?.crm?.fileId || null,
      }
    }));

    res.json({
      success: true,
      total,
      page,
      limit,
      files: transformedFiles,
      _metadata: {
        queryType: 'lightweight',
        fieldsIncluded: ['basic_info', 'file_meta', 'zoho_refs'],
        fieldsExcluded: ['full_payload', 'pdf_buffer']
      }
    });

  } catch (err) {
    console.error("getSavedFilesList error:", err);

    if (err.message.includes('buffering timed out')) {
      console.log('Database timeout, returning empty list for saved files');
      return res.json({
        success: true,
        total: 0,
        page: 1,
        limit: 20,
        files: []
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to fetch saved files",
      detail: err?.message || String(err),
    });
  }
}

export async function getSavedFilesGrouped(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100
    );

    const startTime = Date.now();

    if (mongoose.connection.readyState === 0) {
      console.log('Database not connected, returning empty list for grouped files');
      return res.json({
        success: true,
        total: 0,
        totalGroups: 0,
        page,
        limit,
        groups: []
      });
    }

    const matchFilter = {};

    if (req.query.status) {
      matchFilter.status = req.query.status;
    }
    if (req.query.search) {
      matchFilter['payload.headerTitle'] = {
        $regex: req.query.search,
        $options: 'i'
      };
    }

    const isTrashMode = req.query.isDeleted === 'true';
    const includeDrafts = req.query.includeDrafts === 'true';
    const includeLogs = req.query.includeLogs === 'true' || isTrashMode;

    if (!isTrashMode) {
      matchFilter.isDeleted = { $ne: true };
    }

    const aggregationPipeline = [
      { $match: matchFilter },
      {
        $facet: {
          totalCount: [{ $count: 'count' }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                status: 1,
                isDeleted: 1,
                deletedAt: 1,
                deletedBy: 1,
                createdAt: 1,
                updatedAt: 1,
                createdBy: 1,
                updatedBy: 1,
                title: '$payload.headerTitle',
                startDate: '$payload.agreement.startDate',
                contractMonths: '$payload.summary.contractMonths',
                biginDealId: '$zoho.bigin.dealId',
                crmDealId: '$zoho.crm.dealId',
                attachedFiles: 1
              }
            },
            {
              $lookup: {
                from: 'versionpdfs',
                let: { agreementId: '$_id', agreementDeleted: '$isDeleted' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$agreementId', '$$agreementId'] },
                          { $ne: ['$status', 'archived'] },
                          ...(isTrashMode ? [
                            { $or: [{ $eq: ['$$agreementDeleted', true] }, { $eq: ['$isDeleted', true] }] }
                          ] : [{ $ne: ['$isDeleted', true] }])
                        ]
                      }
                    }
                  },
                  {
                    $project: {
                      _id: 1, versionNumber: 1, status: 1, isDeleted: 1,
                      deletedAt: 1, deletedBy: 1, createdAt: 1, createdBy: 1,
                      size: '$pdf_meta.sizeBytes'
                    }
                  },
                  { $sort: { versionNumber: -1 } }
                ],
                as: 'versionPdfs'
              }
            },
            ...(includeLogs ? [{
              $lookup: {
                from: 'logs',
                let: { agreementId: '$_id', agreementDeleted: '$isDeleted' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$agreementId', '$$agreementId'] },
                          ...(isTrashMode ? [
                            { $or: [{ $eq: ['$$agreementDeleted', true] }, { $eq: ['$isDeleted', true] }] }
                          ] : [{ $ne: ['$isDeleted', true] }])
                        ]
                      }
                    }
                  },
                  {
                    $project: {
                      _id: 1, versionId: 1, versionNumber: 1, fileName: 1, fileSize: 1,
                      totalChanges: 1, totalPriceImpact: 1, createdAt: 1, isDeleted: 1,
                      deletedAt: 1, deletedBy: 1
                    }
                  },
                  { $sort: { versionNumber: -1, createdAt: -1 } }
                ],
                as: 'logs'
              }
            }] : []),
            {
              $lookup: {
                from: 'manualuploaddocuments',
                let: { attachedFileIds: '$attachedFiles.manualDocumentId', agreementDeleted: '$isDeleted' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $in: ['$_id', '$$attachedFileIds'] },
                          ...(isTrashMode ? [
                            { $or: [{ $eq: ['$$agreementDeleted', true] }, { $eq: ['$isDeleted', true] }] }
                          ] : [{ $ne: ['$isDeleted', true] }])
                        ]
                      }
                    }
                  },
                  {
                    $project: {
                      _id: 1, fileName: 1, originalFileName: 1, fileSize: 1, mimeType: 1,
                      description: 1, uploadedBy: 1, status: 1, isDeleted: 1, deletedAt: 1,
                      deletedBy: 1, biginDealId: '$zoho.bigin.dealId', biginFileId: '$zoho.bigin.fileId',
                      crmDealId: '$zoho.crm.dealId', crmFileId: '$zoho.crm.fileId', createdAt: 1, updatedAt: 1
                    }
                  }
                ],
                as: 'manualUploads'
              }
            }
          ]
        }
      }
    ];

    const queryStartTime = Date.now();
    const result = await CustomerHeaderDoc.aggregate(aggregationPipeline);
    const queryTime = Date.now() - queryStartTime;

    const totalAgreements = result[0]?.totalCount[0]?.count || 0;
    const agreements = result[0]?.data || [];

    const transformedAgreements = agreements.map(agreement => {
      const attachedFiles = (agreement.attachedFiles || [])
        .map(attachmentRef => {
          const manualDoc = (agreement.manualUploads || []).find(
            doc => doc._id.toString() === attachmentRef.manualDocumentId?.toString()
          );
          if (!manualDoc) return null;
          return {
            id: manualDoc._id, agreementId: agreement._id, fileName: manualDoc.originalFileName,
            fileType: 'attached_pdf', title: manualDoc.originalFileName,
            status: manualDoc.status || 'uploaded', createdAt: manualDoc.createdAt,
            updatedAt: manualDoc.updatedAt, createdBy: manualDoc.uploadedBy, updatedBy: null,
            fileSize: manualDoc.fileSize || 0, pdfStoredAt: manualDoc.createdAt,
            hasPdf: !!(manualDoc.fileSize && manualDoc.fileSize > 0) || !!(manualDoc.biginFileId || manualDoc.crmFileId),
            description: attachmentRef.description || manualDoc.description || '',
            isDeleted: manualDoc.isDeleted || false, deletedAt: manualDoc.deletedAt || null,
            deletedBy: manualDoc.deletedBy || null,
            zohoInfo: {
              biginDealId: manualDoc.biginDealId || null, biginFileId: manualDoc.biginFileId || null,
              crmDealId: manualDoc.crmDealId || null, crmFileId: manualDoc.crmFileId || null,
            }
          };
        })
        .filter(file => file !== null);

      const versionFiles = (agreement.versionPdfs || []).map(version => ({
        id: version._id, agreementId: agreement._id,
        fileName: `${agreement.title || 'Untitled'} - Version ${version.versionNumber}.pdf`,
        fileType: 'version_pdf', title: `Version ${version.versionNumber}`,
        status: version.status || 'saved', createdAt: version.createdAt,
        updatedAt: version.createdAt, createdBy: version.createdBy || null,
        updatedBy: version.createdBy || null, fileSize: version.size || 0,
        pdfStoredAt: version.createdAt, hasPdf: !!(version.size && version.size > 0),
        description: `Version ${version.versionNumber} created on ${new Date(version.createdAt).toLocaleDateString()}`,
        versionNumber: version.versionNumber, isDeleted: version.isDeleted || false,
        deletedAt: version.deletedAt || null, deletedBy: version.deletedBy || null,
        zohoInfo: { biginDealId: null, biginFileId: null, crmDealId: null, crmFileId: null }
      }));

      const logFiles = (agreement.logs || []).map(log => ({
        id: log._id, agreementId: agreement._id, versionId: log.versionId,
        fileName: log.fileName, fileType: 'version_log', title: `v${log.versionNumber} Changes`,
        status: 'attached', createdAt: log.createdAt, updatedAt: log.createdAt,
        createdBy: null, updatedBy: null, fileSize: log.fileSize || 0,
        pdfStoredAt: log.createdAt, hasPdf: true,
        description: `${log.totalChanges} changes, $${(log.totalPriceImpact || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} total impact`,
        versionNumber: log.versionNumber, isDeleted: log.isDeleted || false,
        deletedAt: log.deletedAt || null, deletedBy: log.deletedBy || null,
        zohoInfo: { biginDealId: null, biginFileId: null, crmDealId: null, crmFileId: null }
      }));

      const allFiles = [...attachedFiles, ...versionFiles, ...logFiles];

      return {
        id: agreement._id, agreementTitle: agreement.title || 'Untitled Agreement',
        fileCount: allFiles.length, latestUpdate: agreement.updatedAt,
        statuses: [agreement.status], isDeleted: agreement.isDeleted || false,
        deletedAt: agreement.deletedAt, deletedBy: agreement.deletedBy,
        createdBy: agreement.createdBy || null, updatedBy: agreement.updatedBy || null,
        agreementStatus: agreement.status || 'draft',
        hasUploads: allFiles.some(f => f.zohoInfo.biginDealId || f.zohoInfo.crmDealId) ||
                    !!(agreement.biginDealId || agreement.crmDealId),
        startDate: agreement.startDate || null, contractMonths: agreement.contractMonths || null,
        files: allFiles
      };
    });

    const finalAgreements = isTrashMode
      ? transformedAgreements.filter(agreement => agreement.fileCount > 0 || agreement.isDeleted === true)
      : !includeDrafts
        ? transformedAgreements.filter(agreement => agreement.fileCount > 0)
        : transformedAgreements.map(agreement => ({...agreement, isDraftOnly: agreement.fileCount === 0}));

    const totalFiles = finalAgreements.reduce((sum, agreement) => sum + agreement.fileCount, 0);
    const totalTime = Date.now() - startTime;

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      success: true, total: totalFiles,
      totalGroups: isTrashMode ? finalAgreements.length : totalAgreements,
      page, limit, groups: finalAgreements,
      _metadata: {
        queryType: 'ultra_optimized_facet_aggregation',
        performance: { totalTime: `${totalTime}ms`, singleQueryTime: `${queryTime}ms` }
      }
    });
  } catch (error) {
    console.error("Error fetching agreements with attached files:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getSavedFileDetails(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false, error: "bad_request", detail: "Invalid document ID format"
      });
    }

    if (mongoose.connection.readyState === 0) {
      return res.json({
        success: true,
        file: { id, title: "Sample Document", status: "draft", createdAt: new Date(), updatedAt: new Date(), payload: {} }
      });
    }

    const file = await CustomerHeaderDoc.findById(id).select({ "pdf_meta.pdfBuffer": 0 }).lean();

    if (!file) {
      return res.status(404).json({ success: false, error: "not_found", detail: "Saved file not found" });
    }

    const transformedFile = {
      id: file._id, title: file.payload?.headerTitle || 'Untitled Document',
      status: file.status, createdAt: file.createdAt, updatedAt: file.updatedAt,
      createdBy: file.createdBy, updatedBy: file.updatedBy, payload: file.payload || {},
      pdfMeta: {
        sizeBytes: file.pdf_meta?.sizeBytes || 0, contentType: file.pdf_meta?.contentType || null,
        storedAt: file.pdf_meta?.storedAt || null, externalUrl: file.pdf_meta?.externalUrl || null,
      },
      zoho: file.zoho || { bigin: { dealId: null, fileId: null, url: null }, crm: { dealId: null, fileId: null, url: null } },
      hasPdf: !!(file.zoho?.bigin?.fileId || file.zoho?.crm?.fileId),
      isEditable: file.status === 'draft' || file.status === 'saved',
    };

    res.json({ success: true, file: transformedFile });
  } catch (err) {
    console.error("getSavedFileDetails error:", err);
    res.status(500).json({ success: false, error: "server_error", detail: err?.message || String(err) });
  }
}

export async function addFileToAgreement(req, res) {
  try {
    const { agreementId } = req.params;
    const { files } = req.body;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({ success: false, error: "bad_request", detail: "Invalid agreement ID format" });
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: "bad_request", detail: "Files array is required" });
    }

    const agreement = await CustomerHeaderDoc.findById(agreementId).select('_id payload.headerTitle attachedFiles').lean();

    if (!agreement) {
      return res.status(404).json({ success: false, error: "not_found", detail: "Agreement not found" });
    }

    const userId = req.user?.id || req.admin?.id || 'system';
    const agreementTitle = agreement.payload?.headerTitle || 'Untitled Agreement';

    const manualDocsToInsert = files.map(file => {
      let pdfBuffer = null;
      if (file.pdfBuffer && Array.isArray(file.pdfBuffer)) {
        pdfBuffer = Buffer.from(file.pdfBuffer);
      } else if (file.pdfBuffer instanceof Buffer) {
        pdfBuffer = file.pdfBuffer;
      }
      if (!pdfBuffer) throw new Error(`File ${file.fileName}: No PDF data provided.`);

      return {
        fileName: `${agreementTitle}_${file.fileName}`,
        originalFileName: file.fileName || 'Untitled.pdf',
        fileSize: file.fileSize || pdfBuffer.length,
        mimeType: file.contentType || 'application/pdf',
        description: file.description || `Attached to agreement: ${agreementTitle}`,
        uploadedBy: userId, status: 'uploaded', pdfBuffer,
        zoho: { bigin: file.zoho?.bigin || {}, crm: file.zoho?.crm || {} },
        metadata: { attachedToAgreement: agreementId, agreementTitle, attachedAt: new Date() }
      };
    });

    const insertedDocs = await ManualUploadDocument.insertMany(manualDocsToInsert);

    const attachmentRefs = insertedDocs.map((doc, index) => ({
      manualDocumentId: new mongoose.Types.ObjectId(doc._id),
      fileName: files[index].fileName || 'Untitled.pdf',
      fileSize: files[index].fileSize || 0,
      description: files[index].description || '',
      attachedAt: new Date(), attachedBy: userId,
      displayOrder: (agreement.attachedFiles?.length || 0) + index
    }));

    const updateResult = await CustomerHeaderDoc.findByIdAndUpdate(
      agreementId,
      { $push: { attachedFiles: { $each: attachmentRefs } }, $set: { updatedBy: userId, updatedAt: new Date() } },
      { new: true, select: '_id payload.headerTitle attachedFiles' }
    ).lean();

    if (!updateResult) {
      await ManualUploadDocument.deleteMany({ _id: { $in: insertedDocs.map(doc => doc._id) } });
      throw new Error('Failed to update agreement with attachment references');
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      success: true, message: `Successfully added ${attachmentRefs.length} file(s) to agreement`,
      agreement: { id: updateResult._id, title: updateResult.payload?.headerTitle, attachedFilesCount: updateResult.attachedFiles?.length || 0 },
      addedFiles: insertedDocs.map((doc, i) => ({ id: doc._id, fileName: files[i].fileName, fileSize: files[i].fileSize }))
    });
  } catch (err) {
    console.error("addFileToAgreement error:", err.message);
    res.status(500).json({ success: false, error: "server_error", detail: err?.message || String(err) });
  }
}

export async function downloadAttachedFile(req, res) {
  try {
    const { fileId } = req.params;

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ success: false, error: "bad_request", detail: "Invalid file ID format" });
    }

    const manualDoc = await ManualUploadDocument.findById(fileId).select('fileName originalFileName mimeType pdfBuffer');

    if (!manualDoc) {
      return res.status(404).json({ success: false, error: "not_found", detail: "File not found" });
    }

    if (!manualDoc.pdfBuffer) {
      return res.status(404).json({ success: false, error: "no_file_data", detail: "File data not available" });
    }

    res.set({
      'Content-Type': manualDoc.mimeType || 'application/pdf',
      'Content-Disposition': `attachment; filename="${manualDoc.originalFileName || 'document.pdf'}"`,
      'Content-Length': manualDoc.pdfBuffer.length.toString()
    });

    res.send(manualDoc.pdfBuffer);
  } catch (err) {
    console.error("downloadAttachedFile error:", err);
    res.status(500).json({ success: false, error: "server_error", detail: err?.message || String(err) });
  }
}

export async function getCustomerHeadersHighLevel(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);

    const filter = { isDeleted: { $ne: true } };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      filter['payload.headerTitle'] = { $regex: req.query.search, $options: 'i' };
    }

    const total = await CustomerHeaderDoc.countDocuments(filter);
    const docs = await CustomerHeaderDoc.find(filter)
      .select({ _id: 1, status: 1, createdAt: 1, updatedAt: 1, 'payload.headerTitle': 1 })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      success: true, total, page, limit,
      documents: docs.map(doc => ({
        id: doc._id, title: doc.payload?.headerTitle || 'Untitled',
        status: doc.status, createdAt: doc.createdAt, updatedAt: doc.updatedAt
      }))
    });
  } catch (err) {
    console.error("getCustomerHeadersHighLevel error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getCustomerHeaderViewerById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: "Invalid ID format" });
    }

    const doc = await CustomerHeaderDoc.findById(id).select({ 'pdf_meta.pdfBuffer': 0 }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }

    res.json({ success: true, document: doc });
  } catch (err) {
    console.error("getCustomerHeaderViewerById error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function downloadCustomerHeaderPdf(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: "Invalid ID format" });
    }

    const doc = await CustomerHeaderDoc.findById(id).select('pdf_meta payload.headerTitle');
    if (!doc) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }

    if (!doc.pdf_meta?.pdfBuffer) {
      return res.status(404).json({ success: false, error: "PDF not available" });
    }

    const filename = `${doc.payload?.headerTitle || 'document'}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': doc.pdf_meta.pdfBuffer.length.toString()
    });
    res.send(doc.pdf_meta.pdfBuffer);
  } catch (err) {
    console.error("downloadCustomerHeaderPdf error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
