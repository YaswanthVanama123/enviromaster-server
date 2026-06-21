/**
 * Zoho Bigin Audit Log Scraper Service
 * Scrapes audit history from Zoho Bigin using Playwright
 * Stops when it reaches logs already in our database
 */

import { chromium } from 'playwright-core';
import path from 'path';
import fs from 'fs';
import { BiginAuditLog } from "#models/logging/index.js";
import logger from "../../utils/logger.js";

const BIGIN_AUDIT_URL = 'https://bigin.zoho.com/bigin/Home#/settings/data-administration/audit-log';
const BIGIN_SIGNIN_URL = 'https://accounts.zoho.in/signin?servicename=ZohoBigin&signupurl=https://www.bigin.com/signup.html';
const BIGIN_EMAIL = process.env.BIGIN_EMAIL || 'hvanama@enviromasternva.com';
const BIGIN_PASSWORD = process.env.BIGIN_PASSWORD || 'Satyavani@970';

// Screenshots directory
const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots', 'bigin-audit');

/**
 * Ensure screenshots directory exists
 */
function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

/**
 * Take a screenshot with timestamp
 */
async function takeScreenshot(page, stepName) {
  if (!/ERROR/i.test(stepName)) return null;
  try {
    ensureScreenshotsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${stepName}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    logger.debug(`📸 Screenshot saved: ${filename}`);
    return filepath;
  } catch (err) {
    logger.error(`📸 Failed to take screenshot (${stepName}):`, err.message);
    return null;
  }
}

/**
 * Get the most recent audit log timestamp from our database
 */
async function getLatestStoredLogTimestamp() {
  const latestLog = await BiginAuditLog.findOne({})
    .sort({ timestamp: -1 })
    .select('timestamp user action recordName')
    .lean();

  if (latestLog) {
    logger.debug('📅 Latest stored log:', {
      timestamp: latestLog.timestamp,
      user: latestLog.user,
      action: latestLog.action,
      recordName: latestLog.recordName
    });
  }

  return latestLog;
}

/**
 * Check if a log entry already exists in our database
 * Uses time range to handle slight timestamp differences
 */
async function logExistsInDatabase(timestamp, user, action, recordName) {
  // Look for logs within 1 minute of this timestamp with same user/action
  const timeStart = new Date(timestamp.getTime() - 60000); // 1 minute before
  const timeEnd = new Date(timestamp.getTime() + 60000); // 1 minute after

  const filter = {
    timestamp: { $gte: timeStart, $lte: timeEnd },
    user: user.trim(),
    action: action.trim(),
  };

  // Add recordName to filter if it exists
  if (recordName) {
    filter.recordName = recordName.trim();
  }

  const exists = await BiginAuditLog.findOne(filter).lean();
  return !!exists;
}

/**
 * Parse date string from timeline (handles "Yesterday", "Today", "May 20, 2026", etc.)
 */
function parseTimelineDate(dateHeader, timeStr) {
  const now = new Date();
  let dateObj;

  if (dateHeader.toLowerCase() === 'today') {
    dateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (dateHeader.toLowerCase() === 'yesterday') {
    dateObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  } else {
    // Parse "May 20, 2026" format
    dateObj = new Date(dateHeader);
  }

  // Parse time "12:09 PM"
  if (timeStr) {
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const ampm = timeMatch[3].toUpperCase();

      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      dateObj.setHours(hours, minutes, 0, 0);
    }
  }

  return dateObj;
}

/**
 * Parse action text to extract action type, module, and record name
 */
