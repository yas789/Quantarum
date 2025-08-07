const winston = require('winston');
const path = require('path');
const config = require('./config');

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, 'logs');
require('fs').mkdirSync(logDir, { recursive: true });

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  defaultMeta: { service: 'agent-bus' },
  transports: [
    // Write all logs with level `debug` and below to `combined.log`
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      level: 'debug',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
      zippedArchive: true
    }),
    // Write all logs with level `error` and below to `error.log`
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
      zippedArchive: true
    })
  ]
});

// If we're not in production, also log to console
if (config.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    level: 'debug'
  }));
}

// Log broker events
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Log function for API requests
function logRequest(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('request', {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      callerId: req.get('x-caller-id') || 'unknown'
    });
  });
  
  next();
}

// Log function for tool invocations
function logInvocation(tool, verb, args, result, error = null, callerId = 'unknown') {
  const logEntry = {
    timestamp: new Date().toISOString(),
    caller_id: callerId,
    tool,
    verb,
    args_hash: hashObject(args),
    code: error ? error.code || 50 : 0,
    ms: result?.duration || 0,
    success: !error,
    error: error ? error.message : undefined
  };
  
  logger.info('invocation', logEntry);
  
  // Also write to the bus log file
  fs.appendFileSync(
    path.join(logDir, 'bus.log'),
    JSON.stringify(logEntry) + '\n',
    { flag: 'a' }
  );
}

// Helper function to create a hash of an object
function hashObject(obj) {
  const str = JSON.stringify(obj);
  let hash = 0;
  
  if (str.length === 0) return hash;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return hash.toString(16);
}

module.exports = {
  logger,
  logRequest,
  logInvocation
};
