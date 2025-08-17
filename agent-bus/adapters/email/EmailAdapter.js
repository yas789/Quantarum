const BaseAdapter = require('./lib/BaseAdapter');
const EmailOperations = require('./handlers/EmailOperations');

/**
 * Email Adapter with zero-config cross-platform support
 */
class EmailAdapter extends BaseAdapter {
  getVerbHandler(verbId) {
    const handlers = {
      // Setup and authentication
      'email.setup': () => EmailOperations.setup(this.args),
      'email.auth': () => EmailOperations.setup(this.args),
      
      // Email operations
      'email.send': () => EmailOperations.send(this.args),
      'email.search': () => EmailOperations.search(this.args),
      'email.list': () => EmailOperations.list(this.args),
      
      // Session management
      'email.sessions': () => EmailOperations.sessions(this.args)
    };
    
    return handlers[verbId];
  }
}

module.exports = EmailAdapter;