function parseActionText(actionText) {
  // Examples:
  // "Mark Lineberry added a note for Event CONF: Mark/True Food..."
  // "Lisa Rothwell updated a Event Mark/Glory Days/..."
  // "Heather Hartwell added a Company Urban Air - Woodbridge"

  const result = {
    user: '',
    action: '',
    module: '',
    recordName: ''
  };

  // Extract user name (first bold span)
  const userMatch = actionText.match(/^([\w ]+?)\s+(added|updated|deleted|sent|created|removed)/i);
  if (userMatch) {
    result.user = userMatch[1].trim();
  }

  // Extract action type
  if (actionText.includes('added a note')) {
    result.action = 'Added Note';
  } else if (actionText.includes('updated a note')) {
    result.action = 'Updated Note';
  } else if (actionText.includes('added a file')) {
    result.action = 'Added File';
  } else if (actionText.includes('sent an email')) {
    result.action = 'Sent Email';
  } else if (actionText.includes('added a')) {
    result.action = 'Added';
  } else if (actionText.includes('updated a')) {
    result.action = 'Updated';
  } else if (actionText.includes('deleted a')) {
    result.action = 'Deleted';
  }

  // Extract module
  const modulePatterns = [
    /for (Pipeline|Event|Contact|Company|Task|Call|Note|Product)/i,
    /(added|updated|deleted) a (Pipeline|Event|Contact|Company|Task|Call|Note|Product|Sales Pipeline Deal|File)/i
  ];

  for (const pattern of modulePatterns) {
    const match = actionText.match(pattern);
    if (match) {
      result.module = match[match.length - 1];
      break;
    }
  }

  return result;
}

/**
 * Login to Zoho Bigin
 */
async function login(page) {
  logger.debug('🔐 Logging into Zoho Bigin...');

  if (!BIGIN_EMAIL || !BIGIN_PASSWORD) {
    throw new Error('BIGIN_EMAIL or BIGIN_PASSWORD not set');
  }

  await page.goto(BIGIN_SIGNIN_URL, {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  await page.waitForSelector('#login_id', { timeout: 30000 });
  logger.debug('   Login form loaded');
  await takeScreenshot(page, '01_login_form_loaded');

  // Enter email
  await page.type('#login_id', BIGIN_EMAIL, { delay: 50 });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await page.click('#nextbtn');
  logger.debug('   Entered email, clicked Next');
  await takeScreenshot(page, '02_entered_email');

  // Wait for password field
  await page.waitForFunction(() => {
    const container = document.querySelector('#password_container');
    return container && !container.classList.contains('zeroheight');
  }, null, { timeout: 15000 });

  await new Promise(resolve => setTimeout(resolve, 1000));
  await takeScreenshot(page, '03_password_field_visible');

  // Enter password
  await page.type('#password', BIGIN_PASSWORD, { delay: 50 });
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.click('#nextbtn');
  logger.debug('   Entered password, clicked Sign in');
  await takeScreenshot(page, '04_clicked_sign_in');

  // Wait for navigation
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }),
    page.waitForSelector('.bigin-home, .bigin-dashboard, .crm-header, [data-module], .zb-header', { timeout: 60000 })
  ]).catch(() => {});

  await takeScreenshot(page, '05_after_login_navigation');

  const currentUrl = page.url();
  logger.debug('   Current URL after login:', currentUrl);

  if (currentUrl.includes('signin') || currentUrl.includes('login')) {
    await takeScreenshot(page, '05_ERROR_still_on_login');
    throw new Error('Login may have failed - still on login page');
  }

  logger.debug('✅ Login successful');
  return true;
}

/**
 * Close any promotional modals that may appear (like "Meet Bigin AI")
 */
