/**
 * Response utility for consistent output formatting
 */
class Response {
  static success(data) {
    console.log(JSON.stringify({ ok: true, data }));
    process.exit(0);
  }
  
  static error(code, message, details = null) {
    const response = { ok: false, code, msg: message };
    if (details) response.details = details;
    
    console.error(JSON.stringify(response));
    process.exit(1);
  }
}

module.exports = Response;