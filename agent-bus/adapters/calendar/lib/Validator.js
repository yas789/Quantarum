/**
 * Input validation utilities for calendar operations
 */
class Validator {
  static requireArgs(args, required) {
    const missing = required.filter(key => args[key] === undefined);
    if (missing.length > 0) {
      const Response = require('./Response');
      Response.error(10, 'MISSING_ARGUMENTS', { missing });
    }
  }
  
  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      const Response = require('./Response');
      Response.error(11, 'INVALID_EMAIL', { email });
    }
  }
  
  static validateDate(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      const Response = require('./Response');
      Response.error(12, 'INVALID_DATE', { date: dateStr });
    }
    return date;
  }
  
  static validateProvider(provider) {
    const validProviders = ['google', 'outlook'];
    if (provider && !validProviders.includes(provider)) {
      const Response = require('./Response');
      Response.error(13, 'UNSUPPORTED_PROVIDER', { 
        provider, 
        supported: validProviders 
      });
    }
  }
}

module.exports = Validator;