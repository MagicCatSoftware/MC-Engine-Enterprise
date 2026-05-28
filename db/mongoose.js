const mongoose = require('mongoose');

let connected = false;

async function connect() {
  if (connected) return;
  await mongoose.connect(process.env.MONGODB_URI);
  connected = true;
  console.log('[mongodb] connected');
}

module.exports = { connect, mongoose };
