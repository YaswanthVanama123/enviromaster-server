/**
 * Version Change Log Controller
 * Handles version change logging and review
 */

import mongoose from "mongoose";
import { VersionChangeLog } from "../../models/logging/index.js";

export async function logVersionChanges(req, res) {
  try {
    const { agreementId, versionId, versionNumber, salespersonId, salespersonName, changes, saveAction, documentTitle, sessionId } = req.body;

    if (!agreementId || !versionId || !salespersonId || !salespersonName || !changes || !Array.isArray(changes) || changes.length === 0 || !saveAction || !documentTitle) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    let versionLog = await VersionChangeLog.findOne({ versionId });

    if (versionLog) {
      versionLog.salespersonId = salespersonId;
      versionLog.salespersonName = salespersonName;
      versionLog.changes = changes;
      versionLog.saveAction = saveAction;
      versionLog.documentTitle = documentTitle;
      versionLog.sessionId = sessionId || `session_${Date.now()}`;
      versionLog.ipAddress = req.ip || req.connection.remoteAddress;
      versionLog.userAgent = req.headers['user-agent'];
      versionLog.updatedAt = new Date();
    } else {
      versionLog = new VersionChangeLog({
        agreementId, versionId, versionNumber: versionNumber || 1,
        salespersonId, salespersonName, changes, saveAction, documentTitle,
        sessionId: sessionId || `session_${Date.now()}`,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      });
    }

    await versionLog.save();

    res.json({
      success: true, message: "Version changes logged successfully",
      log: { id: versionLog._id, versionId: versionLog.versionId, versionNumber: versionLog.versionNumber, totalChanges: versionLog.totalChanges, totalPriceImpact: versionLog.totalPriceImpact, hasSignificantChanges: versionLog.hasSignificantChanges, reviewStatus: versionLog.reviewStatus, saveAction: versionLog.saveAction }
    });
  } catch (err) {
    console.error("logVersionChanges error:", err);
    res.status(500).json({ success: false, error: "Failed to log version changes", detail: err?.message });
  }
}

export async function getVersionChangeLogs(req, res) {
  try {
    const { agreementId } = req.params;
    const { versionNumber, salespersonId, reviewStatus, limit = 50, sortOrder = -1 } = req.query;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({ success: false, error: "Invalid agreement ID format" });
    }

    const options = { versionNumber: versionNumber ? Number(versionNumber) : null, salespersonId, reviewStatus, limit: Number(limit), sortOrder: Number(sortOrder) };
    const logs = await VersionChangeLog.getLogsForAgreement(agreementId, options);
    const stats = await VersionChangeLog.getChangeStats(agreementId);

    res.json({
      success: true, total: logs.length, logs,
      statistics: stats.length > 0 ? stats[0] : { totalVersions: 0, totalChanges: 0, totalPriceImpact: 0, versionsWithSignificantChanges: 0, pendingApprovals: 0 }
    });
  } catch (err) {
    console.error("getVersionChangeLogs error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve logs", detail: err?.message });
  }
}

export async function getVersionChangeLog(req, res) {
  try {
    const { versionId } = req.params;
    if (!mongoose.isValidObjectId(versionId)) {
      return res.status(400).json({ success: false, error: "Invalid version ID format" });
    }

    const log = await VersionChangeLog.findOne({ versionId, isDeleted: { $ne: true } });
    if (!log) {
      return res.status(404).json({ success: false, error: "Version change log not found" });
    }

    res.json({ success: true, log });
  } catch (err) {
    console.error("getVersionChangeLog error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve log", detail: err?.message });
  }
}

export async function reviewVersionChanges(req, res) {
  try {
    const { logId } = req.params;
    const { reviewStatus, reviewNotes } = req.body;

    if (!mongoose.isValidObjectId(logId)) {
      return res.status(400).json({ success: false, error: "Invalid log ID format" });
    }

    if (!reviewStatus || !['approved', 'rejected'].includes(reviewStatus)) {
      return res.status(400).json({ success: false, error: "Invalid review status" });
    }

    const log = await VersionChangeLog.findById(logId);
    if (!log) {
      return res.status(404).json({ success: false, error: "Log not found" });
    }

    log.reviewStatus = reviewStatus;
    log.reviewedBy = req.admin?.id || req.user?.id || 'system';
    log.reviewedAt = new Date();
    log.reviewNotes = reviewNotes || '';
    await log.save();

    res.json({ success: true, message: `Version changes ${reviewStatus} successfully`, log: { id: log._id, versionId: log.versionId, versionNumber: log.versionNumber, reviewStatus: log.reviewStatus, reviewedBy: log.reviewedBy, reviewedAt: log.reviewedAt } });
  } catch (err) {
    console.error("reviewVersionChanges error:", err);
    res.status(500).json({ success: false, error: "Failed to review", detail: err?.message });
  }
}

export async function getPendingVersionChanges(req, res) {
  try {
    const { page = 1, limit = 20, salespersonId, significantOnly } = req.query;

    const filter = { reviewStatus: 'pending', isDeleted: { $ne: true } };
    if (salespersonId) filter.salespersonId = salespersonId;
    if (significantOnly === 'true') filter.hasSignificantChanges = true;

    const total = await VersionChangeLog.countDocuments(filter);
    const logs = await VersionChangeLog.find(filter).populate('agreementId', 'payload.headerTitle').sort({ createdAt: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).lean();

    res.json({ success: true, total, page: Number(page), limit: Number(limit), pendingChanges: logs });
  } catch (err) {
    console.error("getPendingVersionChanges error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve pending changes", detail: err?.message });
  }
}
