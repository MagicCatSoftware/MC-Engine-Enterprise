const { mongoose } = require('../db/mongoose');

const userSchema = new mongoose.Schema({
  googleId:             { type: String, required: true, unique: true },
  email:                { type: String, required: true },
  name:                 String,
  picture:              String,
  username:             { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  stripeCustomerId:         String,
  stripeSubscriptionId:     String,
  subscriptionStatus:       { type: String, default: 'inactive' },
  subscriptionPeriodEnd:    Date,
  isPermanent:              { type: Boolean, default: false },
  manualPaid:               { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
