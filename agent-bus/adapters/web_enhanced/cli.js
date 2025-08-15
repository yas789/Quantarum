#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { EventEmitter } = require('events');

// Structured output helpers
const ok = (data) => console.log(JSON.stringify({ ok: true, data }));
const fail = (code, msg, details) => {
  console.error(JSON.stringify({ ok: false, code, msg, ...(details && { details }) }));
  process.exit(1);
};

// Read payload
const payload = JSON.parse(process.argv[2] || '{}');
let { verb, args = {} } = payload;

// Normalize verb id
const normalizeVerb = (v) => (v && v.startsWith('web_enhanced.') ? v : `web_enhanced.${v}`);

// Lazy load Playwright with helpful error if missing
let pw;
try {
  pw = require('playwright');
} catch (e) {
  fail(14, 'DEPENDENCY_MISSING', {
    message: 'playwright not installed',
    install: 'npm i -D playwright',
  });
}

// Configuration
const CONFIG = {
  MAX_SESSIONS: 5,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  DEFAULT_VIEWPORT: { width: 1920, height: 1080 },
  USER_AGENTS: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ],
  SESSIONS_DIR: path.join(os.tmpdir(), 'quantarum_sessions')
};

// Enhanced Session Manager
class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.activeSessions = new Map();
    this.initSessionsDirectory();
    this.startCleanupTimer();
  }

  async initSessionsDirectory() {
    try {
      await fs.mkdir(CONFIG.SESSIONS_DIR, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  startCleanupTimer() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  async createSession(sessionId, options = {}) {
    if (this.activeSessions.size >= CONFIG.MAX_SESSIONS) {
      await this.cleanupOldestSession();
    }

    const sessionDir = path.join(CONFIG.SESSIONS_DIR, sessionId);
    
    const contextOptions = {
      headless: options.headless !== true, // Default to visible browser
      viewport: options.viewport || CONFIG.DEFAULT_VIEWPORT,
      userAgent: options.userAgent || this.getRandomUserAgent(),
      acceptDownloads: true,
      ignoreHTTPSErrors: true,
      permissions: ['geolocation', 'notifications'],
      ...options.contextOptions
    };

    try {
      const context = await pw.chromium.launchPersistentContext(sessionDir, contextOptions);
      
      // Set up resource optimization
      await this.setupResourceOptimization(context, options);
      
      // Load saved authentication state
      await this.loadAuthState(context, sessionId);

      const session = {
        id: sessionId,
        context,
        pages: new Map(),
        createdAt: Date.now(),
        lastUsed: Date.now(),
        options,
        tabs: []
      };

      this.activeSessions.set(sessionId, session);
      this.emit('sessionCreated', sessionId);
      
      return session;
    } catch (error) {
      throw new Error(`Failed to create session ${sessionId}: ${error.message}`);
    }
  }

  async getSession(sessionId) {
    if (this.activeSessions.has(sessionId)) {
      const session = this.activeSessions.get(sessionId);
      session.lastUsed = Date.now();
      return session;
    }
    return null;
  }

  async getOrCreateSession(sessionId, options = {}) {
    let session = await this.getSession(sessionId);
    if (!session) {
      session = await this.createSession(sessionId, options);
    }
    return session;
  }

  async closeSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      await this.saveAuthState(session.context, sessionId);
      await session.context.close();
      this.activeSessions.delete(sessionId);
      this.emit('sessionClosed', sessionId);
    }
  }

  async cleanupOldestSession() {
    let oldestSession = null;
    let oldestTime = Date.now();

    for (const [id, session] of this.activeSessions) {
      if (session.lastUsed < oldestTime) {
        oldestTime = session.lastUsed;
        oldestSession = id;
      }
    }

    if (oldestSession) {
      await this.closeSession(oldestSession);
    }
  }

  async cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [id, session] of this.activeSessions) {
      if (now - session.lastUsed > CONFIG.SESSION_TIMEOUT) {
        expiredSessions.push(id);
      }
    }

    for (const sessionId of expiredSessions) {
      await this.closeSession(sessionId);
    }
  }

  getRandomUserAgent() {
    return CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
  }

  async setupResourceOptimization(context, options) {
    if (options.blockResources) {
      const blockedTypes = options.blockResources === true 
        ? ['image', 'font', 'media'] 
        : options.blockResources;

      await context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (blockedTypes.includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    if (options.blockDomains) {
      await context.route('**/*', (route) => {
        const url = route.request().url();
        const shouldBlock = options.blockDomains.some(domain => url.includes(domain));
        if (shouldBlock) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }
  }

  async saveAuthState(context, sessionId) {
    try {
      const authFile = path.join(CONFIG.SESSIONS_DIR, `${sessionId}_auth.json`);
      const pages = context.pages();
      
      if (pages.length > 0) {
        const page = pages[0];
        const cookies = await context.cookies();
        const localStorage = await page.evaluate(() => {
          try {
            return JSON.stringify(localStorage);
          } catch (e) {
            return '{}';
          }
        });
        const sessionStorage = await page.evaluate(() => {
          try {
            return JSON.stringify(sessionStorage);
          } catch (e) {
            return '{}';
          }
        });

        await fs.writeFile(authFile, JSON.stringify({
          cookies,
          localStorage,
          sessionStorage,
          savedAt: Date.now()
        }));
      }
    } catch (error) {
      // Ignore auth save errors
    }
  }

  async loadAuthState(context, sessionId) {
    try {
      const authFile = path.join(CONFIG.SESSIONS_DIR, `${sessionId}_auth.json`);
      const authData = JSON.parse(await fs.readFile(authFile, 'utf8'));
      
      if (authData.cookies && authData.cookies.length > 0) {
        await context.addCookies(authData.cookies);
      }

      // localStorage and sessionStorage will be restored when pages load
    } catch (error) {
      // No auth state to load, that's fine
    }
  }
}

// Smart Page Manager
class PageManager {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
  }

  async getOrCreatePage(sessionId, url, options = {}) {
    const session = await this.sessionManager.getOrCreateSession(sessionId, options);
    
    // Check if we have an existing page for this domain
    if (options.reuseTab !== false) {
      const hostname = url ? new URL(url).hostname : null;
      const existingPage = Array.from(session.pages.values())
        .find(pageInfo => {
          if (!pageInfo.page || pageInfo.page.isClosed()) return false;
          if (!hostname) return true;
          try {
            return pageInfo.page.url().includes(hostname);
          } catch (e) {
            return false;
          }
        });

      if (existingPage && !existingPage.page.isClosed()) {
        if (url && existingPage.page.url() !== url) {
          await existingPage.page.goto(url, { 
            waitUntil: options.waitUntil || 'load',
            timeout: options.timeout || 30000
          });
        }
        return existingPage.page;
      }
    }

    // Create new page
    const page = await session.context.newPage();
    const pageInfo = {
      page,
      createdAt: Date.now(),
      tabIndex: session.tabs.length
    };

    session.pages.set(page.url(), pageInfo);
    session.tabs.push(pageInfo);

    if (url) {
      await page.goto(url, { 
        waitUntil: options.waitUntil || 'load',
        timeout: options.timeout || 30000
      });
    }

    return page;
  }

  async switchTab(sessionId, tabIndex) {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session || !session.tabs[tabIndex]) {
      throw new Error(`Tab ${tabIndex} not found in session ${sessionId}`);
    }

    const pageInfo = session.tabs[tabIndex];
    if (pageInfo.page.isClosed()) {
      throw new Error(`Tab ${tabIndex} is closed`);
    }

    await pageInfo.page.bringToFront();
    return pageInfo.page;
  }

  async getTabInfo(sessionId) {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      return { tabs: [] };
    }

    const tabs = [];
    for (let i = 0; i < session.tabs.length; i++) {
      const pageInfo = session.tabs[i];
      if (pageInfo.page && !pageInfo.page.isClosed()) {
        tabs.push({
          index: i,
          url: pageInfo.page.url(),
          title: await pageInfo.page.title(),
          createdAt: pageInfo.createdAt
        });
      }
    }

    return { tabs };
  }
}

