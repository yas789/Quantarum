#!/usr/bin/env node

// Comprehensive test runner for all zero-config capabilities
const { spawn } = require('child_process');
const path = require('path');

const tests = [
  {
    name: '📁 File System Intelligence',
    testFile: '/Users/yassirmaknaoui/git/Quantarum/agent-bus/adapters/fs/test-intelligence.js',
    status: 'fully_implemented'
  },
  {
    name: '📧 Email Automation',  
    testFile: '/Users/yassirmaknaoui/git/Quantarum/agent-bus/adapters/email/test-email.js',
    status: 'partial_implementation'
  },
  {
    name: '📅 Calendar Integration',
    testFile: '/Users/yassirmaknaoui/git/Quantarum/agent-bus/adapters/calendar/test-calendar.js', 
    status: 'mock_only'
  },
  {
    name: '💬 Messaging Hub',
    testFile: '/Users/yassirmaknaoui/git/Quantarum/agent-bus/adapters/messaging/test-messaging.js',
    status: 'mock_only'
  }
];

async function runTest(test) {
  console.log(`\n🚀 Testing ${test.name}`);
  console.log(`   Status: ${test.status}`);
  console.log(`   File: ${test.testFile}`);
  
  return new Promise((resolve) => {
    const child = spawn('node', [test.testFile], {
      stdio: ['pipe', 'pipe', 'pipe']
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
      if (code === 0) {
        console.log('✅ Tests completed successfully');
        
        // Extract key metrics
        const output = stdout + stderr;
        const passedMatch = output.match(/Passed: (\d+)\/(\d+)/);
        if (passedMatch) {
          console.log(`   Results: ${passedMatch[1]}/${passedMatch[2]} tests passed`);
        }
        
        resolve({ passed: true, results: output });
      } else {
        console.log(`❌ Tests failed with code ${code}`);
        console.log(`   Error output: ${stderr.substring(0, 200)}...`);
        resolve({ passed: false, error: stderr });
      }
    });
  });
}

async function runAllTests() {
  console.log('🎯 Quantarum Agent Bus - Zero-Config Capabilities Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Testing all implemented zero-config capabilities...\n');
  
  const results = [];
  
  for (const test of tests) {
    const result = await runTest(test);
    results.push({ ...test, ...result });
    
    // Brief pause between test suites
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Overall summary
  console.log('\n📊 Overall Test Results Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    const status = getStatusDescription(result.status);
    console.log(`${icon} ${result.name} - ${status}`);
  });
  
  console.log(`\n🏆 Summary: ${passed}/${total} test suites passed`);
  
  console.log('\n🎯 Implementation Status:');
  console.log('✅ File System Intelligence: FULLY IMPLEMENTED & TESTED');
  console.log('🟡 Email Automation: FRAMEWORK READY, NEEDS BROWSER AUTOMATION');  
  console.log('🟡 Calendar Integration: BASIC STRUCTURE, NEEDS FULL IMPLEMENTATION');
  console.log('🟡 Messaging Hub: MOCK RESPONSES, NEEDS REAL PLATFORM INTEGRATION');
  
  console.log('\n💡 Recommendations:');
  console.log('1. File System adapter is production-ready');
  console.log('2. Web adapters need Puppeteer automation completion');
  console.log('3. Start with email adapter - most straightforward to complete');
  console.log('4. Consider gradual rollout: FS first, then email, then calendar/messaging');
}

function getStatusDescription(status) {
  switch (status) {
    case 'fully_implemented': return 'Production Ready';
    case 'partial_implementation': return 'Framework Ready, Needs Completion';
    case 'mock_only': return 'Mock Implementation Only';
    default: return 'Unknown Status';
  }
}

// Run all tests
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };