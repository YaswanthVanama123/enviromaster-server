/**
 * Zoho Bigin Company Scraper Service
 * Scrapes company data from Zoho Bigin using Playwright
 */

import { BiginCompany } from "#models/customer/index.js";
import logger from "../../utils/logger.js";
import { launchHardenedBrowser, closeBrowserQuietly } from "../../utils/playwrightBrowser.js";

const BIGIN_COMPANIES_URL = 'https://bigin.zoho.in/bigin/Home#/tab/Accounts/list';
const BIGIN_SIGNIN_URL = 'https://accounts.zoho.in/signin?servicename=ZohoBigin&signupurl=https://www.bigin.com/signup.html';
const BIGIN_EMAIL = process.env.BIGIN_EMAIL || 'hvanama@enviromasternva.com';
const BIGIN_PASSWORD = process.env.BIGIN_PASSWORD || 'Satyavani@970';

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

  // Enter email
  await page.type('#login_id', BIGIN_EMAIL, { delay: 50 });
  await new Promise(resolve => setTimeout(resolve, 1000));
  await page.click('#nextbtn');
  logger.debug('   Entered email, clicked Next');

  // Wait for password field
  await page.waitForFunction(() => {
    const container = document.querySelector('#password_container');
    return container && !container.classList.contains('zeroheight');
  }, null, { timeout: 15000 });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Enter password
  await page.type('#password', BIGIN_PASSWORD, { delay: 50 });
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.click('#nextbtn');
  logger.debug('   Entered password, clicked Sign in');

  // Wait for navigation
  await Promise.race([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }),
    page.waitForSelector('.bigin-home, .bigin-dashboard, .crm-header, [data-module], .zb-header', { timeout: 60000 })
  ]).catch(() => {});

  const currentUrl = page.url();
  if (currentUrl.includes('signin') || currentUrl.includes('login')) {
    throw new Error('Login may have failed - still on login page');
  }

  logger.debug('✅ Login successful');
  return true;
}

/**
 * Navigate to companies list page
 */
