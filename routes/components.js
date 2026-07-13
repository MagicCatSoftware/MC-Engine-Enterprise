const express  = require('express');
const router   = express.Router();
const DbRecord = require('../models/DbRecord');
const { requireLogin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const writeLimit = rateLimit({ windowMs: 60_000, max: 30, keyFn: req => 'u:' + req.user._id });

router.use(requireLogin);

// List all saved components for the current user
router.get('/', async (req, res) => {
  try {
    const records = await DbRecord.find({ userId: req.user._id, collection: '_components' }).sort('-createdAt');
    res.json(records.map(r => ({ id: r._id, name: r.data.name || 'Component', description: r.data.description || '', data: r.data.data, createdAt: r.createdAt })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Save a new component (body: { name, description, data: { machines, events, pipes } })
router.post('/', writeLimit, async (req, res) => {
  try {
    const { name, description, data } = req.body || {};
    if (!name || !data || !data.machines) return res.status(400).json({ error: 'name and data.machines required' });
    const r = await DbRecord.create({ userId: req.user._id, collection: '_components', data: { name, description: description || '', data } });
    res.status(201).json({ id: r._id, name, description: description || '', data, createdAt: r.createdAt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete a component
router.delete('/:id', writeLimit, async (req, res) => {
  try {
    const r = await DbRecord.findOneAndDelete({ _id: req.params.id, userId: req.user._id, collection: '_components' });
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
