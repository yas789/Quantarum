// Generate a unique ID for this content script instance
const CONTENT_SCRIPT_ID = `content-script-${Math.random().toString(36).substr(2, 9)}`;

// Keep track of the current tab ID
let currentTabId = null;

// Get the current tab ID
chrome.runtime.sendMessage({type: 'GET_TAB_ID'}, (response) => {
  if (response && response.tabId) {
    currentTabId = response.tabId;
  }
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FROM_NATIVE_HOST' && message.tabId === currentTabId) {
    // Handle messages from the native host
    handleNativeMessage(message.payload, sendResponse);
    return true; // Keep the message channel open for async response
  }
  return false;
});

// Handle messages from the native host
async function handleNativeMessage(message, sendResponse) {
  try {
    let result;
    
    switch (message.action) {
      case 'click':
        result = await clickElement(message.selector, message.options);
        break;
        
      case 'fill':
        result = await fillForm(message.selectors, message.values);
        break;
        
      case 'navigate':
        result = await navigate(message.url, message.options);
        break;
        
      case 'screenshot':
        result = await takeScreenshot(message.options);
        break;
        
      case 'evaluate':
        result = await evaluateScript(message.script, message.args);
        break;
        
      case 'extract':
        result = await extractData(message.selectors, message.options);
        break;
        
      default:
        throw new Error(`Unknown action: ${message.action}`);
    }
    
    sendResponse({
      success: true,
      action: message.action,
      result,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      title: document.title
    });
    
  } catch (error) {
    console.error('Error in content script:', error);
    sendResponse({
      success: false,
      action: message.action,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}

// Helper function to wait for an element to be available
async function waitForElement(selector, timeout = 10000) {
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const checkElement = () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      if (Date.now() - startTime >= timeout) {
        reject(new Error(`Timeout waiting for element: ${selector}`));
        return;
      }
      
      setTimeout(checkElement, 100);
    };
    
    checkElement();
  });
}

// Click an element
async function clickElement(selector, options = {}) {
  const {
    waitForNavigation = false,
    timeout = 10000,
    waitFor = 0,
    scrollIntoView = true,
    waitForElementTimeout = 10000
  } = options;
  
  try {
    // Wait for the element to be available
    const element = await waitForElement(selector, waitForElementTimeout);
    
    // Scroll the element into view if requested
    if (scrollIntoView) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(resolve => setTimeout(resolve, 200)); // Small delay for scrolling
    }
    
    // Wait for any additional time if specified
    if (waitFor > 0) {
      await new Promise(resolve => setTimeout(resolve, waitFor));
    }
    
    // Click the element
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      ...(options.eventProps || {})
    });
    
    element.dispatchEvent(clickEvent);
    
    // Wait for navigation if requested
    if (waitForNavigation) {
      await new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          window.removeEventListener('load', onLoad);
          resolve();
        }, timeout);
        
        const onLoad = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        
        window.addEventListener('load', onLoad);
      });
    }
    
    return { success: true, selector };
  } catch (error) {
    console.error('Error clicking element:', error);
    throw error;
  }
}

// Fill a form with values
async function fillForm(selectors, values) {
  const results = [];
  
  for (const [selector, value] of Object.entries(selectors)) {
    try {
      const element = await waitForElement(selector);
      
      // Handle different input types
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        const inputType = element.type.toLowerCase();
        
        // Clear the input first
        element.value = '';
        
        // Handle different input types
        if (inputType === 'checkbox' || inputType === 'radio') {
          element.checked = Boolean(value);
        } else if (inputType === 'file') {
          // For file inputs, we can't set the value directly due to security restrictions
          console.warn('File inputs cannot be set programmatically for security reasons');
        } else {
          // For text, email, password, etc.
          element.value = value;
        }
        
        // Trigger change events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        results.push({ selector, success: true });
      } else if (element.isContentEditable) {
        // Handle contenteditable elements
        element.textContent = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        results.push({ selector, success: true });
      } else {
        throw new Error(`Element is not an input, textarea, or contenteditable: ${selector}`);
      }
    } catch (error) {
      console.error(`Error filling field ${selector}:`, error);
      results.push({ 
        selector, 
        success: false, 
        error: error.message 
      });
    }
  }
  
  return { results };
}

