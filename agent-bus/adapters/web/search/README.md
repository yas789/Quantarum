# Zero-Config Web Search for Personal Agents

A bulletproof web search adapter designed for personal computing agents that require **zero setup** and **instant reliability**.

## Philosophy: "Download and It Works"

This adapter embodies the vision of magical user experiences:
- **No API keys required**
- **No external account setup**
- **No configuration files**
- **Instant functionality** after `npm start`

Perfect for personal productivity agents that users expect to work immediately, like consumer applications.

## Multi-Engine Resilience

### Search Engine Priority Order
1. **DuckDuckGo Lite** (Primary) - Clean, stable, privacy-focused
2. **Startpage** (Secondary) - Google results without tracking
3. **Brave Search** (Tertiary) - Independent search results
4. **SearX Public** (Fallback) - Multiple instance failover

### Intelligent Failover
```javascript
// Automatic engine switching when one fails
engines: ['duckduckgo', 'startpage', 'brave', 'searx']
→ Try DuckDuckGo first
→ If fails/blocked → Try Startpage  
→ If fails → Try Brave
→ If fails → Try SearX instances
→ Return combined deduplicated results
```

## Zero-Config Features

### 🚀 **Instant Search**
```json
{
  "tool": "web_search",
  "verb": "search", 
  "args": {"query": "nodejs tutorial"}
}
```
**No setup required** - works immediately after installation.

### 💾 **Smart Caching**
- **30-minute TTL** for repeated queries
- **Local temp directory** storage
- **Privacy-preserving** - no external data collection
- **Offline graceful degradation**

### 🛡️ **Bulletproof Reliability**
- **Multiple CSS selectors** per engine (when one breaks, try others)
- **Content-based fallbacks** when selectors fail completely
- **Cross-engine validation** and deduplication
- **Graceful error handling** with user-friendly messages

### 🔒 **Privacy-First Design**
- **No tracking** or analytics
- **Random user agents** to avoid fingerprinting  
- **Local processing** - all data stays on user's machine
- **DNT headers** and privacy-respecting requests

## Personal Agent Optimizations

### Smart Result Processing
```javascript
// Automatic deduplication across engines
results = [
  {title: "Node.js Guide", url: "nodejs.org/guide", source: "nodejs.org"},
  {title: "Node Tutorial", url: "w3schools.com/nodejs", source: "w3schools.com"}
]

// No duplicate URLs, clean metadata extraction
```

### Enhanced Error Handling
```javascript
// User-friendly error messages for personal agents
"NETWORK_ERROR": "Unable to reach search engines - check internet connection"
"SEARCH_TIMEOUT": "Search timed out - please try again"  
"RATE_LIMITED": "Please wait a moment before searching again"
```

### Resource Efficiency
- **Minimal memory footprint** for personal computers
- **Configurable timeouts** (15s default per engine)
- **Efficient caching** reduces network requests
- **Automatic cleanup** of old cache files

## Usage Examples

### Basic Search (Zero Config)
```bash
# Just works - no setup needed
curl -X POST http://localhost:4000/invoke \
  -H 'Content-Type: application/json' \
  -d '{"tool":"web_search","verb":"search","args":{"query":"playwright tutorial"}}'
```

### Advanced Search Options
```json
{
  "tool": "web_search",
  "verb": "search",
  "args": {
    "query": "machine learning basics",
    "limit": 10,
    "engines": ["duckduckgo", "startpage"]
  }
}
```

### Search Suggestions
```json
{
  "tool": "web_search", 
  "verb": "suggest",
  "args": {
    "query": "python",
    "limit": 5
  }
}
```

## Engine-Specific Features

### DuckDuckGo Lite
- **Most reliable** for scraping (simple HTML)
- **No JavaScript** required
- **Clean table-based layout**
- **Privacy-focused** (no tracking)

### Startpage
- **Google-quality results** without tracking
- **Anonymous proxy** to Google's index
- **Rich snippets** and metadata
- **Consent-free** access

### Brave Search
- **Independent index** (not Google/Bing)
- **Fast results** with good relevance
- **Privacy-respecting** by design
- **Growing index** with unique results

### SearX Public
- **Multiple instances** for redundancy  
- **Aggregates** results from many engines
- **Open source** and transparent
- **Fallback reliability** when others fail

## Selector Resilience

Each engine has **multiple selector fallbacks**:

```javascript
// DuckDuckGo selectors (primary → fallback)
selectors: [
  {
    results: 'tr:has(td.result-link)',    // Lite layout
    title: 'td.result-link a',
    link: 'td.result-link a', 
    snippet: 'td.result-snippet'
  },
  {
    results: '.result',                   // Standard layout
    title: '.result__title a',
    link: '.result__title a',
    snippet: '.result__snippet'
  }
]
```

