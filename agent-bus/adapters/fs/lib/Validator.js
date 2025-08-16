/**
 * Input validation utilities
 */
class Validator {
  static requireArgs(args, required) {
    const missing = required.filter(key => args[key] === undefined);
    if (missing.length > 0) {
      const Response = require('./Response');
      Response.error(10, 'MISSING_ARGUMENTS', { missing });
    }
  }
  
  static validatePath(filePath) {
    if (!filePath || typeof filePath !== 'string') {
      const Response = require('./Response');
      Response.error(11, 'INVALID_PATH', { path: filePath });
    }
  }
  
  static validateEncoding(encoding) {
    const validEncodings = ['utf8', 'ascii', 'binary', 'base64', 'hex'];
    if (encoding && !validEncodings.includes(encoding)) {
      const Response = require('./Response');
      Response.error(12, 'INVALID_ENCODING', { encoding, valid: validEncodings });
    }
  }
}

module.exports = Validator;