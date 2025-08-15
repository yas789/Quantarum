#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const glob = require('glob').glob;
const crypto = require('crypto');
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

// Configuration for intelligent file operations
const CONFIG = {
  // File type categories for smart organization
  FILE_TYPES: {
    documents: ['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.pages'],
    images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.tiff', '.ico'],
    videos: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v'],
    audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'],
    archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
    code: ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.h', '.html', '.css', '.php', '.rb', '.go', '.rs'],
    data: ['.json', '.xml', '.csv', '.yaml', '.yml', '.sql', '.db'],
    presentations: ['.ppt', '.pptx', '.key', '.odp'],
    spreadsheets: ['.xls', '.xlsx', '.numbers', '.ods', '.csv']
  },
  
  // Duplicate detection settings
  DUPLICATE_THRESHOLD: 0.95, // 95% similarity for duplicates
  MAX_CONTENT_SIZE: 10 * 1024 * 1024, // 10MB max for content analysis
  CACHE_DIR: path.join(os.tmpdir(), 'quantarum_fs_cache'),
  
  // Project patterns for structure analysis
  PROJECT_PATTERNS: {
    'Node.js': ['package.json', 'node_modules', '.npmrc'],
    'Python': ['requirements.txt', 'setup.py', '__pycache__', '.venv', 'pyproject.toml'],
    'Java': ['pom.xml', 'build.gradle', 'src/main/java', '.mvn'],
    'React': ['package.json', 'src/components', 'public/index.html'],
    'Git Repository': ['.git', '.gitignore', 'README.md'],
    'Docker': ['Dockerfile', 'docker-compose.yml', '.dockerignore'],
    'iOS': ['.xcodeproj', '.xcworkspace', 'Podfile'],
    'Android': ['build.gradle', 'app/src/main', 'AndroidManifest.xml']
  }
};

// Initialize cache directory
async function initCache() {
  try {
    await fs.mkdir(CONFIG.CACHE_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Get file type category
function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [category, extensions] of Object.entries(CONFIG.FILE_TYPES)) {
    if (extensions.includes(ext)) {
      return category;
    }
  }
  return 'other';
}

// Calculate file hash for duplicate detection
async function calculateFileHash(filePath) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > CONFIG.MAX_CONTENT_SIZE) {
      // For large files, hash first and last 1KB + size + mtime
      const fd = await fs.open(filePath, 'r');
      const buffer1 = Buffer.alloc(1024);
      const buffer2 = Buffer.alloc(1024);
      
      await fd.read(buffer1, 0, 1024, 0); // First 1KB
      await fd.read(buffer2, 0, 1024, Math.max(0, stats.size - 1024)); // Last 1KB
      await fd.close();
      
      const hash = crypto.createHash('md5');
      hash.update(buffer1);
      hash.update(buffer2);
      hash.update(stats.size.toString());
      hash.update(stats.mtime.toString());
      return hash.digest('hex');
    } else {
      // For small files, hash full content
      const content = await fs.readFile(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    }
  } catch (error) {
    return null;
  }
}

// Search file content (text files only)
async function searchFileContent(filePath, query, options = {}) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > CONFIG.MAX_CONTENT_SIZE) {
      return { matches: [], reason: 'file_too_large' };
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const textExtensions = ['.txt', '.md', '.js', '.ts', '.py', '.html', '.css', '.json', '.xml', '.yaml', '.yml', '.log'];
    
    if (!textExtensions.includes(ext)) {
      return { matches: [], reason: 'binary_file' };
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const matches = [];
    
    const searchTerm = options.caseSensitive ? query : query.toLowerCase();
    
    lines.forEach((line, index) => {
      const searchLine = options.caseSensitive ? line : line.toLowerCase();
      if (searchLine.includes(searchTerm)) {
        matches.push({
          line: index + 1,
          content: line.trim(),
          context: {
            before: lines[index - 1]?.trim() || '',
            after: lines[index + 1]?.trim() || ''
          }
        });
      }
    });
    
    return { matches, total: matches.length };
  } catch (error) {
    return { matches: [], error: error.message };
  }
}

