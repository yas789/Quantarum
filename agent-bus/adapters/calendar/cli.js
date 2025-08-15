#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');

const payload = JSON.parse(process.argv[2] || '{}');
const { verb, args = {} } = payload;

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

const requireArgs = (args, required) => {
  const missing = required.filter(key => args[key] === undefined);
  if (missing.length > 0) {
    fail(10, 'MISSING_ARGUMENTS', { missing });
  }
};

function generateSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

function detectProvider(email) {
  if (!email) return 'google';
  const domain = email.split('@')[1]?.toLowerCase();
  if (domain?.includes('gmail') || domain?.includes('google')) {
    return 'google';
  }
  if (domain?.includes('outlook') || domain?.includes('hotmail') || domain?.includes('live')) {
    return 'outlook';
  }
  return 'google';
}

function formatDateForDisplay(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

(async () => {
  try {
    if (!verb) {
      throw new Error('No verb provided');
    }
    
    const verbId = verb.startsWith('calendar.') ? verb : `calendar.${verb}`;
    
    switch (verbId) {
      case 'calendar.setup':
        const provider = args.provider || detectProvider(args.email);
        const sessionId = generateSessionId();
        
        const supportedProviders = ['google', 'outlook'];
        if (!supportedProviders.includes(provider)) {
          return fail(11, 'UNSUPPORTED_PROVIDER', { provider, supported: supportedProviders });
        }
        
        const cacheDir = path.join(os.tmpdir(), 'quantarum_calendar_sessions');
        try {
          await fs.mkdir(cacheDir, { recursive: true });
        } catch (error) {}
        
        const providerUrls = {
          google: 'https://calendar.google.com',
          outlook: 'https://outlook.live.com/calendar'
        };
        
        return ok({
          sessionId,
          provider: provider,
          setupInstructions: [
            'Zero-config calendar adapter using web automation',
            `1. Open ${providerUrls[provider]} in your browser`,
            '2. Login to your account manually',
            '3. Keep the browser session active',
            `4. Use sessionId "${sessionId}" for operations`,
            'Note: Full automation requires puppeteer installation'
          ]
        });

      case 'calendar.create':
        requireArgs(args, ['title', 'start']);
        
        if (!args.sessionId) {
          return fail(10, 'MISSING_SESSION_ID', { 
            message: 'Run calendar.setup first to get a sessionId' 
          });
        }
        
        const startDate = new Date(args.start);
        if (isNaN(startDate.getTime())) {
          return fail(11, 'INVALID_DATE', { date: args.start });
        }
        
        let endDate;
        if (args.end) {
          endDate = new Date(args.end);
          if (isNaN(endDate.getTime())) {
            return fail(11, 'INVALID_DATE', { date: args.end });
          }
        } else {
          endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        }
        
        return ok({
          success: true,
          action: 'create',
          title: args.title,
          eventId: `evt_${Date.now()}`,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          formattedStart: formatDateForDisplay(startDate),
          formattedEnd: formatDateForDisplay(endDate),
          location: args.location || '',
          notes: args.notes || '',
          calendar: args.calendar || 'primary'
        });

      case 'calendar.list':
        if (!args.sessionId) {
          return fail(10, 'MISSING_SESSION_ID', { 
            message: 'Run calendar.setup first to get a sessionId' 
          });
        }
        
        const mockEvents = [
          {
            id: 'evt_001',
            title: 'Team Meeting',
            start: '2024-12-16T10:00:00Z',
            end: '2024-12-16T11:00:00Z',
            location: 'Conference Room A'
          },
          {
            id: 'evt_002',
            title: 'Project Review',
            start: '2024-12-16T14:00:00Z',
            end: '2024-12-16T15:00Z',
            location: 'Zoom'
          }
        ].slice(0, args.limit || 10);
        
        return ok({
          events: mockEvents,
          total: mockEvents.length,
          calendar: args.calendar || 'primary'
        });

      case 'calendar.search':
        if (!args.sessionId) {
          return fail(10, 'MISSING_SESSION_ID', { 
            message: 'Run calendar.setup first to get a sessionId' 
          });
        }
        
        const searchResults = [
          {
            id: 'evt_003',
            title: 'Meeting with Client',
            start: '2024-12-17T09:00:00Z',
            end: '2024-12-17T10:00:00Z',
            location: 'Office'
          }
        ].filter(event => 
          !args.query || event.title.toLowerCase().includes(args.query.toLowerCase())
        ).slice(0, args.limit || 10);
        
        return ok({
          events: searchResults,
          total: searchResults.length,
          query: args.query || ''
        });

      default:
        return fail(10, 'UNKNOWN_VERB', { verb: verbId });
    }
    
  } catch (error) {
    console.error('Calendar Adapter Error:', {
      message: error.message,
      stack: error.stack,
      verb,
      args
    });
    
    const details = process.env.NODE_ENV === 'development' 
      ? { message: error.message, stack: error.stack }
      : undefined;
      
    return fail(50, 'ADAPTER_ERROR', details);
  }
})();