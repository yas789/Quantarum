#!/usr/bin/env node

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const net = require('net');
const WebSocket = require('ws');

// Promisify functions
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);
const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  PORT: 0, // Auto-select port
  HOST: '127.0.0.1',
  LOG_LEVEL: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  SOCKET_TIMEOUT: 30000, // 30 seconds
  MAX_MESSAGE_SIZE: 10 * 1024 * 1024, // 10MB
  CHROME_PROFILES: [
    path.join(process.env.HOME, 'Library/Application Support/Google/Chrome'), // macOS
    path.join(process.env.HOME, '.config/google-chrome'), // Linux
    path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data') // Windows
  ]
};

// State
let server = null;
let wss = null;
let clients = new Set();
let messageQueue = [];
let isProcessingQueue = false;

// Helper functions
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (data) {
    console[level](logMessage, data);
  } else {
    console[level](logMessage);
  }
}

// Error handling
class WebAdapterError extends Error {
  constructor(message, code = 500, details = {}) {
    super(message);
    this.name = 'WebAdapterError';
    this.code = code;
    this.details = details;
  }
  
  toJSON() {
    return {
      error: this.message,
      code: this.code,
      details: this.details,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined
    };
  }
}

// Find Chrome profile path
async function findChromeProfile() {
  for (const profile of CONFIG.CHROME_PROFILES) {
    try {
      await access(profile, fs.constants.R_OK);
      return profile;
    } catch (error) {
      // Continue to next profile
    }
  }
  
  throw new WebAdapterError(
    'Chrome profile not found. Please ensure Chrome is installed.'
  );
}

