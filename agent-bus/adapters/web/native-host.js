#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');

// Configuration
const CONFIG = {
  HOST_NAME: 'com.agentbus.webautomation',
  NATIVE_HOST_PATH: path.join(__dirname, 'native-host.js'),
  LOG_FILE: path.join(process.cwd(), 'web-automation.log'),
  DEBUG: process.env.NODE_ENV !== 'production'
};

// Set up logging
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  
  // Log to console in debug mode
  if (CONFIG.DEBUG) {
    console.log(logMessage);
  }
  
  // Log to file
  fs.appendFileSync(CONFIG.LOG_FILE, logMessage, 'utf8');
}

// Handle errors
function handleError(error, message = 'An error occurred') {
  log(`${message}:`, { error: error.message, stack: error.stack });
  process.exit(1);
}

// Install the native messaging host
function installNativeHost() {
  try {
    const manifest = {
      name: CONFIG.HOST_NAME,
      description: 'Agent Bus Web Automation Native Host',
      path: CONFIG.NATIVE_HOST_PATH,
      type: 'stdio',
      allowed_origins: [
        'chrome-extension://*/',  // Will be replaced with actual extension ID
        'chrome-extension://'     // Fallback for development
      ]
    };
    
    // Determine the manifest location based on the OS
    let manifestPath;
    let installCmd;
    
    switch (process.platform) {
      case 'win32':
        manifestPath = path.join(
          process.env.APPDATA,
          '..',
          'Local',
          'Google',
          'Chrome',
          'NativeMessagingHosts',
          `${CONFIG.HOST_NAME}.json`
        );
        break;
        
      case 'darwin': // macOS
        manifestPath = path.join(
          process.env.HOME,
          'Library',
          'Application Support',
          'Google',
          'Chrome',
          'NativeMessagingHosts',
          `${CONFIG.HOST_NAME}.json`
        );
        break;
        
      case 'linux':
        manifestPath = path.join(
          process.env.HOME,
          '.config',
          'google-chrome',
          'NativeMessagingHosts',
          `${CONFIG.HOST_NAME}.json`
        );
        break;
        
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
    
    // Create the directory if it doesn't exist
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write the manifest file
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    
    // Make the script executable
    if (process.platform !== 'win32') {
      fs.chmodSync(CONFIG.NATIVE_HOST_PATH, '755');
    }
    
    log('Native messaging host installed successfully', { manifestPath });
    return true;
    
  } catch (error) {
    handleError(error, 'Failed to install native messaging host');
    return false;
  }
}

// Uninstall the native messaging host
function uninstallNativeHost() {
  try {
    let manifestPath;
    
    switch (process.platform) {
      case 'win32':
        manifestPath = path.join(
          process.env.APPDATA,
          '..',
          'Local',
          'Google',
          'Chrome',
          'NativeMessagingHosts',
          `${CONFIG.HOST_NAME}.json`
        );
        break;
        
      case 'darwin':
        manifestPath = path.join(
          process.env.HOME,
          'Library',
          'Application Support',
          'Google',
          'Chrome',
          'NativeMessagingHosts',
          `${CONFIG.HOST_NAME}.json`
        );
        break;
        
      case 'linux':
        manifestPath = path.join(
          process.env.HOME,
          '.config',
          'google-chrome',
          'NativeMessagingHosts',
          `${CONFIG.HOST_NAME}.json`
        );
        break;
        
      default:
        throw new Error(`Unsupported platform: ${process.platform}`);
    }
    
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
      log('Native messaging host uninstalled successfully', { manifestPath });
    } else {
      log('Native messaging host not found', { manifestPath });
    }
    
    return true;
    
  } catch (error) {
    handleError(error, 'Failed to uninstall native messaging host');
    return false;
  }
}

