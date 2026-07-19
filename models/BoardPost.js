const { mongoose } = require('../db/mongoose');

const boardPostSchema = new mongoose.Schema({
  topicId:    { type: mongoose.Schema.Types.ObjectId, ref: 'BoardTopic', required: true, index: true },
  authorName: { type: String, trim: true, maxlength: 40, default: 'Anonymous' },
  body:       { type: String, required: true, trim: true, maxlength: 2000 },
}, { timestamps: true });

module.exports = mongoose.model('BoardPost', boardPostSchema);
