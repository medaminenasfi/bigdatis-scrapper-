const mongoose = require('mongoose');
const logger = require('./logger');

// Disable buffering to prevent silent failures
mongoose.set('bufferCommands', false);

async function connectMongoDB() {
  if (!process.env.MONGODB_URI) {
    logger.warn('MONGODB_URI not set - skipping database connection');
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      bufferTimeoutMS: 120000
    });
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    throw error;
  }
}

async function disconnectMongoDB() {
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error(`MongoDB disconnection error: ${error.message}`);
    throw error;
  }
}

module.exports = { connectMongoDB, disconnectMongoDB };