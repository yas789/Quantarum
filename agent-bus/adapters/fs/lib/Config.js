const path = require('path');
const os = require('os');

/**
 * Configuration constants for file system operations
 */
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
  DUPLICATE_THRESHOLD: 0.95,
  MAX_CONTENT_SIZE: 10 * 1024 * 1024, // 10MB
  CACHE_DIR: path.join(os.tmpdir(), 'quantarum_fs_cache'),
  
  // Project analysis patterns
  PROJECT_PATTERNS: {
    nodejs: ['package.json'],
    python: ['requirements.txt', 'setup.py', 'pyproject.toml'],
    java: ['pom.xml', 'build.gradle'],
    dotnet: ['*.csproj', '*.sln'],
    rust: ['Cargo.toml'],
    go: ['go.mod'],
    react: ['package.json', 'src/', 'public/'],
    vue: ['package.json', 'src/', 'vue.config.js'],
    angular: ['package.json', 'angular.json'],
    docker: ['Dockerfile', 'docker-compose.yml']
  },
  
  // Error codes
  ERROR_CODES: {
    MISSING_ARGUMENTS: 10,
    INVALID_PATH: 11,
    INVALID_ENCODING: 12,
    FILE_NOT_FOUND: 20,
    PERMISSION_DENIED: 21,
    OPERATION_FAILED: 30,
    ANALYSIS_ERROR: 40
  }
};

module.exports = CONFIG;