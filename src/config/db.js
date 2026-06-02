import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error('MONGO_URI environment variable is not defined. Please check your .env file.');
    }

    await mongoose.connect(uri, {
      dbName: process.env.MONGO_DB || 'enviro_master'
    });

    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${process.env.MONGO_DB || 'enviro_master'}`);
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);

    if (process.env.NODE_ENV === 'production') {
      console.error('⚠️  Cannot start server without database in production mode');
      process.exit(1);
    } else {
      console.log('⚠️  Server will continue without MongoDB for testing purposes (development only)');
    }
  }
};

export default connectDB;