// Handle messages from the browser extension
function handleMessage(message) {
  return new Promise((resolve) => {
    try {
      const { action, tabId, requestId } = message;
      const response = { requestId };
      
      log('Received message from extension', { action, tabId });
      
      // Process the message based on the action
      switch (action) {
        case 'PING':
          response.status = 'pong';
          break;
          
        case 'EXECUTE_SCRIPT':
          // Forward to the appropriate handler
          handleExecuteScript(message)
            .then(result => {
              response.result = result;
              response.success = true;
              resolve(response);
            })
            .catch(error => {
              response.error = error.message;
              response.success = false;
              resolve(response);
            });
          return; // Return early since we're handling the response asynchronously
          
        default:
          response.error = `Unknown action: ${action}`;
          response.success = false;
      }
      
      resolve(response);
      
    } catch (error) {
      log('Error handling message:', error);
      resolve({
        requestId: message.requestId,
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  });
}

// Handle script execution requests
async function handleExecuteScript(message) {
  const { script, args = [], options = {} } = message;
  
  // Validate the script
  if (typeof script !== 'string' || !script.trim()) {
    throw new Error('Invalid script provided');
  }
  
  // Execute the script in a separate process for safety
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'scripts', `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.js`);
    
    try {
      // Write the script to a temporary file
      const wrappedScript = `
        // Wrap in an async IIFE to handle async/await
        (async () => {
          try {
            const args = ${JSON.stringify(args)};
            const result = await (${script})(...args);
            process.send({ success: true, result });
          } catch (error) {
            process.send({ 
              success: false, 
              error: error.message,
              stack: error.stack 
            });
          }
        })();
      `;
      
      fs.writeFileSync(scriptPath, wrappedScript, 'utf8');
      
      // Execute the script in a child process
      const child = exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        // Clean up the temporary file
        try {
          if (fs.existsSync(scriptPath)) {
            fs.unlinkSync(scriptPath);
          }
        } catch (cleanupError) {
          log('Error cleaning up temporary script:', cleanupError);
        }
        
        if (error) {
          reject(new Error(`Script execution failed: ${error.message}`));
          return;
        }
        
        if (stderr) {
          log('Script stderr:', stderr);
        }
        
        if (stdout) {
          try {
            const result = JSON.parse(stdout);
            if (result.success === false) {
              const error = new Error(result.error || 'Script execution failed');
              error.stack = result.stack;
              reject(error);
            } else {
              resolve(result.result);
            }
          } catch (parseError) {
            resolve(stdout);
          }
        }
      });
      
      // Handle process messages (for async scripts)
      if (child.send) {
        child.on('message', (message) => {
          if (message.success === false) {
            const error = new Error(message.error || 'Script execution failed');
            error.stack = message.stack;
            reject(error);
          } else {
            resolve(message.result);
          }
        });
      }
      
      // Set a timeout for script execution
      if (options.timeout) {
        setTimeout(() => {
          if (!child.killed) {
            child.kill();
            reject(new Error(`Script execution timed out after ${options.timeout}ms`));
          }
        }, options.timeout);
      }
      
    } catch (error) {
      // Clean up the temporary file if it exists
      if (scriptPath && fs.existsSync(scriptPath)) {
        try {
          fs.unlinkSync(scriptPath);
        } catch (cleanupError) {
          log('Error cleaning up temporary script:', cleanupError);
        }
      }
      
      reject(error);
    }
  });
}

// Main function
async function main() {
  // Handle command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--install')) {
    // Install the native messaging host
    const success = installNativeHost();
    process.exit(success ? 0 : 1);
    
  } else if (args.includes('--uninstall')) {
    // Uninstall the native messaging host
    const success = uninstallNativeHost();
    process.exit(success ? 0 : 1);
    
  } else if (args.includes('--version')) {
    // Show version
    console.log('Agent Bus Web Automation Native Host v1.0.0');
    process.exit(0);
    
  } else if (args.includes('--help')) {
    // Show help
    console.log(`
Agent Bus Web Automation Native Host

Usage:
  node native-host.js [options]

Options:
  --install      Install the native messaging host
  --uninstall    Uninstall the native messaging host
  --version      Show version information
  --help         Show this help message
    `);
    process.exit(0);
    
  } else {
    // Run in native messaging mode
    log('Starting native messaging host...');
    
    // Set up message handling
    process.stdin.on('data', async (data) => {
      try {
        // Parse the incoming message
        const message = JSON.parse(data.toString());
        
        // Handle the message and send a response
        const response = await handleMessage(message);
        
        // Send the response back to the extension
        const responseData = JSON.stringify(response) + '\n';
        process.stdout.write(responseData, 'utf8');
        
      } catch (error) {
        log('Error processing message:', error);
        
        // Send an error response
        const errorResponse = {
          requestId: null,
          success: false,
          error: error.message,
          stack: CONFIG.DEBUG ? error.stack : undefined
        };
        
        process.stdout.write(JSON.stringify(errorResponse) + '\n', 'utf8');
      }
    });
    
    // Handle process termination
    process.on('SIGTERM', () => {
      log('Received SIGTERM, shutting down...');
      process.exit(0);
    });
    
    process.on('SIGINT', () => {
      log('Received SIGINT, shutting down...');
      process.exit(0);
    });
    
    // Log startup
    log('Native messaging host ready');
  }
}

// Run the main function
main().catch(handleError);
