const path = require('path');
const os = require('os');

/**
 * Configuration for email providers and operations
 */
const CONFIG = {
  // Cache and session settings
  CACHE_DIR: path.join(os.tmpdir(), 'quantarum_email_cache'),
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  
  // Browser settings
  BROWSER_OPTIONS: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--no-first-run',
      '--disable-default-apps'
    ]
  },
  
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  
  // Email provider configurations
  PROVIDERS: {
    gmail: {
      name: 'Gmail',
      loginUrl: 'https://accounts.google.com/signin',
      mailUrl: 'https://mail.google.com',
      selectors: {
        loginEmail: 'input[type="email"]',
        loginPassword: 'input[type="password"]',
        nextButton: '[data-l="Next"]',
        composeButton: '[gh="cm"]',
        toField: 'textarea[name="to"]',
        subjectField: 'input[name="subjectbox"]',
        bodyField: 'div[aria-label="Message Body"]',
        sendButton: '[role="button"][aria-label*="Send"]',
        emailList: '[role="main"] tbody tr',
        searchBox: 'input[aria-label="Search mail"]'
      }
    },
    outlook: {
      name: 'Outlook',
      loginUrl: 'https://login.microsoftonline.com',
      mailUrl: 'https://outlook.live.com/mail',
      selectors: {
        loginEmail: 'input[type="email"]',
        loginPassword: 'input[type="password"]',
        nextButton: 'input[type="submit"]',
        composeButton: '[aria-label="New message"]',
        toField: 'input[aria-label="To"]',
        subjectField: 'input[aria-label="Subject"]',
        bodyField: 'div[aria-label="Message body"]',
        sendButton: '[aria-label="Send"]',
        emailList: '[role="listitem"]',
        searchBox: 'input[aria-label="Search"]'
      }
    }
  },
  
  // Error codes
  ERROR_CODES: {
    MISSING_ARGUMENTS: 10,
    INVALID_EMAIL: 11,
    UNSUPPORTED_PROVIDER: 12,
    SESSION_NOT_FOUND: 20,
    AUTHENTICATION_FAILED: 21,
    SEND_FAILED: 30,
    SEARCH_FAILED: 31,
    BROWSER_ERROR: 40
  }
};

module.exports = CONFIG;