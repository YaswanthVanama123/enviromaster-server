/**
 * RouteSTAR Customer Scraper Service
 * Scrapes customers from RouteStar using Playwright with pagination support
 */

import logger from "../../utils/logger.js";
import { launchHardenedBrowser, closeBrowserQuietly } from "../../utils/playwrightBrowser.js";

const BASE_URL = process.env.ROUTESTAR_BASE_URL || 'https://emnrv.routestar.online';
const USERNAME = process.env.ROUTESTAR_USERNAME || '';
const PASSWORD = process.env.ROUTESTAR_PASSWORD || '';

/**
 * Login to RouteSTAR
 */
async function login(page) {
  logger.debug('🔐 Logging into RouteStar...');
  logger.debug(`   URL: ${BASE_URL}/web/login/`);
  logger.debug(`   Username: ${USERNAME ? USERNAME.substring(0, 3) + '***' : 'NOT SET'}`);

  if (!USERNAME || !PASSWORD) {
    throw new Error('ROUTESTAR_USERNAME or ROUTESTAR_PASSWORD not set in environment');
  }

  await page.goto(`${BASE_URL}/web/login/`, {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  // Wait for login form
  await page.waitForSelector('input[name="username"], #username', { timeout: 10000 });

  // Clear and fill username
  const usernameInput = await page.$('input[name="username"], #username');
  await usernameInput.click({ clickCount: 3 });
  await usernameInput.type(USERNAME);

  // Clear and fill password
  const passwordInput = await page.$('input[name="password"], #password');
  await passwordInput.click({ clickCount: 3 });
  await passwordInput.type(PASSWORD);

  // Click login button
  await page.click('button[type="submit"], input[type="submit"], #login-btn, .login-btn');

  // Wait for either redirect or dashboard element to appear
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
      page.waitForSelector('.dashboard, #dashboard, .main-content, nav, .sidebar', { timeout: 30000 })
    ]);
  } catch (e) {
    // Check if we're already logged in by looking at the URL
    const currentUrl = page.url();
    logger.debug('   Current URL after login attempt:', currentUrl);
  }

  // Verify login success
  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    // Check for error message
    const errorMsg = await page.$eval('.error, .alert-danger, .login-error', el => el.textContent).catch(() => null);
    throw new Error(`Login failed: ${errorMsg || 'Still on login page'}`);
  }

  logger.debug('✅ Login successful');
  return true;
}

/**
 * Navigate to customers page and set up for scraping
 */
