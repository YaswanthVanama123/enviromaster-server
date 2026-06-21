/**
 * Price Override Controller
 * Handles price override logging and review
 */

import mongoose from "mongoose";
import { PriceOverrideLog } from "../../models/logging/index.js";
import logger from "../../utils/logger.js";

export async function logPriceOverride(req, res) {
  try {
    const { agreementId, versionId, versionNumber, salespersonId, salespersonName, productKey, productName, productType, fieldType, originalValue, overrideValue, quantity, frequency, sessionId, documentTitle, source } = req.body;

    if (!agreementId || !salespersonId || !salespersonName || !productKey || !productName || !productType || !fieldType || originalValue === undefined || overrideValue === undefined) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const overrideLog = new PriceOverrideLog({
      agreementId, versionId: versionId || null, versionNumber: versionNumber || 1,
      salespersonId, salespersonName, productKey, productName, productType, fieldType,
      originalValue: Number(originalValue), overrideValue: Number(overrideValue),
      quantity: quantity || 0, frequency: frequency || '',
      sessionId: sessionId || `session_${Date.now()}`, documentTitle: documentTitle || 'Untitled Document',
      source: source || 'form_filling',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    });

    await overrideLog.save();

    res.json({
      success: true, message: "Price override logged successfully",
      log: { id: overrideLog._id, changeAmount: overrideLog.changeAmount, changePercentage: overrideLog.changePercentage, isSignificantChange: overrideLog.isSignificantChange, requiresApproval: overrideLog.requiresApproval, reviewStatus: overrideLog.reviewStatus }
    });
  } catch (err) {
    logger.error("logPriceOverride error:", err);
    res.status(500).json({ success: false, error: "Failed to log price override", detail: err?.message });
  }
}

export async function getPriceOverrideLogs(req, res) {
  try {
    const { agreementId } = req.params;
    const { versionNumber, salespersonId, reviewStatus, limit = 50, sortOrder = -1 } = req.query;

    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({ success: false, error: "Invalid agreement ID format" });
    }

    const options = { versionNumber: versionNumber ? Number(versionNumber) : null, salespersonId, reviewStatus, limit: Number(limit), sortOrder: Number(sortOrder) };
    const logs = await PriceOverrideLog.getLogsForAgreement(agreementId, options);
    const stats = await PriceOverrideLog.getOverrideStats(agreementId);

    res.json({ success: true, total: logs.length, logs, statistics: stats });
  } catch (err) {
    logger.error("getPriceOverrideLogs error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve logs", detail: err?.message });
  }
}

export async function getPriceOverrideStats(req, res) {
  try {
    const { agreementId } = req.params;
    if (!mongoose.isValidObjectId(agreementId)) {
      return res.status(400).json({ success: false, error: "Invalid agreement ID format" });
    }

    const stats = await PriceOverrideLog.getOverrideStats(agreementId);
    const recentLogs = await PriceOverrideLog.getLogsForAgreement(agreementId, { limit: 5 });

    res.json({ success: true, statistics: stats, recentOverrides: recentLogs });
  } catch (err) {
    logger.error("getPriceOverrideStats error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve stats", detail: err?.message });
  }
}

export async function reviewPriceOverride(req, res) {
  try {
    const { logId } = req.params;
    const { reviewStatus, reviewNotes } = req.body;

    if (!mongoose.isValidObjectId(logId)) {
      return res.status(400).json({ success: false, error: "Invalid log ID format" });
    }

    if (!reviewStatus || !['approved', 'rejected'].includes(reviewStatus)) {
      return res.status(400).json({ success: false, error: "Invalid review status" });
    }

    const log = await PriceOverrideLog.findById(logId);
    if (!log) {
      return res.status(404).json({ success: false, error: "Log not found" });
    }

    log.reviewStatus = reviewStatus;
    log.reviewedBy = req.admin?.id || req.user?.id || 'system';
    log.reviewedAt = new Date();
    log.reviewNotes = reviewNotes || '';
    await log.save();

    res.json({ success: true, message: `Price override ${reviewStatus} successfully`, log: { id: log._id, reviewStatus: log.reviewStatus, reviewedBy: log.reviewedBy, reviewedAt: log.reviewedAt } });
  } catch (err) {
    logger.error("reviewPriceOverride error:", err);
    res.status(500).json({ success: false, error: "Failed to review", detail: err?.message });
  }
}

export async function getPendingPriceOverrides(req, res) {
  try {
    const { page = 1, limit = 20, salespersonId, significantOnly } = req.query;

    const filter = { reviewStatus: 'pending', isDeleted: { $ne: true } };
    if (salespersonId) filter.salespersonId = salespersonId;
    if (significantOnly === 'true') filter.isSignificantChange = true;

    const total = await PriceOverrideLog.countDocuments(filter);
    const logs = await PriceOverrideLog.find(filter).populate('agreementId', 'payload.headerTitle').sort({ createdAt: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).lean();

    res.json({ success: true, total, page: Number(page), limit: Number(limit), pendingOverrides: logs });
  } catch (err) {
    logger.error("getPendingPriceOverrides error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve pending overrides", detail: err?.message });
  }
}
