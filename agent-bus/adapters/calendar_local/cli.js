#!/usr/bin/env node
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

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

// Format date for AppleScript
const formatDateForAppleScript = (dateStr) => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}. Please use ISO 8601 format.`);
  }
  
  // Format: "Thursday, March 14, 2024 at 2:00:00 PM"
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

// Get calendar by name or use default
const getCalendarId = async (calendarName = 'Home') => {
  try {
    const script = `
      tell application "Calendar"
        set calendarNames to name of calendars
        set calendarIds to id of calendars
        
        repeat with i from 1 to count of calendarNames
          if item i of calendarNames is "${calendarName}" then
            return item i of calendarIds
          end if
        end repeat
        
        -- If calendar not found, use the first available calendar
        if (count of calendarIds) > 0 then
          return item 1 of calendarIds
        else
          error "No calendars found"
        end if
      end tell
    `;
    
    const { stdout } = await execAsync(`osascript -e '${script}'`);
    return stdout.trim();
  } catch (error) {
    console.error('Error getting calendar ID:', error.message);
    return null;
  }
};

// Main handler
(async () => {
  try {
    switch (verb) {
      case 'calendar_local.create':
        requireArgs(args, ['title', 'start']);
        
        const {
          title,
          start,
          end,
          allDay = false,
          location = '',
          notes = '',
          attendees = [],
          calendar = 'Home'
        } = args;
        
        // Calculate end time if not provided (default to 1 hour after start)
        const startDate = new Date(start);
        const endDate = end ? new Date(end) : new Date(startDate.getTime() + 60 * 60 * 1000);
        
        if (isNaN(startDate.getTime())) {
          throw new Error(`Invalid start date: ${start}`);
        }
        if (isNaN(endDate.getTime())) {
          throw new Error(`Invalid end date: ${end}`);
        }
        if (endDate <= startDate) {
          throw new Error('End time must be after start time');
        }
        
        // Format dates for AppleScript
        const formattedStartDate = formatDateForAppleScript(startDate);
        const formattedEndDate = formatDateForAppleScript(endDate);
        
        // Get or create a temporary file for the event details
        const tempDir = os.tmpdir();
        const tempFile = path.join(tempDir, `event_${Date.now()}.txt`);
        
        try {
          // Create a temporary file with event details
          await fs.writeFile(tempFile, JSON.stringify({
            title,
            start: formattedStartDate,
            end: formattedEndDate,
            allDay,
            location,
            notes,
            attendees,
            calendar
          }));
          
          // Get the calendar ID
          const calendarId = await getCalendarId(calendar);
          if (!calendarId) {
            throw new Error(`Calendar '${calendar}' not found`);
          }
          
          // AppleScript to create the event
          const script = `
            set eventDetails to (do shell script "cat '${tempFile.replace(/'/g, "''")}'")
            set eventProps to run script "(" & eventDetails & ")"
            
            tell application "Calendar"
              -- Get the calendar by ID
              set targetCalendar to first calendar where id is "${calendarId}"
              
              -- Create the event
              tell targetCalendar
                set newEvent to make new event with properties { \
                  summary:my title of eventProps, \
                  start date:date my start of eventProps, \
                  end date:date my end of eventProps, \
                  allday event:my allDay of eventProps, \
                  location:my location of eventProps, \
                  description:my notes of eventProps \
                }
                
                -- Add attendees if any
                repeat with attendeeEmail in my attendees of eventProps
                  tell newEvent
                    make new attendee at end of attendees with properties {email:attendeeEmail}
                  end tell
                end repeat
                
                -- Return the event details
                set eventId to id of newEvent
                set eventUrl to "ical://" & (get uid of newEvent)
                
                return {eventId, eventUrl, summary:summary of newEvent, startDate:start date of newEvent, endDate:end date of newEvent}
              end tell
            end tell
          `;
          
          // Execute the AppleScript
          const { stdout, stderr } = await execAsync(`osascript -e '${script.replace(/\n/g, ' ').replace(/\s+/g, ' ')}'`);
          
          if (stderr) {
            console.error('AppleScript error:', stderr);
          }
          
          // Parse the result
          let eventResult;
          try {
            // Clean up the AppleScript output to make it valid JSON
            const cleanOutput = stdout
              .replace(/date "([^"]+)"/g, '"$1"')
              .replace(/\{([^:]+):/g, '"$1":')
              .replace(/,\s*\}/g, '}')
              .replace(/,\s*\]/g, ']');
              
            eventResult = JSON.parse(`{${cleanOutput}}`);
          } catch (parseError) {
            console.error('Error parsing AppleScript output:', parseError);
            eventResult = { eventId: `temp_${Date.now()}` };
          }
          
          return ok({
            eventId: eventResult.eventId || `temp_${Date.now()}`,
            eventUrl: eventResult.eventUrl || '',
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            calendar,
            summary: title
          });
          
        } finally {
          // Clean up the temporary file
          try {
            await fs.unlink(tempFile);
          } catch (cleanupError) {
            console.error('Error cleaning up temporary file:', cleanupError);
          }
        }

      default:
        return fail(10, 'UNKNOWN_VERB');
    }
  } catch (error) {
    // Handle common errors
    if (error.message.includes('User canceled')) {
      return fail(12, 'USER_CANCELED', { 
        message: 'The user canceled the operation',
        details: error.message 
      });
    }
    
    if (error.message.includes('permission')) {
      return fail(13, 'PERMISSION_DENIED', { 
        message: 'Permission denied when trying to access Calendar',
        details: 'Please grant the application access to Calendar in System Preferences > Security & Privacy > Privacy > Calendars',
        error: error.message 
      });
    }
    
    // For other errors, include the error details in development
    const details = process.env.NODE_ENV === 'development' 
      ? { 
          message: error.message, 
          stack: error.stack,
          ...(error.code && { code: error.code }),
          ...(error.path && { path: error.path })
        }
      : undefined;
      
    return fail(50, 'ADAPTER_ERROR', details);
  }
})();
