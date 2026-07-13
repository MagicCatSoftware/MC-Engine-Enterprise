const { mongoose } = require('../db/mongoose');

const reservedUsernameSchema = new mongoose.Schema({
  username:   { type: String, required: true, unique: true, lowercase: true, trim: true },
  reason:     String,
  reservedBy: String,
}, { timestamps: true });

module.exports = mongoose.model('ReservedUsername', reservedUsernameSchema);
