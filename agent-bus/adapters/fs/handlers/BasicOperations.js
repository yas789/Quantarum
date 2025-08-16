const fs = require('fs').promises;
const path = require('path');
const Validator = require('../lib/Validator');

/**
 * Handler for basic file system operations
 */
class BasicOperations {
  static async read(args) {
    Validator.requireArgs(args, ['path']);
    Validator.validatePath(args.path);
    Validator.validateEncoding(args.encoding);
    
    const content = await fs.readFile(args.path, args.encoding || 'utf8');
    return { content };
  }
  
  static async write(args) {
    Validator.requireArgs(args, ['path', 'content']);
    Validator.validatePath(args.path);
    Validator.validateEncoding(args.encoding);
    
    await fs.mkdir(path.dirname(args.path), { recursive: true });
    const buffer = Buffer.from(args.content, args.encoding || 'utf8');
    await fs.writeFile(args.path, buffer);
    
    return { 
      path: args.path,
      bytesWritten: buffer.length 
    };
  }
  
  static async mkdir(args) {
    Validator.requireArgs(args, ['path']);
    Validator.validatePath(args.path);
    
    const mode = args.mode ? parseInt(args.mode, 8) : 0o755;
    await fs.mkdir(args.path, { recursive: true, mode });
    
    return { path: args.path };
  }
  
  static async move(args) {
    Validator.requireArgs(args, ['source', 'destination']);
    Validator.validatePath(args.source);
    Validator.validatePath(args.destination);
    
    await fs.mkdir(path.dirname(args.destination), { recursive: true });
    await fs.rename(args.source, args.destination);
    
    return {
      source: args.source,
      destination: args.destination
    };
  }
  
  static async copy(args) {
    Validator.requireArgs(args, ['source', 'destination']);
    Validator.validatePath(args.source);
    Validator.validatePath(args.destination);
    
    await fs.mkdir(path.dirname(args.destination), { recursive: true });
    await fs.copyFile(args.source, args.destination);
    
    return {
      source: args.source,
      destination: args.destination
    };
  }
  
  static async delete(args) {
    Validator.requireArgs(args, ['path']);
    Validator.validatePath(args.path);
    
    const stats = await fs.stat(args.path);
    if (stats.isDirectory()) {
      await fs.rmdir(args.path, { recursive: true });
    } else {
      await fs.unlink(args.path);
    }
    
    return { 
      path: args.path,
      type: stats.isDirectory() ? 'directory' : 'file'
    };
  }
}

module.exports = BasicOperations;