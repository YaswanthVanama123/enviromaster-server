/**
 * Map Distance Controller
 * Handles API endpoints for map distance functionality
 */

import { getMapDistance, MapDistanceSession } from '../../services/mapDistanceScraper.js';
import { RouteStarCustomer, CompanyMapping } from '../../models/customer/index.js';
import { MapDistanceRecord, MapDistanceSyncJob, FREQUENCY_MAP, FREQUENCY_REVERSE_MAP, DAY_OF_WEEK_MAP, DAY_OF_WEEK_REVERSE_MAP } from '../../models/sync/index.js';
import { getDrivingTime, buildAddressString } from '../../services/mapboxService.js';

// Account type detection constants
const ACCOUNT_TYPE_THRESHOLDS = {
  anchorMinRevenue: 200,
  anchorMinRevenueGreenline: 100,
  bread5MaxMiles: 2.5,
  bread15MaxMiles: 7.5,
  milesPerMinute: 0.5
};

// Store active sync job ID in memory for quick access
let activeSyncJobId = null;
// Store active browser session for batch operations
let activeSyncSession = null;

/**
 * Helper: Convert frequency string to number
 * Handles RouteStar's various frequency formats
 */
function frequencyToNumber(freqStr) {
  if (!freqStr) return 0;
  const normalized = freqStr.toLowerCase().trim();

  // Check direct match in FREQUENCY_REVERSE_MAP
  if (FREQUENCY_REVERSE_MAP[normalized] !== undefined) {
    return FREQUENCY_REVERSE_MAP[normalized];
  }

  // Handle RouteStar-specific frequency variations
  // MonthlyWeek1, MonthlyWeek2, MonthlyWeek3, MonthlyWeek4 -> Monthly (3)
  if (normalized.startsWith('monthlyweek')) {
    return 3; // Monthly
  }

  // Handle variations with/without hyphens
  if (normalized === 'bimonthly' || normalized === 'bi monthly') {
    return 14; // Bi-Monthly
  }
  if (normalized === 'biweekly' || normalized === 'bi weekly') {
    return 2; // Bi-Weekly
  }
  if (normalized === 'biannual' || normalized === 'bi annual') {
    return 5; // Bi-Annual
  }

  // Handle "onetime" without space
  if (normalized === 'onetime' || normalized === 'one-time') {
    return 7; // One Time
  }

  // Handle "every X weeks" variations
  if (normalized.includes('every') && normalized.includes('week')) {
    if (normalized.includes('4')) return 10; // Every 4 Weeks
    if (normalized.includes('6')) return 11; // Every 6 Weeks
    if (normalized.includes('8')) return 12; // Every 8 Weeks
  }

  // Handle EOW variations
  if (normalized.includes('eow') || normalized.includes('every other week')) {
    if (normalized.includes('odd')) return 8;
    if (normalized.includes('even')) return 9;
    return 2; // Default to Bi-Weekly
  }

  console.log(`[FREQUENCY] Unknown frequency string: "${freqStr}" (normalized: "${normalized}")`);
  return 0; // Unknown
}

/**
 * Helper: Convert day string to number
 */
function dayToNumber(dayStr) {
  if (!dayStr) return 7;
  const normalized = dayStr.toLowerCase().trim();
  return DAY_OF_WEEK_REVERSE_MAP[normalized] ?? 7;
}

/**
 * Helper: Convert frequency number to string
 */
function frequencyToString(freqNum) {
  return FREQUENCY_MAP[freqNum] ?? 'Unknown';
}

/**
 * Helper: Convert day number to string
 */
function dayToString(dayNum) {
  return DAY_OF_WEEK_MAP[dayNum] ?? 'Unknown';
}

/**
 * Initialize: Check for any running/paused jobs on startup and resume them
 */
export const initializeJobStatus = async () => {
  try {
    const interruptedJob = await MapDistanceSyncJob.findOne({
      status: { $in: ['running', 'paused'] },
      customerIds: { $exists: true, $ne: [] }
    });

    if (interruptedJob) {
      console.log('[MapDistance] Found interrupted job on startup:', interruptedJob._id);
      console.log(`[MapDistance] Progress: ${interruptedJob.processedCustomerIds?.length || 0}/${interruptedJob.customerIds?.length || 0}`);

      resumeInterruptedJob(interruptedJob._id).catch(err => {
        console.error('[MapDistance] Error resuming job:', err);
      });
    }
  } catch (error) {
    console.error('[MapDistance] Error initializing job status:', error);
  }
};

/**
 * Resume an interrupted job
 */
async function resumeInterruptedJob(jobId) {
  const job = await MapDistanceSyncJob.findById(jobId);
  if (!job) return;

  let processedIds = job.processedCustomerIds || [];
  let allIds = job.customerIds || [];

  if (allIds.length === 0) {
    console.log('[MapDistance] Legacy job detected - fetching customer list');

    let customers;
    if (job.jobType === 'update_sync') {
      const customerIdsWithData = await MapDistanceRecord.distinct('customerId');
      customers = await RouteStarCustomer.find({
        _id: { $in: customerIdsWithData },
        isActive: true
      }).select('_id').lean();
    } else {
      customers = await RouteStarCustomer.find({ isActive: true })
        .select('_id')
        .lean();
    }

    allIds = customers.map(c => c._id);

    await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
      customerIds: allIds
    });
  }

  if (processedIds.length === 0 && job.processedCustomers > 0) {
    console.log('[MapDistance] Legacy job - inferring processed customers from records');

    const recordsFromThisJob = await MapDistanceRecord.distinct('customerId', {
      syncJobId: jobId
    });

    processedIds = recordsFromThisJob;

    await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
      processedCustomerIds: processedIds
    });
  }

  const remainingIds = allIds.filter(id => !processedIds.some(pId => pId.toString() === id.toString()));

  console.log(`[MapDistance] Resume calculation: ${allIds.length} total, ${processedIds.length} processed, ${remainingIds.length} remaining`);

  if (remainingIds.length === 0) {
    await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      completedAt: new Date(),
      currentCustomerName: null
    });
    console.log('[MapDistance] Job was already complete');
    return;
  }

  const customers = await RouteStarCustomer.find({
    _id: { $in: remainingIds }
  }).select('_id name').lean();

  if (customers.length === 0) {
    await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      completedAt: new Date(),
      currentCustomerName: null
    });
    return;
  }

  await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
    status: 'running',
    totalCustomers: allIds.length,
    lastActivityAt: new Date(),
    $push: {
      errors: {
        customerName: 'System',
        error: `Resuming from ${processedIds.length}/${allIds.length}`,
        timestamp: new Date()
      }
    }
  });

  activeSyncJobId = jobId;
  console.log(`[MapDistance] Resuming job: ${customers.length} customers remaining`);

  runSyncJob(jobId, customers, true).catch(err => {
    console.error('[MapDistance] Error in resumed job:', err);
  });
}

