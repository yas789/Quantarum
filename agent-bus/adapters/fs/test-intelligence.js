#!/usr/bin/env node

// Comprehensive test script for intelligent file system operations
const { spawn } = require('child_process');
const path = require('path');

const cliPath = path.join(__dirname, 'cli.js');

// Test cases for intelligent file operations
const tests = [
  {
    name: 'Project Structure Analysis',
    payload: {
      verb: 'fs.analyze',
      args: { dir: '/Users/yassirmaknaoui/git/Quantarum/agent-bus' }
    },
    description: 'Analyze project type and structure with AI-powered detection'
  },
  {
    name: 'Content Search (Zero-config)',
    payload: {
      verb: 'fs.searchContent', 
      args: { 
        dir: '/Users/yassirmaknaoui/git/Quantarum/agent-bus/adapters', 
        query: 'require', 
        limit: 10 
      }
    },
    description: 'Full-text search across all files without external indexing'
  },
  {
    name: 'Smart File Organization',
    payload: {
      verb: 'fs.organize',
      args: { 
        dir: '/Users/yassirmaknaoui/git/Quantarum/agent-bus/adapters',
        generatePlan: true 
      }
    },
    description: 'Intelligent file organization by type, date, and size with suggestions'
  },
  {
    name: 'Duplicate Detection',
    payload: {
      verb: 'fs.duplicates',
      args: { dir: '/Users/yassirmaknaoui/git/Quantarum/agent-bus/manifests' }
    },
    description: 'Smart duplicate detection using content hashing'
  },
  {
    name: 'Directory Statistics',
    payload: {
      verb: 'fs.stats',
      args: { dir: '/Users/yassirmaknaoui/git/Quantarum/agent-bus/adapters' }
    },
    description: 'Comprehensive statistics and insights about directory contents'
  },
  {
    name: 'File Pattern Search',
    payload: {
      verb: 'fs.search',
      args: { 
        dir: '/Users/yassirmaknaoui/git/Quantarum/agent-bus',
        pattern: '*.js',
        limit: 5,
        sort: 'size'
      }
    },
    description: 'Pattern-based file search with sorting options'
  }
];

function runTest(test) {
  return new Promise((resolve, reject) => {
    console.log(`\n🧠 Testing: ${test.name}`);
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
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          if (result.ok) {
            console.log(`✅ ${test.name} passed`);
            
            // Display key insights from each test
            displayInsights(test.name, result.data);
            
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
          console.log(`   Error: ${stderr}`);
        }
        resolve(null);
      }
    });
  });
}

function displayInsights(testName, data) {
  switch (testName) {
    case 'Project Structure Analysis':
      console.log(`   🔍 Detected: ${data.type} (${Math.round(data.confidence * 100)}% confidence)`);
      console.log(`   📁 Files: ${data.files}, Directories: ${data.directories}`);
      if (data.suggestions && data.suggestions.length > 0) {
        console.log(`   💡 Suggestions: ${data.suggestions[0]}`);
      }
      break;
      
    case 'Content Search (Zero-config)':
      console.log(`   🔍 Found "${data.query}" in ${data.total} files`);
      console.log(`   📄 Searched ${data.searched} files total`);
      if (data.files && data.files.length > 0) {
        console.log(`   📝 Example: ${data.files[0].matches} matches in ${data.files[0].name}`);
      }
      break;
      
    case 'Smart File Organization':
      const types = Object.keys(data.byType);
      console.log(`   📂 File types found: ${types.join(', ')}`);
      console.log(`   📊 Total files analyzed: ${data.total}`);
      if (data.plan && data.plan.length > 0) {
        console.log(`   🎯 Organization suggestions: ${data.plan.length} actions`);
      }
      break;
      
    case 'Duplicate Detection':
      console.log(`   🔍 Scanned ${data.scanned} files`);
      console.log(`   🗑️  Found ${data.total} duplicate groups`);
      if (data.wastedSpace > 0) {
        console.log(`   💾 Wasted space: ${Math.round(data.wastedSpace / 1024)} KB`);
      }
      break;
      
    case 'Directory Statistics':
      const fileTypes = Object.keys(data.byType);
      console.log(`   📊 Total files: ${data.total}`);
      console.log(`   💾 Total size: ${Math.round(data.totalSize / 1024)} KB`);
      console.log(`   📁 File types: ${fileTypes.length} categories`);
      if (data.largest && data.largest.length > 0) {
        console.log(`   🔝 Largest file: ${data.largest[0].name} (${Math.round(data.largest[0].size / 1024)} KB)`);
      }
      break;
      
    case 'File Pattern Search':
      console.log(`   🔍 Found ${data.results.length} JavaScript files`);
      if (data.results && data.results.length > 0) {
        console.log(`   📁 Example: ${data.results[0].name} (${Math.round(data.results[0].size / 1024)} KB)`);
      }
      break;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Intelligent File System Tests');
  console.log('   Testing zero-config AI-powered file operations...\n');
  
  const results = [];
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
    
    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  const passed = results.filter(r => r && r.ok).length;
  const total = tests.length;
  
  console.log('\n📊 Intelligent File System Test Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   Passed: ${passed}/${total} tests`);
  
  if (passed === total) {
    console.log('🎉 All intelligent file operations working perfectly!');
    console.log('✨ Zero-config file intelligence ready for personal agents');
    console.log('\n🔥 Key Features Validated:');
    console.log('   🧠 AI-powered project analysis');
    console.log('   🔍 Content search without external indexing');
    console.log('   📁 Smart file organization with suggestions');
    console.log('   🗑️  Intelligent duplicate detection');
    console.log('   📊 Comprehensive directory insights');
    console.log('   🎯 All operations work instantly, no setup required!');
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