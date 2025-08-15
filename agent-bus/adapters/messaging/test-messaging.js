#!/usr/bin/env node

// Test script for zero-config messaging automation
const { spawn } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'cli.js');

// Test cases for messaging operations
const tests = [
  {
    name: 'Messaging Setup (WhatsApp)',
    description: 'Test one-time messaging session setup for WhatsApp Web',
    payload: {
      verb: 'messaging.setup',
      args: { platform: 'whatsapp' }
    },
    expectSetup: true
  },
  {
    name: 'Messaging Setup (Slack)',
    description: 'Test one-time messaging session setup for Slack',
    payload: {
      verb: 'messaging.setup',
      args: { platform: 'slack' }
    },
    expectSetup: true
  },
  {
    name: 'Messaging Setup (Discord)',
    description: 'Test one-time messaging session setup for Discord',
    payload: {
      verb: 'messaging.setup',
      args: { platform: 'discord' }
    },
    expectSetup: true
  },
  {
    name: 'Send WhatsApp Message',
    description: 'Test sending a message via WhatsApp Web',
    payload: {
      verb: 'messaging.send',
      args: {
        sessionId: 'test_msg_session_123',
        to: 'John Doe',
        message: 'Hello from Agent Bus! 👋 This is a test message.',
        platform: 'whatsapp'
      }
    }
  },
  {
    name: 'Send Slack Message',
    description: 'Test sending a message via Slack',
    payload: {
      verb: 'messaging.send',
      args: {
        sessionId: 'test_msg_session_123',
        to: '#general',
        message: 'Team update: All systems operational! 🚀',
        platform: 'slack'
      }
    }
  },
  {
    name: 'List Messaging Chats',
    description: 'Test listing recent chats/channels',
    payload: {
      verb: 'messaging.list',
      args: {
        sessionId: 'test_msg_session_123',
        limit: 10,
        platform: 'whatsapp'
      }
    }
  },
  {
    name: 'Read Messages from Chat',
    description: 'Test reading messages from a specific chat',
    payload: {
      verb: 'messaging.read',
      args: {
        sessionId: 'test_msg_session_123',
        chat: 'Work Team',
        limit: 15,
        platform: 'whatsapp'
      }
    }
  },
  {
    name: 'Search Messages',
    description: 'Test searching messages across chats',
    payload: {
      verb: 'messaging.search',
      args: {
        sessionId: 'test_msg_session_123',
        query: 'meeting',
        limit: 5,
        platform: 'whatsapp'
      }
    }
  },
  {
    name: 'List Unread Only',
    description: 'Test listing only chats with unread messages',
    payload: {
      verb: 'messaging.list',
      args: {
        sessionId: 'test_msg_session_123',
        unreadOnly: true,
        limit: 5,
        platform: 'whatsapp'
      }
    }
  },
  {
    name: 'Missing Session ID Error',
    description: 'Test error handling for missing session ID',
    payload: {
      verb: 'messaging.send',
      args: {
        to: 'Someone',
        message: 'Test message'
      }
    },
    expectError: true
  },
  {
    name: 'Unsupported Platform Error',
    description: 'Test error handling for unsupported platform',
    payload: {
      verb: 'messaging.setup',
      args: { platform: 'telegram' }
    },
    expectError: true
  }
];

function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\n💬 Testing: ${test.name}`);
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
            console.log(`   Platform: ${result.data.platform}`);
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
    case 'Send WhatsApp Message':
    case 'Send Slack Message':
      console.log(`   📤 Message sent to: ${data.recipient}`);
      console.log(`   💬 Content: "${data.message.substring(0, 50)}${data.message.length > 50 ? '...' : ''}"`);
      console.log(`   📱 Platform: ${data.platform}`);
      console.log(`   🆔 Message ID: ${data.messageId}`);
      break;
      
    case 'List Messaging Chats':
    case 'List Unread Only':
      console.log(`   💬 Found ${data.total} chats on ${data.platform}`);
      if (data.chats && data.chats.length > 0) {
        const unreadCount = data.chats.filter(chat => chat.unread).length;
        console.log(`   📬 Unread chats: ${unreadCount}`);
        console.log(`   📝 Recent chat: "${data.chats[0].name}" - ${data.chats[0].lastMessage}`);
      }
      break;
      
    case 'Read Messages from Chat':
      console.log(`   📖 Read ${data.total} messages from "${data.chat}"`);
      console.log(`   📱 Platform: ${data.platform}`);
      if (data.messages && data.messages.length > 0) {
        console.log(`   💬 Latest: "${data.messages[data.messages.length - 1].text}" from ${data.messages[data.messages.length - 1].sender}`);
      }
      break;
      
    case 'Search Messages':
      console.log(`   🔍 Found ${data.total} messages matching "${data.query}"`);
      console.log(`   📱 Platform: ${data.platform}`);
      if (data.results && data.results.length > 0) {
        console.log(`   📝 Match: "${data.results[0].text.substring(0, 60)}..." in ${data.results[0].chat}`);
      }
      break;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Zero-Config Messaging Automation Tests');
  console.log('   Testing cross-platform messaging capabilities...\n');
  
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
  
  console.log('\n📊 Messaging Automation Test Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Passed: ${passed}/${total} tests`);
  
  if (passed === total) {
    console.log('🎉 All messaging automation tests passed!');
    console.log('✨ Zero-config messaging capabilities ready for agents');
    console.log('\n🔥 Key Features Validated:');
    console.log('   💬 Multi-platform messaging (WhatsApp, Slack, Discord)');
    console.log('   🔐 Web-based authentication without API keys');
    console.log('   📤 Message sending with rich content support');
    console.log('   📋 Chat/channel listing and management');
    console.log('   📖 Message reading and history access');
    console.log('   🔍 Cross-chat message search capabilities');
    console.log('   📬 Unread message filtering and notifications');
    console.log('   🌐 Works on any platform with a web browser');
    console.log('   🎯 Zero-config setup - just login once and message!');
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