#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const glob = promisify(require('glob'));

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
      case 'fs.read':
        requireArgs(args, ['path']);
        const content = await fs.readFile(args.path, args.encoding || 'utf8');
        return ok({ content });

      case 'fs.write':
        requireArgs(args, ['path', 'content']);
        await fs.mkdir(path.dirname(args.path), { recursive: true });
        const buffer = Buffer.from(args.content, args.encoding || 'utf8');
        await fs.writeFile(args.path, buffer);
        return ok({ 
          path: args.path,
          bytesWritten: buffer.length 
        });

      case 'fs.mkdir':
        requireArgs(args, ['path']);
        const mode = args.mode ? parseInt(args.mode, 8) : 0o755;
        await fs.mkdir(args.path, { recursive: true, mode });
        return ok({ path: args.path });

      case 'fs.move':
        requireArgs(args, ['source', 'destination']);
        await fs.mkdir(path.dirname(args.destination), { recursive: true });
        await fs.rename(args.source, args.destination);
        return ok({
          source: args.source,
          destination: args.destination
        });

      case 'fs.search':
        requireArgs(args, ['dir', 'pattern']);
        
        // Build glob pattern
        const globPattern = args.recursive !== false 
          ? `${args.dir}/**/${args.pattern}`
          : `${args.dir}/${args.pattern}`;
        
        // Find files matching the pattern
        const files = await glob(globPattern, { 
          nodir: true,
          dot: true,
          absolute: true,
          matchBase: false,
          silent: true,
          ignore: ['**/node_modules/**'],
          ...(args.limit && { limit: args.limit })
        });

        // Get file stats for each match
        const results = await Promise.all(
          files.map(async (filePath) => {
            const stats = await fs.stat(filePath);
            return {
              path: filePath,
              name: path.basename(filePath),
              size: stats.size,
              mtime: stats.mtime.toISOString(),
              isDirectory: stats.isDirectory(),
              isFile: stats.isFile()
            };
          })
        );

        // Sort results
        const sortKey = args.sort || 'name';
        results.sort((a, b) => {
          if (a[sortKey] < b[sortKey]) return -1;
          if (a[sortKey] > b[sortKey]) return 1;
          return 0;
        });

        // Apply limit after sorting
        const limitedResults = args.limit 
          ? results.slice(0, args.limit)
          : results;

        return ok({ results: limitedResults });

      default:
        return fail(10, 'UNKNOWN_VERB');
    }
  } catch (error) {
    // Handle common filesystem errors
    if (error.code === 'ENOENT') {
      return fail(44, 'FILE_NOT_FOUND', { path: error.path });
    }
    if (error.code === 'EACCES') {
      return fail(13, 'PERMISSION_DENIED', { path: error.path });
    }
    if (error.code === 'EEXIST') {
      return fail(17, 'FILE_EXISTS', { path: error.path });
    }
    
    // For other errors, include the error details in development
    const details = process.env.NODE_ENV === 'development' 
      ? { message: error.message, stack: error.stack }
      : undefined;
      
    return fail(50, 'ADAPTER_ERROR', details);
  }
})();