// Navigate to a URL
async function navigate(url, options = {}) {
  const { waitForNavigation = true, timeout = 30000 } = options;
  
  return new Promise((resolve, reject) => {
    try {
      if (waitForNavigation) {
        const timeoutId = setTimeout(() => {
          window.removeEventListener('load', onLoad);
          reject(new Error(`Navigation timeout after ${timeout}ms`));
        }, timeout);
        
        const onLoad = () => {
          clearTimeout(timeoutId);
          resolve({
            success: true,
            url: window.location.href,
            title: document.title
          });
        };
        
        window.addEventListener('load', onLoad);
      }
      
      // Perform the navigation
      window.location.href = url;
      
      if (!waitForNavigation) {
        resolve({ success: true, url });
      }
    } catch (error) {
      console.error('Error during navigation:', error);
      reject(error);
    }
  });
}

// Take a screenshot of the current page or an element
async function takeScreenshot(options = {}) {
  const { selector = null, format = 'png', quality = 0.8 } = options;
  
  try {
    let element = document.documentElement;
    
    if (selector) {
      element = await waitForElement(selector);
    }
    
    // Use the HTML2Canvas library for better screenshots with CSS
    const html2canvas = await loadScript('https://html2canvas.hertzen.com/dist/html2canvas.min.js');
    const canvas = await html2canvas(element, {
      scale: window.devicePixelRatio,
      useCORS: true,
      allowTaint: true,
      logging: false,
      ...options.canvasOptions
    });
    
    // Convert to the requested format
    let dataUrl, mimeType;
    
    switch (format.toLowerCase()) {
      case 'jpeg':
      case 'jpg':
        mimeType = 'image/jpeg';
        dataUrl = canvas.toDataURL(mimeType, quality);
        break;
      case 'webp':
        mimeType = 'image/webp';
        dataUrl = canvas.toDataURL(mimeType, quality);
        break;
      case 'png':
      default:
        mimeType = 'image/png';
        dataUrl = canvas.toDataURL();
    }
    
    // Return the data URL and metadata
    return {
      success: true,
      format: mimeType,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      selector
    };
    
  } catch (error) {
    console.error('Error taking screenshot:', error);
    throw error;
  }
}

// Evaluate a script in the page context
async function evaluateScript(script, args = []) {
  try {
    // Create a function from the script string
    const func = new Function(...Object.keys(args), `return (${script})`);
    
    // Execute the function with the provided arguments
    const result = await func(...Object.values(args));
    
    // Handle promises
    const finalResult = result instanceof Promise ? await result : result;
    
    return {
      success: true,
      result: finalResult,
      type: typeof finalResult
    };
    
  } catch (error) {
    console.error('Error evaluating script:', error);
    throw error;
  }
}

// Extract data from the page using selectors
async function extractData(selectors, options = {}) {
  const { waitForElement = true, timeout = 5000 } = options;
  const result = {};
  
  for (const [key, selector] of Object.entries(selectors)) {
    try {
      let element;
      
      if (waitForElement) {
        element = await waitForElement(selector, timeout);
      } else {
        element = document.querySelector(selector);
        if (!element) {
          result[key] = { success: false, error: 'Element not found' };
          continue;
        }
      }
      
      // Extract data based on element type
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
        result[key] = element.value;
      } else if (element.hasAttribute('contenteditable')) {
        result[key] = element.textContent || element.innerText;
      } else if (element.hasAttribute('src')) {
        result[key] = element.src;
      } else if (element.hasAttribute('href')) {
        result[key] = element.href;
      } else {
        // Default to text content
        result[key] = element.textContent || element.innerText;
      }
      
      // Trim whitespace by default
      if (options.trim !== false && typeof result[key] === 'string') {
        result[key] = result[key].trim();
      }
      
    } catch (error) {
      console.error(`Error extracting data for selector ${key}:`, error);
      result[key] = { 
        success: false, 
        error: error.message,
        stack: error.stack
      };
    }
  }
  
  return result;
}

// Helper function to load a script dynamically
function loadScript(url) {
  return new Promise((resolve, reject) => {
    if (window.html2canvas) {
      resolve(window.html2canvas);
      return;
    }
    
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve(window.html2canvas);
    script.onerror = (error) => reject(new Error(`Failed to load script: ${url}`));
    
    document.head.appendChild(script);
  });
}

// Initialize the content script
(function init() {
  // Add a data attribute to mark this page as controlled by the extension
  document.documentElement.setAttribute('data-agent-bus-controlled', 'true');
  
  console.log(`Agent Bus content script ${CONTENT_SCRIPT_ID} initialized`);
})();