async function closePromotionalModals(page) {
  logger.debug('   Checking for promotional modals...');

  // First, try clicking the X button directly using coordinates or specific Lyte selectors
  const closedViaEval = await page.evaluate(() => {
    const wormholes = document.querySelectorAll('lyte-wormhole, lyte-modal, lyte-dialog');
    for (const wormhole of wormholes) {
      const closeElements = wormhole.querySelectorAll('svg, lyte-icon, span, button, div');
      for (const el of closeElements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.x > 1000 && rect.y < 100 && rect.y > 40) {
          if (rect.width < 50 && rect.height < 50) {
            el.click();
            return true;
          }
        }
      }
    }

    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      if (rect.x > 1060 && rect.x < 1100 && rect.y > 40 && rect.y < 80) {
        if (rect.width > 0 && rect.width < 40 && rect.height > 0 && rect.height < 40) {
          el.click();
          return true;
        }
      }
    }

    const svgs = document.querySelectorAll('svg');
    for (const svg of svgs) {
      const rect = svg.getBoundingClientRect();
      if (rect.x > 1000 && rect.y < 100 && rect.width > 0) {
        const parent = svg.closest('button, div, span, lyte-button');
        if (parent) {
          parent.click();
          return true;
        }
        svg.click();
        return true;
      }
    }

    return false;
  });

  if (closedViaEval) {
    logger.debug('   Closed modal via evaluate method');
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  }

  // Try clicking at the exact position of the X button (based on screenshot analysis)
  // The X appears to be around coordinates (1081, 58) in a 1920x1080 viewport
  try {
    logger.debug('   Trying to click X button at position...');
    await page.mouse.click(1081, 58);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if modal is still there
    const modalStillExists = await page.evaluate(() => {
      const wormholes = document.querySelectorAll('lyte-wormhole, lyte-modal');
      for (const w of wormholes) {
        if (w.offsetParent !== null && w.innerHTML.includes('Meet Bigin AI')) {
          return true;
        }
      }
      return false;
    });

    if (!modalStillExists) {
      logger.debug('   Modal closed via position click');
      return true;
    }
  } catch (e) {
    logger.debug('   Position click failed:', e.message);
  }

  // Try pressing Escape key
  logger.debug('   Trying Escape key...');
  await page.keyboard.press('Escape');
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Click outside the modal to close it
  logger.debug('   Trying to click outside modal...');
  await page.mouse.click(100, 400);
  await new Promise(resolve => setTimeout(resolve, 500));

  return false;
}

