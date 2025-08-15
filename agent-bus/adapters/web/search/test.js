#!/usr/bin/env node

// Simple test script for zero-config web search
const { spawn } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'cli.js');

// Test cases
const tests = [
  {
    name: 'Basic Search',
    payload: {
      verb: 'web.search',
      args: { query: 'nodejs tutorial', limit: 3 }
    }
  },
  {
    name: 'Search Suggestions', 
    payload: {
      verb: 'web.suggest',
      args: { query: 'javascript', limit: 5 }
    }
  },
  {
    name: 'Specific Engines',
    payload: {
      verb: 'web.search',
      args: { 
        query: 'python tutorial', 
        engines: ['duckduckgo', 'startpage'], 
        limit: 2 
      }
    }
  }
];

function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧪 Testing: ${test.name}`);
    
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
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          if (result.ok) {
            console.log(`✅ ${test.name} passed`);
            console.log(`   Results: ${result.data.results ? result.data.results.length : result.data.suggestions ? result.data.suggestions.length : 'N/A'}`);
            if (result.data.engines) {
              console.log(`   Engines: ${result.data.engines.map(e => e.name).join(', ')}`);
            }
          } else {
            console.log(`❌ ${test.name} failed: ${result.msg}`);
          }
          resolve(result);
        } catch (error) {
          console.log(`❌ ${test.name} failed to parse result: ${error.message}`);
          resolve(null);
        }
      } else {
        console.log(`❌ ${test.name} exited with code ${code}`);
        if (stderr) {
          try {
            const error = JSON.parse(stderr);
            console.log(`   Error: ${error.msg}`);
          } catch (e) {
            console.log(`   Error: ${stderr}`);
          }
        }
        resolve(null);
      }
    });
  });
}

async function runAllTests() {
  console.log('🚀 Starting Zero-Config Web Search Tests\n');
  
  const results = [];
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
    
    // Wait a bit between tests to be respectful to search engines
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  const passed = results.filter(r => r && r.ok).length;
  const total = tests.length;
  
  console.log('\n📊 Test Summary');
  console.log(`   Passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Zero-config web search is working perfectly.');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
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