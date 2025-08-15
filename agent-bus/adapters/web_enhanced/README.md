# Enhanced Web Adapter

A sophisticated web browser automation adapter with persistent sessions, human-like interactions, and multi-tab support.

## Features

### 🔄 Persistent Sessions
- **Long-lived browser contexts** that persist across multiple operations
- **Automatic session management** with configurable timeouts and cleanup
- **Authentication state preservation** - cookies, localStorage, and sessionStorage are saved and restored
- **Resource optimization** - block images, fonts, and other resources for faster navigation

### 🤖 Human-like Interactions
- **Natural mouse movements** with random offsets and delays
- **Human-like typing patterns** with variable delays between keystrokes
- **Smart waiting strategies** that avoid detection
- **Realistic user behavior** patterns to prevent bot detection

### 📱 Multi-tab Orchestration
- **Coordinate actions** across multiple browser tabs
- **Smart tab reuse** - reuse existing tabs for the same domain
- **Tab switching and management** with full state tracking
- **Parallel tab operations** for efficient workflows

### 🛡️ Advanced Error Recovery
- **Automatic retry logic** with exponential backoff
- **Session recovery** when browser processes crash
- **Graceful degradation** for missing elements or network issues
- **Comprehensive error reporting** with context

## Quick Start

### 1. Create a Persistent Session
```json
{
  "tool": "web_enhanced",
  "verb": "createSession", 
  "args": {
    "sessionId": "my-work-session",
    "options": {
      "headless": false,
      "blockResources": ["image", "font"],
      "viewport": {"width": 1920, "height": 1080}
    }
  }
}
```

### 2. Open a Website
```json
{
  "tool": "web_enhanced",
  "verb": "open",
  "args": {
    "url": "https://github.com",
    "sessionId": "my-work-session"
  }
}
```

### 3. Interact with Elements
```json
{
  "tool": "web_enhanced", 
  "verb": "click",
  "args": {
    "locator": "text=Sign in",
    "sessionId": "my-work-session",
    "humanLike": true
  }
}
```

### 4. Fill Forms Naturally
```json
{
  "tool": "web_enhanced",
  "verb": "fill", 
  "args": {
    "locator": "input[name='login']",
    "value": "username",
    "sessionId": "my-work-session",
    "humanLike": true
  }
}
```

## Advanced Usage

### Multi-tab Workflows
```json
// Open multiple tabs
{
  "tool": "web_enhanced",
  "verb": "openTabs",
  "args": {
    "urls": [
      "https://github.com",
      "https://stackoverflow.com", 
      "https://docs.playwright.dev"
    ],
    "sessionId": "research-session",
    "switchTo": 1
  }
}

// Switch between tabs
{
  "tool": "web_enhanced",
  "verb": "switchTab",
  "args": {
    "tabIndex": 0,
    "sessionId": "research-session"
  }
}
```

### JavaScript Execution
```json
{
  "tool": "web_enhanced",
  "verb": "evaluate",
  "args": {
    "script": "return document.querySelectorAll('a').length",
    "sessionId": "my-work-session"
  }
}
```

### Smart Waiting
```json
{
  "tool": "web_enhanced", 
  "verb": "wait",
  "args": {
    "locator": ".results",
    "state": "visible",
    "timeout": 10000,
    "sessionId": "my-work-session"
  }
}
```

## Locator Types

The adapter supports multiple locator strategies:

### String Locators
```javascript
"button.primary"              // CSS selector
"text=Sign In"               // Text content
"role=button"                // ARIA role  
"label=Username"             // Label text
"placeholder=Enter email"    // Placeholder text
"testId=login-btn"          // Test ID attribute
"xpath=//div[@class='main']" // XPath
"css=.navigation > li"       // Explicit CSS
```

### Object Locators  
```json
{
  "role": "button",
  "name": "Submit", 
  "exact": true
}

{
  "text": "Click here",
  "exact": false  
}

{
  "xpath": "//input[@type='submit']"
}
```

## Session Management

### Session Options
```json
{
  "sessionId": "unique-session-id",
  "options": {
    "headless": false,
    "viewport": {"width": 1920, "height": 1080},
    "userAgent": "custom user agent",
    "blockResources": ["image", "font", "media"],
    "blockDomains": ["ads.example.com", "tracking.com"],
    "contextOptions": {
      "permissions": ["geolocation"],
      "locale": "en-US"
    }
  }
}
```

### Automatic Cleanup
- Sessions automatically expire after 30 minutes of inactivity
- Maximum of 5 concurrent sessions (configurable)
- Graceful cleanup on process termination
- Authentication state is preserved between sessions

## Error Handling

The adapter includes robust error recovery:

- **Automatic retries** with exponential backoff
- **Session recreation** when browser processes crash  
- **Element waiting strategies** with smart timeouts
- **Network error recovery** with connection retries

## Performance Optimizations

### Resource Blocking
```json
{
  "blockResources": ["image", "font", "media"]
}
```

### Domain Blocking
```json
{
  "blockDomains": ["ads.example.com", "analytics.google.com"]
}
```

### Tab Reuse
```json
{
  "reuseTab": true  // Default: reuse tabs for same domain
}
```

## Security Considerations

- **Isolated sessions** - each session runs in its own browser context
- **Temporary profiles** - browser data is stored in temp directories
- **Automatic cleanup** - sessions and data are cleaned up on exit
- **Confirmation required** for session closure to prevent data loss

## Dependencies

- **Node.js 20+**
- **Playwright** - for browser automation
- **chromium** browser will be installed automatically by Playwright

## Installation

The adapter requires Playwright to be installed:

```bash
cd agent-bus
npm install playwright
npx playwright install chromium
```

## Troubleshooting

### Common Issues

1. **"playwright not installed"**
   ```bash
   npm install playwright
   npx playwright install chromium  
   ```

2. **"Chrome not found"**
   - Ensure Chrome or Chromium is installed
   - Check the browser installation paths in the code

3. **Session timeouts**
   - Increase timeout values in requests
   - Check network connectivity
   - Verify element selectors are correct

4. **Memory issues with many sessions**
   - Reduce MAX_SESSIONS in configuration
   - Close unused sessions explicitly
   - Enable resource blocking

### Debug Mode

Set environment variable for detailed logging:
```bash
NODE_ENV=development
```

## Examples

See the `/examples` directory for comprehensive usage examples including:

- E-commerce automation workflows
- Social media interactions  
- Form filling and submission
- Data scraping with multiple tabs
- Authentication workflows
- File upload handling

## Contributing

When contributing to this adapter:

1. Follow existing code patterns and conventions
2. Add comprehensive error handling for new features
3. Include examples in the manifest for new verbs
4. Test with multiple browser states and network conditions
5. Update this README with new capabilities

## Changelog

### v2.0.0
- Complete rewrite with persistent session management
- Added human-like interaction patterns
- Multi-tab orchestration capabilities  
- Enhanced error recovery and retry logic
- Resource optimization and blocking
- Authentication state preservation
- Smart page management with tab reuse