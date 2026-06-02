/**
 * Map Distance Routes
 * Routes for map distance functionality
 */

import express from 'express';
import {
  getRouteStarCustomers,
  fetchMapDistance,
  startSync,
  startUpdateSync,
  resumeSync,
  pauseSync,
  getSyncStatus,
  cancelSync,
  resetStuckJobs,
  getSyncHistory,
  getStoredRecords,
  getCustomerRecords,
  getCustomersWithData,
  getStats,
  deleteAllRecords,
  detectAccountType,
  detectAccountTypeWithMapbox,
  detectAccountTypeBatch,
  getCustomerDistances
} from '../../controllers/sync/mapDistanceController.js';

const router = express.Router();

// GET /api/map-distance/customers - Get all RouteStar customers for dropdown
router.get('/customers', getRouteStarCustomers);

// POST /api/map-distance/fetch - Fetch map distance for a customer (live)
router.post('/fetch', fetchMapDistance);

// Sync endpoints
// POST /api/map-distance/sync/start - Start syncing all customers
router.post('/sync/start', startSync);

// POST /api/map-distance/sync/update - Update existing customer data only
router.post('/sync/update', startUpdateSync);

// GET /api/map-distance/sync/status - Get current sync status
router.get('/sync/status', getSyncStatus);

// POST /api/map-distance/sync/cancel - Cancel running sync
router.post('/sync/cancel', cancelSync);

// POST /api/map-distance/sync/pause - Pause running sync (can resume later)
router.post('/sync/pause', pauseSync);

// POST /api/map-distance/sync/reset - Reset stuck jobs
router.post('/sync/reset', resetStuckJobs);

// POST /api/map-distance/sync/resume - Resume interrupted job
router.post('/sync/resume', resumeSync);

// GET /api/map-distance/sync/history - Get sync job history
router.get('/sync/history', getSyncHistory);

// Stored records endpoints
// GET /api/map-distance/records - Get all stored records (paginated)
router.get('/records', getStoredRecords);

// GET /api/map-distance/customers-with-data - Get customers that have stored records
router.get('/customers-with-data', getCustomersWithData);

// GET /api/map-distance/records/:customerId - Get records for a customer
router.get('/records/:customerId', getCustomerRecords);

// DELETE /api/map-distance/records - Delete all stored records
router.delete('/records', deleteAllRecords);

// GET /api/map-distance/stats - Get statistics
router.get('/stats', getStats);

// Account type detection endpoints
// POST /api/map-distance/detect-account-type - Detect account type based on distance
router.post('/detect-account-type', detectAccountType);

// POST /api/map-distance/detect-account-type-mapbox - Detect account type using Mapbox for driving time
router.post('/detect-account-type-mapbox', detectAccountTypeWithMapbox);

// POST /api/map-distance/detect-account-type-batch - Detect account types for multiple frequencies
router.post('/detect-account-type-batch', detectAccountTypeBatch);

// GET /api/map-distance/customer-distances/:customerId - Get all distances for a customer
router.get('/customer-distances/:customerId', getCustomerDistances);

export default router;
