// queue.js
const Queue = require('bull');
const redisConfig = {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
};

// Buat queue untuk top-up
const topUpQueue = new Queue('topUpQueue', redisConfig);

module.exports = topUpQueue;