/**
 * Trash Controller
 * Handles soft delete, restore, and permanent delete operations
 */

import mongoose from "mongoose";
import { CustomerHeaderDoc, ManualUploadDocument, VersionPdf } from "../../models/agreement/index.js";
import { Log } from "../../models/logging/index.js";
import logger from "../../utils/logger.js";

const isAgreementMarkedDeleted = async (agreementId) => {
  if (!agreementId || !mongoose.isValidObjectId(agreementId)) return false;
  const agreement = await CustomerHeaderDoc.findById(agreementId).select('isDeleted').lean();
  return agreement?.isDeleted === true;
};

export async function restoreAgreement(req, res) {
  try {
    const { agreementId } = req.params;
    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({ success: false, error: "bad_request", detail: "Invalid agreement ID format" });
    }

    const userId = req.user?.id || req.admin?.id || 'system';
    const restoreTimestamp = new Date();

    const agreement = await CustomerHeaderDoc.findById(agreementId).select('_id payload.headerTitle attachedFiles isDeleted').lean();
    if (!agreement) {
      return res.status(404).json({ success: false, error: "not_found", detail: "Agreement not found" });
    }

    const manualFileIds = (agreement.attachedFiles || []).map(ref => ref.manualDocumentId).filter(id => id);

    const [agreementResult, versionResult, manualResult, logResult] = await Promise.all([
      agreement.isDeleted === true
        ? CustomerHeaderDoc.findOneAndUpdate({ _id: agreementId, isDeleted: true }, { $set: { isDeleted: false, deletedAt: null, deletedBy: null, updatedBy: userId, updatedAt: restoreTimestamp } }, { new: true })
        : Promise.resolve(null),
      VersionPdf.updateMany({ agreementId, isDeleted: true }, { $set: { isDeleted: false, deletedAt: null, deletedBy: null, updatedAt: restoreTimestamp } }),
      manualFileIds.length > 0 ? ManualUploadDocument.updateMany({ _id: { $in: manualFileIds }, isDeleted: true }, { $set: { isDeleted: false, deletedAt: null, deletedBy: null, updatedAt: restoreTimestamp } }) : Promise.resolve({ modifiedCount: 0 }),
      Log.updateMany({ agreementId, isDeleted: true }, { $set: { isDeleted: false, deletedAt: null, deletedBy: null, updatedAt: restoreTimestamp } })
    ]);

    const agreementRestored = agreementResult ? 1 : 0;
    const totalRestored = agreementRestored + versionResult.modifiedCount + manualResult.modifiedCount + logResult.modifiedCount;

    if (totalRestored === 0) {
      return res.status(404).json({ success: false, error: "not_found", detail: "No deleted items found to restore" });
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      success: true,
      message: totalRestored === 1 ? "1 item restored successfully" : `${totalRestored} items restored successfully`,
      agreement: { id: agreement._id, title: agreement.payload?.headerTitle || 'Untitled Agreement' },
      restoredCount: totalRestored,
      breakdown: { agreement: agreementRestored, versionPdfs: versionResult.modifiedCount, attachedFiles: manualResult.modifiedCount, versionLogs: logResult.modifiedCount }
    });
  } catch (err) {
    logger.error("restoreAgreement error:", err);
    res.status(500).json({ success: false, error: "server_error", detail: err?.message || String(err) });
  }
}

export async function restoreFile(req, res) {
  try {
    const { fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ success: false, error: "bad_request", detail: "Invalid file ID format" });
    }

    let file = null, fileType = null, fileName = "Unknown File";

    // Try to find deleted file
    const [manual, version, log] = await Promise.all([
      ManualUploadDocument.findOne({ _id: fileId, isDeleted: true }),
      VersionPdf.findOne({ _id: fileId, isDeleted: true }),
      Log.findOne({ _id: fileId, isDeleted: true })
    ]);

    if (manual) { file = manual; fileType = "attached_file"; fileName = manual.originalFileName || manual.fileName; }
    else if (version) { file = version; fileType = "version_pdf"; fileName = version.fileName || `Version ${version.versionNumber}`; }
    else if (log) { file = log; fileType = "version_log"; fileName = log.fileName || `Log v${log.versionNumber}`; }

    if (!file) {
      return res.status(404).json({ success: false, error: "not_found", detail: "File not found" });
    }

    file.isDeleted = false;
    file.deletedAt = null;
    file.deletedBy = null;
    await file.save();

    res.json({ success: true, message: "File restored successfully", file: { id: file._id, title: fileName, type: fileType } });
  } catch (err) {
    logger.error("restoreFile error:", err);
    res.status(500).json({ success: false, error: "server_error", detail: err?.message || String(err) });
  }
}

