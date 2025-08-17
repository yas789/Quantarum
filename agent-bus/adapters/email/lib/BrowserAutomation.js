const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const CONFIG = require('./Config');

/**
 * Browser automation utilities for email operations
 */
class BrowserAutomation {
  static async createAuthScript(provider, sessionManager) {
    const config = CONFIG.PROVIDERS[provider];
    if (!config) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    
    return `
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch(${JSON.stringify(CONFIG.BROWSER_OPTIONS)});
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('${CONFIG.USER_AGENT}');
    
    // Navigate to login page
    await page.goto('${config.loginUrl}', { waitUntil: 'networkidle2' });
    
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
          await require('fs').promises.writeFile('${sessionManager.sessionPath}', JSON.stringify({
            cookies,
            provider: '${provider}',
            email: '${sessionManager.email}',
            timestamp: Date.now()
          }, null, 2));
          
          console.log('Session saved successfully!');
          await browser.close();
          process.exit(0);
        } catch (error) {
          console.error('Error saving session:', error);
          process.exit(1);
        }
      }
    });
  } catch (error) {
    console.error('Browser automation error:', error);
    await browser.close();
    process.exit(1);
  }
})();`;
  }
  
  static async createEmailScript(provider, operation, operationData, sessionManager) {
    const config = CONFIG.PROVIDERS[provider];
    if (!config) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    
    const sessionData = await sessionManager.loadSession();
    if (!sessionData) {
      throw new Error('No valid session found. Please run setup first.');
    }
    
    return `
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch(${JSON.stringify({...CONFIG.BROWSER_OPTIONS, headless: true})});
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('${CONFIG.USER_AGENT}');
    
    // Load saved cookies
    const sessionData = ${JSON.stringify(sessionData)};
    await page.setCookie(...sessionData.cookies);
    
    // Navigate to mail interface
    await page.goto('${config.mailUrl}', { waitUntil: 'networkidle2' });
    
    ${this.generateOperationCode(operation, operationData, config)}
    
    await browser.close();
  } catch (error) {
    console.error('Email operation error:', error);
    await browser.close();
    process.exit(1);
  }
})();`;
  }
  
  static generateOperationCode(operation, data, config) {
    switch (operation) {
      case 'send':
        return `
    // Compose new email
    await page.waitForSelector('${config.selectors.composeButton}');
    await page.click('${config.selectors.composeButton}');
    
    // Fill recipients
    await page.waitForSelector('${config.selectors.toField}');
    await page.type('${config.selectors.toField}', '${data.to.join(', ')}');
    
    // Fill subject
    await page.waitForSelector('${config.selectors.subjectField}');
    await page.type('${config.selectors.subjectField}', '${data.subject}');
    
    // Fill body
    await page.waitForSelector('${config.selectors.bodyField}');
    await page.type('${config.selectors.bodyField}', \`${data.body}\`);
    
    // Send email
    await page.click('${config.selectors.sendButton}');
    await page.waitForTimeout(2000);
    
    console.log(JSON.stringify({
      ok: true,
      data: {
        sent: true,
        to: ${JSON.stringify(data.to)},
        subject: '${data.subject}',
        timestamp: new Date().toISOString()
      }
    }));`;
    
      case 'search':
        return `
    // Search emails
    await page.waitForSelector('${config.selectors.searchBox}');
    await page.type('${config.selectors.searchBox}', '${data.query}');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    
    // Extract search results
    const emails = await page.evaluate(() => {
      const emailElements = document.querySelectorAll('${config.selectors.emailList}');
      return Array.from(emailElements).slice(0, 10).map(el => ({
        subject: el.querySelector('[data-thread-id]')?.textContent?.trim() || 'No subject',
        sender: el.querySelector('[email]')?.getAttribute('email') || 'Unknown sender',
        date: el.querySelector('[title]')?.getAttribute('title') || 'Unknown date'
      }));
    });
    
    console.log(JSON.stringify({
      ok: true,
      data: {
        query: '${data.query}',
        results: emails,
        total: emails.length
      }
    }));`;
    
      case 'list':
        return `
    // List recent emails
    await page.waitForSelector('${config.selectors.emailList}');
    await page.waitForTimeout(2000);
    
    const emails = await page.evaluate(() => {
      const emailElements = document.querySelectorAll('${config.selectors.emailList}');
      return Array.from(emailElements).slice(0, ${data.limit || 10}).map(el => ({
        subject: el.querySelector('[data-thread-id]')?.textContent?.trim() || 'No subject',
        sender: el.querySelector('[email]')?.getAttribute('email') || 'Unknown sender',
        date: el.querySelector('[title]')?.getAttribute('title') || 'Unknown date',
        unread: el.classList.contains('zA')
      }));
    });
    
    console.log(JSON.stringify({
      ok: true,
      data: {
        emails,
        total: emails.length
      }
    }));`;
    
      default:
        return `console.error('Unknown operation: ${operation}'); process.exit(1);`;
    }
  }
  
  static async executePuppeteerScript(script) {
    return new Promise((resolve, reject) => {
      const tempFile = path.join(os.tmpdir(), `email_script_${Date.now()}.js`);
      
      fs.writeFile(tempFile, script)
        .then(() => {
          const child = spawn('node', [tempFile], {
            stdio: ['inherit', 'pipe', 'pipe']
          });
          
          let stdout = '';
          let stderr = '';
          
          child.stdout.on('data', (data) => {
            stdout += data.toString();
          });
          
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          
          child.on('close', async (code) => {
            try {
              await fs.unlink(tempFile);
            } catch (error) {
              // Ignore cleanup errors
            }
            
            if (code === 0) {
              try {
                const result = JSON.parse(stdout);
                resolve(result.data);
              } catch (error) {
                resolve({ success: true, output: stdout });
              }
            } else {
              reject(new Error(stderr || `Process exited with code ${code}`));
            }
          });
        })
        .catch(reject);
    });
  }
}

module.exports = BrowserAutomation;