#!/usr/bin/env node
// Server entrypoint that uses the newer Broker from app.js
const broker = require('./app');
const config = require('./config');
const { logger } = require('./logger');

(async () => {
  try {
    await broker.start(config.PORT);

    const shutdown = async (signal) => {
      try {
        logger.info(`Received ${signal}, shutting down broker`);
        await broker.stop();
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { error: err.message });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('unhandledRejection', (reason, p) => {
      logger.error('Unhandled Rejection', { reason, promise: p });
    });
  } catch (err) {
    logger.error('Failed to start broker', { error: err.message });
    process.exit(1);
  }
})();

