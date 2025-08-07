// Environment configuration
require('dotenv').config();

module.exports = {
  // Server configuration
  PORT: process.env.PORT || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Security
  TRUST_PROXY: process.env.TRUST_PROXY || false,
  
  // Rate limiting (requests per minute per IP)
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX: 100, // 100 requests per minute
  
  // Tool configuration
  TOOLPACK_TTL: 5 * 60 * 1000, // 5 minutes
  
  // Trust tiers
  TRUST_TIERS: {
    A: 'API-based (most secure)',
    B: 'Web DOM automation',
    C: 'Local automation (AppleScript/Accessibility)'
  }
};
