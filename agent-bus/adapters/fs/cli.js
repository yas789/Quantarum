#!/usr/bin/env node

/**
 * File System Adapter - Clean, Modular Implementation
 * 
 * Provides intelligent file system operations with zero-config setup.
 * 
 * @author Quantarum Agent Bus
 * @version 2.0.0
 */

'use strict';

const FsAdapter = require('./FsAdapter');

/**
 * Application entry point
 */
async function main() {
  try {
    const payload = JSON.parse(process.argv[2] || '{}');
    
    if (!payload.verb) {
      const Response = require('./lib/Response');
      Response.error(10, 'MISSING_VERB', { 
        message: 'No verb provided in payload' 
      });
    }
    
    const adapter = new FsAdapter(payload);
    await adapter.execute();
    
  } catch (error) {
    const Response = require('./lib/Response');
    
    if (error instanceof SyntaxError) {
      Response.error(10, 'INVALID_PAYLOAD', { 
        message: 'Invalid JSON payload provided' 
      });
    }
    
    Response.error(50, 'UNEXPECTED_ERROR', { 
      message: error.message 
    });
  }
}

// Execute if this file is run directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { FsAdapter };