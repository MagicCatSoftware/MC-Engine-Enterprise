const express   = require('express');
const router    = express.Router();
const DbRecord  = require('../models/DbRecord');
const User      = require('../models/User');
const { requireLogin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

function fmt(r) {
  return Object.assign({ _id: r._id, _createdAt: r.createdAt, _updatedAt: r.updatedAt }, r.data);
}

// Public, unauthenticated reads — keyed by IP since there's no logged-in user to key on
const publicReadLimit = rateLimit({ windowMs: 60_000, max: 60, message: 'Too many requests — please slow down.' });
// Authenticated reads/writes — keyed by user id so one account can't starve others sharing an IP
const userReadLimit  = rateLimit({ windowMs: 60_000, max: 120, keyFn: req => 'u:' + req.user._id });
const userWriteLimit = rateLimit({ windowMs: 60_000, max: 30,  keyFn: req => 'u:' + req.user._id });

// Public read-only — no auth required, GET only
router.get('/public/:username/:collection', publicReadLimit, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }, '_id');
    if (!user) return res.status(404).json({ error: 'User not found' });
    let records = await DbRecord.find(
      { userId: user._id, collection: req.params.collection },
    ).sort('createdAt');
    const q = req.query.q;
    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      records = records.filter(r => Object.values(r.data || {}).some(v => String(v).toLowerCase().includes(term)));
    }
    res.json(records.map(fmt));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// All routes below require login
router.use(requireLogin);

// List all collection names for the current user
router.get('/', userReadLimit, async (req, res) => {
  try {
    const collections = await DbRecord.distinct('collection', { userId: req.user._id });
    res.json(collections.sort());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// List records in a collection
router.get('/:collection', userReadLimit, async (req, res) => {
  try {
    let records = await DbRecord.find({ userId: req.user._id, collection: req.params.collection }).sort('createdAt');
    const q = req.query.q;
    if (q && q.trim()) {
      const term = q.trim().toLowerCase();
      records = records.filter(r => Object.values(r.data || {}).some(v => String(v).toLowerCase().includes(term)));
    }
    res.json(records.map(fmt));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Create a record (always inserts new)
router.post('/:collection', userWriteLimit, async (req, res) => {
  try {
    const r = await DbRecord.create({ userId: req.user._id, collection: req.params.collection, data: req.body || {} });
    res.status(201).json(fmt(r));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Upsert singleton — update the one document in the collection, or create it if none exists
router.patch('/:collection', userWriteLimit, async (req, res) => {
  try {
    const r = await DbRecord.findOneAndUpdate(
      { userId: req.user._id, collection: req.params.collection },
      { $set: { data: req.body || {} } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(fmt(r));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get a single record
router.get('/:collection/:id', userReadLimit, async (req, res) => {
  try {
    const r = await DbRecord.findOne({ _id: req.params.id, userId: req.user._id, collection: req.params.collection });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(fmt(r));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Update a record
router.put('/:collection/:id', userWriteLimit, async (req, res) => {
  try {
    const r = await DbRecord.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, collection: req.params.collection },
      { $set: { data: req.body || {} } },
      { new: true }
    );
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(fmt(r));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete a single record
router.delete('/:collection/:id', userWriteLimit, async (req, res) => {
  try {
    const r = await DbRecord.findOneAndDelete({ _id: req.params.id, userId: req.user._id, collection: req.params.collection });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Drop an entire collection (delete all records in it)
router.delete('/:collection', userWriteLimit, async (req, res) => {
  try {
    const result = await DbRecord.deleteMany({ userId: req.user._id, collection: req.params.collection });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
