const { PublicClientApplication } = require('@azure/msal-node');
const fs = require('fs').promises;
const path = require('path');

const TOKEN_CACHE_PATH = path.join(__dirname, '.token-cache.json');

// Configuration - Replace these with your Azure AD app details
const config = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID || 'YOUR_CLIENT_ID',
    authority: 'https://login.microsoftonline.com/common',
  },
  system: {
    loggerOptions: {
      loggerCallback: () => {},
      piiLoggingEnabled: false,
    }
  }
};

const msalClient = new PublicClientApplication(config);

async function getTokenFromCache() {
  try {
    const cache = await fs.readFile(TOKEN_CACHE_PATH, 'utf8');
    const { account, token } = JSON.parse(cache);
    return { account, token };
  } catch (error) {
    return { account: null, token: null };
  }
}

async function saveTokenToCache(account, token) {
  await fs.writeFile(
    TOKEN_CACHE_PATH,
    JSON.stringify({ account, token }, null, 2),
    'utf8'
  );
}

async function getToken() {
  // Try to get token from cache
  const { account, token } = await getTokenFromCache();
  
  if (token) {
    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (token.expiresOn > now) {
      return token.accessToken;
    }
    
    // TODO: Implement token refresh if needed
  }
  
  return null;
}

async function initiateDeviceCodeLogin() {
  const deviceCodeRequest = {
    deviceCodeCallback: (response) => {
      console.log(response.message);
    },
    scopes: ['Mail.Send'],
  };

  try {
    const response = await msalClient.acquireTokenByDeviceCode(deviceCodeRequest);
    await saveTokenToCache(response.account, {
      accessToken: response.accessToken,
      expiresOn: response.expiresOn.getTime() / 1000,
    });
    return { accessToken: response.accessToken };
  } catch (error) {
    console.error('Error during device code flow:', error);
    throw error;
  }
}

module.exports = {
  getToken,
  initiateDeviceCodeLogin,
};
