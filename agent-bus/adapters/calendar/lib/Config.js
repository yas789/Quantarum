const path = require('path');
const os = require('os');

/**
 * Configuration for calendar providers and operations
 */
const CONFIG = {
  // Cache and session settings
  CACHE_DIR: path.join(os.tmpdir(), 'quantarum_calendar_cache'),
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  
  // Calendar provider configurations
  PROVIDERS: {
    google: {
      name: 'Google Calendar',
      loginUrl: 'https://accounts.google.com/signin',
      calendarUrl: 'https://calendar.google.com',
      selectors: {
        loginEmail: 'input[type="email"]',
        loginPassword: 'input[type="password"]',
        nextButton: '[data-l="Next"]',
        createButton: '[aria-label="Create"]',
        eventTitleField: 'input[aria-label="Title"]',
        eventDateField: 'input[aria-label="Start date"]',
        eventTimeField: 'input[aria-label="Start time"]',
        saveButton: '[aria-label="Save"]',
        eventList: '[role="gridcell"]'
      }
    },
    outlook: {
      name: 'Outlook Calendar',
      loginUrl: 'https://login.microsoftonline.com',
      calendarUrl: 'https://outlook.live.com/calendar',
      selectors: {
        loginEmail: 'input[type="email"]',
        loginPassword: 'input[type="password"]',
        nextButton: 'input[type="submit"]',
        createButton: '[aria-label="New event"]',
        eventTitleField: 'input[aria-label="Subject"]',
        eventDateField: 'input[aria-label="Start date"]',
        eventTimeField: 'input[aria-label="Start time"]',
        saveButton: '[aria-label="Save"]',
        eventList: '[role="option"]'
      }
    }
  },
  
  // Browser settings
  BROWSER_OPTIONS: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  },
  
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  
  // Error codes
  ERROR_CODES: {
    MISSING_ARGUMENTS: 10,
    INVALID_EMAIL: 11,
    INVALID_DATE: 12,
    UNSUPPORTED_PROVIDER: 13,
    SESSION_NOT_FOUND: 20,
    AUTHENTICATION_FAILED: 21,
    CREATE_FAILED: 30,
    LIST_FAILED: 31,
    BROWSER_ERROR: 40
  }
};

module.exports = CONFIG;