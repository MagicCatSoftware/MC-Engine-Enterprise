const express          = require('express');
const router           = express.Router();
const User             = require('../models/User');
const ReservedUsername = require('../models/ReservedUsername');
const { requireLogin, isAdmin } = require('../middleware/auth');

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.use(requireLogin, requireAdmin);

function serializeUser(u) {
  return {
    id:                    u._id,
    email:                 u.email,
    name:                  u.name,
    username:              u.username,
    subscriptionStatus:    u.subscriptionStatus,
    subscriptionPeriodEnd: u.subscriptionPeriodEnd,
    isPermanent:           u.isPermanent,
    manualPaid:            u.manualPaid,
    isAdmin:               isAdmin(u),
    createdAt:             u.createdAt,
  };
}

// List / search users
router.get('/users', async (req, res) => {
  const { q } = req.query;
  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

  const filter = q
    ? { $or: [
        { email:    new RegExp(q, 'i') },
        { username: new RegExp(q, 'i') },
        { name:     new RegExp(q, 'i') },
      ] }
    : {};

  const [users, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({ users: users.map(serializeUser), total, page, limit });
});

// Grant/revoke permanent access (bypasses subscription requirement entirely)
router.post('/users/:id/permanent', async (req, res) => {
  const { value } = req.body;
  const user = await User.findByIdAndUpdate(req.params.id, { isPermanent: !!value }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(serializeUser(user));
});

// Grant/revoke manually-marked-paid access (independent of Stripe)
router.post('/users/:id/paid', async (req, res) => {
  const { value } = req.body;
  const user = await User.findByIdAndUpdate(req.params.id, { manualPaid: !!value }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(serializeUser(user));
});

// Force-set or clear a user's username (admin bypass — no subscription check)
router.post('/users/:id/username', async (req, res) => {
  const raw = (req.body.username || '').toLowerCase().trim();

  if (!raw) {
    const user = await User.findByIdAndUpdate(req.params.id, { $unset: { username: 1 } }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(serializeUser(user));
  }

  if (!USERNAME_RE.test(raw))
    return res.status(400).json({ error: 'Username must be 3-30 chars, start with a letter or number, and contain only letters, numbers, _ or -' });

  try {
    const user = await User.findByIdAndUpdate(req.params.id, { username: raw }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(serializeUser(user));
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'That username is already taken' });
    throw e;
  }
});

// List reserved (unowned) usernames
router.get('/reserved', async (req, res) => {
  const list = await ReservedUsername.find().sort('-createdAt');
  res.json(list.map(r => ({ username: r.username, reason: r.reason, reservedBy: r.reservedBy, createdAt: r.createdAt })));
});

// Reserve a username with no owner, blocking it from public claim
router.post('/reserved', async (req, res) => {
  const slug = (req.body.username || '').toLowerCase().trim();
  if (!USERNAME_RE.test(slug))
    return res.status(400).json({ error: 'Username must be 3-30 chars, start with a letter or number, and contain only letters, numbers, _ or -' });
  if (await User.exists({ username: slug }))
    return res.status(409).json({ error: 'That username is already claimed by a user' });

  try {
    const r = await ReservedUsername.create({ username: slug, reason: req.body.reason || '', reservedBy: req.user.email });
    res.status(201).json({ username: r.username, reason: r.reason, reservedBy: r.reservedBy, createdAt: r.createdAt });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Already reserved' });
    throw e;
  }
});

// Release a reserved username
router.delete('/reserved/:username', async (req, res) => {
  await ReservedUsername.deleteOne({ username: req.params.username.toLowerCase() });
  res.json({ ok: true });
});

module.exports = router;
