/**
 * Document Stats Controller
 * Handles document status counts and statistics
 */

import mongoose from "mongoose";
import { CustomerHeaderDoc } from "../../models/agreement/index.js";

export async function getDocumentStatusCounts(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: true, counts: { draft: 0, saved: 0, pending_approval: 0, approved: 0, total: 0 } });
    }

    const [draftCount, savedCount, pendingCount, approvedCount, totalCount] = await Promise.all([
      CustomerHeaderDoc.countDocuments({ status: 'draft', isDeleted: { $ne: true } }),
      CustomerHeaderDoc.countDocuments({ status: 'saved', isDeleted: { $ne: true } }),
      CustomerHeaderDoc.countDocuments({ status: 'pending_approval', isDeleted: { $ne: true } }),
      CustomerHeaderDoc.countDocuments({ status: 'approved', isDeleted: { $ne: true } }),
      CustomerHeaderDoc.countDocuments({ isDeleted: { $ne: true } })
    ]);

    res.json({
      success: true,
      counts: { draft: draftCount, saved: savedCount, pending_approval: pendingCount, approved: approvedCount, total: totalCount }
    });
  } catch (err) {
    console.error("getDocumentStatusCounts error:", err);
    res.status(500).json({ success: false, error: "Failed to get status counts", detail: err?.message });
  }
}