async function dismissTimezonePopup(page) {
  try {
    await page.waitForSelector('.remind_later_link', { timeout: 4000 });
  } catch (e) {
    return false;
  }

  try {
    const clicked = await page.evaluate(() => {
      const link = document.querySelector('.remind_later_link');
      if (link) {
        link.click();
        return true;
      }
      return false;
    });

    if (clicked) {
      logger.debug('   ✓ Dismissed "Update your time zone" popup via Remind me later');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return clicked;
  } catch (e) {
    logger.debug('   ⚠️ Could not dismiss time zone popup:', e.message);
    return false;
  }
}

/**
 * Navigate to audit logs page using UI navigation (not direct URL)
 * Direct URL navigation loses the session and redirects to public page
 */
async function navigateToAuditLogs(page) {
  logger.debug('📍 Navigating to audit logs via UI...');

  await takeScreenshot(page, '06_before_audit_navigation');

  try {
    // First, make sure we're on the Bigin app (not public page)
    const currentUrl = page.url();
    logger.debug('   Current URL before navigation:', currentUrl);

    // Close any promotional modals that may appear
    await closePromotionalModals(page);
    await dismissTimezonePopup(page);

    // Wait for the app to be fully loaded
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Look for the Settings gear icon/button in the header
    // Common selectors for settings in Zoho apps
    const settingsSelectors = [
      '[data-zcqa="settings"]',
      '.zb-settings-icon',
      '.settings-icon',
      '[title="Settings"]',
      '[aria-label="Settings"]',
      'a[href*="settings"]',
      '.zb-header-settings',
      '[class*="setting"]',
      'lyte-icon[name="gear"]',
      'svg[name="gear"]',
      '.gear-icon',
      '[data-icon="gear"]'
    ];

    logger.debug('   Looking for Settings button...');
    let settingsFound = false;

    for (const selector of settingsSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await page.evaluate(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, element);

          if (isVisible) {
            logger.debug(`   Found Settings button: ${selector}`);
            await element.click();
            settingsFound = true;
            break;
          }
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!settingsFound) {
      // Alternative: Use keyboard shortcut or direct URL manipulation within the app
      logger.debug('   Settings button not found, trying alternative approach...');

      // Try to find and click the settings link in any sidebar/menu
      const menuSettingsClicked = await page.evaluate(() => {
        // Look for any clickable element with "Settings" text
        const elements = document.querySelectorAll('a, button, div[role="button"], span[role="button"]');
        for (const el of elements) {
          if (el.textContent && el.textContent.trim().toLowerCase().includes('settings')) {
            el.click();
            return true;
          }
        }
        // Look for gear icon by SVG content
        const svgs = document.querySelectorAll('svg');
        for (const svg of svgs) {
          const parent = svg.closest('a, button, [role="button"]');
          if (parent && svg.outerHTML.includes('gear')) {
            parent.click();
            return true;
          }
        }
        return false;
      });

      if (menuSettingsClicked) {
        logger.debug('   Clicked Settings via text/icon search');
        settingsFound = true;
      }
    }

    await takeScreenshot(page, '07_after_settings_click');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Now look for Data Administration in the settings sidebar, then Audit Log
    logger.debug('   Looking for Data Administration link...');

    // First click on Data Administration
    const dataAdminClicked = await page.evaluate(() => {
      const elements = document.querySelectorAll('a, button, div[role="button"], li, span');
      for (const el of elements) {
        const text = el.textContent?.trim().toLowerCase() || '';
        if (text === 'data administration' || text.includes('data admin')) {
          el.click();
          return true;
        }
      }
      return false;
    });

    if (dataAdminClicked) {
      logger.debug('   Clicked Data Administration');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await takeScreenshot(page, '07b_after_data_admin_click');
    }

    // Now look for Audit Log link
    logger.debug('   Looking for Audit Log link...');

    const auditLogSelectors = [
      '[data-zcqa*="audit"]',
      'a[href*="audit-log"]',
      'a[href*="audit_log"]',
      '[title*="Audit"]',
      '[aria-label*="Audit"]'
    ];

    let auditLogFound = false;

    for (const selector of auditLogSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          logger.debug(`   Found Audit Log link: ${selector}`);
          await element.click();
          auditLogFound = true;
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!auditLogFound) {
      // Try finding by text content
      const auditClicked = await page.evaluate(() => {
        const elements = document.querySelectorAll('a, button, div[role="button"], li, span');
        for (const el of elements) {
          const text = el.textContent?.trim().toLowerCase() || '';
          if (text === 'audit log' || text === 'audit logs') {
            el.click();
            return true;
          }
        }
        return false;
      });

      if (auditClicked) {
        logger.debug('   Clicked Audit Log via text search');
        auditLogFound = true;
      }
    }

    await takeScreenshot(page, '08_after_audit_click');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // If UI navigation didn't work, try hash navigation within the current page
    if (!settingsFound || !auditLogFound) {
      logger.debug('   UI navigation incomplete, trying hash navigation...');

      // Use evaluate to change the hash without losing session
      // Correct path: Settings > Data Administration > Audit Log
      await page.evaluate(() => {
        window.location.hash = '#/settings/data-administration/audit-log';
      });

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Close any modals that may have appeared
      await closePromotionalModals(page);

      await takeScreenshot(page, '08b_hash_navigation');
    }

    // Close any promotional modals that may have appeared during navigation
    await closePromotionalModals(page);
    await takeScreenshot(page, '08c_after_modal_close');

    // Check current URL
    const finalUrl = page.url();
    logger.debug('   Final URL:', finalUrl);

    // Wait for timeline to load (try multiple selectors)
    const timelineSelectors = [
      '.detail-timeline-wrap',
      '.audit-log-timeline-wrapper',
      'zt-timeline',
      '.audit-log-content',
      '.timeline-wrapper',
      '[data-component="timeline"]',
      '.detail-timeline-box'
    ];

    let timelineFound = false;
    for (const selector of timelineSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        logger.debug(`   Found timeline element: ${selector}`);
        timelineFound = true;
        break;
      } catch (e) {
        // Try next selector
      }
    }

    if (!timelineFound) {
      logger.debug('   Timeline element not found, checking page content...');

      // Log what elements are on the page
      const pageInfo = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyClasses: document.body.className,
          mainElements: Array.from(document.querySelectorAll('main, [role="main"], .main-content, #content')).map(el => el.className),
          hasTimeline: !!document.querySelector('[class*="timeline"]'),
          settingsLinks: Array.from(document.querySelectorAll('a[href*="settings"]')).map(a => a.href),
          visibleText: document.body.innerText.substring(0, 1000)
        };
      });
      logger.debug('   Page info:', JSON.stringify(pageInfo, null, 2));
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    await takeScreenshot(page, '09_audit_page_final');

    logger.debug('   Audit log page loaded');
    return true;

  } catch (error) {
    logger.error('   Navigation error:', error.message);
    await takeScreenshot(page, '09_ERROR_navigation_failed');

    // Log current page state
    const currentUrl = page.url();
    logger.debug('   Current URL on error:', currentUrl);

    throw error;
  }
}

