import 'dotenv/config';
import {createClient} from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('ready', () => {
  console.log('Redis client is ready');
});

redisClient.on('end', () => {
  console.log('Redis connection ended');
});

redisClient.on('reconnecting', () => {
  console.log('Redis reconnecting...');
});

// Connect to Redis
const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('Redis connection established');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    throw error;
  }
};

// Initialize connection
connectRedis().catch(console.error);

// Helper function to ensure Redis is connected
const ensureConnection = async () => {
  if (!redisClient.isReady) {
    console.log('Redis not ready, attempting to connect...');
    try {
      await redisClient.connect();
      console.log('Redis connection established');
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }
  return redisClient;
};

export {redisClient, ensureConnection}
