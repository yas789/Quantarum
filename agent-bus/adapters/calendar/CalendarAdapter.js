const BaseAdapter = require('./lib/BaseAdapter');
const CalendarOperations = require('./handlers/CalendarOperations');

/**
 * Calendar Adapter with zero-config cross-platform support
 */
class CalendarAdapter extends BaseAdapter {
  getVerbHandler(verbId) {
    const handlers = {
      // Setup and authentication
      'calendar.setup': () => CalendarOperations.setup(this.args),
      'calendar.auth': () => CalendarOperations.setup(this.args),
      
      // Calendar operations
      'calendar.create': () => CalendarOperations.create(this.args),
      'calendar.list': () => CalendarOperations.list(this.args),
      'calendar.search': () => CalendarOperations.search(this.args)
    };
    
    return handlers[verbId];
  }
}

module.exports = CalendarAdapter;