export async function deleteAgreement(req, res) {
  try {
    const { agreementId } = req.params;
    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({ success: false, error: "bad_request", detail: "Invalid agreement ID format" });
    }

    const userId = req.user?.username || req.admin?.username || 'system';
    const deleteTimestamp = new Date();

    const agreement = await CustomerHeaderDoc.findOneAndUpdate(
      { _id: agreementId, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: deleteTimestamp, deletedBy: userId, updatedBy: userId } },
      { new: true, select: 'payload.headerTitle attachedFiles', lean: true }
    );

    if (!agreement) {
      return res.status(404).json({ success: false, error: "not_found", detail: "Agreement not found or already deleted" });
    }

    const manualFileIds = (agreement.attachedFiles || []).map(ref => ref.manualDocumentId).filter(id => id);

    const [versionResult, manualResult, logResult] = await Promise.all([
      VersionPdf.updateMany({ agreementId, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: deleteTimestamp, deletedBy: userId } }),
      manualFileIds.length > 0 ? ManualUploadDocument.updateMany({ _id: { $in: manualFileIds }, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: deleteTimestamp, deletedBy: userId } }) : Promise.resolve({ modifiedCount: 0 }),
      Log.updateMany({ agreementId, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: deleteTimestamp, deletedBy: userId } })
    ]);

    const totalDeleted = 1 + versionResult.modifiedCount + manualResult.modifiedCount + logResult.modifiedCount;

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      success: true, message: `Agreement and ${totalDeleted - 1} file(s) moved to trash successfully`,
      deletedCount: totalDeleted,
      breakdown: { agreement: 1, versionPdfs: versionResult.modifiedCount, attachedFiles: manualResult.modifiedCount, versionLogs: logResult.modifiedCount }
    });
  } catch (err) {
    logger.error("deleteAgreement error:", err);
    res.status(500).json({ success: false, error: "server_error", detail: err?.message || String(err) });
  }
}

export async function deleteFile(req, res) {
  try {
    const { fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ success: false, error: "bad_request", detail: "Invalid file ID format" });
    }

    const userId = req.user?.id || req.admin?.id || 'system';
    const fileTypeHint = String(req.query.fileType || "").trim().toLowerCase();

    let result = null, fileType = null;

    if (fileTypeHint === 'attached_pdf') {
      result = await ManualUploadDocument.findOneAndUpdate({ _id: fileId, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } }, { new: true, select: 'fileName originalFileName', lean: true });
      if (result) fileType = 'attached_file';
    } else if (fileTypeHint === 'version_pdf') {
      result = await VersionPdf.findOneAndUpdate({ _id: fileId, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } }, { new: true, select: 'fileName versionNumber', lean: true });
      if (result) fileType = 'version_pdf';
    } else if (fileTypeHint === 'version_log') {
      result = await Log.findOneAndUpdate({ _id: fileId, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } }, { new: true, select: 'fileName versionNumber', lean: true });
      if (result) fileType = 'version_log';
    }

    if (!result) {
      const [manualResult, versionResult, logResult] = await Promise.all([
        ManualUploadDocument.findOneAndUpdate({ _id: fileId, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } }, { new: true, select: 'fileName originalFileName', lean: true }),
        VersionPdf.findOneAndUpdate({ _id: fileId, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } }, { new: true, select: 'fileName versionNumber', lean: true }),
        Log.findOneAndUpdate({ _id: fileId, isDeleted: { $ne: true } }, { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: userId } }, { new: true, select: 'fileName versionNumber', lean: true })
      ]);

      if (manualResult) { result = manualResult; fileType = 'attached_file'; }
      else if (versionResult) { result = versionResult; fileType = 'version_pdf'; }
      else if (logResult) { result = logResult; fileType = 'version_log'; }
    }

    if (!result) {
      return res.status(404).json({ success: false, error: "not_found", detail: "File not found or already deleted" });
    }

    let fileName;
    if (fileType === 'attached_file') {
      fileName = result.fileName || result.originalFileName;
    } else if (fileType === 'version_pdf') {
      fileName = result.fileName || `Version ${result.versionNumber}`;
    } else {
      fileName = result.fileName || `Log v${result.versionNumber}`;
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ success: true, message: "File moved to trash successfully", fileType, fileName });
  } catch (err) {
    logger.error("deleteFile error:", err);
    res.status(500).json({ success: false, error: "server_error", detail: err?.message || String(err) });
  }
}

