import logger from './logger.js';

let active = null;
const waiters = [];

export function getActiveAutomation() {
  if (!active) return null;
  return { label: active.label, startedAt: active.startedAt };
}

export function getQueuedAutomations() {
  return waiters.map((w) => w.label);
}

function grantTo(waiter) {
  const token = Symbol(waiter.label);
  active = { label: waiter.label, token, startedAt: new Date() };
  logger.debug(`[browser-gate] "${waiter.label}" acquired the browser`);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (active && active.token === token) {
      logger.debug(`[browser-gate] "${waiter.label}" released the browser`);
      active = null;
      const next = waiters.shift();
      if (next) grantTo(next);
    }
  };

  waiter.resolve(release);
}

export function acquireBrowserGate(label, { onQueued } = {}) {
  return new Promise((resolve) => {
    const waiter = { label, resolve };

    if (!active) {
      grantTo(waiter);
      return;
    }

    const blockingLabel = active.label;
    waiters.push(waiter);
    logger.debug(
      `[browser-gate] "${label}" is waiting behind "${blockingLabel}" (queue depth ${waiters.length})`
    );
    if (typeof onQueued === 'function') {
      try {
        onQueued(blockingLabel, waiters.length);
      } catch (err) {
        logger.warn('[browser-gate] onQueued callback failed:', err?.message || err);
      }
    }
  });
}

export default { getActiveAutomation, getQueuedAutomations, acquireBrowserGate };