// Human-like Interaction Handler
class HumanInteraction {
  static async humanLikeClick(page, locator, options = {}) {
    await locator.waitFor({ state: 'visible', timeout: options.timeout || 30000 });
    
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error('Element not visible or has no bounding box');
    }

    // Random offset within the element
    const offsetX = (Math.random() - 0.5) * Math.min(box.width * 0.6, 20);
    const offsetY = (Math.random() - 0.5) * Math.min(box.height * 0.6, 20);
    const targetX = box.x + box.width / 2 + offsetX;
    const targetY = box.y + box.height / 2 + offsetY;

    // Human-like mouse movement
    await page.mouse.move(targetX, targetY, {
      steps: Math.floor(Math.random() * 10) + 5
    });

    // Random delay before click
    await page.waitForTimeout(Math.random() * 300 + 100);

    // Click with slight variation
    await page.mouse.click(targetX, targetY, {
      delay: Math.random() * 100 + 50
    });
  }

  static async humanLikeType(page, locator, text, options = {}) {
    await locator.waitFor({ state: 'visible', timeout: options.timeout || 30000 });
    await locator.click();
    
    // Clear existing text if needed
    if (options.clear !== false) {
      await locator.selectText();
    }

    // Type with human-like delays
    for (const char of text) {
      await page.keyboard.type(char, {
        delay: Math.random() * 150 + 50
      });
    }
  }

  static async smartWait(page, condition, timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        if (typeof condition === 'string') {
          await page.waitForSelector(condition, { timeout: 1000 });
          return true;
        } else if (typeof condition === 'function') {
          const result = await condition();
          if (result) return true;
        }
      } catch (e) {
        // Continue waiting
      }
      
      await page.waitForTimeout(Math.random() * 1000 + 500);
    }
    
    throw new Error(`Wait condition not met within ${timeout}ms`);
  }
}