/**
 * GET /api/map-distance/customers
 * Get all RouteStar customers for dropdown selection
 */
export const getRouteStarCustomers = async (req, res) => {
  try {
    const { search } = req.query;

    let query = { isActive: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await RouteStarCustomer.find(query)
      .select('routeStarId name company city state')
      .sort({ name: 1 })
      .limit(500)
      .lean();

    res.json({
      success: true,
      data: customers,
      total: customers.length
    });
  } catch (error) {
    console.error('Error fetching RouteStar customers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch customers'
    });
  }
};

/**
 * POST /api/map-distance/fetch
 * Start a background job to fetch map distance for a single customer
 */
export const fetchMapDistance = async (req, res) => {
  try {
    const { customerName } = req.body;

    if (!customerName) {
      return res.status(400).json({
        success: false,
        error: 'Customer name is required'
      });
    }

    const runningJob = await MapDistanceSyncJob.findOne({ status: 'running' }).lean();
    if (runningJob) {
      return res.status(400).json({
        success: false,
        error: 'A job is already running. Please wait for it to complete.',
        jobId: runningJob._id
      });
    }

    const customer = await RouteStarCustomer.findOne({
      name: { $regex: new RegExp(`^${customerName}$`, 'i') },
      isActive: true
    }).select('_id name').lean();

    const syncJob = new MapDistanceSyncJob({
      status: 'running',
      jobType: 'single_fetch',
      totalCustomers: 1,
      startedAt: new Date(),
      currentCustomerName: customerName,
      startedBy: req.body.startedBy || 'admin'
    });
    await syncJob.save();

    activeSyncJobId = syncJob._id;

    console.log(`[MapDistance] Starting background fetch for: ${customerName}, jobId: ${syncJob._id}`);

    runSingleFetchJob(syncJob._id, customerName, customer?._id).catch(err => {
      console.error('[MapDistance] Background fetch error:', err);
    });

    res.json({
      success: true,
      message: 'Fetch started in background',
      jobId: syncJob._id,
      customerName
    });
  } catch (error) {
    console.error('Error starting fetch:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start fetch'
    });
  }
};

/**
 * Background job for single customer fetch
 */
async function runSingleFetchJob(jobId, customerName, customerId) {
  console.log(`[MapDistance] Running single fetch for: ${customerName}`);

  try {
    const result = await getMapDistance(customerName, (progress, message) => {
      console.log(`[MapDistance] ${progress}% - ${message}`);
    });

    if (result.success && result.data && result.data.length > 0) {
      if (customerId) {
        await MapDistanceRecord.deleteMany({ customerId });

        const records = result.data.map(item => ({
          customerId,
          destinationCustomerName: item.customer || '',
          assignedTo: item.assignedTo || '',
          frequency: frequencyToNumber(item.frequency),
          serviceDate: parseDate(item.date),
          dayOfWeek: dayToNumber(item.day),
          stopNumber: parseInt(item.stop) || null,
          distanceMiles: parseDistance(item.distance),
          syncJobId: jobId
        }));

        if (records.length > 0) {
          await MapDistanceRecord.insertMany(records);
        }
      }

      await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
        status: 'completed',
        completedAt: new Date(),
        processedCustomers: 1,
        successfulCustomers: 1,
        recordsCreated: result.data.length,
        currentCustomerName: null,
        fetchedData: result.data
      });

      console.log(`[MapDistance] Single fetch completed: ${result.data.length} records`);
    } else {
      await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
        status: 'completed',
        completedAt: new Date(),
        processedCustomers: 1,
        successfulCustomers: 1,
        recordsCreated: 0,
        currentCustomerName: null,
        fetchedData: []
      });

      console.log(`[MapDistance] Single fetch completed: no data found`);
    }
  } catch (error) {
    console.error(`[MapDistance] Single fetch error:`, error.message);

    await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      completedAt: new Date(),
      processedCustomers: 1,
      failedCustomers: 1,
      currentCustomerName: null,
      $push: {
        errors: {
          customerName,
          error: error.message,
          timestamp: new Date()
        }
      }
    });
  }

  activeSyncJobId = null;
}

/**
 * POST /api/map-distance/sync/start
 * Start a full sync of all customers' map distances
 */
