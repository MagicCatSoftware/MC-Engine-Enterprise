const express  = require('express');
const router   = express.Router();
const VarStore = require('../models/VarStore');
const User     = require('../models/User');
const { requireLogin } = require('../middleware/auth');

// Public read — no auth required
router.get('/public/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }, '_id');
    if (!user) return res.status(404).json({ error: 'User not found' });
    const store = await VarStore.findOne({ userId: user._id });
    res.json(store ? Object.fromEntries(store.vars) : {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Authenticated: get current user's public vars
router.get('/', requireLogin, async (req, res) => {
  try {
    const store = await VarStore.findOne({ userId: req.user._id });
    res.json(store ? Object.fromEntries(store.vars) : {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Authenticated: set public vars (called on project save)
router.put('/', requireLogin, async (req, res) => {
  try {
    const incoming = req.body || {};
    const sanitized = {};
    for (const [k, v] of Object.entries(incoming)) {
      if (typeof k === 'string' && k.length <= 100) {
        sanitized[k] = String(v ?? '').slice(0, 1000);
      }
    }
    await VarStore.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { vars: new Map(Object.entries(sanitized)) } },
      { upsert: true, new: true }
    );
    res.json({ ok: true, count: Object.keys(sanitized).length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
