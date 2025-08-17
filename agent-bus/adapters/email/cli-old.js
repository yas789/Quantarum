#!/usr/bin/env node

// Zero-config cross-platform email automation
// Works with Gmail, Outlook, and other web-based email providers
// No API keys or local mail apps required

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');

// Read the JSON input
const payload = JSON.parse(process.argv[2] || '{}');
const { verb, args = {} } = payload;

// Helper functions
const ok = (data) => console.log(JSON.stringify({ ok: true, data }));
const fail = (code, msg, details) => {
  console.error(JSON.stringify({ 
    ok: false, 
    code, 
    msg,
    ...(details && { details })
  }));
  process.exit(1);
};

// Validate required arguments
const requireArgs = (args, required) => {
  const missing = required.filter(key => args[key] === undefined);
  if (missing.length > 0) {
    fail(10, 'MISSING_ARGUMENTS', { missing });
  }
};

// Email provider configurations
const EMAIL_PROVIDERS = {
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
      sendButton: 'div[data-tooltip="Send ‪(Ctrl+Enter)‬"]',
      searchBox: 'input[aria-label="Search mail"]',
      emailList: 'tr.zA',
      emailSubject: 'span[data-thread-perm]',
      emailSender: 'span.go span',
      emailDate: 'span.g3',
      unreadIndicator: '.yW'
    },
    actions: {
      waitForLoad: 2000,
      typeDelay: 100,
      clickDelay: 500
    }
  },
  outlook: {
    name: 'Outlook',
    loginUrl: 'https://login.live.com',
    mailUrl: 'https://outlook.live.com/mail',
    selectors: {
      loginEmail: 'input[type="email"]',
      loginPassword: 'input[type="password"]',
      nextButton: 'input[type="submit"]',
      composeButton: '[data-automation-id="newMailButton"]',
      toField: 'div[aria-label="To"]',
      subjectField: 'input[aria-label="Add a subject"]',
      bodyField: 'div[aria-label="Message body"]',
      sendButton: 'button[aria-label="Send"]',
      searchBox: 'input[aria-label="Search"]',
      emailList: '[role="row"][aria-label*="message"]',
      emailSubject: '[data-automation-id="subject"]',
      emailSender: '[data-automation-id="sender"]',
      emailDate: '[data-automation-id="date"]',
      unreadIndicator: '[data-automation-id="unread"]'
    },
    actions: {
      waitForLoad: 3000,
      typeDelay: 150,
      clickDelay: 700
    }
  }
};

// Session management
class EmailSession {
  constructor(provider, sessionId) {
    this.provider = provider;
    this.sessionId = sessionId;
    this.config = EMAIL_PROVIDERS[provider];
    this.cacheDir = path.join(os.tmpdir(), 'quantarum_email_sessions');
    this.sessionPath = path.join(this.cacheDir, `${sessionId}_${provider}`);
  }

  async init() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  async getAuthScript() {
    return `
      const puppeteer = require('puppeteer');
      
      (async () => {
        const browser = await puppeteer.launch({
          headless: false, // Show browser for manual login
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ]
        });
        
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Navigate to login page
        await page.goto('${this.config.loginUrl}', { waitUntil: 'networkidle2' });
        
        console.log('Please login manually in the browser window...');
        console.log('Once logged in and you see your inbox, press Enter here to continue...');
        
        // Wait for user to press Enter
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', async (key) => {
          if (key[0] === 13) { // Enter key
            try {
              // Save session cookies
              const cookies = await page.cookies();
              await require('fs').promises.writeFile('${this.sessionPath}_cookies.json', JSON.stringify(cookies));
              console.log('Session saved successfully!');
              await browser.close();
              process.exit(0);
            } catch (error) {
              console.error('Error saving session:', error);
              process.exit(1);
            }
          }
        });
      })();
    `;
  }

  async loadSession() {
    try {
      const cookiesPath = `${this.sessionPath}_cookies.json`;
      const cookies = JSON.parse(await fs.readFile(cookiesPath, 'utf8'));
      return cookies;
    } catch (error) {
      return null;
    }
  }

