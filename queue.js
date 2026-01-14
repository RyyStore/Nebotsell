// queue.js
const Queue = require('bull');

const topUpQueue = new Queue('topUpQueue', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null, // Tambahkan ini agar tidak error limit retry
    enableReadyCheck: false     // Tambahkan ini agar lebih stabil di VPS
  },
});

module.exports = topUpQueue;