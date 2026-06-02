import dotenv from 'dotenv';
import mongoose from 'mongoose';
import app from './app.js';
import connectDB from './config/db.js';
import { cleanupTemporaryArtifacts } from './utils/tmpCleanup.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    const dbConnected = await connectDB();
    if (dbConnected) {
      console.log('✅ Database connection successful');
      // Initialize job status (mark any interrupted jobs as failed)
      try {
        const { initializeJobStatus } = await import('./controllers/mapDistanceController.js');
        await initializeJobStatus();
      } catch (initErr) {
        console.warn('⚠️ Could not initialize map distance job status:', initErr.message);
      }
    } else {
      console.log('⚠️ Running without database - some features may not work');
    }

    await cleanupTemporaryArtifacts({ purgeAll: true });
    app.listen(PORT, () =>
      console.log(`🚀 API listening on http://localhost:${PORT}`)
    );
  } catch (err) {
    console.error('❌ Server start error:', err);
    process.exit(1);
  }
})();