export const startSync = async (req, res) => {
  try {
    const runningJob = await MapDistanceSyncJob.findOne({ status: 'running' }).lean();
    if (runningJob) {
      return res.status(400).json({
        success: false,
        error: 'A sync job is already running',
        jobId: runningJob._id
      });
    }

    const customers = await RouteStarCustomer.find({ isActive: true })
      .select('_id name')
      .lean();

    if (customers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No customers found to sync'
      });
    }

    const syncJob = new MapDistanceSyncJob({
      status: 'running',
      jobType: 'full_sync',
      totalCustomers: customers.length,
      customerIds: customers.map(c => c._id),
      processedCustomerIds: [],
      startedAt: new Date(),
      lastActivityAt: new Date(),
      startedBy: req.body.startedBy || 'admin'
    });
    await syncJob.save();

    activeSyncJobId = syncJob._id;

    runSyncJob(syncJob._id, customers, false).catch(err => {
      console.error('[MapDistance Sync] Background job error:', err);
    });

    res.json({
      success: true,
      message: 'Sync started',
      jobId: syncJob._id,
      totalCustomers: customers.length
    });
  } catch (error) {
    console.error('Error starting sync:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start sync'
    });
  }
};

/**
 * Background sync job runner
 */
async function runSyncJob(jobId, customers, isResume = false) {
  console.log(`[MapDistance Sync] ${isResume ? 'Resuming' : 'Starting'} sync for ${customers.length} customers`);

  const syncJob = await MapDistanceSyncJob.findById(jobId);
  if (!syncJob) return;

  const session = new MapDistanceSession();
  activeSyncSession = session;

  try {
    console.log('[MapDistance Sync] Initializing browser session...');
    await session.initialize((progress, message) => {
      console.log(`[MapDistance Sync] Init: ${progress}% - ${message}`);
    });
    console.log('[MapDistance Sync] Browser session ready - starting customer processing');

    for (const customer of customers) {
      const currentJob = await MapDistanceSyncJob.findById(jobId);
      if (currentJob.status === 'cancelled') {
        console.log('[MapDistance Sync] Job was cancelled');
        activeSyncJobId = null;
        await session.close();
        activeSyncSession = null;
        return;
      }
      if (currentJob.status === 'paused') {
        console.log('[MapDistance Sync] Job was paused');
        activeSyncJobId = null;
        await session.close();
        activeSyncSession = null;
        return;
      }

      const totalProcessed = (currentJob.processedCustomerIds?.length || 0) + 1;
      await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
        processedCustomers: totalProcessed,
        currentCustomerName: customer.name,
        lastActivityAt: new Date()
      });

      console.log(`[MapDistance Sync] Processing ${totalProcessed}/${syncJob.totalCustomers}: ${customer.name}`);

      try {
        const result = await session.fetchForCustomer(customer.name, (progress, message) => {
        });

        if (result.success && result.data && result.data.length > 0) {
          await MapDistanceRecord.deleteMany({ customerId: customer._id });

          const records = result.data.map(item => ({
            customerId: customer._id,
            destinationCustomerName: item.customer || '',
            assignedTo: item.assignedTo || '',
            frequency: frequencyToNumber(item.frequency),
            serviceDate: parseDate(item.date),
            dayOfWeek: dayToNumber(item.day),
            stopNumber: parseInt(item.stop) || null,
            distanceMiles: parseDistance(item.distance),
            syncJobId: jobId
          }));

          if (records.length > 0) {
            await MapDistanceRecord.insertMany(records);
            await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
              $inc: {
                successfulCustomers: 1,
                recordsCreated: records.length
              },
              $push: { processedCustomerIds: customer._id },
              lastActivityAt: new Date()
            });
          }
        } else {
          await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
            $inc: { successfulCustomers: 1 },
            $push: { processedCustomerIds: customer._id },
            lastActivityAt: new Date()
          });
        }
      } catch (error) {
        console.error(`[MapDistance Sync] Error for ${customer.name}:`, error.message);

        await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
          $inc: { failedCustomers: 1 },
          $push: {
            processedCustomerIds: customer._id,
            errors: {
              customerName: customer.name,
              error: error.message,
              timestamp: new Date()
            }
          },
          lastActivityAt: new Date()
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
      status: 'completed',
      completedAt: new Date(),
      currentCustomerName: null
    });

    console.log('[MapDistance Sync] Sync completed');
  } catch (error) {
    console.error('[MapDistance Sync] Session error:', error.message);

    await MapDistanceSyncJob.findByIdAndUpdate(jobId, {
      status: 'failed',
      completedAt: new Date(),
      currentCustomerName: null,
      $push: {
        errors: {
          customerName: 'System',
          error: `Session error: ${error.message}`,
          timestamp: new Date()
        }
      }
    });
  } finally {
    if (session) {
      await session.close();
      activeSyncSession = null;
    }
    activeSyncJobId = null;
  }
}

/**
 * Helper: Parse date string to Date object
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Helper: Parse distance string to number
 */
