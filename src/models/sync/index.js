/**
 * Sync Models - Index
 * Exports all sync/job-related models
 */

import BiginScrapeSession, {
  SCRAPE_SESSION_STATUS,
} from "./BiginScrapeSession.model.js";

import {
  MapDistanceRecord,
  MapDistanceSyncJob,
  FREQUENCY_MAP,
  FREQUENCY_REVERSE_MAP,
  DAY_OF_WEEK_MAP,
  DAY_OF_WEEK_REVERSE_MAP,
  SYNC_JOB_STATUS,
  SYNC_JOB_TYPE,
} from "./MapDistance.model.js";

import ZohoMapping from "./ZohoMapping.model.js";
import ZohoUploadArchive from "./ZohoUploadArchive.model.js";

export {
  // Models
  BiginScrapeSession,
  MapDistanceRecord,
  MapDistanceSyncJob,
  ZohoMapping,
  ZohoUploadArchive,

  // Constants
  SCRAPE_SESSION_STATUS,
  FREQUENCY_MAP,
  FREQUENCY_REVERSE_MAP,
  DAY_OF_WEEK_MAP,
  DAY_OF_WEEK_REVERSE_MAP,
  SYNC_JOB_STATUS,
  SYNC_JOB_TYPE,
};

export default {
  BiginScrapeSession,
  MapDistanceRecord,
  MapDistanceSyncJob,
  ZohoMapping,
  ZohoUploadArchive,
};
