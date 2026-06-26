import { chromium } from 'playwright-core';
import logger from './logger.js';

export const BROWSER_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--mute-audio',
  '--no-first-run',
  '--no-zygote',
  '--js-flags=--max-old-space-size=512',
];

export async function launchHardenedBrowser(extraArgs = []) {
  const seen = new Set();
  const args = [...BROWSER_LAUNCH_ARGS, ...extraArgs].filter((arg) => {
    if (seen.has(arg)) return false;
    seen.add(arg);
    return true;
  });

  return chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    args,
  });
}

export async function closeBrowserQuietly(browser) {
  if (!browser) return;
  try {
    await browser.close();
  } catch (err) {
    logger.warn('[browser] close failed:', err?.message || err);
  }
}

export default { BROWSER_LAUNCH_ARGS, launchHardenedBrowser, closeBrowserQuietly };