// Error Recovery Handler
class ErrorRecovery {
  static async executeWithRetry(action, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await action();
      } catch (error) {
        lastError = error;
        
        if (i === maxRetries - 1) break;
        
        // Exponential backoff
        const delay = retryDelay * Math.pow(2, i) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Handle specific error types
        if (error.message.includes('Target closed') || 
            error.message.includes('Session closed')) {
          // Session recovery will be handled by session manager
          break;
        }
      }
    }
    
    throw lastError;
  }
}

// Initialize managers
const sessionManager = new SessionManager();
const pageManager = new PageManager(sessionManager);

// Enhanced locator resolver
function resolveLocator(page, sel) {
  if (typeof sel === 'string') {
    const s = sel.trim();
    if (s.startsWith('text=')) return page.getByText(s.slice(5));
    if (s.startsWith('role=')) return page.getByRole(s.slice(5));
    if (s.startsWith('label=')) return page.getByLabel(s.slice(6));
    if (s.startsWith('placeholder=')) return page.getByPlaceholder(s.slice(12));
    if (s.startsWith('testId=')) return page.getByTestId(s.slice(7));
    if (s.startsWith('xpath=')) return page.locator(`xpath=${s.slice(6)}`);
    if (s.startsWith('css=')) return page.locator(s.slice(4));
    return page.locator(s);
  }
  
  if (sel && typeof sel === 'object') {
    const { role, name, exact, text, label, placeholder, testId, css, xpath } = sel;
    if (role) return page.getByRole(role, name ? { name, exact: !!exact } : undefined);
    if (text) return page.getByText(text, { exact: !!exact });
    if (label) return page.getByLabel(label, { exact: !!exact });
    if (placeholder) return page.getByPlaceholder(placeholder, { exact: !!exact });
    if (testId) return page.getByTestId(testId);
    if (xpath) return page.locator(`xpath=${xpath}`);
    if (css) return page.locator(css);
  }
  
  throw new Error('Invalid locator');
}

