/**
 * Daily new-customer distance backfill.
 *
 * Runs `launchMissingSync` once per day so customers added to RouteStar after the
 * last sync get their distances fetched without anyone pressing a button. Only
 * ever targets customers with no stored records — it never re-fetches existing
 * data, so it stays cheap.
 *
 * Deliberately dependency-free (no node-cron): a coarse interval tick plus a
 * "did it already run today?" check against MapDistanceSyncJob is enough, and it
 * survives restarts without a scheduler daemon or persisted timer state.
 */

import { MapDistanceSyncJob } from '../models/sync/index.js';
import logger from './logger.js';

const TICK_MS = 15 * 60 * 1000;

// Local hour (0-23) at which the backfill should run. Overridable so deployments
// can move it away from business hours; the scraper drives a headless browser.
const RUN_HOUR = Number.isFinite(Number(process.env.MAP_DISTANCE_DAILY_HOUR))
  ? Math.min(23, Math.max(0, Number(process.env.MAP_DISTANCE_DAILY_HOUR)))
  : 2;

let timer = null;
let runningTick = false;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function alreadyRanToday() {
  const job = await MapDistanceSyncJob.findOne({
    startedBy: 'scheduler:daily-missing',
    startedAt: { $gte: startOfToday() },
  })
    .select('_id')
    .lean();
  return !!job;
}

async function tick() {
  if (runningTick) return;
  runningTick = true;
  try {
    if (new Date().getHours() !== RUN_HOUR) return;
    if (await alreadyRanToday()) return;

    const { launchMissingSync } = await import(
      '../controllers/sync/mapDistanceController.js'
    );
    const result = await launchMissingSync({ startedBy: 'scheduler:daily-missing' });

    if (result.ok) {
      logger.info(
        `[MapDistance Scheduler] Daily backfill started for ${result.totalCustomers} new customer(s)`
      );
    } else if (result.code === 'nothing_missing') {
      logger.debug('[MapDistance Scheduler] Daily backfill skipped - no new customers');
    } else {
      logger.warn(`[MapDistance Scheduler] Daily backfill not started: ${result.error}`);
    }
  } catch (err) {
    logger.error('[MapDistance Scheduler] Daily backfill failed:', err);
  } finally {
    runningTick = false;
  }
}

export function startDailyMissingSyncScheduler() {
  if (timer) return;
  if (process.env.MAP_DISTANCE_DAILY_SYNC === 'false') {
    logger.info('[MapDistance Scheduler] Daily backfill disabled via MAP_DISTANCE_DAILY_SYNC=false');
    return;
  }
  timer = setInterval(() => {
    tick().catch(err =>
      logger.error('[MapDistance Scheduler] Unexpected tick error:', err)
    );
  }, TICK_MS);
  timer.unref?.();
  logger.info(`[MapDistance Scheduler] Daily new-customer backfill armed for ~${RUN_HOUR}:00 local`);
}

export function stopDailyMissingSyncScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export default startDailyMissingSyncScheduler;
