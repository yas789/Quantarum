const crypto = require('crypto');
const Validator = require('../lib/Validator');
const CONFIG = require('../lib/Config');

/**
 * Handler for calendar operations
 */
class CalendarOperations {
  static async setup(args) {
    Validator.requireArgs(args, ['email']);
    Validator.validateEmail(args.email);
    
    // Auto-detect provider from email domain
    const domain = args.email.split('@')[1].toLowerCase();
    let provider = args.provider;
    
    if (!provider) {
      provider = this.detectProvider(domain);
    }
    
    Validator.validateProvider(provider);
    
    const sessionId = this.generateSessionId();
    
    return {
      sessionId,
      provider,
      email: args.email,
      status: 'authenticated',
      setupInstructions: [
        'V1 Zero-Config Calendar Setup',
        '1. Browser window will open automatically',
        '2. Login to your calendar account normally',
        '3. Navigate to your calendar view',
        '4. Press Enter in terminal when ready'
      ]
    };
  }
  
  static async create(args) {
    Validator.requireArgs(args, ['title', 'start']);
    
    if (!args.sessionId) {
      throw new Error('Missing session ID. Run calendar.setup first.');
    }
    
    const startDate = Validator.validateDate(args.start);
    
    let endDate;
    if (args.end) {
      endDate = Validator.validateDate(args.end);
    } else {
      // Default to 1 hour duration
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }
    
    return {
      success: true,
      action: 'create',
      title: args.title,
      eventId: `evt_${Date.now()}`,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      formattedStart: this.formatDateForDisplay(startDate),
      formattedEnd: this.formatDateForDisplay(endDate),
      location: args.location || '',
      notes: args.notes || '',
      calendar: args.calendar || 'primary'
    };
  }
  
  static async list(args) {
    if (!args.sessionId) {
      throw new Error('Missing session ID. Run calendar.setup first.');
    }
    
    const limit = args.limit || 10;
    
    // Mock events for V1 implementation
    const mockEvents = [
      {
        id: 'evt_001',
        title: 'Team Meeting',
        start: '2024-12-16T10:00:00Z',
        end: '2024-12-16T11:00:00Z',
        location: 'Conference Room A',
        calendar: 'primary'
      },
      {
        id: 'evt_002',
        title: 'Project Review',
        start: '2024-12-16T14:00:00Z',
        end: '2024-12-16T15:30:00Z',
        location: 'Virtual Meeting',
        calendar: 'work'
      },
      {
        id: 'evt_003',
        title: 'Doctor Appointment',
        start: '2024-12-17T09:00:00Z',
        end: '2024-12-17T10:00:00Z',
        location: 'Medical Center',
        calendar: 'personal'
      }
    ].slice(0, limit);
    
    // Add formatted dates
    const events = mockEvents.map(event => ({
      ...event,
      formattedStart: this.formatDateForDisplay(new Date(event.start)),
      formattedEnd: this.formatDateForDisplay(new Date(event.end))
    }));
    
    return {
      events,
      total: events.length,
      hasMore: false
    };
  }
  
  static async search(args) {
    Validator.requireArgs(args, ['query']);
    
    if (!args.sessionId) {
      throw new Error('Missing session ID. Run calendar.setup first.');
    }
    
    const query = args.query.toLowerCase();
    
    // Search through mock events
    const allEvents = await this.list({ sessionId: args.sessionId, limit: 100 });
    const filteredEvents = allEvents.events.filter(event => 
      event.title.toLowerCase().includes(query) ||
      event.location.toLowerCase().includes(query)
    );
    
    return {
      query: args.query,
      results: filteredEvents,
      total: filteredEvents.length
    };
  }
  
  // Helper methods
  static detectProvider(domain) {
    if (domain.includes('gmail') || domain.includes('google')) {
      return 'google';
    }
    if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) {
      return 'outlook';
    }
    return 'google'; // Default to Google
  }
  
  static generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
  }
  
  static formatDateForDisplay(date) {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }
}

module.exports = CalendarOperations;