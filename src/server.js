import dotenv from 'dotenv';
import app from './app.js';
import connectDB from './config/db.js';
import { cleanupTemporaryArtifacts } from './utils/tmpCleanup.js';
import logger from './utils/logger.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Global safety net: a background job (e.g. the Bigin Playwright scrapers) can
// throw or reject outside a request handler. Without these, Node's default
// behaviour terminates the process. Log and keep the server alive instead.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection (kept server alive):', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception (kept server alive):', err);
});

(async () => {
  try {
    const dbConnected = await connectDB();
    if (dbConnected) {
      logger.info('Database connection successful');
      try {
        const { initializeJobStatus } = await import('./controllers/mapDistanceController.js');
        await initializeJobStatus();
      } catch (initErr) {
        logger.warn('Could not initialize map distance job status:', initErr.message);
      }
    } else {
      logger.warn('Running without database - some features may not work');
    }

    await cleanupTemporaryArtifacts({ purgeAll: true });
    app.listen(PORT, () =>
      logger.info(`API listening on port ${PORT} (log level: ${logger.level()}, env: ${process.env.NODE_ENV || 'development'})`)
    );
  } catch (err) {
    logger.error('Server start error:', err);
    process.exit(1);
  }
})();
