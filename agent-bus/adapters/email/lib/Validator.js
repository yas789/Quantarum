/**
 * Input validation utilities for email operations
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
  
  static validateEmailList(emails) {
    if (!Array.isArray(emails)) {
      emails = [emails];
    }
    
    for (const email of emails) {
      this.validateEmail(email);
    }
    
    return emails;
  }
  
  static validateProvider(provider) {
    const validProviders = ['gmail', 'outlook'];
    if (provider && !validProviders.includes(provider)) {
      const Response = require('./Response');
      Response.error(12, 'UNSUPPORTED_PROVIDER', { 
        provider, 
        supported: validProviders 
      });
    }
  }
}

module.exports = Validator;