async function navigateToCustomers(page) {
  logger.debug('📍 Navigating to customers page...');
  await page.goto(`${BASE_URL}/web/customers/`, {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  // Wait for table to load
  await page.waitForSelector('#customer-list-table, .handsontable, table', { timeout: 30000 });
  logger.debug('✅ Customers page loaded');

  // Set items per page to 20 (no scrolling needed at this size)
  logger.debug('📋 Setting items per page to 20...');
  try {
    const selectExists = await page.$('#items_per_page');
    if (selectExists) {
      // Use 20 items per page - no scrolling needed
      await page.selectOption('#items_per_page', '20');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      logger.debug('✅ Set to 20 items per page');
    } else {
      logger.debug('⚠️ Items per page dropdown not found, using default');
    }
  } catch (e) {
    logger.debug('⚠️ Could not set items per page:', e.message);
  }
}

/**
 * Get total number of pages from pagination
 */
async function getTotalPages(page) {
  try {
    const totalPages = await page.evaluate(() => {
      // Look for pagination info - common patterns
      const paginationItems = document.querySelectorAll('.pagination li[data-lp]');
      if (paginationItems.length > 0) {
        // Get the highest page number
        let maxPage = 1;
        paginationItems.forEach(item => {
          const pageNum = parseInt(item.getAttribute('data-lp'), 10);
          if (!isNaN(pageNum) && pageNum > maxPage) {
            maxPage = pageNum;
          }
        });
        return maxPage;
      }

      // Try other pagination patterns
      const pageLinks = document.querySelectorAll('.pagination a, .paginate_button');
      if (pageLinks.length > 0) {
        let maxPage = 1;
        pageLinks.forEach(link => {
          const text = link.textContent.trim();
          const num = parseInt(text, 10);
          if (!isNaN(num) && num > maxPage) {
            maxPage = num;
          }
        });
        return maxPage;
      }

      // Check for "Page X of Y" text
      const pageInfo = document.querySelector('.pagination-info, .dataTables_info');
      if (pageInfo) {
        const match = pageInfo.textContent.match(/of\s+(\d+)/i);
        if (match) {
          return parseInt(match[1], 10);
        }
      }

      return 1; // Default to 1 page if we can't determine
    });

    logger.debug(`📄 Found ${totalPages} total pages`);
    return totalPages;
  } catch (e) {
    logger.debug('⚠️ Could not determine total pages:', e.message);
    return 1;
  }
}

/**
 * Navigate to a specific page number
 */
async function goToPage(page, pageNum) {
  try {
    logger.debug(`   Navigating to page ${pageNum}...`);

    // Try clicking the page number in pagination
    const clicked = await page.evaluate((targetPage) => {
      // Try li[data-lp="X"] pattern first
      const pageItem = document.querySelector(`.pagination li[data-lp="${targetPage}"]`);
      if (pageItem) {
        const link = pageItem.querySelector('a');
        if (link) {
          link.click();
          return true;
        }
      }

      // Try finding link with page number text
      const allLinks = document.querySelectorAll('.pagination a');
      for (const link of allLinks) {
        if (link.textContent.trim() === String(targetPage)) {
          link.click();
          return true;
        }
      }

      return false;
    }, pageNum);

    if (clicked) {
      // Wait for table to reload
      await new Promise(resolve => setTimeout(resolve, 1500));
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    logger.debug(`   ⚠️ Error navigating to page ${pageNum}:`, e.message);
    return false;
  }
}

/**
 * Scrape customers from current page
 */
async function scrapeCurrentPage(page) {
  // Wait a bit for data to fully load
  await new Promise(resolve => setTimeout(resolve, 1000));

  const customers = await page.evaluate((baseUrl) => {
    const results = [];

    // Try different table selectors
    let table = document.querySelector('#customer-list-table .ht_master tbody');
    if (!table) {
      table = document.querySelector('.handsontable tbody');
    }
    if (!table) {
      table = document.querySelector('#customer-list-table tbody');
    }
    if (!table) {
      table = document.querySelector('table tbody');
    }

    if (!table) {
      return results;
    }

    const rows = table.querySelectorAll('tr');

    rows.forEach((row, index) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) return; // Skip rows with too few cells

      // Get customer name and detail URL from first cell link
      const nameLink = cells[0]?.querySelector('a');
      const name = nameLink?.textContent?.trim() || cells[0]?.textContent?.trim() || '';
      const detailUrl = nameLink?.getAttribute('href') || '';

      // Skip header rows or empty names
      if (!name || name.toLowerCase() === 'name' || name.toLowerCase() === 'customer') return;

      // Extract routeStarId from detail URL
      const idMatch = detailUrl.match(/customerdetail\/([^\/]+)/);
      const routeStarId = idMatch ? idMatch[1] : `row-${index}`;

      // Get checkbox values for Active and Paperless (adjust indices based on actual table structure)
      const activeCheckbox = cells[8]?.querySelector('input[type="checkbox"]');
      const paperlessCheckbox = cells[9]?.querySelector('input[type="checkbox"]');

      const customer = {
        routeStarId,
        name,
        address: cells[1]?.textContent?.trim() || '',
        city: cells[2]?.textContent?.trim() || '',
        state: cells[3]?.textContent?.trim() || '',
        zipCode: cells[4]?.textContent?.trim() || '',
        phone: cells[5]?.querySelector('a')?.textContent?.trim() || cells[5]?.textContent?.trim() || '',
        email: cells[6]?.querySelector('a')?.textContent?.trim() || cells[6]?.textContent?.trim() || '',
        company: cells[7]?.textContent?.trim() || '',
        isActive: activeCheckbox?.checked ?? true,
        isPaperless: paperlessCheckbox?.checked ?? false,
        grouping: cells[10]?.textContent?.trim() || '',
        onRoute: cells[11]?.textContent?.trim() || '',
        createdInRouteStar: cells[12]?.textContent?.trim() || '',
        account: cells[13]?.textContent?.trim() || '',
        salesRep: cells[14]?.textContent?.trim() || '',
        customerType: cells[15]?.textContent?.trim() || '',
        balance: parseFloat(cells[16]?.textContent?.replace(/[^0-9.-]/g, '') || '0') || 0,
        detailUrl: detailUrl ? `${baseUrl}${detailUrl}` : '',
      };

      if (name) {
        results.push(customer);
      }
    });

    return results;
  }, BASE_URL);

  return customers;
}

/**
 * Scrape all customers with pagination support
 */
async function scrapeAllCustomers(page, onProgress, onBatch) {
  logger.debug('🔍 Starting to scrape all customers (20 per page)...');

  const seen = new Set();
  const allCustomers = onBatch ? null : [];
  let totalScraped = 0;
  let totalSaved = 0;
  let currentPage = 1;
  let consecutiveEmptyPages = 0;

  // Dedup by routeStarId, then stream each page's fresh rows to the caller
  // (which saves them) so we never hold the whole customer list in RAM.
  const flushPage = async (pageCustomers) => {
    const fresh = [];
    for (const customer of pageCustomers) {
      const key = customer.routeStarId;
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      fresh.push(customer);
    }
    if (fresh.length === 0) return;
    totalScraped += fresh.length;
    if (onBatch) totalSaved += (await onBatch(fresh)) || 0;
    else allCustomers.push(...fresh);
  };

  // Scrape first page
  logger.debug(`📄 Scraping page 1...`);
  onProgress?.(50, `Scraping page 1...`);

  const firstPageCustomers = await scrapeCurrentPage(page);
  logger.debug(`   Found ${firstPageCustomers.length} customers on page 1`);
  await flushPage(firstPageCustomers);

  // Keep navigating to next pages
  while (consecutiveEmptyPages < 2) {
    currentPage++;

    // Try to click on the specific page number first
    let navigated = await page.evaluate((targetPage) => {
      // Look for the page number link
      const pageLinks = document.querySelectorAll('.pagination li[data-lp] a');
      for (const link of pageLinks) {
        const li = link.parentElement;
        const pageNum = parseInt(li.getAttribute('data-lp'), 10);
        if (pageNum === targetPage) {
          link.click();
          return { success: true, method: 'direct' };
        }
      }
      return { success: false };
    }, currentPage);

    // If page number not visible, click "»" to load more pages first
    if (!navigated.success) {
      logger.debug(`   Page ${currentPage} not visible, clicking » to load more pages...`);

      const clickedNext = await page.evaluate(() => {
        const nextLi = document.querySelector('.pagination li.next:not(.disabled)');
        if (nextLi) {
          const link = nextLi.querySelector('a');
          if (link) {
            link.click();
            return true;
          }
        }
        return false;
      });

      if (!clickedNext) {
        logger.debug(`   ✅ No more next button, reached last page`);
        break;
      }

      // Wait for pagination to update
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Now try to click the target page again
      navigated = await page.evaluate((targetPage) => {
        const pageLinks = document.querySelectorAll('.pagination li[data-lp] a');
        for (const link of pageLinks) {
          const li = link.parentElement;
          const pageNum = parseInt(li.getAttribute('data-lp'), 10);
          if (pageNum === targetPage) {
            link.click();
            return { success: true, method: 'after-next' };
          }
        }
        // If still not found, check what's the current active page
        const activeLi = document.querySelector('.pagination li.active');
        if (activeLi) {
          const activeNum = parseInt(activeLi.getAttribute('data-lp'), 10);
          return { success: false, activePage: activeNum };
        }
        return { success: false };
      }, currentPage);

      if (!navigated.success) {
        // Check if we're already past the target (means we're at the end)
        if (navigated.activePage && navigated.activePage >= currentPage) {
          logger.debug(`   Already at page ${navigated.activePage}, continuing...`);
          currentPage = navigated.activePage;
        } else {
          logger.debug(`   ⚠️ Could not navigate to page ${currentPage}, stopping`);
          break;
        }
      }
    }

    logger.debug(`   Navigating to page ${currentPage}...`);

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 1500));

    const progressPercent = Math.min(50 + currentPage * 2, 90);
    onProgress?.(progressPercent, `Scraping page ${currentPage}...`);
    logger.debug(`📄 Scraping page ${currentPage}...`);

    const pageCustomers = await scrapeCurrentPage(page);
    logger.debug(`   Found ${pageCustomers.length} customers on page ${currentPage}`);

    if (pageCustomers.length === 0) {
      consecutiveEmptyPages++;
      logger.debug(`   ⚠️ No customers found on page ${currentPage}`);
    } else {
      consecutiveEmptyPages = 0;
      await flushPage(pageCustomers);
    }

    // Safety check - if we've scraped more than 50 pages, something is wrong
    if (currentPage > 50) {
      logger.debug(`   ⚠️ Safety limit reached (50 pages), stopping`);
      break;
    }
  }

  logger.debug(`✅ Total unique customers scraped: ${totalScraped}`);
  return onBatch ? { totalScraped, totalSaved } : allCustomers;
}

