const { mongoose } = require('../db/mongoose');

const projectSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name:      { type: String, required: true },
  data:      mongoose.Schema.Types.Mixed,
  isProfile: { type: Boolean, default: false },
  public:    { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
