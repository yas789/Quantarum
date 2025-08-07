// Native host name - must match the native messaging host manifest
const NATIVE_HOST = 'com.agentbus.webautomation';

// Keep track of the native port
let nativePort = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 1000; // 1 second

// Connect to the native messaging host
function connectToNativeHost() {
  try {
    console.log('Connecting to native host...');
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);
    reconnectAttempts = 0;
    
    // Set up message listener
    nativePort.onMessage.addListener((message) => {
      console.log('Received message from native host:', message);
      // Forward messages to the content script
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'FROM_NATIVE_HOST',
            payload: message
          });
        }
      });
    });
    
    // Handle disconnection
    nativePort.onDisconnect.addListener(() => {
      console.log('Disconnected from native host');
      nativePort = null;
      
      // Attempt to reconnect
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        setTimeout(connectToNativeHost, RECONNECT_DELAY);
      } else {
        console.error('Max reconnection attempts reached');
      }
    });
    
    console.log('Connected to native host');
  } catch (error) {
    console.error('Error connecting to native host:', error);
    nativePort = null;
  }
}

// Initialize connection when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated, connecting to native host...');
  connectToNativeHost();
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!nativePort) {
    console.error('No connection to native host');
    sendResponse({
      error: 'No connection to native host. Please ensure the Agent Bus service is running.'
    });
    return false;
  }
  
  try {
    // Forward messages to the native host
    nativePort.postMessage({
      tabId: sender.tab?.id,
      url: sender.tab?.url,
      ...request
    });
    
    // Set up a one-time listener for the response
    const handleResponse = (message) => {
      if (message.requestId === request.requestId) {
        chrome.runtime.onMessage.removeListener(handleResponse);
        sendResponse(message);
      }
    };
    
    chrome.runtime.onMessage.addListener(handleResponse);
    
    // Return true to indicate we'll send a response asynchronously
    return true;
  } catch (error) {
    console.error('Error sending message to native host:', error);
    sendResponse({
      error: 'Failed to send message to native host',
      details: error.message
    });
    return false;
  }
});

// Keep the service worker alive
function keepAlive() {
  setInterval(chrome.runtime.getPlatformInfo, 30000);
}

// Start the keep-alive mechanism
keepAlive();
