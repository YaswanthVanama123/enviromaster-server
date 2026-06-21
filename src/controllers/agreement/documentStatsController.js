/**
 * Document Stats Controller
 * Handles document status counts and statistics
 */

import mongoose from "mongoose";
import { VersionPdf } from "../../models/agreement/index.js";
import logger from "../../utils/logger.js";

const DONE_STATUSES = ['approved', 'approved_salesman', 'approved_admin', 'active', 'finalized'];

export async function getDocumentStatusCounts(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, counts: { draft: 0, saved: 0, pending_approval: 0, approved: 0, total: 0 } });
    }

    const { startDate, endDate, groupBy } = req.query;

    const match = { isDeleted: { $ne: true }, status: { $nin: ['superseded', 'archived'] } };
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) match.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    // Aggregate totals (respecting the date range)
    const statusAgg = await VersionPdf.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const counts = { draft: 0, saved: 0, pending_approval: 0, approved: 0, total: 0 };
    statusAgg.forEach(s => {
      const st = s._id;
      if (st === 'draft') counts.draft += s.count;
      else if (st === 'saved') counts.saved += s.count;
      else if (st === 'pending_approval') counts.pending_approval += s.count;
      else counts.approved += s.count;
      counts.total += s.count;
    });

    // Per-bucket time series when a grouping is requested (day / week / month)
    let timeSeries = null;
    if (groupBy) {
      const format = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-%U' : '%Y-%m-%d';
      const series = await VersionPdf.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format, date: '$createdAt' } },
            saved: { $sum: { $cond: [{ $eq: ['$status', 'saved'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending_approval'] }, 1, 0] } },
            drafts: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
            done: { $sum: { $cond: [{ $in: ['$status', DONE_STATUSES] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      timeSeries = series.map(s => ({
        period: s._id,
        saved: s.saved,
        pending: s.pending,
        drafts: s.drafts,
        done: s.done,
      }));
    }

    res.json({
      success: true,
      counts,
      ...(timeSeries ? { timeSeries } : {}),
    });
  } catch (err) {
    logger.error("getDocumentStatusCounts error:", err);
    res.status(500).json({ success: false, error: "Failed to get status counts", detail: err?.message });
  }
}
