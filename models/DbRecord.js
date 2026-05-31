const mongoose = require('mongoose');
const s = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  collection: { type: String, required: true },
  data:       { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });
s.index({ userId: 1, collection: 1 });
module.exports = mongoose.model('DbRecord', s);
