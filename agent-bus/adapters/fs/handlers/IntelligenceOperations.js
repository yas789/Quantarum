const fs = require('fs').promises;
const path = require('path');
const glob = require('glob').glob;
const crypto = require('crypto');
const Validator = require('../lib/Validator');
const CONFIG = require('../lib/Config');

/**
 * Handler for intelligent file system operations
 */
class IntelligenceOperations {
  static async search(args) {
    Validator.requireArgs(args, ['dir', 'pattern']);
    Validator.validatePath(args.dir);
    
    const globPattern = args.recursive !== false 
      ? `${args.dir}/**/${args.pattern}`
      : `${args.dir}/${args.pattern}`;
    
    const files = await glob(globPattern, { 
      nodir: true,
      dot: true,
      absolute: true,
      matchBase: false,
      silent: true,
      ignore: ['**/node_modules/**'],
      ...(args.limit && { limit: args.limit })
    });

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

    const sortKey = args.sort || 'name';
    results.sort((a, b) => {
      if (a[sortKey] < b[sortKey]) return -1;
      if (a[sortKey] > b[sortKey]) return 1;
      return 0;
    });

    const limitedResults = args.limit 
      ? results.slice(0, args.limit)
      : results;

    return { results: limitedResults };
  }
  
  static async searchContent(args) {
    Validator.requireArgs(args, ['dir', 'query']);
    Validator.validatePath(args.dir);
    
    const globPattern = `${args.dir}/**/*`;
    const files = await glob(globPattern, {
      nodir: true,
      dot: false,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
    });
    
    const results = [];
    const binaryExtensions = ['.exe', '.bin', '.jpg', '.png', '.pdf', '.zip'];
    
    for (const filePath of files.slice(0, 100)) { // Limit to first 100 files to prevent overflow
      try {
        const ext = path.extname(filePath).toLowerCase();
        if (binaryExtensions.includes(ext)) continue;
        
        const stats = await fs.stat(filePath);
        if (stats.size > CONFIG.MAX_CONTENT_SIZE) continue;
        
        const content = await fs.readFile(filePath, 'utf8');
        const matches = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(args.query.toLowerCase())) {
            matches.push({
              lineNumber: index + 1,
              content: line.trim().substring(0, 100), // Truncate long lines
              context: this.getLineContext(lines, index, 1).map(l => l.substring(0, 50))
            });
          }
        });
        
        if (matches.length > 0) {
          results.push({
            path: filePath,
            matches,
            totalMatches: matches.length
          });
        }
        
