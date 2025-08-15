#!/usr/bin/env node

const axios = require('axios');
const cheerio = require('cheerio');
const { URL, URLSearchParams } = require('url');
const crypto = require('crypto');
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

// Configuration for zero-config personal agents
const CONFIG = {
  CACHE_TTL: 30 * 60 * 1000, // 30 minutes
  MAX_RETRIES: 3,
  TIMEOUT: 15000, // 15 seconds per engine
  CACHE_DIR: path.join(os.tmpdir(), 'quantarum_search_cache'),
  USER_AGENTS: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ]
};

// Multi-engine configuration for zero-config reliability
const SEARCH_ENGINES = {
  // Primary: DuckDuckGo Lite - Most reliable for scraping
  duckduckgo: {
    name: 'DuckDuckGo',
    baseUrl: 'https://lite.duckduckgo.com/lite/',
    method: 'POST',
    priority: 1,
    selectors: [
      // Primary selectors
      {
        results: 'tr:has(td.result-link)',
        title: 'td.result-link a',
        link: 'td.result-link a',
        snippet: 'td.result-snippet'
      },
      // Fallback selectors for different DDG layouts
      {
        results: '.result',
        title: '.result__title a',
        link: '.result__title a',
        snippet: '.result__snippet'
      }
    ],
    params: { q: '', kl: 'us-en' },
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'DNT': '1'
    }
  },

  // Secondary: Startpage - Google results without tracking
  startpage: {
    name: 'Startpage',
    baseUrl: 'https://www.startpage.com/sp/search',
    method: 'POST',
    priority: 2,
    selectors: [
      {
        results: '.w-gl__result',
        title: '.w-gl__result-title',
        link: '.w-gl__result-title a',
        snippet: '.w-gl__description'
      },
      {
        results: '.result',
        title: '.result-title',
        link: '.result-title a',
        snippet: '.result-desc'
      }
    ],
    params: {
      query: '',
      cat: 'web',
      cmd: 'process_search',
      language: 'english',
      engine0: 'v1all'
    }
  },

  // Tertiary: Brave Search - Independent results
  brave: {
    name: 'Brave Search',
    baseUrl: 'https://search.brave.com/search',
    priority: 3,
    selectors: [
      {
        results: 'div[data-type="web"]',
        title: '.title',
        link: '.title a',
        snippet: '.snippet'
      },
      {
        results: '.snippet',
        title: 'h3 a',
        link: 'h3 a',
        snippet: '.snippet-description'
      }
    ],
    params: { q: '', source: 'web' }
  },

  // Fallback: Public Searx instances
  searx: {
    name: 'SearX',
    baseUrls: [
      'https://searx.be/search',
      'https://search.sapti.me/search',
      'https://searx.prvcy.eu/search'
    ],
    priority: 4,
    selectors: [
      {
        results: '.result',
        title: '.result_title',
        link: '.result_title a',
        snippet: '.result_content'
      }
    ],
    params: {
      q: '',
      categories: 'general',
      language: 'en',
      time_range: '',
      safesearch: '1'
    }
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

// Generate cache key
function getCacheKey(query, engine) {
  return crypto.createHash('md5').update(`${query}-${engine}`).digest('hex');
}

// Get cached results
async function getCachedResults(query, engine) {
  try {
    const cacheKey = getCacheKey(query, engine);
    const cacheFile = path.join(CONFIG.CACHE_DIR, `${cacheKey}.json`);
    const stats = await fs.stat(cacheFile);
    
    // Check if cache is still valid
    if (Date.now() - stats.mtime.getTime() < CONFIG.CACHE_TTL) {
      const cached = await fs.readFile(cacheFile, 'utf8');
      return JSON.parse(cached);
    }
  } catch (error) {
    // Cache miss or expired
  }
  return null;
}

// Cache results
async function cacheResults(query, engine, results) {
  try {
    const cacheKey = getCacheKey(query, engine);
    const cacheFile = path.join(CONFIG.CACHE_DIR, `${cacheKey}.json`);
    await fs.writeFile(cacheFile, JSON.stringify(results), 'utf8');
  } catch (error) {
    // Cache write failed, continue without caching
  }
}

// Get random user agent
function getRandomUserAgent() {
  return CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
}

// Extract search results with multiple selector fallbacks
function extractSearchResults(html, engine) {
  const $ = cheerio.load(html);
  const results = [];
  const engineConfig = SEARCH_ENGINES[engine];
  
  if (!engineConfig || !engineConfig.selectors) {
    return results;
  }

  // Try each selector set until we find results
  for (const selectorSet of engineConfig.selectors) {
    const tempResults = [];
    
    $(selectorSet.results).each((_, element) => {
      try {
        const $element = $(element);
        
        // Extract title
        const titleEl = $element.find(selectorSet.title).first();
        const title = titleEl.text().trim();
        
        // Extract link
        const linkEl = titleEl.length ? titleEl : $element.find(selectorSet.link).first();
        let link = linkEl.attr('href');
        
        // Clean and validate link
        if (link) {
          link = cleanUrl(link, engine);
        }
        
        // Extract snippet
        let snippet = $element.find(selectorSet.snippet).text().trim();
        if (!snippet) {
          // Fallback snippet extraction
          snippet = extractFallbackSnippet($element);
        }
        
        // Clean up text
        const cleanTitle = cleanText(title);
        const cleanSnippet = cleanText(snippet);
        
        // Validate result
        if (cleanTitle && link && isValidUrl(link)) {
          // Extract domain for source
          const source = extractDomain(link);
          
          tempResults.push({
            title: cleanTitle,
            url: link,
            snippet: cleanSnippet,
            source: source,
            engine: engineConfig.name
          });
        }
      } catch (error) {
        // Skip this result and continue
      }
    });
    
    // If we got results with this selector set, return them
    if (tempResults.length > 0) {
      results.push(...tempResults);
      break;
    }
  }
  
  return results;
}

// Clean URL for different engines
function cleanUrl(url, engine) {
  try {
    // Handle relative URLs
    if (!url.startsWith('http')) {
      if (url.startsWith('//')) {
        url = 'https:' + url;
      } else if (url.startsWith('/')) {
        const baseUrls = {
          'startpage': 'https://www.startpage.com',
          'searx': 'https://searx.be'
        };
        url = (baseUrls[engine] || '') + url;
      } else {
        url = 'https://' + url;
      }
    }
    
    // Handle search engine redirects
    const parsedUrl = new URL(url);
    
    // Startpage redirect cleanup
    if (parsedUrl.hostname.includes('startpage.com') && parsedUrl.searchParams.has('url')) {
      url = parsedUrl.searchParams.get('url');
    }
    
    return url;
  } catch (error) {
    return url;
  }
}

// Extract fallback snippet from element
function extractFallbackSnippet($element) {
  const fallbackSelectors = [
    'p', 'div:not(:has(*))', '.description', '.desc', '.content'
  ];
  
  for (const selector of fallbackSelectors) {
    const text = $element.find(selector).first().text().trim();
    if (text && text.length > 20 && text.length < 500) {
      return text;
    }
  }
  
  return '';
}

// Clean text content
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
}

