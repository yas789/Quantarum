#!/usr/bin/env node
const path = require('path');
const os = require('os');

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
const normalizeVerb = (v) => (v && v.startsWith('web_playwright.') ? v : `web_playwright.${v}`);

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

// Build or reuse a browser context
async function getContext(options = {}) {
  const headless = options.headless !== false; // default true unless explicitly false
  const userDir = options.session_id
    ? path.join(os.tmpdir(), `webpw_${options.session_id}`)
    : null;
  const chromium = pw.chromium;
  if (userDir) {
    return chromium.launchPersistentContext(userDir, { headless });
  }
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  // Ensure closing the browser when context closes
  context.on('close', () => { try { browser.close(); } catch (_) {} });
  return context;
}

// Resolve resilient locator
function resolveLocator(page, sel) {
  // string: support prefixes like text=, role=, css=, xpath=
  if (typeof sel === 'string') {
    const s = sel.trim();
    if (s.startsWith('text=')) return page.getByText(s.slice(5));
    if (s.startsWith('role=')) return page.getByRole(s.slice(5));
    if (s.startsWith('label=')) return page.getByLabel(s.slice(6));
    if (s.startsWith('placeholder=')) return page.getByPlaceholder(s.slice(12));
    if (s.startsWith('testId=')) return page.getByTestId(s.slice(7));
    if (s.startsWith('xpath=')) return page.locator(`xpath=${s.slice(6)}`);
    if (s.startsWith('css=')) return page.locator(s.slice(4));
    // default to CSS
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

// Core verbs
async function doOpen(a) {
  if (!a.url) fail(10, 'MISSING_ARGUMENTS', { missing: ['url'] });
  const context = await getContext(a);
  try {
    const page = await context.newPage();
    await page.goto(a.url, { waitUntil: a.waitUntil || 'load' });
    const title = await page.title();
    const finalUrl = page.url();
    await context.close();
    return ok({ title, url: finalUrl });
  } catch (e) {
    try { await context.close(); } catch (_) {}
    fail(50, 'ADAPTER_ERROR', { message: e.message });
  }
}

async function ensurePage(context, a) {
  const page = await context.newPage();
  if (a.url) {
    await page.goto(a.url, { waitUntil: a.waitUntil || 'load' });
  }
  return page;
}

async function doClick(a) {
  if (!a.locator) fail(10, 'MISSING_ARGUMENTS', { missing: ['locator'] });
  const context = await getContext(a);
  try {
    const page = await ensurePage(context, a);
    const locator = resolveLocator(page, a.locator);
    await locator.waitFor({ state: 'visible', timeout: a.timeout || 30000 });
    await locator.click({ timeout: a.timeout || 30000 });
    if (a.waitForNavigation) {
      await page.waitForLoadState(typeof a.waitForNavigation === 'string' ? a.waitForNavigation : 'load');
    }
    await context.close();
    return ok({ success: true });
  } catch (e) {
    try { await context.close(); } catch (_) {}
    fail(50, 'ADAPTER_ERROR', { message: e.message });
  }
}

async function doFill(a) {
  if (!a.locator || a.value === undefined) fail(10, 'MISSING_ARGUMENTS', { missing: ['locator','value'] });
  const context = await getContext(a);
  try {
    const page = await ensurePage(context, a);
    const locator = resolveLocator(page, a.locator);
    await locator.waitFor({ state: 'visible', timeout: a.timeout || 30000 });
    await locator.fill(String(a.value), { timeout: a.timeout || 30000 });
    if (a.submit) {
      // try pressing Enter
      await locator.press('Enter');
    }
    await context.close();
    return ok({ success: true });
  } catch (e) {
    try { await context.close(); } catch (_) {}
    fail(50, 'ADAPTER_ERROR', { message: e.message });
  }
}

async function doRead(a) {
  if (!a.locator) fail(10, 'MISSING_ARGUMENTS', { missing: ['locator'] });
  const as = a.as || 'text';
  const context = await getContext(a);
  try {
    const page = await ensurePage(context, a);
    const locator = resolveLocator(page, a.locator);
    await locator.waitFor({ state: 'attached', timeout: a.timeout || 30000 });
    let value;
    if (as === 'text') value = (await locator.textContent()) || '';
    else if (as === 'html') value = await locator.innerHTML();
    else if (as === 'value') value = await locator.inputValue();
    else if (as === 'attribute') {
      if (!a.attribute) fail(10, 'MISSING_ARGUMENTS', { missing: ['attribute'] });
      value = await locator.getAttribute(a.attribute);
    } else {
      fail(10, 'INVALID_ARGS', { message: `Unknown read mode: ${as}` });
    }
    await context.close();
    return ok({ value });
  } catch (e) {
    try { await context.close(); } catch (_) {}
    fail(50, 'ADAPTER_ERROR', { message: e.message });
  }
}

async function doWait(a) {
  const context = await getContext(a);
  try {
    const page = await ensurePage(context, a);
    if (a.locator) {
      const locator = resolveLocator(page, a.locator);
      const state = a.state || (a.visible ? 'visible' : a.hidden ? 'hidden' : 'attached');
      await locator.waitFor({ state, timeout: a.timeout || a.ms || 30000 });
    } else if (a.ms || a.timeout) {
      await page.waitForTimeout(a.ms || a.timeout);
    } else if (a.state) {
      await page.waitForLoadState(a.state);
    } else {
      fail(10, 'INVALID_ARGS', { message: 'Provide locator/state or ms' });
    }
    await context.close();
    return ok({ success: true });
  } catch (e) {
    try { await context.close(); } catch (_) {}
    fail(50, 'ADAPTER_ERROR', { message: e.message });
  }
}

async function doUpload(a) {
  if (!a.locator || !a.filePath) fail(10, 'MISSING_ARGUMENTS', { missing: ['locator','filePath'] });
  const context = await getContext(a);
  try {
    const page = await ensurePage(context, a);
    const locator = resolveLocator(page, a.locator);
    await locator.setInputFiles(a.filePath);
    await context.close();
    return ok({ success: true });
  } catch (e) {
    try { await context.close(); } catch (_) {}
    fail(50, 'ADAPTER_ERROR', { message: e.message });
  }
}

(async () => {
  try {
    const id = normalizeVerb(verb);
    switch (id) {
      case 'web_playwright.open':
        return await doOpen(args);
      case 'web_playwright.click':
        return await doClick(args);
      case 'web_playwright.fill':
        return await doFill(args);
      case 'web_playwright.read':
        return await doRead(args);
      case 'web_playwright.wait':
        return await doWait(args);
      case 'web_playwright.upload':
        return await doUpload(args);
      default:
        return fail(10, 'UNKNOWN_VERB');
    }
  } catch (e) {
    return fail(50, 'ADAPTER_ERROR', { message: e.message });
  }
})();

