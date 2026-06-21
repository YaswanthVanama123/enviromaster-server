import dotenv from 'dotenv';
import app from './app.js';
import connectDB from './config/db.js';
import { cleanupTemporaryArtifacts } from './utils/tmpCleanup.js';
import logger from './utils/logger.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

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
