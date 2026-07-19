const express     = require('express');
const router       = express.Router();
const BoardTopic   = require('../models/BoardTopic');
const BoardPost    = require('../models/BoardPost');
const { rateLimit } = require('../middleware/rateLimit');

// Public, unauthenticated board — anyone can start a topic or reply. Escape all
// user-controlled fields on the way out: the engine's loop templates interpolate
// {{field}} tokens straight into innerHTML with no escaping of their own (that's
// fine for trusted, self-authored seed data, but this board renders arbitrary
// visitor input to other visitors, so it has to be pre-escaped at this boundary).
const esc = s => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escTopic = t => ({
  _id: String(t._id),
  title: esc(t.title),
  authorName: esc(t.authorName),
  postCount: t.postCount,
  lastActivityAt: t.lastActivityAt,
  createdAt: t.createdAt,
});

const escPost = p => ({
  _id: String(p._id),
  topicId: String(p.topicId),
  authorName: esc(p.authorName),
  body: esc(p.body),
  createdAt: p.createdAt,
});

const createLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 5,  message: 'Too many topics created — please slow down.' });
const replyLimit  = rateLimit({ windowMs: 10 * 60 * 1000, max: 15, message: 'Too many replies — please slow down.' });

// List topics, most recently active first
router.get('/topics', async (req, res) => {
  const topics = await BoardTopic.find({}).sort('-lastActivityAt').limit(50);
  res.json(topics.map(escTopic));
});

// Create a topic — { title, body, authorName }, body becomes the first post
router.post('/topics', createLimit, async (req, res) => {
  const title      = String(req.body.title || '').trim().slice(0, 120);
  const body       = String(req.body.body  || '').trim().slice(0, 2000);
  const authorName = String(req.body.authorName || '').trim().slice(0, 40) || 'Anonymous';
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (!body)  return res.status(400).json({ error: 'Message is required' });

  const topic = await BoardTopic.create({ title, authorName, postCount: 1, lastActivityAt: new Date() });
  await BoardPost.create({ topicId: topic._id, authorName, body });
  res.status(201).json(escTopic(topic));
});

// Get a single topic (used to render the topic view's heading)
router.get('/topics/:id', async (req, res) => {
  const topic = await BoardTopic.findById(req.params.id).catch(() => null);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  res.json(escTopic(topic));
});

// List posts for a topic, oldest first
router.get('/topics/:id/posts', async (req, res) => {
  const posts = await BoardPost.find({ topicId: req.params.id }).sort('createdAt').limit(300).catch(() => []);
  res.json(posts.map(escPost));
});

// Reply to a topic — { body, authorName }
router.post('/topics/:id/posts', replyLimit, async (req, res) => {
  const topic = await BoardTopic.findById(req.params.id).catch(() => null);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  const body       = String(req.body.body || '').trim().slice(0, 2000);
  const authorName = String(req.body.authorName || '').trim().slice(0, 40) || 'Anonymous';
  if (!body) return res.status(400).json({ error: 'Message is required' });

  const post = await BoardPost.create({ topicId: topic._id, authorName, body });
  topic.postCount = (topic.postCount || 0) + 1;
  topic.lastActivityAt = new Date();
  await topic.save();
  res.status(201).json(escPost(post));
});

module.exports = router;
