import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error('MONGO_URI environment variable is not defined. Please check your .env file.');
    }

    await mongoose.connect(uri, {
      dbName: process.env.MONGO_DB || 'enviro_master',
      maxPoolSize: Number(process.env.MONGO_MAX_POOL) || 100,
      minPoolSize: Number(process.env.MONGO_MIN_POOL) || 10,
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
      maxIdleTimeMS: Number(process.env.MONGO_MAX_IDLE_TIME_MS) || 60000,
    });

    logger.info(`MongoDB connected (database: ${process.env.MONGO_DB || 'enviro_master'})`);
    return true;
  } catch (err) {
    logger.error('MongoDB connection failed:', err.message);

    if (process.env.NODE_ENV === 'production') {
      logger.error('Cannot start server without database in production mode');
      process.exit(1);
    } else {
      logger.warn('Server will continue without MongoDB for testing purposes (development only)');
    }
    return false;
  }
};

export default connectDB;
