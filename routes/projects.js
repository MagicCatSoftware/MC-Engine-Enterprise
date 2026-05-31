const express  = require('express');
const router   = express.Router();
const Project  = require('../models/Project');
const VarStore = require('../models/VarStore');
const { requireLogin, requireSubscription } = require('../middleware/auth');

async function syncPublicVars(userId, vars) {
  if (!vars || typeof vars !== 'object') return;
  const setOps = {};
  for (const [k, v] of Object.entries(vars)) {
    if (v && typeof v === 'object' && v.public) {
      setOps[`vars.${k}`] = String(v.value ?? '');
    }
  }
  if (Object.keys(setOps).length === 0) return;
  await VarStore.findOneAndUpdate({ userId }, { $set: setOps }, { upsert: true });
}

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
  syncPublicVars(req.user._id, data.vars).catch(() => {});
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
  if (data && data.vars) syncPublicVars(req.user._id, data.vars).catch(() => {});
  res.json({ id: p._id, name: p.name, updated_at: p.updatedAt });
});

router.delete('/:id', async (req, res) => {
  const p = await Project.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Publish current engine state directly as the live profile (upsert)
router.post('/publish', async (req, res) => {
  const { data, name } = req.body;
  if (!data) return res.status(400).json({ error: 'data required' });

  let profile = await Project.findOne({ userId: req.user._id, isProfile: true });
  if (profile) {
    profile.data = data;
    if (name) profile.name = name;
    await profile.save();
  } else {
    profile = await Project.create({
      userId: req.user._id,
      name:   name || 'My Profile',
      data,
      isProfile: true,
    });
  }

  syncPublicVars(req.user._id, data.vars).catch(() => {});
  res.json({ ok: true, id: profile._id, url: req.user.username ? '/' + req.user.username : null });
});

module.exports = router;