// Enhanced verb implementations
async function doCreateSession(args) {
  const { sessionId, options = {} } = args;
  if (!sessionId) fail(10, 'MISSING_ARGUMENTS', { missing: ['sessionId'] });
  
  try {
    const session = await sessionManager.createSession(sessionId, options);
    return ok({ 
      sessionId, 
      created: true,
      options: session.options
    });
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doOpen(args) {
  const { url, sessionId = 'default', ...options } = args;
  if (!url) fail(10, 'MISSING_ARGUMENTS', { missing: ['url'] });
  
  try {
    const result = await ErrorRecovery.executeWithRetry(async () => {
      const page = await pageManager.getOrCreatePage(sessionId, url, options);
      const title = await page.title();
      const finalUrl = page.url();
      return { title, url: finalUrl, sessionId };
    });
    
    return ok(result);
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doClick(args) {
  const { locator, sessionId = 'default', humanLike = true, ...options } = args;
  if (!locator) fail(10, 'MISSING_ARGUMENTS', { missing: ['locator'] });
  
  try {
    const result = await ErrorRecovery.executeWithRetry(async () => {
      const page = await pageManager.getOrCreatePage(sessionId, options.url, options);
      const loc = resolveLocator(page, locator);
      
      if (humanLike) {
        await HumanInteraction.humanLikeClick(page, loc, options);
      } else {
        await loc.waitFor({ state: 'visible', timeout: options.timeout || 30000 });
        await loc.click({ timeout: options.timeout || 30000 });
      }
      
      if (options.waitForNavigation) {
        await page.waitForLoadState(
          typeof options.waitForNavigation === 'string' 
            ? options.waitForNavigation 
            : 'load'
        );
      }
      
      return { success: true, sessionId };
    });
    
    return ok(result);
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doFill(args) {
  const { locator, value, sessionId = 'default', humanLike = true, ...options } = args;
  if (!locator || value === undefined) {
    fail(10, 'MISSING_ARGUMENTS', { missing: ['locator', 'value'] });
  }
  
  try {
    const result = await ErrorRecovery.executeWithRetry(async () => {
      const page = await pageManager.getOrCreatePage(sessionId, options.url, options);
      const loc = resolveLocator(page, locator);
      
      if (humanLike) {
        await HumanInteraction.humanLikeType(page, loc, String(value), options);
      } else {
        await loc.waitFor({ state: 'visible', timeout: options.timeout || 30000 });
        await loc.fill(String(value), { timeout: options.timeout || 30000 });
      }
      
      if (options.submit) {
        await loc.press('Enter');
      }
      
      return { success: true, sessionId };
    });
    
    return ok(result);
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doRead(args) {
  const { locator, sessionId = 'default', as = 'text', ...options } = args;
  if (!locator) fail(10, 'MISSING_ARGUMENTS', { missing: ['locator'] });
  
  try {
    const result = await ErrorRecovery.executeWithRetry(async () => {
      const page = await pageManager.getOrCreatePage(sessionId, options.url, options);
      const loc = resolveLocator(page, locator);
      
      await loc.waitFor({ state: 'attached', timeout: options.timeout || 30000 });
      
      let value;
      switch (as) {
        case 'text':
          value = (await loc.textContent()) || '';
          break;
        case 'html':
          value = await loc.innerHTML();
          break;
        case 'value':
          value = await loc.inputValue();
          break;
        case 'attribute':
          if (!options.attribute) fail(10, 'MISSING_ARGUMENTS', { missing: ['attribute'] });
          value = await loc.getAttribute(options.attribute);
          break;
        default:
          fail(10, 'INVALID_ARGS', { message: `Unknown read mode: ${as}` });
      }
      
      return { value, sessionId };
    });
    
    return ok(result);
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doWait(args) {
  const { sessionId = 'default', ...options } = args;
  
  try {
    const result = await ErrorRecovery.executeWithRetry(async () => {
      const page = await pageManager.getOrCreatePage(sessionId, options.url, options);
      
      if (options.locator) {
        const loc = resolveLocator(page, options.locator);
        const state = options.state || (options.visible ? 'visible' : options.hidden ? 'hidden' : 'attached');
        await loc.waitFor({ state, timeout: options.timeout || options.ms || 30000 });
      } else if (options.ms || options.timeout) {
        await page.waitForTimeout(options.ms || options.timeout);
      } else if (options.state) {
        await page.waitForLoadState(options.state);
      } else if (options.condition) {
        await HumanInteraction.smartWait(page, options.condition, options.timeout || 30000);
      } else {
        fail(10, 'INVALID_ARGS', { message: 'Provide locator, condition, state, or ms' });
      }
      
      return { success: true, sessionId };
    });
    
    return ok(result);
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doScreenshot(args) {
  const { sessionId = 'default', selector, fullPage = false, ...options } = args;
  
  try {
    const result = await ErrorRecovery.executeWithRetry(async () => {
      const page = await pageManager.getOrCreatePage(sessionId, options.url, options);
      
      let screenshot;
      if (selector) {
        const loc = resolveLocator(page, selector);
        await loc.waitFor({ state: 'visible', timeout: options.timeout || 30000 });
        screenshot = await loc.screenshot({ type: 'png' });
      } else {
        screenshot = await page.screenshot({ 
          fullPage, 
          type: 'png',
          timeout: options.timeout || 30000
        });
      }
      
      return { 
        screenshot: screenshot.toString('base64'), 
        sessionId,
        fullPage: !!fullPage
      };
    });
    
    return ok(result);
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doOpenTabs(args) {
  const { urls, sessionId = 'default', switchTo, ...options } = args;
  if (!urls || !Array.isArray(urls)) {
    fail(10, 'MISSING_ARGUMENTS', { missing: ['urls'] });
  }
  
  try {
    const result = await ErrorRecovery.executeWithRetry(async () => {
      const session = await sessionManager.getOrCreateSession(sessionId, options);
      const tabInfo = [];
      
      for (let i = 0; i < urls.length; i++) {
        const page = await pageManager.getOrCreatePage(sessionId, urls[i], {
          ...options,
          reuseTab: false
        });
        tabInfo.push({
          index: i,
          url: page.url(),
          title: await page.title()
        });
      }
      
      if (typeof switchTo === 'number' && switchTo < tabInfo.length) {
        await pageManager.switchTab(sessionId, switchTo);
      }
      
      return { tabs: tabInfo, sessionId, activeTab: switchTo };
    });
    
    return ok(result);
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doSwitchTab(args) {
  const { tabIndex, sessionId = 'default' } = args;
  if (typeof tabIndex !== 'number') {
    fail(10, 'MISSING_ARGUMENTS', { missing: ['tabIndex'] });
  }
  
  try {
    const page = await pageManager.switchTab(sessionId, tabIndex);
    return ok({ 
      success: true, 
      tabIndex, 
      sessionId,
      url: page.url(),
      title: await page.title()
    });
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doGetTabs(args) {
  const { sessionId = 'default' } = args;
  
  try {
    const result = await pageManager.getTabInfo(sessionId);
    return ok({ ...result, sessionId });
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doCloseSession(args) {
  const { sessionId } = args;
  if (!sessionId) fail(10, 'MISSING_ARGUMENTS', { missing: ['sessionId'] });
  
  try {
    await sessionManager.closeSession(sessionId);
    return ok({ sessionId, closed: true });
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

async function doEvaluate(args) {
  const { script, sessionId = 'default', args: scriptArgs = [], ...options } = args;
  if (!script) fail(10, 'MISSING_ARGUMENTS', { missing: ['script'] });
  
  try {
    const result = await ErrorRecovery.executeWithRetry(async () => {
      const page = await pageManager.getOrCreatePage(sessionId, options.url, options);
      
      const scriptResult = await page.evaluate(
        new Function('...args', script), 
        ...scriptArgs
      );
      
      return { result: scriptResult, sessionId };
    });
    
    return ok(result);
  } catch (error) {
    fail(50, 'ADAPTER_ERROR', { message: error.message });
  }
}

// Main execution
(async () => {
  try {
    const id = normalizeVerb(verb);
    switch (id) {
      case 'web_enhanced.createSession':
        return await doCreateSession(args);
      case 'web_enhanced.open':
        return await doOpen(args);
      case 'web_enhanced.click':
        return await doClick(args);
      case 'web_enhanced.fill':
        return await doFill(args);
      case 'web_enhanced.read':
        return await doRead(args);
      case 'web_enhanced.wait':
        return await doWait(args);
      case 'web_enhanced.screenshot':
        return await doScreenshot(args);
      case 'web_enhanced.openTabs':
        return await doOpenTabs(args);
      case 'web_enhanced.switchTab':
        return await doSwitchTab(args);
      case 'web_enhanced.getTabs':
        return await doGetTabs(args);
      case 'web_enhanced.closeSession':
        return await doCloseSession(args);
      case 'web_enhanced.evaluate':
        return await doEvaluate(args);
      default:
        return fail(10, 'UNKNOWN_VERB');
    }
  } catch (e) {
    return fail(50, 'ADAPTER_ERROR', { message: e.message });
  }
})();

// Cleanup on exit
process.on('SIGINT', async () => {
  console.error('Shutting down gracefully...');
  for (const sessionId of sessionManager.activeSessions.keys()) {
    await sessionManager.closeSession(sessionId);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  for (const sessionId of sessionManager.activeSessions.keys()) {
    await sessionManager.closeSession(sessionId);
  }
  process.exit(0);
});