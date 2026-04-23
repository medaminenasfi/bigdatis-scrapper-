const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    return log;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'bigdatis-scraper' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'scraper.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 3,
      tailable: true
    }),
    
    // Separate file for scraping activities
    new winston.transports.File({
      filename: path.join(logsDir, 'scraping.log'),
      level: 'info',
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 7,
      tailable: true,
      // Only log scraping-related messages
      filter: (info) => {
        return info.message.includes('scrap') || 
               info.message.includes('page') || 
               info.message.includes('properties') ||
               info.message.includes('offset');
      }
    })
  ],
  
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: fileFormat
    })
  ],
  
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: fileFormat
    })
  ]
});

// Add custom methods for scraping activities
logger.scrapingInfo = (message, meta = {}) => {
  logger.info(message, { ...meta, category: 'scraping' });
};

logger.scrapingError = (message, error = null, meta = {}) => {
  logger.error(message, { 
    ...meta, 
    category: 'scraping',
    error: error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : null
  });
};

logger.apiRequest = (url, method = 'POST', meta = {}) => {
  logger.debug('API Request', {
    url,
    method,
    ...meta,
    category: 'api'
  });
};

logger.apiResponse = (url, status, responseTime, meta = {}) => {
  logger.debug('API Response', {
    url,
    status,
    responseTime: `${responseTime}ms`,
    ...meta,
    category: 'api'
  });
};

logger.databaseAction = (action, collection, count = null, meta = {}) => {
  logger.info('Database Action', {
    action,
    collection,
    count,
    ...meta,
    category: 'database'
  });
};

// Function to create a child logger with additional context
logger.createChild = (context) => {
  return logger.child(context);
};

// Function to log performance metrics
logger.performance = (operation, duration, meta = {}) => {
  logger.info('Performance Metric', {
    operation,
    duration: `${duration}ms`,
    ...meta,
    category: 'performance'
  });
};

// Function to log memory usage
logger.memoryUsage = () => {
  const usage = process.memoryUsage();
  logger.debug('Memory Usage', {
    rss: `${Math.round(usage.rss / 1024 / 1024 * 100) / 100} MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100} MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100} MB`,
    external: `${Math.round(usage.external / 1024 / 1024 * 100) / 100} MB`,
    category: 'system'
  });
};

module.exports = logger;