const mongoose = require('mongoose');
const s = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  vars:   { type: Map, of: String, default: new Map() },
}, { timestamps: true });
module.exports = mongoose.model('VarStore', s);
