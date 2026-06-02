/**
 * Account Type Detection Routes
 * Routes for auto-detecting account types based on revenue and distance
 */

import express from 'express';
import {
  detect,
  detectBatch,
  getThresholds,
} from '../../controllers/product/accountTypeController.js';

const router = express.Router();

/**
 * @route   GET /api/account-type/thresholds
 * @desc    Get account type detection thresholds and rules
 * @access  Public
 */
router.get('/thresholds', getThresholds);

/**
 * @route   POST /api/account-type/detect
 * @desc    Detect account type for a single location
 * @access  Public
 * @body    { perVisitRevenue: number, distanceToAnchorMiles?: number, isGreenline?: boolean }
 */
router.post('/detect', detect);

/**
 * @route   POST /api/account-type/detect-batch
 * @desc    Detect account types for multiple locations
 * @access  Public
 * @body    { locations: Array<{ perVisitRevenue, distanceToAnchorMiles?, isGreenline?, customerId?, customerName? }> }
 */
router.post('/detect-batch', detectBatch);

export default router;