// Analyze project structure
async function analyzeProjectStructure(dirPath) {
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const structure = {
      type: 'unknown',
      confidence: 0,
      files: files.length,
      directories: files.filter(f => f.isDirectory()).length,
      indicators: {},
      suggestions: []
    };
    
    // Check for project type indicators
    for (const [projectType, indicators] of Object.entries(CONFIG.PROJECT_PATTERNS)) {
      let matches = 0;
      const foundIndicators = [];
      
      for (const indicator of indicators) {
        const exists = files.some(f => f.name === indicator || f.name.includes(indicator));
        if (exists) {
          matches++;
          foundIndicators.push(indicator);
        }
      }
      
      const confidence = matches / indicators.length;
      if (confidence > structure.confidence) {
        structure.type = projectType;
        structure.confidence = confidence;
        structure.indicators[projectType] = foundIndicators;
      }
    }
    
    // Generate suggestions based on project type
    if (structure.type !== 'unknown' && structure.confidence > 0.5) {
      structure.suggestions = generateProjectSuggestions(structure.type, files);
    }
    
    return structure;
  } catch (error) {
    return { error: error.message };
  }
}

// Generate project-specific suggestions
function generateProjectSuggestions(projectType, files) {
  const suggestions = [];
  const fileNames = files.map(f => f.name);
  
  switch (projectType) {
    case 'Node.js':
      if (!fileNames.includes('README.md')) {
        suggestions.push('Consider adding a README.md file');
      }
      if (!fileNames.includes('.gitignore')) {
        suggestions.push('Add .gitignore to exclude node_modules');
      }
      if (!fileNames.includes('package-lock.json') && !fileNames.includes('yarn.lock')) {
        suggestions.push('Run npm install to generate lock file');
      }
      break;
      
    case 'Python':
      if (!fileNames.includes('README.md')) {
        suggestions.push('Consider adding a README.md file');
      }
      if (!fileNames.includes('.gitignore')) {
        suggestions.push('Add .gitignore to exclude __pycache__ and .venv');
      }
      break;
      
    case 'Git Repository':
      if (!fileNames.includes('README.md')) {
        suggestions.push('Add README.md to describe your project');
      }
      break;
  }
  
  return suggestions;
}

// Smart file organization
async function organizeFiles(dirPath, options = {}) {
  try {
    const files = await glob(path.join(dirPath, '**/*'), { 
      nodir: true, 
      absolute: true 
    });
    
    const organization = {
      byType: {},
      byDate: {},
      bySize: { small: [], medium: [], large: [] },
      total: files.length,
      plan: []
    };
    
    for (const filePath of files) {
      const stats = await fs.stat(filePath);
      const fileType = getFileType(filePath);
      const relativePath = path.relative(dirPath, filePath);
      
      // Organize by type
      if (!organization.byType[fileType]) {
        organization.byType[fileType] = [];
      }
      organization.byType[fileType].push(relativePath);
      
      // Organize by date (year-month)
      const date = stats.mtime;
      const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      if (!organization.byDate[yearMonth]) {
        organization.byDate[yearMonth] = [];
      }
      organization.byDate[yearMonth].push(relativePath);
      
      // Organize by size
      if (stats.size < 1024 * 1024) { // < 1MB
        organization.bySize.small.push(relativePath);
      } else if (stats.size < 100 * 1024 * 1024) { // < 100MB
        organization.bySize.medium.push(relativePath);
      } else {
        organization.bySize.large.push(relativePath);
      }
    }
    
    // Generate organization plan
    if (options.generatePlan) {
      for (const [type, typeFiles] of Object.entries(organization.byType)) {
        if (typeFiles.length > 5) { // Only suggest organization for types with multiple files
          organization.plan.push({
            action: 'create_folder',
            folder: path.join(dirPath, type),
            files: typeFiles.length,
            description: `Move ${typeFiles.length} ${type} files to organized folder`
          });
        }
      }
    }
    
    return organization;
  } catch (error) {
    return { error: error.message };
  }
}

