/**
 * Approval Controller
 * Handles approval documents grouping
 */

import mongoose from "mongoose";
import { CustomerHeaderDoc, ManualUploadDocument, VersionPdf } from "../../models/agreement/index.js";
import logger from "../../utils/logger.js";

export async function getApprovalDocumentsGrouped(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, totalGroups: 0, totalFiles: 0, groups: [] });
    }

    const [pendingAgreementIds, pendingVersionAgreementIds, pendingManualAgreementIds] = await Promise.all([
      CustomerHeaderDoc.distinct('_id', { status: 'pending_approval', isDeleted: { $ne: true } }),
      VersionPdf.distinct('agreementId', { status: 'pending_approval', isDeleted: { $ne: true } }),
      ManualUploadDocument.distinct('metadata.attachedToAgreement', { status: 'pending_approval', isDeleted: { $ne: true }, 'metadata.attachedToAgreement': { $exists: true } })
    ]);

    const allAgreementIds = [...new Set([
      ...pendingAgreementIds.map(id => id.toString()),
      ...pendingVersionAgreementIds.map(id => id.toString()),
      ...pendingManualAgreementIds.filter(id => id).map(id => id.toString())
    ])];

    if (allAgreementIds.length === 0) {
      return res.json({ success: true, totalGroups: 0, totalFiles: 0, groups: [] });
    }

    const allAgreementObjectIds = allAgreementIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const agreements = await CustomerHeaderDoc.aggregate([
      { $match: { _id: { $in: allAgreementObjectIds }, isDeleted: { $ne: true } } },
      { $lookup: { from: 'versionpdfs', let: { agreementId: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$agreementId', '$$agreementId'] }, { $eq: ['$status', 'pending_approval'] }, { $ne: ['$isDeleted', true] }] } } }, { $project: { _id: 1, versionNumber: 1, fileName: 1, status: 1, createdAt: 1, updatedAt: 1, 'pdf_meta.sizeBytes': 1 } }], as: 'pendingVersions' } },
      { $lookup: { from: 'manualuploaddocuments', let: { attachedFileIds: { $ifNull: ['$attachedFiles.manualDocumentId', []] }, agreementIdStr: { $toString: '$_id' } }, pipeline: [{ $match: { $expr: { $and: [{ $or: [{ $in: ['$_id', '$$attachedFileIds'] }, { $eq: ['$metadata.attachedToAgreement', '$$agreementIdStr'] }] }, { $eq: ['$status', 'pending_approval'] }, { $ne: ['$isDeleted', true] }] } } }, { $project: { _id: 1, fileName: 1, originalFileName: 1, fileSize: 1, status: 1, uploadedBy: 1, createdAt: 1, updatedAt: 1 } }], as: 'pendingManualUploads' } },
      { $project: { _id: 1, status: 1, createdAt: 1, updatedAt: 1, 'payload.headerTitle': 1, 'pdf_meta.sizeBytes': 1, pendingVersions: 1, pendingManualUploads: 1 } },
      { $sort: { updatedAt: -1 } }
    ]);

    const groups = agreements.map(agreement => {
      const files = [];
      const agreementId = agreement._id.toString();
      const title = agreement.payload?.headerTitle || 'Untitled Agreement';

      if (agreement.status === 'pending_approval' && agreement.pdf_meta?.sizeBytes) {
        files.push({ id: agreement._id, agreementId, fileName: `${title}.pdf`, fileType: 'main_pdf', title, status: agreement.status, createdAt: agreement.createdAt, updatedAt: agreement.updatedAt, fileSize: agreement.pdf_meta.sizeBytes, hasPdf: true, canChangeStatus: true });
      }

      (agreement.pendingVersions || []).forEach(v => {
        files.push({ id: v._id, agreementId, fileName: v.fileName || `${title} - Version ${v.versionNumber}.pdf`, fileType: 'version_pdf', title: `Version ${v.versionNumber}`, status: v.status, createdAt: v.createdAt, updatedAt: v.updatedAt, fileSize: v.pdf_meta?.sizeBytes || 0, hasPdf: true, canChangeStatus: true, versionNumber: v.versionNumber });
      });

      (agreement.pendingManualUploads || []).forEach(m => {
        files.push({ id: m._id, agreementId, fileName: m.originalFileName, fileType: 'attached_pdf', title: m.originalFileName, status: m.status, createdAt: m.createdAt, updatedAt: m.updatedAt, fileSize: m.fileSize || 0, hasPdf: true, canChangeStatus: true });
      });

      return { id: agreementId, agreementTitle: title, agreementStatus: agreement.status, latestUpdate: agreement.updatedAt, fileCount: files.length, files };
    });

    const totalFiles = groups.reduce((sum, g) => sum + g.fileCount, 0);
    res.json({ success: true, totalGroups: groups.length, totalFiles, groups });
  } catch (error) {
    logger.error('getApprovalDocumentsGrouped error:', error);
    res.status(500).json({ success: false, error: 'server_error', detail: error.message });
  }
}
