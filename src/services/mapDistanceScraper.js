/**
 * Map Distance Scraper Service
 * Automates RouteStar website to fetch map distance for customers
 * Supports session reuse for batch operations (login once, fetch many)
 */

import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.ROUTESTAR_BASE_URL || 'https://emnrv.routestar.online';
const USERNAME = process.env.ROUTESTAR_USERNAME || '';
const PASSWORD = process.env.ROUTESTAR_PASSWORD || '';

// Screenshot directory
const SCREENSHOT_DIR = path.join(__dirname, '../tmp');

// Debug mode - set to true to capture screenshots
const DEBUG_MODE = true;

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * MapDistanceSession - Manages a persistent browser session for batch operations
 * Login once, fetch many customers, close when done
 */
class MapDistanceSession {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isInitialized = false;
    this.isOnMapDistancePage = false;
    this.customerCount = 0;
  }

  /**
   * Take debug screenshot
   */
  async _screenshot(name) {
    if (!DEBUG_MODE || !this.page) return;
    try {
      const filename = `debug_${Date.now()}_${name}.png`;
      await this.page.screenshot({
        path: path.join(SCREENSHOT_DIR, filename),
        fullPage: true
      });
      console.log(`   📸 Screenshot: ${filename}`);
    } catch (e) {
      console.log(`   ⚠️ Screenshot failed: ${e.message}`);
    }
  }

  /**
   * Initialize session - launch browser, login, navigate to map distance page
   */
  async initialize(onProgress) {
    if (this.isInitialized) {
      console.log('[Session] Already initialized, reusing session');
      return;
    }

    console.log('[Session] Initializing new session...');
    onProgress?.(5, 'Launching browser...');

    this.browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      protocolTimeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
    this.page.setDefaultTimeout(30000);
    this.page.setDefaultNavigationTimeout(30000);

    // Login
    onProgress?.(15, 'Logging into RouteStar...');
    await this._login();

    // Navigate to Map Distance page
    onProgress?.(30, 'Navigating to Map Distance page...');
    await this._navigateToMapDistance();

    this.isInitialized = true;
    this.isOnMapDistancePage = true;
    console.log('[Session] Session initialized successfully');
  }

  /**
   * Fetch distance for a customer (reuses existing session)
   */
  async fetchForCustomer(customerName, onProgress) {
    if (!this.isInitialized) {
      throw new Error('Session not initialized. Call initialize() first.');
    }

    console.log(`[Session] Fetching distance for: ${customerName}`);
    onProgress?.(50, `Searching for ${customerName}...`);

    try {
      // If not on map distance page, navigate there
      if (!this.isOnMapDistancePage) {
        await this._navigateToMapDistance();
        this.isOnMapDistancePage = true;
      }

      // Search and get results
      const results = await this._searchAndGetDistance(customerName);

      onProgress?.(100, 'Complete');
      return {
        success: true,
        data: results,
        customerName,
        fetchedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[Session] Error fetching for ${customerName}:`, error.message);

      // Try to recover - check if we need to re-login
      const currentUrl = this.page.url();
      if (currentUrl.includes('/login')) {
        console.log('[Session] Session expired, re-initializing...');
        this.isInitialized = false;
        this.isOnMapDistancePage = false;
        await this.initialize(onProgress);
        // Retry the fetch
        return this.fetchForCustomer(customerName, onProgress);
      }

      return {
        success: false,
        data: [],
        customerName,
        error: error.message || 'Unknown error',
        fetchedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Close the session and browser
   */
  async close() {
    if (this.browser) {
      console.log('[Session] Closing browser session');
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isInitialized = false;
      this.isOnMapDistancePage = false;
    }
  }

  /**
   * Check if session is still valid
   */
  isValid() {
    return this.isInitialized && this.browser !== null && this.page !== null;
  }

  // Private methods below

  async _login() {
    console.log('🔐 Logging into RouteStar...');

    if (!USERNAME || !PASSWORD) {
      throw new Error('ROUTESTAR_USERNAME or ROUTESTAR_PASSWORD not set');
    }

    await this.page.goto(`${BASE_URL}/web/login/`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await this.page.waitForSelector('input[name="username"], #username', { timeout: 10000 });

    const usernameInput = await this.page.$('input[name="username"], #username');
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(USERNAME);

    const passwordInput = await this.page.$('input[name="password"], #password');
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(PASSWORD);

    await this.page.click('button[type="submit"], input[type="submit"], #login-btn, .login-btn');

    try {
      await Promise.race([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        this.page.waitForSelector('.dashboard, #dashboard, .main-content, nav, .sidebar', { timeout: 30000 })
      ]);
    } catch (e) {
      // Continue anyway
    }

    const currentUrl = this.page.url();
    if (currentUrl.includes('/login')) {
      throw new Error('Login failed - still on login page');
    }

    console.log('✅ Login successful');
  }

  async _navigateToMapDistance() {
    console.log('📍 Navigating to Map Distance page...');

    // Inject script to block bootbox modals
    await this.page.evaluateOnNewDocument(() => {
      window.addEventListener('DOMContentLoaded', () => {
        if (typeof bootbox !== 'undefined') {
          bootbox.alert = () => {};
          bootbox.dialog = () => {};
          bootbox.confirm = () => {};
          bootbox.prompt = () => {};
        }
      });
    });

    await this.page.goto(`${BASE_URL}/web/mapdistance/`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    await this._dismissModals();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await this.page.waitForSelector('.select2-selection, #customerSelect', { timeout: 15000 });
    console.log('✅ Map Distance page loaded');
  }

  async _dismissModals() {
    // Force remove modals from DOM and click dismiss buttons ONLY inside modals
    await this.page.evaluate(() => {
      // Only target buttons INSIDE modal dialogs, not anywhere on the page
      const modalContainers = document.querySelectorAll('.modal, .bootbox, .modal-dialog, [role="dialog"]');

      modalContainers.forEach(modal => {
        // Find cancel/close buttons inside this modal only
        const buttons = modal.querySelectorAll('button, .btn');
        buttons.forEach(btn => {
          const text = btn.textContent?.trim().toUpperCase();
          if (text === 'CANCEL' || text === 'CLOSE' || text === 'OK' || text === 'DISMISS' || text === '×') {
            try { btn.click(); } catch(e) {}
          }
        });

        // Also click close buttons
        const closeBtn = modal.querySelector('.close, .btn-close, [data-dismiss="modal"]');
        if (closeBtn) {
          try { closeBtn.click(); } catch(e) {}
        }
      });

      // Remove modal elements from DOM
      const selectors = ['.bootbox', '.modal', '.modal-backdrop'];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.tagName !== 'BODY') {
            try { el.remove(); } catch(e) {}
          }
        });
      });

      // Remove modal-open class from body
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';

      // Override bootbox functions to prevent future modals
      if (typeof bootbox !== 'undefined') {
        bootbox.alert = function() { return null; };
        bootbox.dialog = function() { return null; };
        bootbox.confirm = function(msg, cb) { if(cb) { cb(true); } return null; };
        bootbox.prompt = function() { return null; };
      }
    });

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  async _searchAndGetDistance(customerName) {
    this.customerCount++;
    const safeCustomerName = customerName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    console.log(`🔍 Searching for: ${customerName}`);

    // Take screenshot at start of each search (every 5th customer or first 3)
    if (this.customerCount <= 3 || this.customerCount % 5 === 0) {
      await this._screenshot(`${this.customerCount}_${safeCustomerName}_start`);
    }

    // Aggressively dismiss any modals first
    await this._dismissModals();
    await new Promise(resolve => setTimeout(resolve, 300));
    await this._dismissModals();

    // Close any open select2 dropdown first
    await this.page.evaluate(() => {
      if (typeof jQuery !== 'undefined') {
        jQuery('.select2-hidden-accessible').select2('close');
      }
    });
    await new Promise(resolve => setTimeout(resolve, 200));

    // Clear any previous selection and open dropdown
    await this.page.evaluate(() => {
      const select = document.querySelector('#customerSelect');
      if (select && typeof jQuery !== 'undefined') {
        jQuery(select).val(null).trigger('change');
      }
    });
    await new Promise(resolve => setTimeout(resolve, 300));

    // Dismiss modals again before opening dropdown
    await this._dismissModals();

    // Open the dropdown
    await this.page.evaluate(() => {
      const select = document.querySelector('#customerSelect');
      if (select && typeof jQuery !== 'undefined') {
        jQuery(select).select2('open');
      }
    });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Type in search field with retry logic
    let searchField = await this.page.$('.select2-search__field');

    // If search field not found, take screenshot and try again
    if (!searchField) {
      console.log('   Search field not found, retrying...');
      await this._screenshot(`${this.customerCount}_${safeCustomerName}_no_searchfield`);
      await this._dismissModals();
      await this.page.evaluate(() => {
        const select = document.querySelector('#customerSelect');
        if (select && typeof jQuery !== 'undefined') {
          jQuery(select).select2('open');
        }
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      searchField = await this.page.$('.select2-search__field');
    }

    if (searchField) {
      await searchField.click({ clickCount: 3 });
      await searchField.type(customerName, { delay: 50 });
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Take screenshot after typing (for debugging)
      if (this.customerCount <= 3) {
        await this._screenshot(`${this.customerCount}_${safeCustomerName}_after_type`);
      }

      // Select first result - MUST click the highlighted option
      console.log('   Selecting dropdown option...');

      // Method 1: Click the highlighted option using Puppeteer (more reliable than evaluate)
      try {
        const highlightedOption = await this.page.$('.select2-results__option--highlighted');
        if (highlightedOption) {
          await highlightedOption.click();
          console.log('   ✓ Clicked highlighted option via Puppeteer');
        } else {
          // Try clicking first valid option
          const firstOption = await this.page.$('.select2-results__option[role="option"]');
          if (firstOption) {
            await firstOption.click();
            console.log('   ✓ Clicked first option via Puppeteer');
          } else {
            // Fallback: use keyboard to select
            console.log('   Using keyboard fallback...');
            await this.page.keyboard.press('Enter');
          }
        }
      } catch (clickErr) {
        console.log(`   Click error: ${clickErr.message}, trying keyboard...`);
        await this.page.keyboard.press('Enter');
      }

      // Wait for selection to register and dropdown to close
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify selection was made (placeholder should be gone)
      const selectedText = await this.page.evaluate(() => {
        const selected = document.querySelector('#select2-customerSelect-container');
        const placeholder = selected?.querySelector('.select2-selection__placeholder');
        if (placeholder) return ''; // Still showing placeholder = not selected
        return selected?.textContent?.trim() || '';
      });

      if (selectedText && !selectedText.includes('Search Customers')) {
        console.log(`   ✓ Selected: "${selectedText}"`);
      } else {
        console.log('   ⚠️ Selection may have failed, retrying with keyboard...');
        // Re-open dropdown and try keyboard
        await this.page.click('.select2-selection');
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.page.keyboard.press('ArrowDown');
        await new Promise(resolve => setTimeout(resolve, 200));
        await this.page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } else {
      console.log('   WARNING: Could not find search field');
      await this._screenshot(`${this.customerCount}_${safeCustomerName}_ERROR_no_field`);
    }

    // Dismiss modals before clicking button
    await this._dismissModals();

    // Click Get Distance button - this submits the form and causes page navigation
    console.log('   Clicking Get Distance...');

    try {
      // Start waiting for navigation BEFORE clicking (form submission)
      const navigationPromise = this.page.waitForNavigation({
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Click the submit button
      await this.page.click('#getDistanceBtn');

      // Wait for navigation to complete
      await navigationPromise;
      console.log('   ✓ Page loaded after form submit');
    } catch (navError) {
      console.log(`   ⚠️ Navigation: ${navError.message}`);
    }

    // Wait for page to fully stabilize after navigation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Now safely dismiss any modals
    try {
      await this._dismissModals();
    } catch (e) {
      // Ignore modal errors
    }

    // Wait for table to have data (not "No data found")
    console.log('   Waiting for table data...');
    try {
      await this.page.waitForFunction(() => {
        const rows = document.querySelectorAll('table.table tbody tr, table.footable tbody tr');
        if (rows.length === 0) return false;
        const firstRow = rows[0];
        if (firstRow.textContent.includes('No data found')) return false;
        const cells = firstRow.querySelectorAll('td');
        return cells.length >= 6;
      }, { timeout: 10000 });
      console.log('   ✓ Table data loaded');
    } catch (tableErr) {
      console.log('   ⚠️ Table wait timeout - checking results anyway');
    }

    // Additional stabilization wait
    await new Promise(resolve => setTimeout(resolve, 500));

    // Take screenshot after clicking (first 3 customers only)
    if (this.customerCount <= 3) {
      await this._screenshot(`${this.customerCount}_${safeCustomerName}_after_click`);
    }

    // Dismiss any modals after page load
    await this._dismissModals();
    await new Promise(resolve => setTimeout(resolve, 300));
    await this._dismissModals();

    // Mark that we're still on map distance page (it reloads with results)
    this.isOnMapDistancePage = true;

    // Extract results
    const results = await this.page.evaluate(() => {
      let dataTable = document.querySelector('table.table') ||
                      document.querySelector('.dataTable') ||
                      document.querySelector('table');

      if (!dataTable) return [];

      const rows = dataTable.querySelectorAll('tbody tr');
      return Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 1 && row.textContent.includes('No data')) return null;
        if (cells.length < 6) return null;

        return {
          assignedTo: cells[0]?.textContent?.trim() || '',
          frequency: cells[1]?.textContent?.trim() || '',
          date: cells[2]?.textContent?.trim() || '',
          customer: cells[3]?.textContent?.trim() || '',
          day: cells[4]?.textContent?.trim() || '',
          stop: cells[5]?.textContent?.trim() || '',
          distance: cells[6]?.textContent?.trim() || '',
        };
      }).filter(r => r !== null && (r.customer || r.assignedTo));
    });

    console.log(`✅ Found ${results.length} results`);

    // Take screenshot if no results found (might indicate issue)
    if (results.length === 0) {
      await this._screenshot(`${this.customerCount}_${safeCustomerName}_no_results`);
    }

    return results;
  }
}

// Global session instance for batch operations
let globalSession = null;

/**
 * Get or create a session for batch operations
 */
export async function getSession() {
  if (!globalSession || !globalSession.isValid()) {
    globalSession = new MapDistanceSession();
  }
  return globalSession;
}

/**
 * Close the global session
 */
export async function closeSession() {
  if (globalSession) {
    await globalSession.close();
    globalSession = null;
  }
}

/**
 * Fetch map distance for a single customer (creates new session each time)
 * Use this for single fetches from the UI
 */
export async function getMapDistance(customerName, onProgress) {
  const session = new MapDistanceSession();

  try {
    await session.initialize(onProgress);
    const result = await session.fetchForCustomer(customerName, onProgress);
    return result;
  } finally {
    await session.close();
  }
}

/**
 * Fetch map distance using shared session (for batch operations)
 * Much faster as it reuses the browser session
 */
export async function getMapDistanceWithSession(session, customerName, onProgress) {
  if (!session.isValid()) {
    await session.initialize(onProgress);
  }
  return session.fetchForCustomer(customerName, onProgress);
}

export { MapDistanceSession };
export default { getMapDistance, getMapDistanceWithSession, getSession, closeSession, MapDistanceSession };