  async executeWithBrowser(action, params = {}) {
    const script = `
      const puppeteer = require('puppeteer');
      const fs = require('fs').promises;
      
      (async () => {
        try {
          const browser = await puppeteer.launch({
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-web-security',
              '--disable-features=VizDisplayCompositor'
            ]
          });
          
          const page = await browser.newPage();
          await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          
          // Load saved cookies
          const cookies = JSON.parse(await fs.readFile('${this.sessionPath}_cookies.json', 'utf8'));
          await page.setCookie(...cookies);
          
          // Navigate to mail interface
          await page.goto('${this.config.mailUrl}', { waitUntil: 'networkidle2' });
          await page.waitForTimeout(${this.config.actions.waitForLoad});
          
          let result = {};
          
          switch ('${action}') {
            case 'send':
              await sendEmail(page, ${JSON.stringify(params)});
              result = { success: true, action: 'send' };
              break;
              
            case 'search':
              result = await searchEmails(page, ${JSON.stringify(params)});
              break;
              
            case 'list':
              result = await listEmails(page, ${JSON.stringify(params)});
              break;
          }
          
          await browser.close();
          console.log(JSON.stringify({ ok: true, data: result }));
          
        } catch (error) {
          console.error(JSON.stringify({ 
            ok: false, 
            code: 50, 
            msg: 'EMAIL_OPERATION_FAILED',
            details: { error: error.message }
          }));
          process.exit(1);
        }
      })();
      
      // Email sending function
      async function sendEmail(page, params) {
        const selectors = ${JSON.stringify(this.config.selectors)};
        const actions = ${JSON.stringify(this.config.actions)};
        
        // Click compose button
        await page.waitForSelector(selectors.composeButton, { timeout: 10000 });
        await page.click(selectors.composeButton);
        await page.waitForTimeout(actions.clickDelay);
        
        // Fill recipients
        await page.waitForSelector(selectors.toField);
        await page.click(selectors.toField);
        await page.type(selectors.toField, params.to.join(', '), { delay: actions.typeDelay });
        
        // Fill CC if provided
        if (params.cc && params.cc.length > 0) {
          try {
            await page.click('[aria-label="Cc"]');
            await page.type('[name="cc"]', params.cc.join(', '), { delay: actions.typeDelay });
          } catch (error) {
            // CC field might not be available
          }
        }
        
        // Fill subject
        await page.click(selectors.subjectField);
        await page.type(selectors.subjectField, params.subject, { delay: actions.typeDelay });
        
        // Fill body
        await page.click(selectors.bodyField);
        await page.type(selectors.bodyField, params.body, { delay: actions.typeDelay });
        
        // Send email
        await page.click(selectors.sendButton);
        await page.waitForTimeout(2000); // Wait for send to complete
      }
      
      // Email search function
      async function searchEmails(page, params) {
        const selectors = ${JSON.stringify(this.config.selectors)};
        const results = [];
        
        if (params.query) {
          // Use search box
          await page.waitForSelector(selectors.searchBox);
          await page.click(selectors.searchBox);
          await page.type(selectors.searchBox, params.query);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(2000);
        }
        
        // Extract email list
        await page.waitForSelector(selectors.emailList);
        const emails = await page.$$eval(selectors.emailList, (elements, selectors) => {
          return elements.slice(0, 20).map((el, index) => {
            try {
              const subject = el.querySelector(selectors.emailSubject)?.textContent?.trim() || '';
              const sender = el.querySelector(selectors.emailSender)?.textContent?.trim() || '';
              const date = el.querySelector(selectors.emailDate)?.textContent?.trim() || '';
              const unread = !!el.querySelector(selectors.unreadIndicator);
              
              return {
                id: 'email_' + index,
                from: sender,
                subject: subject,
                date: date,
                unread: unread,
                snippet: subject.length > 100 ? subject.substring(0, 100) + '...' : subject
              };
            } catch (error) {
              return null;
            }
          }).filter(Boolean);
        }, selectors);
        
        return { messages: emails, total: emails.length };
      }
      
      // Email listing function  
      async function listEmails(page, params) {
        const selectors = ${JSON.stringify(this.config.selectors)};
        
        // Wait for email list to load
        await page.waitForSelector(selectors.emailList);
        
        const emails = await page.$$eval(selectors.emailList, (elements, selectors) => {
          return elements.slice(0, params.limit || 10).map((el, index) => {
            try {
              const subject = el.querySelector(selectors.emailSubject)?.textContent?.trim() || '';
              const sender = el.querySelector(selectors.emailSender)?.textContent?.trim() || '';
              const date = el.querySelector(selectors.emailDate)?.textContent?.trim() || '';
              const unread = !!el.querySelector(selectors.unreadIndicator);
              
              // Filter by unread if requested
              if (params.unreadOnly && !unread) {
                return null;
              }
              
              return {
                id: 'email_' + index,
                from: sender,
                to: ['me'], // Can't easily extract recipient from list view
                subject: subject,
                date: date,
                unread: unread,
                snippet: subject.length > 100 ? subject.substring(0, 100) + '...' : subject
              };
            } catch (error) {
              return null;
            }
          }).filter(Boolean);
        }, selectors);
        
        return { messages: emails, total: emails.length };
      }
    `;

    // Write script to temporary file
    const tempScript = path.join(os.tmpdir(), `email_script_${Date.now()}.js`);
    await fs.writeFile(tempScript, script);

    try {
      // Execute the script
      const result = await new Promise((resolve, reject) => {
        const child = spawn('node', [tempScript], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          if (code === 0) {
            try {
              resolve(JSON.parse(stdout));
            } catch (error) {
              reject(new Error(`Failed to parse result: ${stdout}`));
            }
          } else {
            reject(new Error(`Script failed with code ${code}: ${stderr}`));
          }
        });
      });

      return result;
    } finally {
      // Clean up temporary script
      try {
        await fs.unlink(tempScript);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

// Generate session ID
function generateSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

// Detect email provider from email address
function detectProvider(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (domain?.includes('gmail') || domain?.includes('google')) {
    return 'gmail';
  }
  if (domain?.includes('outlook') || domain?.includes('hotmail') || domain?.includes('live')) {
    return 'outlook';
  }
  return 'gmail'; // Default to Gmail
}

// Main handler
(async () => {
  try {
    if (!verb) {
      throw new Error('No verb provided');
    }
    
    // Normalize to full verb id
    const verbId = verb.startsWith('email.') ? verb : `email.${verb}`;
    
    switch (verbId) {
      case 'email.setup':
        requireArgs(args, ['email']);
        
        const provider = args.provider || detectProvider(args.email);
        const sessionId = generateSessionId();
        
        if (!EMAIL_PROVIDERS[provider]) {
          return fail(11, 'UNSUPPORTED_PROVIDER', { provider, supported: Object.keys(EMAIL_PROVIDERS) });
        }
        
        const session = new EmailSession(provider, sessionId);
        await session.init();
        
        // Generate authentication script
        const authScript = await session.getAuthScript();
        const tempAuthFile = path.join(os.tmpdir(), `email_auth_${sessionId}.js`);
        await fs.writeFile(tempAuthFile, authScript);
        
        return ok({
          sessionId,
          provider: provider,
          setupInstructions: [
            `Run: node ${tempAuthFile}`,
            'Login manually in the browser window',
            'Press Enter in the terminal once logged in',
            `Use sessionId "${sessionId}" for subsequent operations`
          ]
        });

      case 'email.send':
        requireArgs(args, ['to', 'subject', 'body']);
        
        if (!args.sessionId) {
          return fail(10, 'MISSING_SESSION_ID', { 
            message: 'Run email.setup first to get a sessionId' 
          });
        }
        
        const sendProvider = args.provider || detectProvider(args.to[0]);
        const sendSession = new EmailSession(sendProvider, args.sessionId);
        
        // Check if session exists
        const cookies = await sendSession.loadSession();
        if (!cookies) {
          return fail(12, 'SESSION_NOT_FOUND', { 
            message: 'Session not found. Run email.setup first.' 
          });
        }
        
        const sendResult = await sendSession.executeWithBrowser('send', {
          to: Array.isArray(args.to) ? args.to : [args.to],
          cc: args.cc || [],
          bcc: args.bcc || [],
          subject: args.subject,
          body: args.body
        });
        
        return ok(sendResult.data);

      case 'email.search':
        if (!args.sessionId) {
          return fail(10, 'MISSING_SESSION_ID', { 
            message: 'Run email.setup first to get a sessionId' 
          });
        }
        
        const searchProvider = args.provider || 'gmail';
        const searchSession = new EmailSession(searchProvider, args.sessionId);
        
        const searchCookies = await searchSession.loadSession();
        if (!searchCookies) {
          return fail(12, 'SESSION_NOT_FOUND', { 
            message: 'Session not found. Run email.setup first.' 
          });
        }
        
        const searchResult = await searchSession.executeWithBrowser('search', {
          query: args.query,
          limit: args.limit || 10,
          unreadOnly: args.unreadOnly || false
        });
        
        return ok(searchResult.data);

      case 'email.list':
        if (!args.sessionId) {
          return fail(10, 'MISSING_SESSION_ID', { 
            message: 'Run email.setup first to get a sessionId' 
          });
        }
        
        const listProvider = args.provider || 'gmail';
        const listSession = new EmailSession(listProvider, args.sessionId);
        
        const listCookies = await listSession.loadSession();
        if (!listCookies) {
          return fail(12, 'SESSION_NOT_FOUND', { 
            message: 'Session not found. Run email.setup first.' 
          });
        }
        
        const listResult = await listSession.executeWithBrowser('list', {
          limit: args.limit || 10,
          unreadOnly: args.unreadOnly || false,
          mailbox: args.mailbox || 'INBOX'
        });
        
        return ok(listResult.data);

      default:
        return fail(10, 'UNKNOWN_VERB', { verb: verbId });
    }
    
  } catch (error) {
    console.error('Email Adapter Error:', {
      message: error.message,
      stack: error.stack,
      verb,
      args
    });
    
    const details = process.env.NODE_ENV === 'development' 
      ? { message: error.message, stack: error.stack }
      : undefined;
      
    return fail(50, 'ADAPTER_ERROR', details);
  }
})();