// Main handler
(async () => {
  try {
    if (!verb) {
      throw new Error('No verb provided');
    }
    
    // Normalize to full verb id: ensure it starts with 'fs.'
    const verbId = verb && verb.startsWith('fs.') ? verb : `fs.${verb}`;
    
    // Only log in development mode to avoid spam
    if (process.env.NODE_ENV === 'development') {
      console.error(`FS Adapter: Processing verb '${verbId}' with args:`, JSON.stringify(args, null, 2));
    }
    
    switch (verbId) {
      case 'fs.read':
        requireArgs(args, ['path']);
        const content = await fs.readFile(args.path, args.encoding || 'utf8');
        return ok({ content });

      case 'fs.write':
        requireArgs(args, ['path', 'content']);
        await fs.mkdir(path.dirname(args.path), { recursive: true });
        const buffer = Buffer.from(args.content, args.encoding || 'utf8');
        await fs.writeFile(args.path, buffer);
        return ok({ 
          path: args.path,
          bytesWritten: buffer.length 
        });

      case 'fs.mkdir':
        requireArgs(args, ['path']);
        const mode = args.mode ? parseInt(args.mode, 8) : 0o755;
        await fs.mkdir(args.path, { recursive: true, mode });
        return ok({ path: args.path });

      case 'fs.move':
        requireArgs(args, ['source', 'destination']);
        await fs.mkdir(path.dirname(args.destination), { recursive: true });
        await fs.rename(args.source, args.destination);
        return ok({
          source: args.source,
          destination: args.destination
        });

      case 'fs.search':
        requireArgs(args, ['dir', 'pattern']);
        
        // Build glob pattern
        const globPattern = args.recursive !== false 
          ? `${args.dir}/**/${args.pattern}`
          : `${args.dir}/${args.pattern}`;
        
        // Find files matching the pattern
        const files = await glob(globPattern, { 
          nodir: true,
          dot: true,
          absolute: true,
          matchBase: false,
          silent: true,
          ignore: ['**/node_modules/**'],
          ...(args.limit && { limit: args.limit })
        });

        // Get file stats for each match
        const results = await Promise.all(
          files.map(async (filePath) => {
            const stats = await fs.stat(filePath);
            return {
              path: filePath,
              name: path.basename(filePath),
              size: stats.size,
              mtime: stats.mtime.toISOString(),
              isDirectory: stats.isDirectory(),
              isFile: stats.isFile()
            };
          })
        );

        // Sort results
        const sortKey = args.sort || 'name';
        results.sort((a, b) => {
          if (a[sortKey] < b[sortKey]) return -1;
          if (a[sortKey] > b[sortKey]) return 1;
          return 0;
        });

        // Apply limit after sorting
        const limitedResults = args.limit 
          ? results.slice(0, args.limit)
          : results;

        return ok({ results: limitedResults });

      case 'fs.searchContent':
        await initCache();
        requireArgs(args, ['dir', 'query']);
        
        const searchResults = [];
        const searchPattern = args.recursive !== false 
          ? `${args.dir}/**/*`
          : `${args.dir}/*`;
        
        const searchFiles = await glob(searchPattern, { 
          nodir: true,
          absolute: true,
          ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
        });
        
        for (const filePath of searchFiles.slice(0, args.limit || 100)) {
          const contentResults = await searchFileContent(filePath, args.query, {
            caseSensitive: args.caseSensitive || false
          });
          
          if (contentResults.matches && contentResults.matches.length > 0) {
            searchResults.push({
              file: filePath,
              name: path.basename(filePath),
              matches: contentResults.matches.length,
              results: contentResults.matches.slice(0, 5) // Limit to first 5 matches per file
            });
          }
        }
        
        return ok({ 
          query: args.query,
          files: searchResults,
          total: searchResults.length,
          searched: searchFiles.length
        });

      case 'fs.organize':
        requireArgs(args, ['dir']);
        const organization = await organizeFiles(args.dir, {
          generatePlan: args.generatePlan !== false
        });
        return ok(organization);

      case 'fs.duplicates':
        await initCache();
        requireArgs(args, ['dir']);
        
        const duplicateFiles = await glob(`${args.dir}/**/*`, { 
          nodir: true, 
          absolute: true,
          ignore: ['**/node_modules/**', '**/.git/**']
        });
        
        const fileHashes = new Map();
        const duplicates = [];
        
        for (const filePath of duplicateFiles) {
          const hash = await calculateFileHash(filePath);
          if (hash) {
            if (fileHashes.has(hash)) {
              const existing = fileHashes.get(hash);
              duplicates.push({
                files: [existing, filePath],
                hash,
                size: (await fs.stat(filePath)).size
              });
            } else {
              fileHashes.set(hash, filePath);
            }
          }
        }
        
        // Calculate space savings
        const totalWaste = duplicates.reduce((sum, dup) => sum + dup.size, 0);
        
        return ok({
          duplicates,
          total: duplicates.length,
          wastedSpace: totalWaste,
          scanned: duplicateFiles.length
        });

      case 'fs.analyze':
        requireArgs(args, ['dir']);
        const analysis = await analyzeProjectStructure(args.dir);
        return ok(analysis);

      case 'fs.stats':
        requireArgs(args, ['dir']);
        
        const allFiles = await glob(`${args.dir}/**/*`, { 
          nodir: true, 
          absolute: true 
        });
        
        const stats = {
          total: allFiles.length,
          byType: {},
          totalSize: 0,
          largest: [],
          newest: [],
          oldest: []
        };
        
        const fileDetails = [];
        
        for (const filePath of allFiles) {
          try {
            const fileStat = await fs.stat(filePath);
            const fileType = getFileType(filePath);
            
            stats.totalSize += fileStat.size;
            
            if (!stats.byType[fileType]) {
              stats.byType[fileType] = { count: 0, size: 0 };
            }
            stats.byType[fileType].count++;
            stats.byType[fileType].size += fileStat.size;
            
            fileDetails.push({
              path: filePath,
              name: path.basename(filePath),
              size: fileStat.size,
              mtime: fileStat.mtime,
              type: fileType
            });
          } catch (error) {
            // Skip files we can't stat
          }
        }
        
        // Get largest files
        stats.largest = fileDetails
          .sort((a, b) => b.size - a.size)
          .slice(0, 10)
          .map(f => ({ path: f.path, name: f.name, size: f.size, type: f.type }));
        
        // Get newest files
        stats.newest = fileDetails
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, 10)
          .map(f => ({ path: f.path, name: f.name, mtime: f.mtime.toISOString(), type: f.type }));
        
        // Get oldest files
        stats.oldest = fileDetails
          .sort((a, b) => a.mtime - b.mtime)
          .slice(0, 10)
          .map(f => ({ path: f.path, name: f.name, mtime: f.mtime.toISOString(), type: f.type }));
        
        return ok(stats);

      default:
        return fail(10, 'UNKNOWN_VERB');
    }
  } catch (error) {
    console.error('FS Adapter Error:', {
      message: error.message,
      stack: error.stack,
      verb,
      args: JSON.stringify(args, null, 2),
      code: error.code,
      path: error.path
    });
    
    if (error.code === 'ENOENT') {
      return fail(12, 'FILE_NOT_FOUND', { path: error.path });
    }
    if (error.code === 'EACCES') {
      return fail(13, 'PERMISSION_DENIED', { path: error.path });
    }
    if (error.code === 'EEXIST') {
      return fail(17, 'FILE_EXISTS', { path: error.path });
    }
    
    // For other errors, include the error details in development
    const details = process.env.NODE_ENV === 'development' 
      ? { message: error.message, stack: error.stack }
      : undefined;
      
    return fail(50, 'ADAPTER_ERROR', details);
  }
})();
