const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const DbRecord = require('../models/DbRecord');
const { rateLimit } = require('../middleware/rateLimit');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public, unauthenticated — anyone viewing a profile page can send its owner a message.
// Stored as a DbRecord scoped to the owner's account (collection "contactMessages"),
// readable by the owner the same way any other live DB collection is (Live DB panel / GET /api/db/contactMessages while logged in).
const contactLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many messages sent — please try again later.' });

router.post('/:username', contactLimit, async (req, res) => {
  try {
    const owner = await User.findOne({ username: req.params.username.toLowerCase() }, '_id');
    if (!owner) return res.status(404).json({ error: 'Profile not found' });

    const name    = String(req.body.name    || '').trim().slice(0, 100);
    const email   = String(req.body.email   || '').trim().slice(0, 200);
    const message = String(req.body.message || '').trim().slice(0, 4000);

    if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message are required' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });

    await DbRecord.create({ userId: owner._id, collection: 'contactMessages', data: { name, email, message } });
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Something went wrong — please try again.' }); }
});

module.exports = router;