When the primary selectors break due to site changes, the adapter automatically tries fallback selectors.

## Caching Strategy

### Local Cache Benefits
```javascript
CONFIG = {
  CACHE_TTL: 30 * 60 * 1000,           // 30 minutes
  CACHE_DIR: os.tmpdir() + '/quantarum_search_cache'
}

// Benefits for personal agents:
// ✅ Faster repeated searches
// ✅ Reduced network usage  
// ✅ Offline graceful degradation
// ✅ No external dependencies
```

### Cache Key Strategy
```javascript
// MD5 hash of query + engine
cacheKey = md5(`${query}-${engineName}`)
// Example: "nodejs tutorial-duckduckgo" → "a1b2c3d4e5f6..."
```

## Error Recovery

### Network Resilience
```javascript
// Automatic retry with different engines
try {
  results = await searchWithEngine('duckduckgo', query)
} catch (error) {
  try {
    results = await searchWithEngine('startpage', query)  
  } catch (error) {
    try {
      results = await searchWithEngine('brave', query)
    } catch (error) {
      // Final fallback to SearX
      results = await searchWithEngine('searx', query)
    }
  }
}
```

### Graceful Degradation
- **Cache fallback** when all engines fail
- **Partial results** better than no results
- **Clear error messages** for users
- **Suggestions fallback** to basic completions

## Perfect for Personal Agents

### Target Use Cases
- **Personal productivity** automation
- **Research assistance** agents  
- **Content discovery** bots
- **Information gathering** workflows

### User Experience
```bash
# User downloads agent
git clone agent-repo
cd agent && npm install

# Agent immediately works
npm start
# ✨ Magic - web search works instantly, no setup
```

### vs. API-Based Solutions
| Zero-Config Search | API-Based Search |
|-------------------|------------------|
| ✅ Works immediately | ❌ Requires API keys |
| ✅ No external accounts | ❌ Azure/Google setup |
| ✅ No billing/quotas | ❌ Usage limits |
| ✅ Privacy-preserving | ❌ Data sent to third parties |
| ✅ Multiple engine redundancy | ❌ Single point of failure |
| ⚠️ May be slower | ✅ Optimized APIs |
| ⚠️ Selector maintenance | ✅ Stable schemas |

## Technical Architecture

### Request Flow
```
User Query
    ↓
Priority Engine Order
    ↓  
Cache Check (30min TTL)
    ↓
HTTP Request with Random User-Agent
    ↓
Multiple Selector Attempts
    ↓
Result Extraction & Validation  
    ↓
Cross-Engine Deduplication
    ↓
Cache Storage
    ↓
Structured Response
```

### Deduplication Algorithm
```javascript
// Normalize URLs for comparison
normalizeUrl = (url) => url
  .toLowerCase()
  .replace(/^https?:\/\/(www\.)?/, '')  // Remove protocol/www
  .replace(/\/$/, '')                   // Remove trailing slash
  .replace(/[?#].*$/, '')              // Remove query/fragment

// Deduplicate by normalized URL
seen = new Set()
uniqueResults = results.filter(r => {
  const normalized = normalizeUrl(r.url)
  if (seen.has(normalized)) return false
  seen.add(normalized)
  return true
})
```

## Monitoring & Debugging

### Engine Performance Tracking
```javascript
// Response includes engine performance data
{
  "engines": [
    {"name": "DuckDuckGo", "results": 8, "fromCache": false},
    {"name": "Startpage", "results": 2, "fromCache": false}
  ],
  "total": 10
}
```

### Debug Information
```javascript
// In development mode, additional context
NODE_ENV=development

// Provides:
// - Stack traces on errors
// - Selector matching details
// - Cache hit/miss information
// - Engine response times
```

## Maintenance

### Selector Updates
When search engines change their HTML structure:

1. **Multiple selectors** provide automatic fallback
2. **Content-based extraction** as final fallback  
3. **Cross-engine validation** catches issues early
4. **Easy selector addition** without breaking changes

### Engine Health Monitoring
```javascript
// Built-in health tracking
engines.forEach(engine => {
  trackMetrics(engine.name, {
    successRate: calculateSuccessRate(engine),
    avgResponseTime: calculateAvgTime(engine),
    lastSuccess: getLastSuccess(engine)
  })
})
```

This zero-config approach makes personal agents feel **magical** - they just work, instantly, without the friction that kills adoption before users see value.