        // Limit total results to prevent JSON overflow
        if (results.length >= 10) break;
        
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }
    
    return {
      query: args.query,
      total: results.length,
      searched: files.length,
      files: results.map(r => ({
        name: path.basename(r.path),
        path: r.path,
        matches: r.totalMatches
      }))
    };
  }
  
  static async analyze(args) {
    Validator.requireArgs(args, ['dir']);
    Validator.validatePath(args.dir);
    
    const stats = await fs.stat(args.dir);
    if (!stats.isDirectory()) {
      throw new Error('Path must be a directory');
    }
    
    // File statistics
    const fileStats = await this.analyzeFiles(args.dir);
    
    // Project detection
    const projectType = await this.detectProjectType(args.dir);
    
    // Directory insights
    const insights = await this.generateInsights(args.dir, fileStats);
    
    // Format for test compatibility
    return {
      ...projectType,
      total: fileStats.totalFiles,
      byType: fileStats.typeDistribution,
      files: fileStats.totalFiles,
      directories: 0, // Could be calculated if needed
      suggestions: insights.map(i => i.message)
    };
  }
  
  static async organize(args) {
    Validator.requireArgs(args, ['dir']);
    Validator.validatePath(args.dir);
    
    const globPattern = `${args.dir}/*`;
    const files = await glob(globPattern, { nodir: true, absolute: true });
    
    const organization = {
      categories: {},
      suggestions: [],
      totalFiles: files.length
    };
    
    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      const category = this.categorizeFile(ext);
      
      if (!organization.categories[category]) {
        organization.categories[category] = [];
      }
      
      const stats = await fs.stat(filePath);
      organization.categories[category].push({
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        mtime: stats.mtime.toISOString()
      });
    }
    
    // Generate organization suggestions
    const suggestions = args.generatePlan 
      ? this.generateOrganizationPlan(organization.categories, args.dir)
      : [];
    
    // Format for test compatibility
    return {
      total: organization.totalFiles,
      byType: organization.categories,
      plan: suggestions
    };
  }
  
  static async findDuplicates(args) {
    Validator.requireArgs(args, ['dir']);
    Validator.validatePath(args.dir);
    
    const globPattern = `${args.dir}/**/*`;
    const files = await glob(globPattern, { nodir: true, absolute: true });
    
    const duplicateFiles = [];
    for (const filePath of files) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.size < CONFIG.MAX_CONTENT_SIZE) {
          duplicateFiles.push(filePath);
        }
      } catch (error) {
        // Skip files that can't be accessed
        continue;
      }
    }
    
    const fileHashes = new Map();
    const duplicates = [];
    
    for (const filePath of duplicateFiles) {
      const hash = await this.calculateFileHash(filePath);
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
    
    const totalWaste = duplicates.reduce((sum, dup) => sum + dup.size, 0);
    
    return {
      duplicates,
      total: duplicates.length,
      wastedSpace: totalWaste,
      scanned: duplicateFiles.length
    };
  }
  
  // Helper methods
  static getLineContext(lines, lineIndex, contextLines) {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);
    return lines.slice(start, end);
  }
  
  static async analyzeFiles(dir) {
    const globPattern = `${dir}/**/*`;
    const files = await glob(globPattern, { nodir: true, absolute: true });
    
    let totalSize = 0;
    const typeStats = {};
    let largest = { size: 0, path: '' };
    let newest = { mtime: new Date(0), path: '' };
    let oldest = { mtime: new Date(), path: '' };
    
    for (const filePath of files) {
      const stats = await fs.stat(filePath);
      const ext = path.extname(filePath).toLowerCase() || 'no-extension';
      
      totalSize += stats.size;
      
      if (!typeStats[ext]) {
        typeStats[ext] = { count: 0, totalSize: 0 };
      }
      typeStats[ext].count++;
      typeStats[ext].totalSize += stats.size;
      
      if (stats.size > largest.size) {
        largest = { size: stats.size, path: filePath };
      }
      
      if (stats.mtime > newest.mtime) {
        newest = { mtime: stats.mtime, path: filePath };
      }
      
      if (stats.mtime < oldest.mtime) {
        oldest = { mtime: stats.mtime, path: filePath };
      }
    }
    
    return {
      totalFiles: files.length,
      totalSize,
      typeDistribution: typeStats,
      largest: { ...largest, mtime: undefined },
      newest: { ...newest, mtime: newest.mtime.toISOString() },
      oldest: { ...oldest, mtime: oldest.mtime.toISOString() }
    };
  }
  
  static async detectProjectType(dir) {
    const confidence = {};
    
    for (const [type, patterns] of Object.entries(CONFIG.PROJECT_PATTERNS)) {
      let matches = 0;
      
      for (const pattern of patterns) {
        try {
          const globPattern = path.join(dir, pattern);
          const files = await glob(globPattern, { absolute: true });
          if (files.length > 0) matches++;
        } catch (error) {
          // Pattern didn't match, continue
        }
      }
      
      if (matches > 0) {
        confidence[type] = matches / patterns.length;
      }
    }
    
    // Find highest confidence project type
    const bestMatch = Object.entries(confidence)
      .sort(([,a], [,b]) => b - a)[0];
    
    return {
      type: bestMatch ? bestMatch[0] : 'unknown',
      confidence: bestMatch ? bestMatch[1] : 0,
      allMatches: confidence
    };
  }
  
  static async generateInsights(dir, fileStats) {
    const insights = [];
    
    // Large files insight
    if (fileStats.largest.size > 100 * 1024 * 1024) { // 100MB
      insights.push({
        type: 'large_files',
        message: `Directory contains very large files (${(fileStats.largest.size / 1024 / 1024).toFixed(1)}MB)`,
        suggestion: 'Consider archiving or moving large files to external storage'
      });
    }
    
    // File type distribution
    const typeCount = Object.keys(fileStats.typeDistribution).length;
    if (typeCount > 20) {
      insights.push({
        type: 'mixed_content',
        message: `Directory contains ${typeCount} different file types`,
        suggestion: 'Consider organizing files by type into subdirectories'
      });
    }
    
    return insights;
  }
  
  static categorizeFile(extension) {
    for (const [category, extensions] of Object.entries(CONFIG.FILE_TYPES)) {
      if (extensions.includes(extension)) {
        return category;
      }
    }
    return 'other';
  }
  
  static generateOrganizationPlan(categories, baseDir) {
    const suggestions = [];
    
    for (const [category, files] of Object.entries(categories)) {
      if (files.length > 5 && category !== 'other') {
        const targetDir = path.join(baseDir, category);
        suggestions.push({
          action: 'create_directory',
          category,
          targetDirectory: targetDir,
          fileCount: files.length,
          description: `Move ${files.length} ${category} files to ${targetDir}`
        });
      }
    }
    
    return suggestions;
  }
  
  static async calculateFileHash(filePath) {
    try {
      const content = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }
}

module.exports = IntelligenceOperations;