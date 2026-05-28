const express = require('express');
const router  = express.Router();
const Project = require('../models/Project');
const { requireLogin, requireSubscription } = require('../middleware/auth');

router.use(requireLogin, requireSubscription);

router.get('/', async (req, res) => {
  const projects = await Project.find(
    { userId: req.user._id },
    'name isProfile public createdAt updatedAt'
  ).sort('-updatedAt');

  res.json(projects.map(p => ({
    id:         p._id,
    name:       p.name,
    isProfile:  p.isProfile,
    public:     p.public,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  })));
});

router.get('/:id', async (req, res) => {
  const p = await Project.findOne({ _id: req.params.id, userId: req.user._id });
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ id: p._id, name: p.name, data: p.data, isProfile: p.isProfile, public: p.public });
});

router.post('/', async (req, res) => {
  const { name, data } = req.body;
  if (!name || !data) return res.status(400).json({ error: 'name and data required' });
  const p = await Project.create({ userId: req.user._id, name, data });
  res.status(201).json({ id: p._id, name: p.name, created_at: p.createdAt, updated_at: p.updatedAt });
});

router.put('/:id', async (req, res) => {
  const { name, data, public: pub, isProfile } = req.body;
  const update = {};
  if (name !== undefined)      update.name      = name;
  if (data !== undefined)      update.data      = data;
  if (pub  !== undefined)      update.public    = pub;
  if (isProfile !== undefined) update.isProfile = isProfile;

  const p = await Project.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    update,
    { new: true }
  );
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ id: p._id, name: p.name, updated_at: p.updatedAt });
});

router.delete('/:id', async (req, res) => {
  const p = await Project.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