function parseDistance(distanceStr) {
  if (!distanceStr) return null;
  const match = distanceStr.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * GET /api/map-distance/sync/status
 * Get current sync status
 */
export const getSyncStatus = async (req, res) => {
  try {
    const runningJob = await MapDistanceSyncJob.findOne({ status: 'running' }).lean();
    const pausedJob = await MapDistanceSyncJob.findOne({ status: 'paused' }).lean();
    const latestJob = await MapDistanceSyncJob.findOne()
      .sort({ createdAt: -1 })
      .lean();

    const isActuallyRunning = runningJob !== null &&
      activeSyncJobId !== null &&
      runningJob._id.toString() === activeSyncJobId.toString();

    const isInterrupted = (runningJob !== null && !isActuallyRunning);
    const isPaused = pausedJob !== null;

    res.json({
      success: true,
      isRunning: isActuallyRunning,
      isInterrupted: isInterrupted,
      isPaused: isPaused,
      job: runningJob || pausedJob || latestJob
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * POST /api/map-distance/sync/cancel
 * Cancel running sync job
 */
export const cancelSync = async (req, res) => {
  try {
    const runningJob = await MapDistanceSyncJob.findOne({ status: 'running' });

    if (!runningJob) {
      return res.status(400).json({
        success: false,
        error: 'No sync job is running'
      });
    }

    await MapDistanceSyncJob.findByIdAndUpdate(runningJob._id, {
      status: 'cancelled',
      completedAt: new Date()
    });

    if (activeSyncSession) {
      await activeSyncSession.close();
      activeSyncSession = null;
    }

    activeSyncJobId = null;

    res.json({
      success: true,
      message: 'Sync cancelled'
    });
  } catch (error) {
    console.error('Error cancelling sync:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * POST /api/map-distance/sync/pause
 * Pause running sync job (can be resumed later)
 */
export const pauseSync = async (req, res) => {
  try {
    const runningJob = await MapDistanceSyncJob.findOne({ status: 'running' });

    if (!runningJob) {
      return res.status(400).json({
        success: false,
        error: 'No sync job is running'
      });
    }

    await MapDistanceSyncJob.findByIdAndUpdate(runningJob._id, {
      status: 'paused',
      lastActivityAt: new Date(),
      $push: {
        errors: {
          customerName: 'System',
          error: `Paused by user at ${runningJob.processedCustomers}/${runningJob.totalCustomers}`,
          timestamp: new Date()
        }
      }
    });

    if (activeSyncSession) {
      await activeSyncSession.close();
      activeSyncSession = null;
    }

    activeSyncJobId = null;

    res.json({
      success: true,
      message: 'Sync paused',
      processedCustomers: runningJob.processedCustomers,
      totalCustomers: runningJob.totalCustomers
    });
  } catch (error) {
    console.error('Error pausing sync:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * POST /api/map-distance/sync/reset
 * Reset/cleanup stuck jobs (mark all running as failed)
 */
export const resetStuckJobs = async (req, res) => {
  try {
    const result = await MapDistanceSyncJob.updateMany(
      { status: 'running' },
      {
        $set: {
          status: 'failed',
          completedAt: new Date()
        },
        $push: {
          errors: {
            customerName: 'System',
            error: 'Manually reset by admin',
            timestamp: new Date()
          }
        }
      }
    );

    if (activeSyncSession) {
      await activeSyncSession.close();
      activeSyncSession = null;
    }

    activeSyncJobId = null;

    res.json({
      success: true,
      message: `Reset ${result.modifiedCount} stuck job(s)`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error resetting stuck jobs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * GET /api/map-distance/sync/history
 * Get sync history
 */
export const getSyncHistory = async (req, res) => {
  try {
    const history = await MapDistanceSyncJob.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error getting sync history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * GET /api/map-distance/records
 * Get stored distance records with pagination
 */
export const getStoredRecords = async (req, res) => {
  try {
    const { customerId, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};
    if (customerId) {
      query.customerId = customerId;
    }

    const sortOrder = customerId ? { distanceMiles: 1 } : { serviceDate: -1 };

    const [records, total] = await Promise.all([
      MapDistanceRecord.find(query)
        .populate('customerId', 'name company city')
        .sort(sortOrder)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      MapDistanceRecord.countDocuments(query)
    ]);

    const mappedRecords = records.map(record => ({
      ...record,
      frequency: frequencyToString(record.frequency),
      dayOfWeek: dayToString(record.dayOfWeek)
    }));

    res.json({
      success: true,
      data: mappedRecords,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error getting stored records:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * GET /api/map-distance/records/:customerId
 * Get distance records for a specific customer
 */
export const getCustomerRecords = async (req, res) => {
  try {
    const { customerId } = req.params;

    const records = await MapDistanceRecord.find({ customerId })
      .sort({ serviceDate: -1 })
      .lean();

    const customer = await RouteStarCustomer.findById(customerId)
      .select('name company city')
      .lean();

    res.json({
      success: true,
      customer,
      data: records,
      total: records.length
    });
  } catch (error) {
    console.error('Error getting customer records:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * GET /api/map-distance/customers-with-data
 * Get list of customers that have stored distance records (for filter dropdown)
 */
export const getCustomersWithData = async (req, res) => {
  try {
    const { search } = req.query;

    const customerIdsWithData = await MapDistanceRecord.distinct('customerId');

    if (customerIdsWithData.length === 0) {
      return res.json({
        success: true,
        data: [],
        total: 0
      });
    }

    let query = { _id: { $in: customerIdsWithData } };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await RouteStarCustomer.find(query)
      .select('_id routeStarId name company city state')
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      data: customers,
      total: customers.length
    });
  } catch (error) {
    console.error('Error getting customers with data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get customers with data'
    });
  }
};

/**
 * GET /api/map-distance/stats
 * Get statistics about stored distance data
 */
export const getStats = async (req, res) => {
  try {
    const [totalRecords, customersWithData, lastSync] = await Promise.all([
      MapDistanceRecord.countDocuments(),
      MapDistanceRecord.distinct('customerId').then(ids => ids.length),
      MapDistanceSyncJob.findOne({ status: 'completed' }).sort({ completedAt: -1 }).lean()
    ]);

    let storageSizeBytes = 0;
    let storageSizeFormatted;
    let avgBytesPerRecord = 0;

    try {
      const db = MapDistanceRecord.db;
      if (db) {
        const stats = await db.command({ collStats: 'mapdistancerecords' }).catch(() => null);
        if (stats) {
          storageSizeBytes = stats.storageSize || stats.size || 0;
        }
      }
    } catch (e) {
      storageSizeBytes = totalRecords * 150;
    }

    if (storageSizeBytes === 0 && totalRecords > 0) {
      storageSizeBytes = totalRecords * 150;
    }

    avgBytesPerRecord = totalRecords > 0 ? Math.round(storageSizeBytes / totalRecords) : 0;

    if (storageSizeBytes < 1024) {
      storageSizeFormatted = `${storageSizeBytes} B`;
    } else if (storageSizeBytes < 1024 * 1024) {
      storageSizeFormatted = `${(storageSizeBytes / 1024).toFixed(2)} KB`;
    } else if (storageSizeBytes < 1024 * 1024 * 1024) {
      storageSizeFormatted = `${(storageSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      storageSizeFormatted = `${(storageSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    res.json({
      success: true,
      stats: {
        totalRecords,
        customersWithData,
        lastSyncAt: lastSync?.completedAt || null,
        lastSyncRecords: lastSync?.recordsCreated || 0,
        storageSizeBytes,
        storageSizeFormatted,
        avgBytesPerRecord
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * POST /api/map-distance/sync/update
 * Update/refresh data for customers that already have records
 */
export const startUpdateSync = async (req, res) => {
  try {
    const runningJob = await MapDistanceSyncJob.findOne({ status: 'running' }).lean();
    if (runningJob) {
      return res.status(400).json({
        success: false,
        error: 'A sync job is already running',
        jobId: runningJob._id
      });
    }

    const customerIdsWithData = await MapDistanceRecord.distinct('customerId');

    if (customerIdsWithData.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No customers with existing data to update. Run a full sync first.'
      });
    }

    const customers = await RouteStarCustomer.find({
      _id: { $in: customerIdsWithData },
      isActive: true
    })
      .select('_id name')
      .lean();

    if (customers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No active customers found to update'
      });
    }

    const syncJob = new MapDistanceSyncJob({
      status: 'running',
      jobType: 'update_sync',
      totalCustomers: customers.length,
      customerIds: customers.map(c => c._id),
      processedCustomerIds: [],
      startedAt: new Date(),
      lastActivityAt: new Date(),
      startedBy: req.body.startedBy || 'admin'
    });
    await syncJob.save();

    activeSyncJobId = syncJob._id;

    runSyncJob(syncJob._id, customers, false).catch(err => {
      console.error('[MapDistance Update Sync] Background job error:', err);
    });

    res.json({
      success: true,
      message: 'Update sync started',
      jobId: syncJob._id,
      totalCustomers: customers.length
    });
  } catch (error) {
    console.error('Error starting update sync:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start update sync'
    });
  }
};

/**
 * POST /api/map-distance/sync/resume
 * Manually resume a paused or interrupted job
 */
export const resumeSync = async (req, res) => {
  try {
    const { jobId } = req.body;

    let job;
    if (jobId) {
      job = await MapDistanceSyncJob.findById(jobId);
    } else {
      job = await MapDistanceSyncJob.findOne({
        status: { $in: ['paused', 'running'] },
        customerIds: { $exists: true, $ne: [] }
      }).sort({ createdAt: -1 });
    }

    if (!job) {
      return res.status(400).json({
        success: false,
        error: 'No resumable job found'
      });
    }

    if (activeSyncJobId && activeSyncJobId.toString() !== job._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Another job is currently running'
      });
    }

    const processedIds = job.processedCustomerIds || [];
    const allIds = job.customerIds || [];
    const remainingIds = allIds.filter(id => !processedIds.some(pId => pId.toString() === id.toString()));

    if (remainingIds.length === 0) {
      await MapDistanceSyncJob.findByIdAndUpdate(job._id, {
        status: 'completed',
        completedAt: new Date()
      });
      return res.json({
        success: true,
        message: 'Job was already complete',
        jobId: job._id
      });
    }

    resumeInterruptedJob(job._id).catch(err => {
      console.error('[MapDistance] Resume error:', err);
    });

    res.json({
      success: true,
      message: `Resuming job from ${processedIds.length}/${allIds.length}`,
      jobId: job._id,
      remainingCustomers: remainingIds.length
    });
  } catch (error) {
    console.error('Error resuming sync:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to resume sync'
    });
  }
};

/**
 * DELETE /api/map-distance/records
 * Delete all stored distance records
 */
export const deleteAllRecords = async (req, res) => {
  try {
    const runningJob = await MapDistanceSyncJob.findOne({ status: 'running' });
    if (runningJob) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete records while a sync is running. Please cancel the sync first.'
      });
    }

    const result = await MapDistanceRecord.deleteMany({});
    await MapDistanceSyncJob.deleteMany({});

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} records and all sync history`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting records:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete records'
    });
  }
};

/**
 * POST /api/map-distance/detect-account-type
 * Detect account type based on distance data
 */
export const detectAccountType = async (req, res) => {
  try {
    const { biginCompanyId, routeStarCustomerId, perVisitRevenue, isGreenline } = req.body;

    let rsCustomerId = routeStarCustomerId;
    let customerName = null;

    if (biginCompanyId && !rsCustomerId) {
      const mapping = await CompanyMapping.findOne({
        biginId: biginCompanyId,
        mappingStatus: 'mapped'
      }).lean();

      if (mapping && mapping.routeStarCustomerId) {
        rsCustomerId = mapping.routeStarCustomerId;
        customerName = mapping.routeStarCustomerName;
      } else {
        return res.json({
          success: true,
          accountType: 'Pit',
          confidence: 'low',
          reason: 'No RouteStar mapping found for this Bigin company',
          distanceMiles: null,
          drivingTimeMinutes: null,
          nearestAnchor: null
        });
      }
    }

    if (perVisitRevenue !== undefined && perVisitRevenue !== null) {
      const threshold = isGreenline
        ? ACCOUNT_TYPE_THRESHOLDS.anchorMinRevenueGreenline
        : ACCOUNT_TYPE_THRESHOLDS.anchorMinRevenue;

      if (perVisitRevenue >= threshold) {
        return res.json({
          success: true,
          accountType: 'Anchor',
          confidence: 'high',
          reason: `Revenue $${perVisitRevenue.toFixed(2)} meets ${isGreenline ? 'Greenline' : 'standard'} Anchor threshold of $${threshold}`,
          distanceMiles: null,
          drivingTimeMinutes: null,
          nearestAnchor: null
        });
      }
    }

    if (!rsCustomerId) {
      return res.json({
        success: true,
        accountType: 'Pit',
        confidence: 'low',
        reason: 'No RouteStar customer specified',
        distanceMiles: null,
        drivingTimeMinutes: null,
        nearestAnchor: null
      });
    }

    const distanceRecords = await MapDistanceRecord.find({ customerId: rsCustomerId })
      .sort({ distanceMiles: 1 })
      .limit(5)
      .lean();

    if (!distanceRecords || distanceRecords.length === 0) {
      return res.json({
        success: true,
        accountType: 'Pit',
        confidence: 'low',
        reason: 'No distance data available for this customer',
        distanceMiles: null,
        drivingTimeMinutes: null,
        nearestAnchor: null,
        customerName
      });
    }

    const nearestRecord = distanceRecords.find(r => r.distanceMiles && r.distanceMiles > 0) || distanceRecords[0];

    if (!nearestRecord || nearestRecord.distanceMiles === null || nearestRecord.distanceMiles === undefined) {
      return res.json({
        success: true,
        accountType: 'Pit',
        confidence: 'low',
        reason: 'No valid distance data found',
        distanceMiles: null,
        drivingTimeMinutes: null,
        nearestAnchor: null,
        customerName
      });
    }

    const distanceMiles = nearestRecord.distanceMiles;
    const drivingTimeMinutes = distanceMiles / ACCOUNT_TYPE_THRESHOLDS.milesPerMinute;
    const nearestAnchor = nearestRecord.destinationCustomerName || nearestRecord.assignedTo || 'Unknown';

    let accountType;
    let confidence = 'high';
    let reason;

    if (distanceMiles <= ACCOUNT_TYPE_THRESHOLDS.bread5MaxMiles) {
      accountType = 'Bread5';
      reason = `${distanceMiles.toFixed(1)} miles (~${drivingTimeMinutes.toFixed(0)} min) from ${nearestAnchor} - within 5 min drive`;
    } else if (distanceMiles <= ACCOUNT_TYPE_THRESHOLDS.bread15MaxMiles) {
      accountType = 'Bread15';
      reason = `${distanceMiles.toFixed(1)} miles (~${drivingTimeMinutes.toFixed(0)} min) from ${nearestAnchor} - within 15 min drive`;
    } else {
      accountType = 'Pit';
      reason = `${distanceMiles.toFixed(1)} miles (~${drivingTimeMinutes.toFixed(0)} min) from ${nearestAnchor} - beyond 15 min drive`;
    }

    res.json({
      success: true,
      accountType,
      confidence,
      reason,
      distanceMiles,
      drivingTimeMinutes,
      nearestAnchor,
      customerName,
      thresholds: ACCOUNT_TYPE_THRESHOLDS
    });

  } catch (error) {
    console.error('Error detecting account type:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to detect account type'
    });
  }
};

/**
 * POST /api/map-distance/detect-account-type-mapbox
 * Detect account type using Mapbox API for accurate driving time calculation
 */
export const detectAccountTypeWithMapbox = async (req, res) => {
  try {
    const { biginCompanyId, frequency } = req.body;

    if (!biginCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'biginCompanyId is required'
      });
    }

    // 1. Find mapping for Bigin company
    const mapping = await CompanyMapping.findOne({
      biginId: biginCompanyId,
      mappingStatus: 'mapped'
    }).lean();

    if (!mapping || !mapping.routeStarCustomerId) {
      return res.json({
        success: false,
        error: 'No RouteStar mapping found for this Bigin company',
        biginCompanyName: mapping?.biginCompanyName || null
      });
    }

    // 2. Get the mapped RouteStar customer with address
    const customer = await RouteStarCustomer.findById(mapping.routeStarCustomerId).lean();

    if (!customer) {
      return res.json({
        success: false,
        error: 'Mapped RouteStar customer not found'
      });
    }

    const fromAddress = buildAddressString(customer);

    if (!fromAddress || fromAddress.trim() === '') {
      return res.json({
        success: false,
        error: 'Customer does not have a valid address',
        biginCompany: mapping.biginCompanyName,
        routeStarCustomer: customer.name
      });
    }

    // 3. Build query for distance records (filter by frequency if provided)
    const distanceQuery = {
      customerId: mapping.routeStarCustomerId,
      destinationCustomerName: { $nin: [customer.name, ""], $exists: true },
      distanceMiles: { $gt: 0 }  // Exclude 0-mile records
    };

    // Add frequency filter if provided
    if (frequency !== undefined && frequency !== null && frequency !== '') {
      distanceQuery.frequency = parseInt(frequency, 10);
      console.log(`📊 Filtering by frequency: ${frequency} (${FREQUENCY_MAP[frequency] || 'Unknown'})`);
    }

    // Get top 3 lowest distance destinations
    const distanceRecords = await MapDistanceRecord.find(distanceQuery)
      .sort({ distanceMiles: 1 })
      .limit(3)
      .lean();

    if (!distanceRecords || distanceRecords.length === 0) {
      const frequencyLabel = frequency !== undefined ? ` with frequency ${FREQUENCY_MAP[frequency] || frequency}` : '';
      return res.json({
        success: false,
        error: `No distance data available for this customer${frequencyLabel}`,
        biginCompany: mapping.biginCompanyName,
        routeStarCustomer: customer.name,
        fromAddress,
        frequencyFilter: frequency !== undefined ? { value: frequency, label: FREQUENCY_MAP[frequency] || 'Unknown' } : null
      });
    }

    // 4. For each destination, get actual driving time via Mapbox
    const destinations = [];
    let shortestDrivingTime = null;
    let shortestDestination = null;

    for (const record of distanceRecords) {
      // Find the destination customer to get their address (case-insensitive search)
      let destCustomer = await RouteStarCustomer.findOne({
        name: { $regex: new RegExp(`^${record.destinationCustomerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      }).lean();

      // Fallback: try partial match if exact match fails
      if (!destCustomer) {
        destCustomer = await RouteStarCustomer.findOne({
          name: { $regex: new RegExp(record.destinationCustomerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
        }).lean();
      }

      if (destCustomer) {
        const toAddress = buildAddressString(destCustomer);

        if (toAddress && toAddress.trim() !== '') {
          try {
            const drivingResult = await getDrivingTime(fromAddress, toAddress);

            const destResult = {
              destination: record.destinationCustomerName,
              address: toAddress,
              storedDistanceMiles: record.distanceMiles,
              mapboxDistanceMiles: parseFloat(drivingResult.distanceMiles.toFixed(2)),
              drivingTimeMinutes: parseFloat(drivingResult.durationMinutes.toFixed(1))
            };

            destinations.push(destResult);

            // Track shortest driving time
            if (shortestDrivingTime === null || drivingResult.durationMinutes < shortestDrivingTime) {
              shortestDrivingTime = drivingResult.durationMinutes;
              shortestDestination = destResult;
            }
          } catch (mapboxError) {
            console.error(`Mapbox error for ${record.destinationCustomerName}:`, mapboxError.message);
            destinations.push({
              destination: record.destinationCustomerName,
              address: toAddress,
              storedDistanceMiles: record.distanceMiles,
              error: mapboxError.message
            });
          }
        } else {
          destinations.push({
            destination: record.destinationCustomerName,
            storedDistanceMiles: record.distanceMiles,
            error: 'No address available'
          });
        }
      } else {
        destinations.push({
          destination: record.destinationCustomerName,
          storedDistanceMiles: record.distanceMiles,
          error: 'Customer not found in database'
        });
      }
    }

    // 5. Determine account type based on shortest driving time
    let accountType = 'Pit';
    let reason = '';

    if (shortestDrivingTime !== null) {
      if (shortestDrivingTime <= 5) {
        accountType = 'Bread5';
        reason = `${shortestDrivingTime.toFixed(1)} min drive to ${shortestDestination.destination} - within 5 min`;
      } else if (shortestDrivingTime <= 15) {
        accountType = 'Bread15';
        reason = `${shortestDrivingTime.toFixed(1)} min drive to ${shortestDestination.destination} - within 15 min`;
      } else {
        // accountType already set
        reason = `${shortestDrivingTime.toFixed(1)} min drive to ${shortestDestination.destination} - beyond 15 min`;
      }
    } else {
      reason = 'Could not calculate driving time to any destination';
    }

    res.json({
      success: true,
      biginCompany: mapping.biginCompanyName,
      routeStarCustomer: customer.name,
      fromAddress,
      destinations,
      accountType,
      shortestDrivingTime: shortestDrivingTime ? parseFloat(shortestDrivingTime.toFixed(1)) : null,
      nearestDestination: shortestDestination?.destination || null,
      reason,
      thresholds: {
        bread5MaxMinutes: 5,
        bread15MaxMinutes: 15
      }
    });

  } catch (error) {
    console.error('Error detecting account type with Mapbox:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to detect account type'
    });
  }
};

/**
 * POST /api/map-distance/detect-account-type-batch
 * Detect account types for multiple frequencies in one call
 * Optimized for form filling where multiple services have different frequencies
 */
export const detectAccountTypeBatch = async (req, res) => {
  try {
    const { biginCompanyId, frequencies } = req.body;

    if (!biginCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'biginCompanyId is required'
      });
    }

    if (!Array.isArray(frequencies) || frequencies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'frequencies array is required'
      });
    }

    console.log(`[BATCH-DETECT] Detecting account types for ${frequencies.length} frequencies`);

    // 1. Find mapping for Bigin company (once for all frequencies)
    const mapping = await CompanyMapping.findOne({
      biginId: biginCompanyId,
      mappingStatus: 'mapped'
    }).lean();

    if (!mapping || !mapping.routeStarCustomerId) {
      // Return Pit for all frequencies if no mapping
      const results = {};
      frequencies.forEach(freq => {
        results[freq] = {
          accountType: 'Pit',
          confidence: 'low',
          reason: 'No RouteStar mapping found',
          drivingTimeMinutes: null,
          nearestDestination: null
        };
      });

      return res.json({
        success: false,
        error: 'No RouteStar mapping found for this Bigin company',
        biginCompanyName: mapping?.biginCompanyName || null,
        results
      });
    }

    // 2. Get the mapped RouteStar customer with address (once)
    const customer = await RouteStarCustomer.findById(mapping.routeStarCustomerId).lean();

    if (!customer) {
      const results = {};
      frequencies.forEach(freq => {
        results[freq] = {
          accountType: 'Pit',
          confidence: 'low',
          reason: 'Mapped RouteStar customer not found',
          drivingTimeMinutes: null,
          nearestDestination: null
        };
      });

      return res.json({
        success: false,
        error: 'Mapped RouteStar customer not found',
        results
      });
    }

    const fromAddress = buildAddressString(customer);

    if (!fromAddress || fromAddress.trim() === '') {
      const results = {};
      frequencies.forEach(freq => {
        results[freq] = {
          accountType: 'Pit',
          confidence: 'low',
          reason: 'Customer does not have a valid address',
          drivingTimeMinutes: null,
          nearestDestination: null
        };
      });

      return res.json({
        success: false,
        error: 'Customer does not have a valid address',
        biginCompany: mapping.biginCompanyName,
        routeStarCustomer: customer.name,
        results
      });
    }

    // 3. Process each frequency
    const results = {};

    for (const frequency of frequencies) {
      const freqNum = parseInt(frequency, 10);
      console.log(`  📊 Processing frequency: ${freqNum} (${FREQUENCY_MAP[freqNum] || 'Unknown'})`);

      try {
        // Build query for this frequency
        const distanceQuery = {
          customerId: mapping.routeStarCustomerId,
          destinationCustomerName: { $nin: [customer.name, ""], $exists: true },
          distanceMiles: { $gt: 0 },
          frequency: freqNum
        };

        // Get top 3 lowest distance destinations for this frequency
        const distanceRecords = await MapDistanceRecord.find(distanceQuery)
          .sort({ distanceMiles: 1 })
          .limit(3)
          .lean();

        if (!distanceRecords || distanceRecords.length === 0) {
          // Fallback: try without frequency filter
          const fallbackQuery = {
            customerId: mapping.routeStarCustomerId,
            destinationCustomerName: { $nin: [customer.name, ""], $exists: true },
            distanceMiles: { $gt: 0 }
          };

          const fallbackRecords = await MapDistanceRecord.find(fallbackQuery)
            .sort({ distanceMiles: 1 })
            .limit(3)
            .lean();

          if (!fallbackRecords || fallbackRecords.length === 0) {
            results[freqNum] = {
              accountType: 'Pit',
              confidence: 'low',
              reason: `No distance data available for frequency ${FREQUENCY_MAP[freqNum] || freqNum}`,
              drivingTimeMinutes: null,
              nearestDestination: null,
              usedFallback: false
            };
            continue;
          }

          // Use fallback records
          const fallbackResult = await processDistanceRecords(fallbackRecords, fromAddress);
          results[freqNum] = {
            ...fallbackResult,
            usedFallback: true,
            fallbackReason: `No data for ${FREQUENCY_MAP[freqNum] || freqNum}, using general distances`
          };
          continue;
        }

        // Process distance records for this frequency
        const result = await processDistanceRecords(distanceRecords, fromAddress);
        results[freqNum] = {
          ...result,
          usedFallback: false
        };

      } catch (freqError) {
        console.error(`Error processing frequency ${freqNum}:`, freqError.message);
        results[freqNum] = {
          accountType: 'Pit',
          confidence: 'low',
          reason: `Error: ${freqError.message}`,
          drivingTimeMinutes: null,
          nearestDestination: null,
          error: freqError.message
        };
      }
    }

    console.log(`[BATCH-DETECT] Completed - processed ${Object.keys(results).length} frequencies`);

    res.json({
      success: true,
      biginCompany: mapping.biginCompanyName,
      routeStarCustomer: customer.name,
      fromAddress,
      results,
      thresholds: {
        bread5MaxMinutes: 5,
        bread15MaxMinutes: 15
      }
    });

  } catch (error) {
    console.error('Error in batch account type detection:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to detect account types'
    });
  }
};

/**
 * Helper function to process distance records and determine account type
 */
async function processDistanceRecords(distanceRecords, fromAddress) {
  let shortestDrivingTime = null;
  let shortestDestination = null;
  const destinations = [];

  for (const record of distanceRecords) {
    // Find the destination customer to get their address
    let destCustomer = await RouteStarCustomer.findOne({
      name: { $regex: new RegExp(`^${record.destinationCustomerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    }).lean();

    if (!destCustomer) {
      destCustomer = await RouteStarCustomer.findOne({
        name: { $regex: new RegExp(record.destinationCustomerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      }).lean();
    }

    if (destCustomer) {
      const toAddress = buildAddressString(destCustomer);

      if (toAddress && toAddress.trim() !== '') {
        try {
          const drivingResult = await getDrivingTime(fromAddress, toAddress);

          destinations.push({
            destination: record.destinationCustomerName,
            drivingTimeMinutes: parseFloat(drivingResult.durationMinutes.toFixed(1))
          });

          if (shortestDrivingTime === null || drivingResult.durationMinutes < shortestDrivingTime) {
            shortestDrivingTime = drivingResult.durationMinutes;
            shortestDestination = record.destinationCustomerName;
          }
        } catch (mapboxError) {
          // Try distance-based estimation as fallback
          const estimatedTime = record.distanceMiles / 0.5; // ~30mph average
          if (shortestDrivingTime === null || estimatedTime < shortestDrivingTime) {
            shortestDrivingTime = estimatedTime;
            shortestDestination = record.destinationCustomerName;
          }
        }
      }
    }
  }

  // Determine account type
  let accountType = 'Pit';
  let reason = '';
  let confidence = 'high';

  if (shortestDrivingTime !== null) {
    if (shortestDrivingTime <= 5) {
      accountType = 'Bread5';
      reason = `${shortestDrivingTime.toFixed(1)} min to ${shortestDestination}`;
    } else if (shortestDrivingTime <= 15) {
      accountType = 'Bread15';
      reason = `${shortestDrivingTime.toFixed(1)} min to ${shortestDestination}`;
    } else {
      // accountType already set
      reason = `${shortestDrivingTime.toFixed(1)} min to ${shortestDestination} (>15 min)`;
    }
  } else {
    reason = 'Could not calculate driving time';
    confidence = 'low';
  }

  return {
    accountType,
    confidence,
    reason,
    drivingTimeMinutes: shortestDrivingTime ? parseFloat(shortestDrivingTime.toFixed(1)) : null,
    nearestDestination: shortestDestination,
    destinations
  };
}

/**
 * GET /api/map-distance/customer-distances/:customerId
 * Get all distance records for a specific customer (for UI display)
 */
export const getCustomerDistances = async (req, res) => {
  try {
    const { customerId } = req.params;

    const records = await MapDistanceRecord.find({ customerId })
      .sort({ distanceMiles: 1 })
      .lean();

    const mappedRecords = records.map(record => ({
      ...record,
      frequency: frequencyToString(record.frequency),
      dayOfWeek: dayToString(record.dayOfWeek)
    }));

    res.json({
      success: true,
      data: mappedRecords,
      total: mappedRecords.length
    });
  } catch (error) {
    console.error('Error getting customer distances:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export default {
  initializeJobStatus,
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
};
