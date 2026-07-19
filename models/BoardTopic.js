const { mongoose } = require('../db/mongoose');

const boardTopicSchema = new mongoose.Schema({
  title:          { type: String, required: true, trim: true, maxlength: 120 },
  authorName:     { type: String, trim: true, maxlength: 40, default: 'Anonymous' },
  postCount:      { type: Number, default: 1 },
  lastActivityAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('BoardTopic', boardTopicSchema);