// Validate URL
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (error) {
    return false;
  }
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch (error) {
    return '';
  }
}

// Search with single engine
async function searchWithEngine(query, engineName, options = {}) {
  const { limit = 10, timeout = CONFIG.TIMEOUT } = options;
  const engine = SEARCH_ENGINES[engineName];
  
  if (!engine) {
    throw new Error(`Unknown engine: ${engineName}`);
  }

  // Check cache first
  const cached = await getCachedResults(query, engineName);
  if (cached) {
    return {
      ...cached,
      fromCache: true,
      engine: engine.name
    };
  }

  // Prepare request parameters
  const params = { ...engine.params };
  
  // Set query parameter based on engine
  if (engineName === 'duckduckgo') {
    params.q = query;
  } else if (engineName === 'startpage') {
    params.query = query;
  } else if (engineName === 'brave') {
    params.q = query;
  } else if (engineName === 'searx') {
    params.q = query;
  }

  // Determine URL (handle multiple URLs for searx)
  let baseUrl = engine.baseUrl;
  if (engine.baseUrls) {
    // Pick random searx instance
    baseUrl = engine.baseUrls[Math.floor(Math.random() * engine.baseUrls.length)];
  }

  // Prepare request config
  const requestConfig = {
    method: engine.method || 'GET',
    url: baseUrl,
    timeout,
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      ...engine.headers
    },
    validateStatus: () => true // Don't throw on non-2xx status
  };

  // Handle POST vs GET
  if (engine.method === 'POST') {
    const formData = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      formData.append(key, String(value));
    });
    requestConfig.data = formData;
  } else {
    requestConfig.params = params;
  }

  // Make request
  const response = await axios(requestConfig);
  
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  // Extract results
  const results = extractSearchResults(response.data, engineName);
  
  // Limit results
  const limitedResults = results.slice(0, limit);
  
  const searchResult = {
    query,
    engine: engine.name,
    results: limitedResults,
    total: limitedResults.length,
    fromCache: false,
    timestamp: Date.now()
  };

  // Cache results
  await cacheResults(query, engineName, searchResult);
  
  return searchResult;
}

