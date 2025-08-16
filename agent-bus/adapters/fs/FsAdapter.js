const BaseAdapter = require('./lib/BaseAdapter');
const BasicOperations = require('./handlers/BasicOperations');
const IntelligenceOperations = require('./handlers/IntelligenceOperations');

/**
 * File System Adapter with intelligent operations
 */
class FsAdapter extends BaseAdapter {
  getVerbHandler(verbId) {
    const handlers = {
      // Basic file operations
      'fs.read': () => BasicOperations.read(this.args),
      'fs.write': () => BasicOperations.write(this.args),
      'fs.mkdir': () => BasicOperations.mkdir(this.args),
      'fs.move': () => BasicOperations.move(this.args),
      'fs.copy': () => BasicOperations.copy(this.args),
      'fs.delete': () => BasicOperations.delete(this.args),
      
      // Intelligent operations
      'fs.search': () => IntelligenceOperations.search(this.args),
      'fs.searchContent': () => IntelligenceOperations.searchContent(this.args),
      'fs.analyze': () => IntelligenceOperations.analyze(this.args),
      'fs.organize': () => IntelligenceOperations.organize(this.args),
      'fs.findDuplicates': () => IntelligenceOperations.findDuplicates(this.args),
      'fs.duplicates': () => IntelligenceOperations.findDuplicates(this.args),
      'fs.stats': () => IntelligenceOperations.analyze(this.args)
    };
    
    return handlers[verbId];
  }
}

module.exports = FsAdapter;