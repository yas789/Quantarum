#!/usr/bin/env node
const clipboardy = require('clipboardy');

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

// Main handler
(async () => {
  try {
    switch (verb) {
      case 'clipboard.get':
        try {
          const content = await clipboardy.read();
          return ok({
            content,
            type: 'text',
            length: content.length
          });
        } catch (error) {
          // If clipboard is empty, return empty string instead of failing
          if (error.message.includes('Couldn\'t find the required `xsel` binary')) {
            return ok({
              content: '',
              type: 'text',
              length: 0
            });
          }
          throw error;
        }

      case 'clipboard.set':
        requireArgs(args, ['content']);
        
        // Validate content type if provided
        const contentType = args.type || 'text';
        if (contentType !== 'text') {
          return fail(15, 'UNSUPPORTED_CONTENT_TYPE', {
            type: contentType,
            supported: ['text']
          });
        }
        
        // Write to clipboard
        await clipboardy.write(String(args.content));
        
        return ok({
          success: true,
          length: String(args.content).length,
          type: 'text'
        });

      default:
        return fail(10, 'UNKNOWN_VERB');
    }
  } catch (error) {
    // Handle common clipboard errors
    if (error.message.includes('Couldn\'t find the required `xsel` binary')) {
      return fail(60, 'MISSING_DEPENDENCY', {
        message: 'Clipboard functionality requires xsel (X11) or pbcopy (macOS)',
        details: 'On Linux, install xsel with: sudo apt-get install xsel',
        error: error.message
      });
    }
    
    // For other errors, include the error details in development
    const details = process.env.NODE_ENV === 'development' 
      ? { message: error.message, stack: error.stack }
      : undefined;
      
    return fail(50, 'ADAPTER_ERROR', details);
  }
})();
