const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const Project = require('../models/Project');
const { requireLogin, requireSubscription } = require('../middleware/auth');

const RESERVED = new Set(['api', 'auth', 'stripe', 'admin', 'static', 'public', 'health']);
const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

// Claim a username (requires active subscription)
router.post('/claim', requireLogin, requireSubscription, async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });

  const slug = username.toLowerCase().trim();
  if (!USERNAME_RE.test(slug))
    return res.status(400).json({ error: 'Username must be 3-30 chars, start with a letter or number, and contain only letters, numbers, _ or -' });
  if (RESERVED.has(slug))
    return res.status(400).json({ error: 'That username is reserved' });
  if (req.user.username)
    return res.status(400).json({ error: 'You already have a username: ' + req.user.username });

  try {
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { username: slug },
      { new: true }
    );
    res.json({ username: updated.username });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'That username is already taken' });
    throw e;
  }
});

// Check username availability
router.get('/check/:username', async (req, res) => {
  const slug = req.params.username.toLowerCase();
  if (!USERNAME_RE.test(slug) || RESERVED.has(slug)) return res.json({ available: false });
  const taken = await User.exists({ username: slug });
  res.json({ available: !taken });
});

// Get public profile data by username
router.get('/:username', async (req, res) => {
  const user = await User.findOne({ username: req.params.username.toLowerCase() }, 'username name picture');
  if (!user) return res.status(404).json({ error: 'Profile not found' });
  const profile = await Project.findOne({ userId: user._id, isProfile: true }, 'data name updatedAt');
  res.json({
    username:    user.username,
    name:        user.name,
    picture:     user.picture,
    profileData: profile ? profile.data : null,
    updatedAt:   profile ? profile.updatedAt : null,
  });
});

module.exports = router;
