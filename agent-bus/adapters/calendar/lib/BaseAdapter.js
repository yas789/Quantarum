const Response = require('./Response');

/**
 * Base class for calendar adapter operations
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
    return verb?.startsWith('calendar.') ? verb : `calendar.${verb}`;
  }
  
  getVerbHandler(verbId) {
    // To be implemented by concrete adapters
    return null;
  }
  
  handleError(error) {
    const details = process.env.NODE_ENV === 'development' 
      ? { message: error.message, stack: error.stack }
      : undefined;
      
    if (error.message.includes('session')) {
      Response.error(20, 'SESSION_ERROR', details);
    } else if (error.message.includes('authentication')) {
      Response.error(21, 'AUTHENTICATION_FAILED', details);
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