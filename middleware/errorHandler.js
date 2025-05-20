const logger = require('../utils/logger');

// Simple error handling middleware
const errorHandler = (err, req, res, next) => {
  logger.error('An error occurred:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined, // Include stack in development
  });
};

module.exports = errorHandler;
