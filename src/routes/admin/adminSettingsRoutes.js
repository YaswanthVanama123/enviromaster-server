import express from 'express';
import { AdminSettings } from "../../models/admin/index.js";
import logger from "../../utils/logger.js";

const router = express.Router();

// GET /api/admin-settings
router.get('/', async (req, res) => {
  try {
    const settings = await AdminSettings.getSingleton();
    return res.json({ success: true, settings });
  } catch (err) {
    logger.error('❌ [ADMIN-SETTINGS] GET failed:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/admin-settings
router.patch('/', async (req, res) => {
  try {
    const { defaultApprovalTaskOwner, approvalTaskSubject, payrollSettings } = req.body;
    const settings = await AdminSettings.getSingleton();

    if (defaultApprovalTaskOwner !== undefined) {
      settings.defaultApprovalTaskOwner = defaultApprovalTaskOwner;
    }
    if (approvalTaskSubject !== undefined) {
      settings.approvalTaskSubject = approvalTaskSubject;
    }
    if (payrollSettings !== undefined) {
      settings.payrollSettings = {
        ...settings.payrollSettings?.toObject?.() || settings.payrollSettings || {},
        ...payrollSettings,
      };
    }

    await settings.save();
    logger.debug('✅ [ADMIN-SETTINGS] Updated:', settings.toObject());
    return res.json({ success: true, settings });
  } catch (err) {
    logger.error('❌ [ADMIN-SETTINGS] PATCH failed:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