/**
 * Main scrape function - called from controller
 */
export async function scrapeRouteStarCustomers(onProgress, onBatch) {
  let browser = null;

  try {
    logger.debug('🚀 Starting RouteSTAR customer scrape...');
    onProgress?.(5, 'Launching browser...');

    browser = await launchHardenedBrowser();

    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    // Set a longer default timeout
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Login
    onProgress?.(10, 'Logging into RouteStar...');
    await login(page);

    // Navigate to customers
    onProgress?.(30, 'Loading customers page...');
    await navigateToCustomers(page);

    // Scrape all customers with pagination (streams each page to onBatch)
    const scraped = await scrapeAllCustomers(page, onProgress, onBatch);

    if (onBatch) {
      logger.debug('🎉 Scrape completed successfully!');
      return {
        success: true,
        customers: [],
        totalCount: scraped.totalScraped || 0,
        savedCount: scraped.totalSaved || 0,
        scrapedAt: new Date().toISOString(),
      };
    }

    const customers = scraped;
    if (customers.length === 0) {
      logger.debug('⚠️ No customers found - table may be empty or structure changed');
    }

    logger.debug('🎉 Scrape completed successfully!');
    return {
      success: true,
      customers,
      totalCount: customers.length,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('❌ Scrape failed:', error);

    return {
      success: false,
      customers: [],
      totalCount: 0,
      error: error.message || 'Unknown error',
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    await closeBrowserQuietly(browser);
    browser = null;
  }
}

export default { scrapeRouteStarCustomers };