// Multi-engine search with intelligent failover
async function performSearch(query, options = {}) {
  const { limit = 10, engines = null } = options;
  
  // Determine engine order (priority-based)
  const engineOrder = engines || Object.keys(SEARCH_ENGINES).sort(
    (a, b) => (SEARCH_ENGINES[a].priority || 99) - (SEARCH_ENGINES[b].priority || 99)
  );

  let lastError = null;
  let combinedResults = [];
  let successfulEngines = [];

  // Try each engine until we get results
  for (const engineName of engineOrder) {
    try {
      const result = await searchWithEngine(query, engineName, { limit, timeout: CONFIG.TIMEOUT });
      
      if (result.results && result.results.length > 0) {
        combinedResults.push(...result.results);
        successfulEngines.push({
          name: result.engine,
          results: result.results.length,
          fromCache: result.fromCache
        });
        
        // If we have enough results, stop trying more engines
        if (combinedResults.length >= limit) {
          break;
        }
      }
    } catch (error) {
      lastError = error;
      // Continue to next engine
      continue;
    }
  }

  // If no results from any engine, throw the last error
  if (combinedResults.length === 0) {
    throw lastError || new Error('All search engines failed');
  }

  // Deduplicate and rank results
  const deduplicatedResults = deduplicateResults(combinedResults);
  const finalResults = deduplicatedResults.slice(0, limit);

  return {
    query,
    results: finalResults,
    total: finalResults.length,
    engines: successfulEngines,
    timestamp: Date.now()
  };
}

// Deduplicate results by URL similarity
function deduplicateResults(results) {
  const seen = new Set();
  const deduplicated = [];
  
  for (const result of results) {
    // Create a normalized key for deduplication
    const normalizedUrl = result.url.toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/$/, '')
      .replace(/[?#].*$/, ''); // Remove query params and fragments
    
    if (!seen.has(normalizedUrl)) {
      seen.add(normalizedUrl);
      deduplicated.push(result);
    }
  }
  
  return deduplicated;
}

// Get search suggestions from multiple sources
async function getSearchSuggestions(query, options = {}) {
  const { limit = 5 } = options;
  const suggestions = new Set(); // Use Set to avoid duplicates
  
  // Try DuckDuckGo suggestions (most privacy-friendly)
  try {
    const response = await axios.get('https://duckduckgo.com/ac/', {
      params: { q: query, kl: 'us-en' },
      timeout: 5000,
      headers: { 'User-Agent': getRandomUserAgent() }
    });
    
    if (Array.isArray(response.data)) {
      response.data.slice(0, limit).forEach(item => {
        if (item.phrase && suggestions.size < limit) {
          suggestions.add(item.phrase);
        }
      });
    }
  } catch (error) {
    // Fallback to basic suggestions if DDG fails
  }
  
  // If we don't have enough suggestions, try a simple completion
  if (suggestions.size < limit) {
    // Add some basic query completions
    const basicSuggestions = [
      `${query} tutorial`,
      `${query} guide`,
      `${query} examples`,
      `what is ${query}`,
      `${query} vs`
    ];
    
    basicSuggestions.forEach(suggestion => {
      if (suggestions.size < limit) {
        suggestions.add(suggestion);
      }
    });
  }
  
  return {
    query,
    suggestions: Array.from(suggestions).slice(0, limit)
  };
}

// Main handler with zero-config reliability
(async () => {
  try {
    // Initialize cache directory
    await initCache();
    
    switch (verb) {
      case 'web.search':
        requireArgs(args, ['query']);
        const searchResult = await performSearch(args.query, args);
        return ok({
          query: searchResult.query,
          results: searchResult.results.map(r => ({
            title: r.title,
            url: r.url,
            snippet: r.snippet,
            source: r.source
          })),
          engines: searchResult.engines,
          total: searchResult.total,
          searchUrl: `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`
        });
        
      case 'web.suggest':
        requireArgs(args, ['query']);
        const suggestions = await getSearchSuggestions(args.query, args);
        return ok(suggestions);
        
      default:
        return fail(10, 'UNKNOWN_VERB');
    }
  } catch (error) {
    // Enhanced error handling for zero-config reliability
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return fail(53, 'SEARCH_TIMEOUT', {
        message: 'Search request timed out - please check your internet connection',
        query: args.query
      });
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return fail(52, 'NETWORK_ERROR', {
        message: 'Unable to reach search engines - please check your internet connection',
        query: args.query
      });
    } else if (error.response && error.response.status === 429) {
      return fail(54, 'RATE_LIMITED', {
        message: 'Search rate limited - please try again in a moment',
        query: args.query
      });
    } else {
      return fail(50, 'SEARCH_FAILED', {
        message: 'Search failed - trying alternative search engines',
        error: error.message,
        query: args.query
      });
    }
  }
})();