// Launch Chrome with the extension loaded
async function launchChrome() {
  try {
    const extensionPath = path.resolve(__dirname, 'extension');
    const profilePath = path.join(await findChromeProfile(), 'Default');
    
    // Create a new Chrome profile for the extension
    const tempProfile = path.join(os.tmpdir(), `agent-bus-chrome-${Date.now()}`);
    
    // Launch Chrome with the extension loaded
    const chromeArgs = [
      `--load-extension=${extensionPath}`,
      `--user-data-dir=${tempProfile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=9222',
      '--enable-logging',
      '--v=1',
      '--disable-extensions-except=' + extensionPath,
      '--whitelisted-extension-id=' + extensionPath,
      '--disable-popup-blocking',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--allow-running-insecure-content',
      '--disable-site-isolation-trials',
      '--metrics-recording-only',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--disable-default-apps',
      '--disable-device-discovery-notifications',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-breakpad',
      '--disable-cloud-import',
      '--disable-datasaver-prompt',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-ipc-flooding-protection',
      '--disable-notifications',
      '--disable-print-preview',
      '--disable-speech-api',
      '--disable-sync',
      '--disable-voice-input',
      '--disable-wake-on-wifi',
      '--enable-automation',
      '--no-default-browser-check',
      '--no-first-run',
      '--safebrowsing-disable-auto-update'
    ];
    
    // Platform-specific Chrome paths
    const chromePaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    
    // Find Chrome executable
    let chromePath = null;
    for (const p of chromePaths) {
      try {
        await access(p, fs.constants.X_OK);
        chromePath = p;
        break;
      } catch (error) {
        // Continue to next path
      }
    }
    
    if (!chromePath) {
      throw new WebAdapterError('Chrome not found. Please install Chrome.');
    }
    
    // Launch Chrome
    log('info', `Launching Chrome from ${chromePath}`);
    const chromeProcess = spawn(chromePath, chromeArgs, {
      detached: true,
      stdio: 'ignore'
    });
    
    chromeProcess.unref();
    
    // Clean up on exit
    process.on('exit', () => {
      try {
        process.kill(-chromeProcess.pid);
      } catch (error) {
        // Ignore
      }
    });
    
    return chromeProcess;
    
  } catch (error) {
    log('error', 'Failed to launch Chrome', error);
    throw error;
  }
}

// Connect to Chrome's debug port
async function connectToChromeDebugger() {
  try {
    // Get the list of available tabs
    const { stdout } = await execAsync('curl -s http://localhost:9222/json');
    const tabs = JSON.parse(stdout);
    
    // Find the tab with our extension
    const extensionTab = tabs.find(tab => 
      tab.url && tab.url.includes('chrome-extension://')
    );
    
    if (!extensionTab) {
      throw new WebAdapterError('Extension tab not found');
    }
    
    // Connect to the WebSocket
    const ws = new WebSocket(extensionTab.webSocketDebuggerUrl);
    
    return new Promise((resolve, reject) => {
      ws.on('open', () => {
        log('info', 'Connected to Chrome debugger');
        resolve(ws);
      });
      
      ws.on('error', (error) => {
        log('error', 'WebSocket error', error);
        reject(error);
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          log('debug', 'Received message from Chrome', message);
          
          // Handle the message
          handleChromeMessage(ws, message);
        } catch (error) {
          log('error', 'Error processing Chrome message', error);
        }
      });
    });
    
  } catch (error) {
    log('error', 'Failed to connect to Chrome debugger', error);
    throw error;
  }
}

// Handle messages from Chrome
function handleChromeMessage(ws, message) {
  // Process the message based on its type
  switch (message.method) {
    case 'Runtime.consoleAPICalled':
      handleConsoleMessage(message.params);
      break;
      
    case 'Runtime.exceptionThrown':
      handleException(message.params);
      break;
      
    case 'Page.javascriptDialogOpening':
      handleDialog(ws, message.params);
      break;
      
    // Add more message handlers as needed
  }
}

// Handle console messages from the page
function handleConsoleMessage(params) {
  const { type, args } = params;
  const messages = args.map(arg => arg.value).join(' ');
  
  switch (type) {
    case 'error':
      log('error', `[CONSOLE] ${messages}`);
      break;
      
    case 'warning':
      log('warn', `[CONSOLE] ${messages}`);
      break;
      
    case 'debug':
    case 'log':
    case 'info':
      log('info', `[CONSOLE] ${messages}`);
      break;
      
    default:
      log('debug', `[CONSOLE ${type}] ${messages}`);
  }
}

// Handle exceptions from the page
function handleException(params) {
  const { exceptionDetails } = params;
  const { text, exception, url, lineNumber, columnNumber } = exceptionDetails;
  
  log('error', 'Uncaught exception', {
    text,
    error: exception?.value,
    url,
    line: lineNumber,
    column: columnNumber,
    stack: exception?.description
  });
}

// Handle dialogs from the page
function handleDialog(ws, params) {
  const { message, type } = params;
  log('info', `Dialog ${type}: ${message}`);
  
  // Auto-dismiss dialogs
  ws.send(JSON.stringify({
    id: Date.now(),
    method: 'Page.handleJavaScriptDialog',
    params: { accept: false }
  }));
}

// Process the message queue
async function processQueue() {
  if (isProcessingQueue || messageQueue.length === 0) {
    return;
  }
  
  isProcessingQueue = true;
  
  try {
    while (messageQueue.length > 0) {
      const { message, resolve, reject } = messageQueue.shift();
      
      try {
        // Process the message
        const result = await processMessage(message);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

// Process a single message
async function processMessage(message) {
  const { action, params = {} } = message;
  
  switch (action) {
    case 'navigate':
      return navigateToUrl(params.url, params.options);
      
    case 'click':
      return clickElement(params.selector, params.options);
      
    case 'fill':
      return fillForm(params.selectors, params.values, params.options);
      
    case 'extract':
      return extractData(params.selectors, params.options);
      
    case 'evaluate':
      return evaluateScript(params.script, params.args, params.options);
      
    case 'screenshot':
      return takeScreenshot(params.selector, params.options);
      
    case 'wait':
      return wait(params.condition, params.timeout, params.options);
      
    default:
      throw new WebAdapterError(`Unknown action: ${action}`, 400);
  }
}

// Navigation
async function navigateToUrl(url, options = {}) {
  // Implementation for navigation
  log('info', `Navigating to ${url}`);
  
  // In a real implementation, this would send a message to the extension
  // to navigate to the specified URL
  
  return { success: true, url };
}

// Click an element
async function clickElement(selector, options = {}) {
  // Implementation for clicking an element
  log('info', `Clicking element: ${selector}`);
  
  // In a real implementation, this would send a message to the extension
  // to click the specified element
  
  return { success: true, selector };
}

// Fill a form
async function fillForm(selectors, values, options = {}) {
  // Implementation for filling a form
  log('info', 'Filling form', { selectors, values });
  
  // In a real implementation, this would send a message to the extension
  // to fill the specified form fields
  
  return { success: true, filled: Object.keys(selectors).length };
}

// Extract data from the page
async function extractData(selectors, options = {}) {
  // Implementation for extracting data
  log('info', 'Extracting data', { selectors });
  
  // In a real implementation, this would send a message to the extension
  // to extract the specified data
  
  // Return mock data for now
  const result = {};
  for (const [key, selector] of Object.entries(selectors)) {
    result[key] = `Data from ${selector}`;
  }
  
  return result;
}

// Evaluate a script in the page context
async function evaluateScript(script, args = [], options = {}) {
  // Implementation for evaluating a script
  log('info', 'Evaluating script', { script, args });
  
  // In a real implementation, this would send the script to the extension
  // to be evaluated in the page context
  
  // Return a mock result for now
  return { success: true, result: 'Script executed' };
}

// Take a screenshot
async function takeScreenshot(selector = null, options = {}) {
  // Implementation for taking a screenshot
  log('info', `Taking screenshot of ${selector || 'page'}`);
  
  // In a real implementation, this would send a message to the extension
  // to take a screenshot of the specified element or the entire page
  
  // Return a mock result for now
  return {
    success: true,
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 1024,
    height: 768
  };
}

// Wait for a condition
async function wait(condition, timeout = 30000, options = {}) {
  // Implementation for waiting
  log('info', `Waiting for condition: ${condition}`);
  
  // In a real implementation, this would wait for the specified condition
  // to be met or the timeout to be reached
  
  return { success: true, condition };
}

// Start the web adapter
async function start() {
  try {
    // Launch Chrome with the extension
    await launchChrome();
    
    // Connect to Chrome's debug port
    const ws = await connectToChromeDebugger();
    
    // Start the WebSocket server
    server = net.createServer((socket) => {
      log('info', 'New client connected');
      
      // Add the client to the set
      clients.add(socket);
      
      // Handle client messages
      let buffer = '';
      
      socket.on('data', (data) => {
        try {
          buffer += data.toString();
          
          // Check if we have a complete message
          let boundary = buffer.indexOf('\n');
          while (boundary !== -1) {
            const messageStr = buffer.substring(0, boundary).trim();
            buffer = buffer.substring(boundary + 1);
            
            if (messageStr) {
              try {
                const message = JSON.parse(messageStr);
                log('debug', 'Received message from client', message);
                
                // Add the message to the queue
                const promise = new Promise((resolve, reject) => {
                  messageQueue.push({ message, resolve, reject });
                });
                
                // Process the queue
                processQueue();
                
                // Send the response back to the client
                promise
                  .then((result) => {
                    const response = { success: true, ...result };
                    socket.write(JSON.stringify(response) + '\n');
                  })
                  .catch((error) => {
                    const response = { 
                      success: false, 
                      error: error.message,
                      code: error.code,
                      details: error.details
                    };
                    socket.write(JSON.stringify(response) + '\n');
                  });
                
              } catch (error) {
                log('error', 'Error processing message', error);
                socket.write(JSON.stringify({
                  success: false,
                  error: 'Invalid message format',
                  details: error.message
                }) + '\n');
              }
            }
            
            boundary = buffer.indexOf('\n');
          }
          
        } catch (error) {
          log('error', 'Error handling client data', error);
          socket.write(JSON.stringify({
            success: false,
            error: 'Internal server error',
            details: error.message
          }) + '\n');
        }
      });
      
      // Handle client disconnection
      socket.on('end', () => {
        log('info', 'Client disconnected');
        clients.delete(socket);
      });
      
      // Handle errors
      socket.on('error', (error) => {
        log('error', 'Socket error', error);
        clients.delete(socket);
      });
    });
    
    // Start the server on a random port
    server.listen(CONFIG.PORT, CONFIG.HOST, () => {
      const { port } = server.address();
      log('info', `Web adapter listening on ${CONFIG.HOST}:${port}`);
      
      // Write the port to a file so the broker knows how to connect
      writeFile(path.join(__dirname, 'port'), port.toString(), 'utf8')
        .catch(error => log('error', 'Failed to write port file', error));
    });
    
    // Handle server errors
    server.on('error', (error) => {
      log('error', 'Server error', error);
      process.exit(1);
    });
    
    // Handle process termination
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    log('error', 'Failed to start web adapter', error);
    process.exit(1);
  }
}

// Shutdown the web adapter
async function shutdown() {
  log('info', 'Shutting down web adapter...');
  
  // Close all client connections
  for (const client of clients) {
    try {
      client.end();
    } catch (error) {
      // Ignore
    }
  }
  
  // Close the server
  if (server) {
    server.close();
  }
  
  // Remove the port file
  try {
    await unlink(path.join(__dirname, 'port'));
  } catch (error) {
    // Ignore
  }
  
  log('info', 'Web adapter shut down');
  process.exit(0);
}

// Main function
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Bus Web Adapter

Usage:
  node cli.js [options]

Options:
  --help, -h    Show this help message
  --version, -v Show version information
  --port PORT   Specify the port to listen on (default: random)
    `);
    process.exit(0);
  }
  
  if (args.includes('--version') || args.includes('-v')) {
    console.log('Agent Bus Web Adapter v1.0.0');
    process.exit(0);
  }
  
  // Parse port if specified
  const portIndex = args.indexOf('--port');
  if (portIndex !== -1 && args.length > portIndex + 1) {
    CONFIG.PORT = parseInt(args[portIndex + 1], 10);
  }
  
  // Start the web adapter
  await start();
}

// Run the main function
main().catch((error) => {
  log('error', 'Unhandled error', error);
  process.exit(1);
});