/**
 * Scrape visible audit logs from the timeline
 */
async function scrapeVisibleLogs(page) {
  return await page.evaluate(() => {
    const logs = [];
    let currentDateHeader = '';

    const timelineBoxes = document.querySelectorAll('.detail-timeline-box');

    timelineBoxes.forEach(box => {
      // Check for date header
      const dateHeader = box.querySelector('.detail-timeline-head');
      if (dateHeader) {
        currentDateHeader = dateHeader.textContent.trim();
      }

      // Get timeline row
      const row = box.querySelector('.detail-timeline-row');
      if (!row) return;

      const timeEl = row.querySelector('.detail-timeline-left');
      const descEl = row.querySelector('.detail-timeline-desc');

      if (!timeEl || !descEl) return;

      const time = timeEl.textContent.trim();
      const descHead = descEl.querySelector('.timeline-desc-head');
      if (!descHead) return;

      // Get user name
      const userEl = descHead.querySelector('.fw-semi');
      const user = userEl ? userEl.textContent.trim() : '';

      // Get full action text
      const fullText = descHead.textContent.trim();

      // Get record name from link
      const linkEl = descHead.querySelector('a');
      const recordName = linkEl ? linkEl.textContent.trim() : '';
      const recordHref = linkEl ? linkEl.getAttribute('href') : '';

      // Extract record ID from href if available
      let recordId = '';
      if (recordHref) {
        const idMatch = recordHref.match(/\/(\d+)$/);
        if (idMatch) recordId = idMatch[1];
      }

      // Parse action
      let action = '';
      let module = '';

      if (fullText.includes('added a note')) {
        action = 'Added Note';
      } else if (fullText.includes('updated a note')) {
        action = 'Updated Note';
      } else if (fullText.includes('added a file')) {
        action = 'Added File';
      } else if (fullText.includes('sent an email')) {
        action = 'Sent Email';
      } else if (fullText.includes('added a')) {
        action = 'Added';
      } else if (fullText.includes('updated a')) {
        action = 'Updated';
      } else if (fullText.includes('deleted')) {
        action = 'Deleted';
      }

      // Extract module
      const moduleMatch = fullText.match(/(Pipeline|Event|Contact|Company|Task|Call|Note|Product|Sales Pipeline Deal)/i);
      if (moduleMatch) {
        module = moduleMatch[1];
      }

      logs.push({
        dateHeader: currentDateHeader,
        time,
        user,
        action,
        module,
        recordName,
        recordId,
        fullText
      });
    });

    return logs;
  });
}

/**
 * Click "View More" button to load more logs
 */
