#!/usr/bin/env node

const axios = require('axios');
const cheerio = require('cheerio');
const { URL, URLSearchParams } = require('url');
const { v4: uuidv4 } = require('uuid');

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

// Search engines configuration
const SEARCH_ENGINES = {
  google: {
    baseUrl: 'https://www.google.com/search',
    selectors: {
      results: 'div[jsname="U8erHd"]',
      title: 'h3',
      link: 'a[href^="http"]',
      snippet: 'div[data-sncf]',
      next: 'a[aria-label^="Next"]',
    },
    params: {
      q: '',
      num: 10,
      start: 0,
      hl: 'en',
      gl: 'us',
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
  },
  bing: {
    baseUrl: 'https://www.bing.com/search',
    selectors: {
      results: 'li.b_algo',
      title: 'h2',
      link: 'a',
      snippet: 'div.b_caption p',
      next: 'a.sb_pagN',
    },
    params: {
      q: '',
      count: 10,
      first: 1,
    },
  },
  duckduckgo: {
    baseUrl: 'https://html.duckduckgo.com/html/',
    selectors: {
      results: 'div.result',
      title: 'h2 a',
      link: 'h2 a',
      snippet: 'a.result__snippet',
      next: 'div.nav-link:contains("Next"):not(.nav-link--disabled) a',
    },
    params: {
      q: '',
    },
    method: 'POST',
  },
  // Add more search engines as needed
};

// Extract search results from HTML
function extractSearchResults(html, engine) {
  const $ = cheerio.load(html);
  const results = [];
  const { selectors } = SEARCH_ENGINES[engine];

  $(selectors.results).each((_, element) => {
    try {
      const titleElement = $(element).find(selectors.title).first();
      const linkElement = titleElement.length ? titleElement : $(element).find(selectors.link).first();
      
      const title = titleElement.length ? titleElement.text().trim() : '';
      let link = linkElement.attr('href');
      
      // Clean up Google's URL format
      if (engine === 'google' && link) {
        try {
          // Handle both relative and absolute URLs
          const baseUrl = link.startsWith('http') ? '' : 'https://www.google.com';
          const url = new URL(link, baseUrl);
          
          // Extract the actual URL from Google's redirect
          if (url.hostname === 'www.google.com' && url.pathname === '/url') {
            link = url.searchParams.get('url') || link;
          }
          
          // Ensure we have a proper URL
          if (!link.startsWith('http')) {
            link = 'https://' + link.replace(/^\/\//, '');
          }
        } catch (e) {
          console.error('Error parsing URL:', e.message);
        }
      }
      
      // Get the snippet, falling back to a nearby element if the primary selector fails
      let snippet = $(element).find(selectors.snippet).text().trim();
      if (!snippet) {
        // Try alternative selectors for snippet
        const possibleSnippets = [
          $(element).find('div[role="heading"] + div').text().trim(),
          $(element).find('div:contains(".")').first().text().trim(),
          $(element).find('div:not(:has(*))').first().text().trim()
        ];
        snippet = possibleSnippets.find(s => s && s.length > 10 && s.length < 300) || '';
      }
      
      // Clean up the data
      const cleanTitle = title.replace(/\s+/g, ' ').trim();
      const cleanSnippet = snippet.replace(/\s+/g, ' ').trim();
      
      // Only add if we have both title and link
      if (cleanTitle && link) {
        results.push({
          title: cleanTitle,
          link: link,
          snippet: cleanSnippet,
        });
      }
    } catch (error) {
      console.error('Error parsing search result:', error);
    }
  });

  return results;
}

// Perform a search
async function performSearch(query, options = {}) {
  const {
    engine = 'duckduckgo', // Default to DuckDuckGo instead of Google
    page = 1,
    limit = 10,
    region = 'us-en',
    safe_search = 'moderate',
    timeout = 30000, // Further increased timeout
  } = options;

  if (!SEARCH_ENGINES[engine]) {
    throw new Error(`Unsupported search engine: ${engine}`);
  }

  const config = SEARCH_ENGINES[engine];
  const params = { ...config.params };
  
  // Set up query parameters
  params.q = query;
  
  if (engine === 'google') {
    params.start = (page - 1) * limit;
    params.num = limit;
    if (safe_search === 'off') params.safe = 'off';
    if (region) params.gl = region;
  } else if (engine === 'bing') {
    params.first = (page - 1) * limit + 1;
    params.count = limit;
    if (safe_search === 'off') params.safeSearch = 'off';
    if (region) params.cc = region;
  } else if (engine === 'duckduckgo') {
    // DuckDuckGo handles pagination differently
  }

  // Make the request
  const requestConfig = {
    method: config.method || 'GET',
    url: config.baseUrl,
    params,
    headers: {
      ...config.headers,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0',
    },
    timeout,
    responseType: 'text',
    validateStatus: null, // Don't throw on HTTP error status codes
  };

  if (config.method === 'POST') {
    const formData = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      formData.append(key, value);
    });
    requestConfig.data = formData;
    requestConfig.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await axios(requestConfig);

  if (response.status !== 200) {
    throw new Error(`Search request failed with status ${response.status}`);
  }

  // Extract results from the HTML
  const results = extractSearchResults(response.data, engine);

  return {
    query,
    engine,
    page,
    results,
    total_results: results.length,
    has_more: results.length >= limit,
  };
}

// Get search suggestions
async function getSearchSuggestions(query, options = {}) {
  const { engine = 'google', limit = 5, region = 'us' } = options;
  
  const suggestions = [];
  
  if (engine === 'google') {
    const url = 'https://suggestqueries.google.com/complete/search';
    const params = {
      q: query,
      client: 'chrome',
      hl: 'en',
      gl: region,
    };
    
    const response = await axios.get(url, {
      params,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
      },
    });
    
    // Parse the response (format: [query, [suggestions], ...])
    if (Array.isArray(response.data) && response.data.length > 1) {
      suggestions.push(...response.data[1].slice(0, limit));
    }
  } else if (engine === 'bing') {
    const url = 'https://www.bing.com/AS/Suggestions';
    const params = {
      qry: query,
      mkt: `${region}-${region.toUpperCase()}`,
      cvid: uuidv4(),
    };
    
    const response = await axios.get(url, {
      params,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });
    
    // Parse the response (format: XML with suggestion elements)
    const $ = cheerio.load(response.data, { xmlMode: true });
    $('suggestion').each((i, el) => {
      if (suggestions.length < limit) {
        suggestions.push($(el).attr('data'));
      }
    });
  } else if (engine === 'duckduckgo') {
    const url = 'https://duckduckgo.com/ac/';
    const params = {
      q: query,
      kl: region.toLowerCase(),
    };
    
    const response = await axios.get(url, { params });
    
    // Parse the response (format: [{"phrase": "suggestion"}, ...])
    if (Array.isArray(response.data)) {
      response.data.slice(0, limit).forEach(item => {
        if (item.phrase) {
          suggestions.push(item.phrase);
        }
      });
    }
  } else {
    throw new Error(`Unsupported search engine for suggestions: ${engine}`);
  }
  
  return {
    query,
    engine,
    suggestions,
  };
}

// Main handler
(async () => {
  try {
    switch (verb) {
      case 'web.search':
        requireArgs(args, ['query']);
        const searchResult = await performSearch(args.query, args.options || {});
        return ok(searchResult);
        
      case 'web.suggest':
        requireArgs(args, ['query']);
        const suggestions = await getSearchSuggestions(args.query, args.options || {});
        return ok(suggestions);
        
      default:
        return fail(10, 'UNKNOWN_VERB');
    }
  } catch (error) {
    // Handle specific errors
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return fail(50, 'SEARCH_ERROR', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      });
    } else if (error.request) {
      // The request was made but no response was received
      return fail(52, 'NO_RESPONSE', {
        message: 'No response received from the search engine',
        error: error.message,
      });
    } else if (error.code === 'ECONNABORTED') {
      // Request timeout
      return fail(53, 'REQUEST_TIMEOUT', {
        message: 'Search request timed out',
        timeout: error.timeout,
      });
    } else {
      // Something happened in setting up the request that triggered an Error
      return fail(51, 'SEARCH_FAILED', {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
})();