async function navigateToCompanies(page) {
  logger.debug('📍 Navigating to Companies (Accounts) list...');

  await page.goto(BIGIN_COMPANIES_URL, {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  // Wait for list view to load
  await page.waitForSelector('.zcui-lv-list, .list-view-container, .lv-canvas-content, [data-zcqa="listViewBody"]', {
    timeout: 30000
  }).catch(() => {});

  await new Promise(resolve => setTimeout(resolve, 3000));

  logger.debug('   Companies list page loaded');
  return true;
}

/**
 * Scrape companies from the list view
 */
async function scrapeVisibleCompanies(page) {
  return await page.evaluate(() => {
    const companies = [];

    // Try multiple selectors for list rows
    const rowSelectors = [
      '.zcui-lv-row',
      '.lv-row',
      '[data-zcqa="listViewRow"]',
      '.list-view-row',
      'tr[data-id]'
    ];

    let rows = [];
    for (const selector of rowSelectors) {
      rows = document.querySelectorAll(selector);
      if (rows.length > 0) break;
    }

    rows.forEach(row => {
      try {
        // Extract company ID from data attributes
        const biginId = row.getAttribute('data-id') ||
                        row.getAttribute('data-record-id') ||
                        row.querySelector('[data-id]')?.getAttribute('data-id') || '';

        // Try to find company name
        const nameEl = row.querySelector('.lv-record-link, .zcui-lv-link, [data-zcqa="recordLink"], a.record-link, .lv-cell-primary a');
        const companyName = nameEl?.textContent?.trim() || '';

        // Get all cell values
        const cells = row.querySelectorAll('.lv-cell, .zcui-lv-cell, td');
        const cellValues = Array.from(cells).map(cell => cell.textContent?.trim() || '');

        // Try to extract phone from cells
        const phonePattern = /[\d\-\(\)\+\s]{10,}/;
        let phone = '';
        for (const val of cellValues) {
          if (phonePattern.test(val)) {
            phone = val;
            break;
          }
        }

        // Try to extract email from cells
        const emailPattern = /[^\s@]+@[^\s@]+\.[^\s@]+/;
        let email = '';
        for (const val of cellValues) {
          const match = val.match(emailPattern);
          if (match) {
            email = match[0];
            break;
          }
        }

        // Try to find owner
        const ownerEl = row.querySelector('[data-field="Owner"], .owner-cell, .lv-owner');
        const owner = ownerEl?.textContent?.trim() || '';

        if (companyName) {
          companies.push({
            biginId,
            companyName,
            phone,
            email,
            owner,
            rawCells: cellValues
          });
        }
      } catch (e) {
        logger.error('Error parsing row:', e);
      }
    });

    return companies;
  });
}

/**
 * Click on a company to get more details
 */
async function getCompanyDetails(page, biginId) {
  try {
    // Click on the company row to open details
    await page.evaluate((id) => {
      const row = document.querySelector(`[data-id="${id}"], [data-record-id="${id}"]`);
      if (row) {
        const link = row.querySelector('a');
        if (link) link.click();
      }
    }, biginId);

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Extract details from the detail view
    const details = await page.evaluate(() => {
      const getFieldValue = (label) => {
        const labelEl = Array.from(document.querySelectorAll('.field-label, .zb-field-label, label'))
          .find(el => el.textContent.toLowerCase().includes(label.toLowerCase()));
        if (labelEl) {
          const valueEl = labelEl.nextElementSibling || labelEl.parentElement?.querySelector('.field-value, .zb-field-value');
          return valueEl?.textContent?.trim() || '';
        }
        return '';
      };

      return {
        website: getFieldValue('website'),
        industry: getFieldValue('industry'),
        street: getFieldValue('street'),
        city: getFieldValue('city'),
        state: getFieldValue('state'),
        zipCode: getFieldValue('zip') || getFieldValue('postal'),
        country: getFieldValue('country'),
        accountType: getFieldValue('account type') || getFieldValue('type'),
        routeStarAccountNumber:
          getFieldValue('routestaraccountnumber') ||
          getFieldValue('routestar account number') ||
          getFieldValue('route star account number') || null,
        description: getFieldValue('description'),
        pipeline: getFieldValue('pipeline'),
        stage: getFieldValue('stage'),
      };
    });

    // Go back to list
    await page.goBack({ waitUntil: 'networkidle' }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    return details;
  } catch (error) {
    logger.error(`Error getting details for company ${biginId}:`, error.message);
    return {};
  }
}

/**
 * Scroll to load more companies
 */
async function scrollForMore(page) {
  const scrolled = await page.evaluate(() => {
    const container = document.querySelector('.lv-canvas-content, .zcui-lv-body, .list-view-body');
    if (container) {
      const prevScroll = container.scrollTop;
      container.scrollTop = container.scrollHeight;
      return container.scrollTop > prevScroll;
    }
    // Fallback: scroll the whole page
    const prevScroll = window.scrollY;
    window.scrollTo(0, document.body.scrollHeight);
    return window.scrollY > prevScroll;
  });

  if (scrolled) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  }

  return scrolled;
}

/**
 * Check if a company exists in our database
 */
async function companyExistsInDatabase(biginId, companyName) {
  if (biginId) {
    const existing = await BiginCompany.findOne({ biginId }).lean();
    if (existing) return existing;
  }

  // Fallback to name matching
  if (companyName) {
    const existing = await BiginCompany.findOne({
      companyName: { $regex: `^${companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
    }).lean();
    return existing;
  }

  return null;
}

/**
 * Main function to scrape Bigin companies
 */
export async function scrapeBiginCompanies(onProgress, options = {}) {
  let browser = null;
  const companies = [];
  let totalScraped = 0;
  let scrollAttempts = 0;
  const MAX_SCROLL_ATTEMPTS = 20;
  const { fetchDetails = false } = options;

  try {
    logger.debug('🚀 Starting Zoho Bigin company scrape...');
    onProgress?.(5, 'Launching browser...');

    browser = await launchHardenedBrowser(['--window-size=1920,1080']);

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);

    // Login
    onProgress?.(10, 'Logging into Zoho Bigin...');
    await login(page);

    // Navigate to companies
    onProgress?.(30, 'Navigating to Companies list...');
    await navigateToCompanies(page);

    // Scrape companies
    onProgress?.(40, 'Scraping companies...');

    const seenIds = new Set();

    while (scrollAttempts < MAX_SCROLL_ATTEMPTS) {
      const visibleCompanies = await scrapeVisibleCompanies(page);
      logger.debug(`   Found ${visibleCompanies.length} visible companies`);

      let newCompaniesThisRound = 0;

      for (const company of visibleCompanies) {
        const key = company.biginId || company.companyName;
        if (!key || seenIds.has(key)) continue;
        seenIds.add(key);

        // Get additional details if requested
        let details = {};
        if (fetchDetails && company.biginId) {
          details = await getCompanyDetails(page, company.biginId);
        }

        companies.push({
          ...company,
          ...details
        });

        newCompaniesThisRound++;
        totalScraped++;
      }

      logger.debug(`   New companies this round: ${newCompaniesThisRound}, Total: ${totalScraped}`);

      if (newCompaniesThisRound === 0) {
        // No new companies found, try scrolling
        const scrolled = await scrollForMore(page);
        if (!scrolled) {
          logger.debug('   No more scrolling possible');
          break;
        }
      }

      scrollAttempts++;
      const progress = Math.min(40 + (scrollAttempts * 2.5), 90);
      onProgress?.(progress, `Loaded ${totalScraped} companies... (scroll ${scrollAttempts})`);
    }

    await closeBrowserQuietly(browser);
    browser = null;

    logger.debug(`🎉 Scrape completed! Found ${companies.length} companies`);

    return {
      success: true,
      companies,
      totalCount: companies.length,
      scrollAttempts,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('❌ Company scrape failed:', error);

    return {
      success: false,
      companies: [],
      totalCount: 0,
      error: error.message || 'Unknown error',
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    await closeBrowserQuietly(browser);
    browser = null;
  }
}

export default { scrapeBiginCompanies };
