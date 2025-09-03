import 'dotenv/config';
import { createClient } from 'redis';

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

const testRedis = async () => {
  try {
    console.log('Testing Redis connection...');
    console.log('Redis URL:', process.env.REDIS_URL || 'redis://localhost:6379');
    
    await redisClient.connect();
    console.log('Redis connection established');
    
    // Test basic operations
    const testKey = 'test:connection';
    const testValue = 'test-value';
    
    console.log('Setting test key...');
    await redisClient.set(testKey, testValue);
    console.log('Test key set successfully');
    
    console.log('Getting test key...');
    const retrievedValue = await redisClient.get(testKey);
    console.log('Retrieved value:', retrievedValue);
    
    if (retrievedValue === testValue) {
      console.log('✅ Redis test passed!');
    } else {
      console.log('❌ Redis test failed!');
    }
    
    // Clean up
    await redisClient.del(testKey);
    console.log('Test key cleaned up');
    
  } catch (error) {
    console.error('Redis test failed:', error);
  } finally {
    await redisClient.quit();
    console.log('Redis connection closed');
  }
};

testRedis();