async function clickViewMore(page) {
  const clicked = await page.evaluate(() => {
    const viewMoreBtn = document.querySelector('lyte-button[data-zcqa="loadTimelineMoreOption"] button');
    if (viewMoreBtn && viewMoreBtn.offsetParent !== null) {
      viewMoreBtn.click();
      return true;
    }
    return false;
  });

  if (clicked) {
    // Wait for new content to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }

  return clicked;
}

/**
 * Main function to scrape Bigin audit logs
 * Stops when it reaches logs that already exist in our database
 */
export async function scrapeBiginAuditLogs(onProgress) {
  let browser = null;
  let page = null;
  const newLogs = [];
  let reachedExisting = false;
  let totalScraped = 0;
  let viewMoreClicks = 0;
  const MAX_VIEW_MORE_CLICKS = 50; // Safety limit

  try {
    logger.debug('🚀 Starting Zoho Bigin audit log scrape...');
    logger.debug(`📁 Screenshots will be saved to: ${SCREENSHOTS_DIR}`);
    onProgress?.(5, 'Launching browser...');

    // Get latest stored log to know when to stop
    const latestStored = await getLatestStoredLogTimestamp();

    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1920,1080'
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    page = await context.newPage();
    page.setDefaultTimeout(60000);

    // Login
    onProgress?.(10, 'Logging into Zoho Bigin...');
    await login(page);

    await dismissTimezonePopup(page);
    await takeScreenshot(page, '05b_after_timezone_popup_check');

    // Navigate to audit logs
    onProgress?.(30, 'Navigating to audit logs...');
    await navigateToAuditLogs(page);

    // Scrape logs, clicking "View More" until we reach existing records
    onProgress?.(40, 'Scraping audit logs...');

    const seenLogs = new Set(); // Track seen logs to avoid duplicates

    while (!reachedExisting && viewMoreClicks < MAX_VIEW_MORE_CLICKS) {
      const visibleLogs = await scrapeVisibleLogs(page);
      logger.debug(`   Found ${visibleLogs.length} visible logs`);

      for (const log of visibleLogs) {
        // Create unique key for this log
        const logKey = `${log.dateHeader}|${log.time}|${log.user}|${log.action}|${log.recordName}`;

        if (seenLogs.has(logKey)) continue;
        seenLogs.add(logKey);

        // Parse the timestamp
        const timestamp = parseTimelineDate(log.dateHeader, log.time);

        // Check if this log exists in our database
        if (latestStored) {
          const existsInDb = await logExistsInDatabase(
            timestamp,
            log.user,
            log.action,
            log.recordName || null
          );

          if (existsInDb) {
            logger.debug(`   ✅ Found existing log - stopping scrape`);
            logger.debug(`      Log: ${log.user} - ${log.action} - ${log.recordName}`);
            reachedExisting = true;
            break;
          }
        }

        // Add to new logs
        newLogs.push({
          timestamp,
          user: log.user,
          action: log.action,
          module: log.module || null,
          recordName: log.recordName || null,
          recordId: log.recordId || null,
          details: log.fullText,
          rawData: log
        });

        totalScraped++;
      }

      if (reachedExisting) break;

      // Click "View More" to load more logs
      const moreAvailable = await clickViewMore(page);
      if (!moreAvailable) {
        logger.debug('   No more logs to load');
        break;
      }

      viewMoreClicks++;
      const progress = Math.min(40 + (viewMoreClicks * 2), 90);
      onProgress?.(progress, `Loaded ${totalScraped} new logs... (click ${viewMoreClicks})`);

      logger.debug(`   Clicked View More (${viewMoreClicks}), total new logs: ${totalScraped}`);
    }

    await browser.close();
    browser = null;

    logger.debug(`🎉 Scrape completed! Found ${newLogs.length} new audit logs`);

    return {
      success: true,
      auditLogs: newLogs,
      totalCount: newLogs.length,
      reachedExisting,
      viewMoreClicks,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('❌ Audit log scrape failed:', error);

    // Try to capture error screenshot
    if (page) {
      try {
        await takeScreenshot(page, 'ERROR_scrape_failed');
      } catch (e) {
        logger.error('Could not capture error screenshot:', e.message);
      }
    }

    if (browser) {
      await browser.close();
    }

    return {
      success: false,
      auditLogs: [],
      totalCount: 0,
      error: error.message || 'Unknown error',
      screenshotsDir: SCREENSHOTS_DIR,
      scrapedAt: new Date().toISOString(),
    };
  }
}

export default { scrapeBiginAuditLogs };
