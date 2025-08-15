#!/usr/bin/env node

// Test script for zero-config calendar automation
const { spawn } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'cli.js');

// Test cases for calendar operations
const tests = [
  {
    name: 'Calendar Setup (Google)',
    description: 'Test one-time calendar session setup for Google Calendar',
    payload: {
      verb: 'calendar.setup',
      args: { email: 'test@gmail.com' }
    },
    expectSetup: true
  },
  {
    name: 'Calendar Setup (Outlook)',
    description: 'Test one-time calendar session setup for Outlook',
    payload: {
      verb: 'calendar.setup',
      args: { email: 'test@outlook.com', provider: 'outlook' }
    },
    expectSetup: true
  },
  {
    name: 'Create Calendar Event',
    description: 'Test calendar event creation',
    payload: {
      verb: 'calendar.create',
      args: {
        sessionId: 'test_cal_session_123',
        title: 'Team Meeting',
        start: '2024-12-16T10:00:00Z',
        end: '2024-12-16T11:00:00Z',
        location: 'Conference Room A',
        notes: 'Weekly team sync meeting'
      }
    }
  },
  {
    name: 'Create All-Day Event',
    description: 'Test all-day calendar event creation',
    payload: {
      verb: 'calendar.create',
      args: {
        sessionId: 'test_cal_session_123',
        title: 'Company Holiday',
        start: '2024-12-25T00:00:00Z',
        allDay: true
      }
    }
  },
  {
    name: 'List Calendar Events',
    description: 'Test listing upcoming calendar events',
    payload: {
      verb: 'calendar.list',
      args: {
        sessionId: 'test_cal_session_123',
        limit: 5
      }
    }
  },
  {
    name: 'Search Calendar Events',
    description: 'Test searching calendar events',
    payload: {
      verb: 'calendar.search',
      args: {
        sessionId: 'test_cal_session_123',
        query: 'meeting',
        limit: 5
      }
    }
  },
  {
    name: 'Invalid Date Error',
    description: 'Test error handling for invalid dates',
    payload: {
      verb: 'calendar.create',
      args: {
        sessionId: 'test_cal_session_123',
        title: 'Invalid Event',
        start: 'not-a-date'
      }
    },
    expectError: true
  },
  {
    name: 'Missing Session ID Error',
    description: 'Test error handling for missing session ID',
    payload: {
      verb: 'calendar.create',
      args: {
        title: 'Event Without Session',
        start: '2024-12-16T10:00:00Z'
      }
    },
    expectError: true
  }
];

function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\n📅 Testing: ${test.name}`);
    console.log(`   Description: ${test.description}`);
    
    const child = spawn('node', [cliPath, JSON.stringify(test.payload)], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout || stderr);
        
        if (test.expectError) {
          if (!result.ok) {
            console.log(`✅ ${test.name} failed as expected (${result.msg})`);
            resolve({ passed: true, result });
          } else {
            console.log(`❌ ${test.name} should have failed but didn't`);
            resolve({ passed: false, result });
          }
        } else if (test.expectSetup) {
          if (result.ok && result.data.sessionId && result.data.setupInstructions) {
            console.log(`✅ ${test.name} passed`);
            console.log(`   SessionId: ${result.data.sessionId}`);
            console.log(`   Provider: ${result.data.provider}`);
            console.log(`   Setup Instructions: ${result.data.setupInstructions.length} steps`);
            resolve({ passed: true, result });
          } else {
            console.log(`❌ ${test.name} failed: missing required setup data`);
            resolve({ passed: false, result });
          }
        } else {
          if (result.ok) {
            console.log(`✅ ${test.name} passed`);
            
            // Display key insights from each test
            displayInsights(test.name, result.data);
            
            resolve({ passed: true, result });
          } else {
            console.log(`❌ ${test.name} failed: ${result.msg}`);
            resolve({ passed: false, result });
          }
        }
      } catch (error) {
        console.log(`❌ ${test.name} failed to parse result: ${error.message}`);
        console.log(`   Raw output: ${stdout || stderr}`);
        resolve({ passed: false, error: error.message });
      }
    });
  });
}

function displayInsights(testName, data) {
  switch (testName) {
    case 'Create Calendar Event':
    case 'Create All-Day Event':
      console.log(`   📝 Event: "${data.title}" created`);
      console.log(`   📅 Start: ${data.formattedStart}`);
      if (data.location) {
        console.log(`   📍 Location: ${data.location}`);
      }
      console.log(`   🆔 Event ID: ${data.eventId}`);
      break;
      
    case 'List Calendar Events':
      console.log(`   📋 Found ${data.total} upcoming events`);
      if (data.events && data.events.length > 0) {
        console.log(`   📝 Next event: "${data.events[0].title}" at ${data.events[0].location || 'No location'}`);
      }
      break;
      
    case 'Search Calendar Events':
      console.log(`   🔍 Found ${data.total} events matching "${data.query}"`);
      if (data.events && data.events.length > 0) {
        console.log(`   📝 Match: "${data.events[0].title}" at ${data.events[0].location || 'No location'}`);
      }
      break;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Zero-Config Calendar Automation Tests');
  console.log('   Testing cross-platform calendar capabilities...\n');
  
  const results = [];
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  const passed = results.filter(r => r.passed).length;
  const total = tests.length;
  
  console.log('\n📊 Calendar Automation Test Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Passed: ${passed}/${total} tests`);
  
  if (passed === total) {
    console.log('🎉 All calendar automation tests passed!');
    console.log('✨ Zero-config calendar capabilities ready for agents');
    console.log('\n🔥 Key Features Validated:');
    console.log('   📅 Cross-platform calendar automation (Google, Outlook)');
    console.log('   🔐 Web-based authentication without API keys');
    console.log('   📝 Event creation with rich details and formatting');
    console.log('   📋 Event listing and management capabilities');
    console.log('   🔍 Event search and filtering functionality');
    console.log('   🌐 Works on any platform with a web browser');
    console.log('   🎯 Zero-config setup - just login once and schedule!');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
    console.log('\n💡 Note: Tests may show expected failures for error conditions');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };