const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { requireLogin } = require('../middleware/auth');

const router     = express.Router();
const MEDIA_ROOT = path.join(__dirname, '..', 'public', 'media');

const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/gif','image/webp','image/svg+xml','image/avif',
  'video/mp4','video/webm','video/ogg','video/quicktime',
  'audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/webm','audio/aac',
]);

function typeFromExt(ext) {
  const e = ext.replace('.', '').toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg','avif'].includes(e)) return 'image';
  if (['mp4','webm','ogv','mov'].includes(e))                      return 'video';
  if (['mp3','ogg','wav','m4a','aac'].includes(e))                 return 'audio';
  return 'file';
}

function userDir(userId) {
  const dir = path.join(MEDIA_ROOT, String(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try { cb(null, userDir(req.user._id)); } catch (e) { cb(e); }
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-z0-9._\-]/gi, '_').slice(0, 80);
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME.has(file.mimetype)),
});

// List files
router.get('/', requireLogin, (req, res) => {
  const dir = userDir(req.user._id);
  try {
    const files = fs.readdirSync(dir)
      .filter(n => !n.startsWith('.'))
      .map(name => {
        const fp   = path.join(dir, name);
        const stat = fs.statSync(fp);
        return {
          name,
          size:      stat.size,
          url:       `/media/${req.user._id}/${encodeURIComponent(name)}`,
          type:      typeFromExt(path.extname(name)),
          createdAt: stat.birthtimeMs,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
    res.json(files);
  } catch (e) { res.json([]); }
});

// Upload (up to 20 files per request)
router.post('/upload', requireLogin, upload.array('files', 20), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
  res.json({
    uploaded: req.files.map(f => ({
      name: f.filename,
      size: f.size,
      url:  `/media/${req.user._id}/${encodeURIComponent(f.filename)}`,
      type: typeFromExt(path.extname(f.filename)),
    })),
  });
});

// Delete a file
router.delete('/:filename', requireLogin, (req, res) => {
  const name = path.basename(decodeURIComponent(req.params.filename));
  const fp   = path.join(userDir(req.user._id), name);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(fp);
  res.json({ ok: true });
});

module.exports = router;
