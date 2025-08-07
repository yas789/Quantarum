#!/usr/bin/env node
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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

// Run AppleScript
const runAppleScript = async (script) => {
  try {
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);
    if (stderr) {
      console.error('AppleScript error:', stderr);
    }
    return stdout.trim();
  } catch (error) {
    throw new Error(`AppleScript execution failed: ${error.message}`);
  }
};

// Get the bundle identifier for an app
const getAppBundleId = async (appName) => {
  try {
    // Try to get the bundle ID using mdfind
    const { stdout } = await execAsync(`mdfind "kMDItemDisplayName == '${appName}.app'" -onlyin /Applications`);
    const appPath = stdout.trim().split('\n')[0];
    
    if (!appPath) {
      throw new Error(`Application '${appName}' not found in /Applications`);
    }
    
    // Get bundle ID from the app's Info.plist
    const { stdout: bundleId } = await execAsync(
      `defaults read "${appPath}/Contents/Info" CFBundleIdentifier`
    );
    
    return bundleId.trim();
  } catch (error) {
    // Fallback to common bundle IDs
    const commonApps = {
      'safari': 'com.apple.Safari',
      'chrome': 'com.google.Chrome',
      'firefox': 'org.mozilla.firefox',
      'vscode': 'com.microsoft.VSCode',
      'xcode': 'com.apple.dt.Xcode',
      'mail': 'com.apple.mail',
      'messages': 'com.apple.MobileSMS',
      'facetime': 'com.apple.FaceTime',
      'photos': 'com.apple.Photos',
      'music': 'com.apple.Music',
      'tv': 'com.apple.TV',
      'podcasts': 'com.apple.podcasts',
      'app store': 'com.apple.AppStore',
      'system preferences': 'com.apple.systempreferences',
      'terminal': 'com.apple.Terminal',
      'calculator': 'com.apple.calculator',
      'calendar': 'com.apple.iCal',
      'reminders': 'com.apple.reminders',
      'notes': 'com.apple.Notes',
      'contacts': 'com.apple.AddressBook',
      'maps': 'com.apple.Maps',
      'find my': 'com.apple.findmy'
    };
    
    const normalizedAppName = appName.toLowerCase();
    if (commonApps[normalizedAppName]) {
      return commonApps[normalizedAppName];
    }
    
    throw new Error(`Could not determine bundle ID for '${appName}'. Please provide the full application name (e.g., 'Safari', 'Google Chrome').`);
  }
};

// Main handler
(async () => {
  try {
    switch (verb) {
      case 'app.open':
        requireArgs(args, ['name']);
        
        // Build the open command
        let openCmd = 'open';
        const openArgs = [];
        
        // Add -a flag for application name
        openArgs.push('-a', `"${args.name}"`);
        
        // Add any additional arguments
        if (args.args && args.args.length > 0) {
          openArgs.push('--args', ...args.args.map(arg => `"${arg}"`));
        }
        
        // Execute the open command
        const { stdout, stderr } = await execAsync(`${openCmd} ${openArgs.join(' ')}`);
        
        if (stderr) {
          console.error('Warning:', stderr);
        }
        
        // Get the process ID of the opened app
        const appName = args.name.endsWith('.app') ? args.name : `${args.name}.app`;
        const { stdout: pgrepOut } = await execAsync(`pgrep -f "${appName}"`);
        const pid = pgrepOut.trim().split('\n')[0];
        
        return ok({
          name: args.name,
          pid: pid ? parseInt(pid, 10) : null,
          message: `Opened ${args.name} successfully`
        });

      case 'app.focus':
        requireArgs(args, ['name']);
        
        try {
          // First try to get the bundle ID
          const bundleId = await getAppBundleId(args.name);
          
          // AppleScript to activate the app by bundle ID
          const script = `
            tell application "System Events"
              set appProcess to first application process whose bundle identifier is "${bundleId}"
              set frontmost of appProcess to true
            end tell
            return "Focused ${args.name} (${bundleId})"
          `;
          
          const result = await runAppleScript(script);
          return ok({
            success: true,
            bundleId,
            message: result
          });
          
        } catch (error) {
          // Fallback to using the app name directly
          try {
            const script = `
              tell application "System Events"
                set appProcess to first application process whose name is "${args.name}"
                set frontmost of appProcess to true
              end tell
              return "Focused ${args.name}"
            `;
            
            const result = await runAppleScript(script);
            return ok({
              success: true,
              message: result
            });
            
          } catch (fallbackError) {
            throw new Error(`Could not focus '${args.name}': ${fallbackError.message}`);
          }
        }

      default:
        return fail(10, 'UNKNOWN_VERB');
    }
  } catch (error) {
    // Handle common errors
    if (error.code === 'ENOENT') {
      return fail(44, 'APP_NOT_FOUND', { app: args.name });
    }
    if (error.code === 'EACCES') {
      return fail(13, 'PERMISSION_DENIED', { 
        message: 'Permission denied when trying to access the application',
        details: error.message 
      });
    }
    
    // For other errors, include the error details in development
    const details = process.env.NODE_ENV === 'development' 
      ? { message: error.message, stack: error.stack }
      : undefined;
      
    return fail(50, 'ADAPTER_ERROR', details);
  }
})();
