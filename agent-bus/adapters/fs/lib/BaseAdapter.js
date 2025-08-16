const Response = require('./Response');
const Validator = require('./Validator');

/**
 * Base class for file system adapter operations
 */
class BaseAdapter {
  constructor(payload) {
    this.verb = payload.verb;
    this.args = payload.args || {};
  }
  
  async execute() {
    try {
      if (!this.verb) {
        Response.error(10, 'NO_VERB_PROVIDED');
      }
      
      const verbId = this.normalizeVerb(this.verb);
      const handler = this.getVerbHandler(verbId);
      
      if (!handler) {
        Response.error(10, 'UNKNOWN_VERB', { verb: verbId });
      }
      
      const result = await handler.call(this);
      Response.success(result);
      
    } catch (error) {
      this.handleError(error);
    }
  }
  
  normalizeVerb(verb) {
    return verb?.startsWith('fs.') ? verb : `fs.${verb}`;
  }
  
  getVerbHandler(verbId) {
    // To be implemented by concrete adapters
    return null;
  }
  
  handleError(error) {
    const details = process.env.NODE_ENV === 'development' 
      ? { message: error.message, stack: error.stack }
      : undefined;
      
    if (error.code === 'ENOENT') {
      Response.error(20, 'FILE_NOT_FOUND', { path: error.path });
    } else if (error.code === 'EACCES') {
      Response.error(21, 'PERMISSION_DENIED', { path: error.path });
    } else {
      Response.error(30, 'OPERATION_FAILED', details);
    }
  }
  
  logDebug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }
}

module.exports = BaseAdapter;