export async function permanentlyDeleteAgreement(req, res) {
  try {
    const { agreementId } = req.params;
    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({ success: false, error: "bad_request", detail: "Invalid agreement ID format" });
    }

    const agreement = await CustomerHeaderDoc.findOne({ _id: agreementId, isDeleted: true });
    if (!agreement) {
      return res.status(404).json({ success: false, error: "not_found", detail: "Agreement not found in trash" });
    }

    const attachedFileIds = (agreement.attachedFiles || []).filter(a => a.manualDocumentId).map(a => a.manualDocumentId);

    const [manualResult, versionResult, logResult] = await Promise.all([
      attachedFileIds.length > 0 ? ManualUploadDocument.deleteMany({ _id: { $in: attachedFileIds } }) : Promise.resolve({ deletedCount: 0 }),
      VersionPdf.deleteMany({ agreementId }),
      Log.deleteMany({ agreementId })
    ]);

    await CustomerHeaderDoc.findByIdAndDelete(agreementId);

    res.json({
      success: true, message: "Agreement permanently deleted",
      deletedData: { agreementId, deletedAttachedFiles: manualResult.deletedCount, deletedVersions: versionResult.deletedCount, deletedLogs: logResult.deletedCount }
    });
  } catch (err) {
    logger.error("permanentlyDeleteAgreement error:", err);
    res.status(500).json({ success: false, error: "server_error", detail: err?.message || String(err) });
  }
}

export async function permanentlyDeleteFile(req, res) {
  try {
    const { fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({ success: false, error: "bad_request", detail: "Invalid file ID format" });
    }

    let file = null, fileType = null, fileName = "Unknown";

    const [manual, version, log] = await Promise.all([
      ManualUploadDocument.findOne({ _id: fileId, isDeleted: true }),
      VersionPdf.findOne({ _id: fileId, isDeleted: true }),
      Log.findOne({ _id: fileId, isDeleted: true })
    ]);

    if (manual) { file = manual; fileType = "attached_file"; fileName = manual.originalFileName || manual.fileName; }
    else if (version) { file = version; fileType = "version_pdf"; fileName = version.fileName || `Version ${version.versionNumber}`; }
    else if (log) { file = log; fileType = "version_log"; fileName = log.fileName || `Log v${log.versionNumber}`; }

    if (!file) {
      return res.status(404).json({ success: false, error: "not_found", detail: "File not found in trash" });
    }

    if (fileType === "attached_file") {
      await CustomerHeaderDoc.updateMany({ "attachedFiles.manualDocumentId": fileId }, { $pull: { attachedFiles: { manualDocumentId: fileId } } });
      await ManualUploadDocument.findByIdAndDelete(fileId);
    } else if (fileType === "version_pdf") {
      await VersionPdf.findByIdAndDelete(fileId);
    } else if (fileType === "version_log") {
      await Log.findByIdAndDelete(fileId);
    }

    res.json({ success: true, message: "File permanently deleted", deletedData: { fileId, fileName, fileType } });
  } catch (err) {
    logger.error("permanentlyDeleteFile error:", err);
    res.status(500).json({ success: false, error: "server_error", detail: err?.message || String(err) });
  }
}

export async function debugGetAllFiles(req, res) {
  try {
    const [versionPdfs, manualUploads, agreements] = await Promise.all([
      VersionPdf.find({}).select({ _id: 1, agreementId: 1, versionNumber: 1, isDeleted: 1, createdAt: 1 }).limit(100).lean(),
      ManualUploadDocument.find({}).select({ _id: 1, fileName: 1, isDeleted: 1, createdAt: 1 }).limit(100).lean(),
      CustomerHeaderDoc.find({}).select({ _id: 1, 'payload.headerTitle': 1, status: 1, isDeleted: 1, createdAt: 1 }).limit(100).lean()
    ]);

    res.json({
      success: true,
      summary: {
        versionPdfs: { total: versionPdfs.length, deleted: versionPdfs.filter(v => v.isDeleted).length },
        manualUploads: { total: manualUploads.length, deleted: manualUploads.filter(m => m.isDeleted).length },
        agreements: { total: agreements.length, deleted: agreements.filter(a => a.isDeleted).length }
      },
      data: { versionPdfs, manualUploads, agreements }
    });
  } catch (err) {
    logger.error('debugGetAllFiles error:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}

export async function verifyTrashWorkflow(req, res) {
  try {
    const results = {
      timestamp: new Date().toISOString(),
      databaseConnection: mongoose.connection.readyState === 1,
      collections: {}
    };

    if (results.databaseConnection) {
      const [versionCount, deletedVersions, uploadCount, deletedUploads, agreementCount, deletedAgreements] = await Promise.all([
        VersionPdf.countDocuments({}),
        VersionPdf.countDocuments({ isDeleted: true }),
        ManualUploadDocument.countDocuments({}),
        ManualUploadDocument.countDocuments({ isDeleted: true }),
        CustomerHeaderDoc.countDocuments({}),
        CustomerHeaderDoc.countDocuments({ isDeleted: true })
      ]);

      results.collections = {
        versionPdfs: { total: versionCount, deleted: deletedVersions },
        manualUploads: { total: uploadCount, deleted: deletedUploads },
        agreements: { total: agreementCount, deleted: deletedAgreements }
      };
    }

    res.json({ success: true, ...results });
  } catch (err) {
    logger.error('verifyTrashWorkflow error:', err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}
