require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const cors       = require('cors');
const session    = require('express-session');
const { MongoStore } = require('connect-mongo');
const passport   = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

const db              = require('./db');
const { connect: connectMongo, mongoose } = require('./db/mongoose');
const User            = require('./models/User');
const Project         = require('./models/Project');
const VarStore        = require('./models/VarStore');
const { handleWebhook } = require('./routes/stripe');
const EXAMPLES        = require('./data/examples');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme';
const PORT      = process.env.PORT || 3000;
const BASE_URL  = process.env.BASE_URL || `http://localhost:${PORT}`;

// ── Stripe webhook (raw body, BEFORE json middleware) ──────────────────────────
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// ── Public file storage (served before auth middleware) ───────────────────────
fs.mkdirSync(path.join(__dirname, 'public', 'media'), { recursive: true });
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

// ── Core middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'changeme-session',
  resave:            false,
  saveUninitialized: false,
  store:             MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie:            { maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' },
}));

// ── Passport / Google OAuth ────────────────────────────────────────────────────
passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  BASE_URL + '/auth/google/callback',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          email:    profile.emails[0].value,
          name:     profile.displayName,
          picture:  profile.photos?.[0]?.value,
        });
        await Project.create({ userId: user._id, name: 'My Profile', data: null, isProfile: true });
      }
      done(null, user);
    } catch (e) {
      done(e);
    }
  }
));

passport.serializeUser((user, done) => done(null, user._id.toString()));
passport.deserializeUser(async (id, done) => {
  try   { done(null, await User.findById(id)); }
  catch (e) { done(e); }
});

app.use(passport.initialize());
app.use(passport.session());

// ── Middleware ────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid admin key' });
  }
  next();
}

// ── Named routes (registered before /:username wildcard) ─────────────────────
app.use('/auth',         require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/profile',  require('./routes/profile'));
app.use('/api/db',       require('./routes/db'));
app.use('/api/vars',     require('./routes/vars'));
app.use('/api/files',    require('./routes/files'));
app.use('/api/admin',    require('./routes/admin'));
app.use('/api/contact',    require('./routes/contact'));
app.use('/api/components', require('./routes/components'));
app.use('/api/ai',         require('./routes/ai'));
app.use('/stripe',       require('./routes/stripe').router);

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = req.user;
  const { isAdmin, hasPaidAccess } = require('./middleware/auth');
  res.json({
    user: {
      id:                 u._id,
      name:               u.name,
      email:              u.email,
      picture:            u.picture,
      username:           u.username,
      subscriptionStatus: u.subscriptionStatus,
      isAdmin:            isAdmin(u),
      hasPaidAccess:      hasPaidAccess(u) || isAdmin(u),
    },
  });
});

// ── Showcase pipe demo data (no auth — used by mce-pipe-demo.mce.json) ──────
app.get('/api/showcase/portfolio', (req, res) => {
  res.json([
    { _id: '1', title: 'Magic Cat Engine',    description: 'Visual no-code IDE for building interactive, database-driven profile pages.', tech: 'Node.js · MongoDB · Express', year: '2026' },
    { _id: '2', title: 'Weather Dashboard',   description: 'Real-time weather data visualization with animated charts and 7-day forecasts.', tech: 'React · D3.js · OpenWeather', year: '2025' },
    { _id: '3', title: 'Task Manager Pro',    description: 'Collaborative task management with live sync and offline-first architecture.', tech: 'Vue.js · Socket.io · IndexedDB', year: '2025' },
    { _id: '4', title: 'AI Portfolio Builder', description: 'GPT-powered portfolio page generator with custom theme support and export.', tech: 'Python · FastAPI · OpenAI', year: '2024' },
  ]);
});

// ── Showcase contacts demo (live MongoDB — used by mce-db-write-demo.mce.json) ─
app.get('/api/showcase/contacts', async (req, res) => {
  try {
    const col  = mongoose.connection.db.collection('showcase_contacts');
    const docs = await col.find({}, { projection: { _id: 0, _ts: 0 } }).sort({ _ts: 1 }).toArray();
    res.json(docs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/showcase/contacts', async (req, res) => {
  try {
    const { name, email, category, date } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const col = mongoose.connection.db.collection('showcase_contacts');
    await col.insertOne({ name, email: email || '—', category: category || 'General', date: date || new Date().toLocaleDateString('en-US'), _ts: Date.now() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Engine management (admin) ─────────────────────────────────────────────────
app.post('/api/engine/update', requireAdmin, upload.single('engine'), (req, res) => {
  const html    = req.file ? req.file.buffer.toString('utf8') : req.body.html;
  const version = req.body.version || new Date().toISOString().slice(0, 10);
  if (!html) return res.status(400).json({ error: 'Provide engine file or html field' });
  if (!html.includes('</body>')) return res.status(400).json({ error: 'Does not look like valid HTML' });
  const result = db.upsertEngine(html, version);
  console.log(`[engine] Updated to ${result.version}`);
  res.json({ ok: true, ...result });
});

app.get('/api/engine/version', (req, res) => {
  const e = db.getEngine();
  if (!e) return res.json({ version: null });
  res.json({ version: e.version, updated_at: e.updated_at });
});

// ── Component library catalogue ───────────────────────────────────────────────
app.get('/api/machines', (req, res) => {
  const machinesDir = path.join(__dirname, 'public', 'machines');
  try {
    const templates = fs.readdirSync(machinesDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(machinesDir, f), 'utf8'));
          return { id: f.replace('.json', ''), name: data.name || f, icon: data.icon || '📦', description: data.description || '', category: data.category || 'General' };
        } catch { return null; }
      })
      .filter(Boolean);
    res.json(templates);
  } catch { res.json([]); }
});

// ── Component library panel ───────────────────────────────────────────────────
function libraryPanelHTML() {
  return `
<style>
  #mce-lib-toggle{position:fixed;bottom:18px;left:18px;z-index:100000;width:38px;height:38px;border-radius:50%;background:#13131f;border:1px solid #444;color:#a78bfa;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 14px rgba(0,0,0,.5)}
  #mce-lib-toggle:hover{background:#1e1e30;border-color:#a78bfa}
  #mce-lib-panel{display:none;position:fixed;bottom:66px;left:18px;z-index:100000;width:264px;max-height:480px;background:#111;border:1px solid #2e2e3e;border-radius:8px;box-shadow:0 4px 28px rgba(0,0,0,.6);font-family:system-ui,sans-serif;font-size:12px;color:#ccc;flex-direction:column;overflow:hidden}
  #mce-lib-panel.open{display:flex}
  .mcl-header{padding:10px 12px;background:#1a1a2e;border-bottom:1px solid #2e2e3e;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a78bfa}
  .mcl-search{padding:7px 8px;border-bottom:1px solid #1a1a1a}
  .mcl-search input{width:100%;padding:5px 8px;background:#0d0d1a;border:1px solid #2a2a3e;border-radius:4px;color:#e2e8f0;font-size:11px;outline:none}
  .mcl-search input:focus{border-color:#a78bfa}
  .mcl-list{flex:1;overflow-y:auto;padding:6px}
  .mcl-cat{padding:4px 6px 2px;font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#333;margin-top:4px}
  .mcl-item{display:flex;align-items:center;gap:9px;padding:8px 9px;border-radius:5px;border:1px solid #1a1a2a;margin-bottom:3px;background:#0d0d0d;cursor:grab;user-select:none;transition:border-color .12s,background .12s}
  .mcl-item:hover{border-color:#a78bfa;background:#0e0e1e}
  .mcl-item:active{cursor:grabbing}
  .mcl-icon{font-size:20px;width:26px;text-align:center;flex-shrink:0}
  .mcl-info{flex:1;min-width:0}
  .mcl-name{font-size:12px;font-weight:600;color:#e2e8f0}
  .mcl-desc{font-size:10px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
  .mcl-empty{padding:20px;text-align:center;color:#444;font-size:11px}
  #canvas-drop.mce-lib-over{border-color:#a78bfa!important;background:rgba(167,139,250,.04)!important}
</style>
<button id="mce-lib-toggle" title="Component Library">&#9707;</button>
<div id="mce-lib-panel">
  <div class="mcl-header">&#9707; Component Library</div>
  <div class="mcl-search"><input id="mcl-q" type="text" placeholder="Filter..."></div>
  <div class="mcl-list" id="mcl-list"><div class="mcl-empty">Loading...</div></div>
  <div class="mcl-header" style="cursor:pointer;border-top:1px solid #2e2e3e;border-bottom:none;margin-top:4px" onclick="document.getElementById('mcl-my-list').style.display=document.getElementById('mcl-my-list').style.display==='none'?'block':'none'">&#128190; My Components</div>
  <div id="mcl-my-list" style="display:none"><div class="mcl-empty" id="mcl-my-empty">Loading…</div></div>
</div>
<script>
(function() {
  var _tpls = [];
  var _dragId = null;

  function insertTemplate(tpl) {
    if (!tpl || !tpl.machines) return;
    var p = 'c' + Date.now() + '_';
    var map = {};
    Object.keys(tpl.machines).forEach(function(k) { map[k] = p + k; });
    Object.keys(tpl.machines).forEach(function(k) {
      var src = tpl.machines[k];
      var newId = map[k];
      MCE.machines[newId] = {
        id: newId, tag: src.type || src.tag || 'div', name: src.name || newId,
        text: src.text || '', css: JSON.parse(JSON.stringify(src.css || {})),
        attrs: src.attrs || {}, children: [],
        parentId: src.parentId ? (map[src.parentId] || null) : null,
        wires: JSON.parse(JSON.stringify(src.wires || [])),
        varWires: src.varWires || [], pipeBindings: src.pipeBindings || [],
        viewBinding: null, dbSource: null, emitOnInput: '', emitOnClick: '',
        transferOnClick: { fromId: '', eventName: '' },
        inputTransform: { filter: '', arg: '' }, outputTransform: { filter: '', arg: '' }
      };
    });
    Object.keys(tpl.machines).forEach(function(k) {
      var m = MCE.machines[map[k]];
      if (m.parentId && MCE.machines[m.parentId]) {
        MCE.machines[m.parentId].children.push(m.id);
      } else {
        MCE.rootOrder.push(m.id);
      }
    });
    if (tpl.events) Object.assign(MCE.events, tpl.events);
    if (tpl.pipes)  Object.assign(MCE.pipes,  tpl.pipes);
    UI.renderCanvas();
    if (UI.renderDOMTree) UI.renderDOMTree();
    if (typeof Logger !== 'undefined') Logger.ok('Added: ' + (tpl.name || 'component'));
    document.getElementById('mce-lib-panel').classList.remove('open');
  }

  function load(id) {
    fetch('/machines/' + id + '.json')
      .then(function(r) { return r.json(); })
      .then(insertTemplate)
      .catch(function(e) { console.error('Library load failed', e); });
  }

  function renderList(q) {
    var list = document.getElementById('mcl-list');
    var items = q ? _tpls.filter(function(t) {
      var s = q.toLowerCase();
      return (t.name||'').toLowerCase().indexOf(s) !== -1 || (t.description||'').toLowerCase().indexOf(s) !== -1 || (t.category||'').toLowerCase().indexOf(s) !== -1;
    }) : _tpls;
    if (!items.length) { list.innerHTML = '<div class="mcl-empty">No components found.</div>'; return; }
    var cats = {}, catOrder = [];
    items.forEach(function(t) {
      var c = t.category || 'General';
      if (!cats[c]) { cats[c] = []; catOrder.push(c); }
      cats[c].push(t);
    });
    var html = '';
    catOrder.forEach(function(c) {
      html += '<div class="mcl-cat">' + c + '</div>';
      cats[c].forEach(function(t) {
        html += '<div class="mcl-item" draggable="true" data-id="' + t.id + '">' +
          '<span class="mcl-icon">' + (t.icon || '&#9632;') + '</span>' +
          '<div class="mcl-info"><div class="mcl-name">' + t.name + '</div><div class="mcl-desc">' + (t.description||'') + '</div></div>' +
          '</div>';
      });
    });
    list.innerHTML = html;
    list.querySelectorAll('.mcl-item').forEach(function(el) {
      el.addEventListener('dragstart', function(e) { _dragId = el.dataset.id; e.dataTransfer.effectAllowed = 'copy'; });
      el.addEventListener('dragend',   function()  { _dragId = null; });
      el.addEventListener('click',     function()  { load(el.dataset.id); });
    });
  }

  document.addEventListener('dragover', function(e) {
    if (!_dragId) return;
    var canvas = document.getElementById('canvas-drop');
    if (!canvas || !canvas.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    canvas.classList.add('mce-lib-over');
  }, true);

  document.addEventListener('dragleave', function(e) {
    if (!_dragId) return;
    var canvas = document.getElementById('canvas-drop');
    if (!canvas) return;
    if (!canvas.contains(e.relatedTarget)) canvas.classList.remove('mce-lib-over');
  }, true);

  document.addEventListener('drop', function(e) {
    if (!_dragId) return;
    var canvas = document.getElementById('canvas-drop');
    if (!canvas || !canvas.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    canvas.classList.remove('mce-lib-over');
    var id = _dragId; _dragId = null;
    load(id);
  }, true);

  document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('mcl-q').addEventListener('input', function() { renderList(this.value.trim()); });
    document.getElementById('mce-lib-toggle').addEventListener('click', function() {
      document.getElementById('mce-lib-panel').classList.toggle('open');
    });
    fetch('/api/machines')
      .then(function(r) { return r.json(); })
      .then(function(data) { _tpls = data; renderList(''); })
      .catch(function() { document.getElementById('mcl-list').innerHTML = '<div class="mcl-empty">Failed to load.</div>'; });
    // Load user components
    fetch('/api/components', { credentials: 'include' })
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(comps) {
        var container = document.getElementById('mcl-my-list');
        var empty = document.getElementById('mcl-my-empty');
        if (!comps.length) { if (empty) empty.textContent = 'No saved components yet. Use "Save as Component" in the Props tab.'; return; }
        if (empty) empty.style.display = 'none';
        comps.forEach(function(c) {
          var div = document.createElement('div');
          div.className = 'mcl-item';
          div.style.cssText = 'display:flex;gap:6px;align-items:center;padding:6px 8px;cursor:pointer;border-radius:3px';
          div.title = c.description || c.name;
          div.innerHTML = '<span style="flex:1;font-size:11px;color:#e2e8f0">' + c.name + '</span>' +
            '<button style="padding:2px 6px;font-size:9px;border:1px solid #3a3a4e;background:#1a1a2a;color:#ccc;border-radius:3px;cursor:pointer" onclick="event.stopPropagation();if(confirm(\'Delete \\"' + c.name + '\\"?\'))fetch(\'/api/components/' + c.id + '\',{method:\'DELETE\',credentials:\'include\'}).then(function(){location.reload()})">✕</button>';
          div.onclick = function() {
            if (typeof UI !== 'undefined' && UI.insertComponent) UI.insertComponent(c.data);
            else console.warn('insertComponent not available');
          };
          container.appendChild(div);
        });
      })
      .catch(function() {});
  });
})();
<\/script>`;
}

// ── Cloud panel (user-aware) ──────────────────────────────────────────────────
function cloudPanelHTML() {
  return `
<style>
  #mce-cloud-toggle{position:fixed;bottom:18px;right:18px;z-index:100000;width:38px;height:38px;border-radius:50%;background:#13131f;border:1px solid #444;color:#a78bfa;font-size:19px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 14px rgba(0,0,0,.5);line-height:1}
  #mce-cloud-toggle:hover{background:#1e1e30;border-color:#a78bfa}
  #mce-cloud-panel{display:none;position:fixed;bottom:66px;right:18px;z-index:100000;width:320px;max-height:520px;background:#111;border:1px solid #2e2e3e;border-radius:8px;box-shadow:0 4px 28px rgba(0,0,0,.6);font-family:system-ui,sans-serif;font-size:12px;color:#ccc;flex-direction:column;overflow:hidden}
  #mce-cloud-panel.open{display:flex}
  .mcec-header{padding:10px 12px;background:#1a1a2e;border-bottom:1px solid #2e2e3e;display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a78bfa}
  .mcec-proj-name{font-weight:400;color:#777;font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
  .mcec-actions{padding:8px 10px;display:flex;gap:5px;border-bottom:1px solid #222;flex-wrap:wrap}
  .mcec-btn{padding:4px 11px;border-radius:4px;border:1px solid #3a3a4e;background:#1a1a2a;color:#ccc;font-size:11px;cursor:pointer;white-space:nowrap}
  .mcec-btn:hover{background:#252535;border-color:#a78bfa;color:#fff}
  .mcec-btn.primary{background:#a78bfa;color:#000;border-color:#a78bfa;font-weight:700}
  .mcec-btn.primary:hover{background:#c4b5fd}
  .mcec-btn.danger{border-color:#ef444466;color:#ef4444}
  .mcec-btn.danger:hover{background:#2a1010;border-color:#ef4444}
  .mcec-btn.green{background:#16a34a;color:#fff;border-color:#16a34a;font-weight:700}
  .mcec-btn.green:hover{background:#15803d}
  .mcec-list{flex:1;overflow-y:auto;padding:5px}
  .mcec-item{display:flex;align-items:center;gap:5px;padding:6px 8px;border-radius:4px;border:1px solid #1e1e2e;margin-bottom:3px;background:#0d0d0d}
  .mcec-item:hover{border-color:#333;background:#131320}
  .mcec-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;color:#e2e8f0;font-size:12px}
  .mcec-item-name:hover{color:#a78bfa}
  .mcec-item-date{font-size:9px;color:#555;flex-shrink:0}
  .mcec-status{padding:5px 12px;font-size:10px;color:#666;border-top:1px solid #1e1e2e;min-height:24px}
  .mcec-empty{padding:24px;text-align:center;color:#555;font-size:11px}
  .mcec-user-bar{padding:8px 12px;background:#0d0d1a;border-bottom:1px solid #1e1e2e;display:flex;align-items:center;gap:8px;font-size:11px}
  .mcec-avatar{width:22px;height:22px;border-radius:50%;object-fit:cover}
  .mcec-user-name{flex:1;color:#e2e8f0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mcec-sub-badge{font-size:9px;padding:1px 5px;border-radius:3px;background:#16a34a33;color:#4ade80;border:1px solid #16a34a55}
  .mcec-gate{padding:20px 16px;display:flex;flex-direction:column;gap:10px;align-items:center;text-align:center}
  .mcec-gate p{color:#888;font-size:11px;margin:0 0 4px}
  .mcec-gate h3{color:#e2e8f0;font-size:13px;margin:0 0 2px}
  .mcec-claim-row{display:flex;gap:6px;width:100%;padding:0 8px}
  .mcec-claim-row input{flex:1;padding:5px 8px;background:#0d0d1a;border:1px solid #3a3a4e;border-radius:4px;color:#e2e8f0;font-size:11px;outline:none}
  .mcec-claim-row input:focus{border-color:#a78bfa}
  .mcec-profile-link{font-size:10px;color:#a78bfa;text-decoration:none;padding:2px 0}
  .mcec-profile-link:hover{text-decoration:underline}
</style>
<button id="mce-cloud-toggle" title="Cloud Projects">&#9729;</button>
<div id="mce-cloud-panel">
  <div class="mcec-header">
    <span>&#9729; Cloud</span>
    <span class="mcec-proj-name" id="mcec-proj-name"></span>
  </div>
  <div id="mcec-user-bar" style="display:none" class="mcec-user-bar">
    <img id="mcec-avatar" class="mcec-avatar" src="" alt="">
    <span id="mcec-user-name" class="mcec-user-name"></span>
    <span id="mcec-sub-badge" class="mcec-sub-badge" style="display:none">Active</span>
    <button class="mcec-btn" style="padding:2px 7px;font-size:10px" onclick="MCE_CLOUD.logout()">Sign out</button>
  </div>
  <div id="mcec-gate-login" class="mcec-gate" style="display:none">
    <h3>Save your work to the cloud</h3>
    <p>Sign in with Google to save projects and build your profile page.</p>
    <button class="mcec-btn primary" onclick="MCE_CLOUD.loginGoogle()">Sign in with Google</button>
  </div>
  <div id="mcec-gate-subscribe" class="mcec-gate" style="display:none">
    <h3>Get your profile page</h3>
    <p>Subscribe to save unlimited projects and claim your own<br><strong>magiccatengine.com/username</strong></p>
    <button class="mcec-btn green" onclick="MCE_CLOUD.subscribe()">Subscribe — $5/mo</button>
    <button class="mcec-btn" onclick="MCE_CLOUD.logout()" style="font-size:10px;padding:2px 8px">Sign out</button>
  </div>
  <div id="mcec-gate-claim" class="mcec-gate" style="display:none">
    <h3>Claim your profile URL</h3>
    <p>Choose a username to get your own page at<br><strong>magiccatengine.com/username</strong></p>
    <div class="mcec-claim-row">
      <input id="mcec-claim-input" type="text" placeholder="username" maxlength="30" oninput="MCE_CLOUD.checkUsername(this.value)">
      <button class="mcec-btn primary" id="mcec-claim-btn" onclick="MCE_CLOUD.claimUsername()" disabled>Claim</button>
    </div>
  </div>
  <div id="mcec-panel-main" style="display:none;flex-direction:column;flex:1;overflow:hidden">
    <div id="mcec-profile-bar" style="display:none;padding:6px 12px;background:#0d1a0d;border-bottom:1px solid #1a2e1a;font-size:10px;color:#4ade80">
      Your profile: <a id="mcec-profile-url" class="mcec-profile-link" href="#" target="_blank"></a>
      &nbsp;·&nbsp;
      <label style="cursor:pointer;color:#888" title="Show your profile in the community gallery">
        <input type="checkbox" id="mcec-public-toggle" style="vertical-align:middle;accent-color:#a78bfa" onchange="MCE_CLOUD.setPublic(this.checked)">
        Public gallery
      </label>
      &nbsp;·&nbsp;
      <span style="color:#888;cursor:pointer" onclick="MCE_CLOUD.manageSubscription()">Manage subscription</span>
    </div>
    <div class="mcec-actions">
      <button class="mcec-btn green" onclick="MCE_CLOUD.publish()" title="Publish to your public profile">&#128640; Publish</button>
      <button class="mcec-btn primary" onclick="MCE_CLOUD.save()">Save</button>
      <button class="mcec-btn" onclick="MCE_CLOUD.saveAs()">Save As…</button>
      <button class="mcec-btn" onclick="MCE_CLOUD.newProject()">New</button>
      <button class="mcec-btn" onclick="MCE_CLOUD.refresh()" title="Refresh">&#8635;</button>
    </div>
    <div class="mcec-list" id="mcec-list"><div class="mcec-empty">Loading…</div></div>
  </div>
  <div class="mcec-status" id="mcec-status"></div>
</div>
<script>
(function() {
  var _id      = null;
  var _user    = null;
  var _statusEl = document.getElementById('mcec-status');
  var _listEl   = document.getElementById('mcec-list');
  var _nameEl   = document.getElementById('mcec-proj-name');

  function status(msg, ok) {
    _statusEl.textContent = msg;
    _statusEl.style.color = ok === false ? '#ef4444' : ok === true ? '#22c55e' : '#888';
    if (ok !== undefined) setTimeout(function(){ _statusEl.textContent = ''; }, 3000);
  }

  function apiFetch(url, opts) {
    opts = opts || {};
    opts.credentials = 'include';
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.body = JSON.stringify(opts.body);
      opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers);
    }
    return fetch(url, opts);
  }

  function showPanel(id) {
    ['mcec-gate-login','mcec-gate-subscribe','mcec-gate-claim','mcec-panel-main']
      .forEach(function(x){ document.getElementById(x).style.display='none'; });
    var el = document.getElementById(id);
    if (el) el.style.display = id === 'mcec-panel-main' ? 'flex' : '';
  }

  function renderUserBar(user) {
    if (!user) { document.getElementById('mcec-user-bar').style.display='none'; return; }
    document.getElementById('mcec-user-bar').style.display='flex';
    document.getElementById('mcec-avatar').src   = user.picture || '';
    document.getElementById('mcec-user-name').textContent = user.name || user.email;
    var badge = document.getElementById('mcec-sub-badge');
    badge.style.display = user.hasPaidAccess ? '' : 'none';
  }

  function renderProfileBar(user) {
    var bar = document.getElementById('mcec-profile-bar');
    if (user && user.username) {
      var url = window.location.origin + '/' + user.username;
      document.getElementById('mcec-profile-url').textContent = url;
      document.getElementById('mcec-profile-url').href = url;
      bar.style.display = '';
    } else {
      bar.style.display = 'none';
    }
  }

  async function loadUser() {
    try {
      var res = await apiFetch('/api/me');
      var j   = await res.json();
      _user = j.user;
    } catch(e) { _user = null; }

    renderUserBar(_user);

    if (!_user) { showPanel('mcec-gate-login'); return; }
    if (!_user.isAdmin && !_user.hasPaidAccess) { showPanel('mcec-gate-subscribe'); return; }
    if (!_user.username) { showPanel('mcec-gate-claim'); return; }

    renderProfileBar(_user);
    showPanel('mcec-panel-main');
    MCE_CLOUD.refresh();
  }

  function mceData() {
    if (typeof MCE === 'undefined') return null;
    return {
      version:       MCE.version || '1.0.0',
      project:       Object.assign({}, MCE.project),
      rootOrder:     (MCE.rootOrder || []).slice(),
      machines:      Object.assign({}, MCE.machines),
      events:        Object.assign({}, MCE.events),
      pipes:         Object.assign({}, MCE.pipes),
      views:         Object.assign({}, MCE.views),
      loops:         Object.assign({}, MCE.loops),
      vars:          Object.assign({}, MCE.vars),
      logic:         Object.assign({}, MCE.logic),
      templates:     Object.assign({}, MCE.templates),
      css:           typeof MCE.css === 'string' ? MCE.css : '',
      runtimeStyle:  MCE.runtimeStyle || 'clean',
      dbCollections: (function() {
        if (typeof DB === 'undefined' || !DB._store) return (MCE.dbCollections || []).slice();
        var stripMeta = function(d) { var r = Object.assign({}, d); delete r._id; delete r._created; delete r._updated; return r; };
        return Object.keys(DB._store)
          .filter(function(n) { return n !== '_machines'; })
          .map(function(n) {
            var c = DB._store[n];
            var seed = c.isArray
              ? c.docs.map(stripMeta)
              : (c.single && c.single._id ? [stripMeta(c.single)] : []);
            return { name: n, isArray: !!c.isArray, seed: seed };
          });
      })(),
      _nextId:       MCE._nextId || 1
    };
  }

  function syncName() {
    var n = MCE && MCE.project && MCE.project.name;
    _nameEl.textContent = n || '';
  }

  window.MCE_CLOUD = {
    loginGoogle: function() { window.location.href = '/auth/google'; },

    async logout() {
      await apiFetch('/auth/logout', { method: 'POST' });
      _user = null; _id = null;
      renderUserBar(null);
      showPanel('mcec-gate-login');
    },

    async subscribe() {
      status('Redirecting to checkout…');
      try {
        var res = await apiFetch('/stripe/create-checkout', { method: 'POST' });
        var j = await res.json();
        if (j.url) window.location.href = j.url;
        else status('Error: ' + (j.error || 'unknown'), false);
      } catch(e) { status('Error: ' + e.message, false); }
    },

    async setPublic(isPublic) {
      if (!_id) return status('Save a profile first', false);
      try {
        await apiFetch('/api/projects/' + _id, { method: 'PUT', body: JSON.stringify({ public: isPublic }) });
        status(isPublic ? 'Profile added to community gallery ✓' : 'Profile removed from gallery ✓', true);
      } catch(e) { status('Could not update', false); }
    },

    async manageSubscription() {
      try {
        var res = await apiFetch('/stripe/portal', { method: 'POST' });
        var j = await res.json();
        if (j.url) window.open(j.url, '_blank');
      } catch(e) { status('Could not open portal', false); }
    },

    _checkTimer: null,
    checkUsername: function(val) {
      var btn = document.getElementById('mcec-claim-btn');
      btn.disabled = true;
      clearTimeout(MCE_CLOUD._checkTimer);
      var slug = val.toLowerCase().replace(/[^a-z0-9_-]/g,'');
      if (slug.length < 3) return;
      MCE_CLOUD._checkTimer = setTimeout(async function() {
        try {
          var res = await apiFetch('/api/profile/check/' + encodeURIComponent(slug));
          var j = await res.json();
          btn.disabled = !j.available;
          status(j.available ? slug + ' is available' : slug + ' is taken', j.available ? true : false);
        } catch(e) {}
      }, 400);
    },

    async claimUsername() {
      var val = document.getElementById('mcec-claim-input').value.trim().toLowerCase();
      if (!val) return;
      status('Claiming…');
      try {
        var res = await apiFetch('/api/profile/claim', { method: 'POST', body: { username: val } });
        var j = await res.json();
        if (!res.ok) return status(j.error, false);
        _user.username = j.username;
        renderProfileBar(_user);
        showPanel('mcec-panel-main');
        MCE_CLOUD.refresh();
        status('Username claimed: ' + j.username, true);
      } catch(e) { status('Error: ' + e.message, false); }
    },

    async publish() {
      var data = mceData();
      if (!data) return status('MCE not ready', false);
      var name = (MCE && MCE.project && MCE.project.name) || 'My Profile';
      status('Publishing…');
      try {
        var res = await apiFetch('/api/projects/publish', {
          method: 'POST',
          body: { name: name, data: data }
        });
        if (!res.ok) { var e = await res.json(); throw new Error(e.error || res.statusText); }
        var j = await res.json();
        if (j.url) {
          status('Live at magiccatengine.com' + j.url, true);
        } else {
          status('Published!', true);
        }
      } catch(e) { status('Error: ' + e.message, false); }
    },

    async save(silent) {
      var data = mceData();
      if (!data) return silent ? null : status('MCE not ready', false);
      var name = (MCE.project && MCE.project.name) || 'Untitled';
      var ind = document.getElementById('autosave-status');
      if (!silent) status('Saving…');
      if (ind) ind.textContent = 'saving…';
      try {
        var res = await apiFetch(_id ? '/api/projects/' + _id : '/api/projects', {
          method: _id ? 'PUT' : 'POST',
          body: { name: name, data: data }
        });
        if (!res.ok) { var e = await res.json(); throw new Error(e.error || res.statusText); }
        var j = await res.json();
        _id = j.id;
        syncName();
        if (!silent) { status('Saved: ' + name, true); MCE_CLOUD.refresh(); }
        if (ind) { ind.textContent = 'Saved'; setTimeout(function() { if (ind.textContent === 'Saved') ind.textContent = ''; }, 2500); }
      } catch(e) {
        if (!silent) status('Error: ' + e.message, false);
        if (ind) ind.textContent = '⚠ save failed';
      }
    },

    async saveAs() {
      var name = prompt('Project name:', (MCE && MCE.project && MCE.project.name) || 'Untitled');
      if (!name) return;
      if (MCE && MCE.project) MCE.project.name = name;
      _id = null;
      syncName();
      await MCE_CLOUD.save();
    },

    newProject() {
      if (!confirm('Start a new project? Unsaved changes will be lost.')) return;
      _id = null;
      if (typeof UI !== 'undefined' && UI._loadJSON) {
        UI._loadJSON({ version:'1.0.0', project:{ name:'Untitled' }, rootOrder:[], machines:{}, events:{}, pipes:{}, views:{}, loops:{}, vars:{}, logic:{}, dbCollections:[], _nextId:1 });
      }
      syncName();
      status('New project ready', true);
    },

    async load(id) {
      status('Loading…');
      try {
        var res = await apiFetch('/api/projects/' + id);
        if (!res.ok) throw new Error('Not found');
        var j = await res.json();
        if (typeof UI === 'undefined' || !UI._loadJSON) return status('UI not ready', false);
        UI._loadJSON(j.data);
        _id = j.id;
        syncName();
        status('Loaded: ' + j.name, true);
        document.getElementById('mce-cloud-panel').classList.remove('open');
      } catch(e) { status('Error: ' + e.message, false); }
    },

    async delete(id, name) {
      if (!confirm('Delete "' + name + '"?')) return;
      try {
        var res = await apiFetch('/api/projects/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        if (_id === id) { _id = null; _nameEl.textContent = ''; }
        status('Deleted', true);
        MCE_CLOUD.refresh();
      } catch(e) { status('Error: ' + e.message, false); }
    },

    async setProfile(id, name) {
      if (!confirm('Set "' + name + '" as your public profile page?')) return;
      try {
        var res = await apiFetch('/api/projects/' + id, { method: 'PUT', body: { isProfile: true } });
        if (!res.ok) throw new Error('Failed');
        status('Profile updated', true);
        MCE_CLOUD.refresh();
      } catch(e) { status('Error: ' + e.message, false); }
    },

    async refresh() {
      try {
        var res = await apiFetch('/api/projects');
        if (res.status === 401 || res.status === 403) { loadUser(); return; }
        var list = await res.json();
        if (!list.length) {
          _listEl.innerHTML = '<div class="mcec-empty">No saved projects.<br>Click Save to create one.</div>';
          return;
        }
        // Sync the public toggle for the current profile project
        var profileProj = list.find(function(p) { return p.isProfile; });
        var tog = document.getElementById('mcec-public-toggle');
        if (tog && profileProj) tog.checked = !!profileProj.public;
        _listEl.innerHTML = list.map(function(p) {
          var d = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '';
          var safeName = String(p.name).replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'");
          var profileStar = p.isProfile ? '<span title="Profile page" style="color:#a78bfa;font-size:10px">&#9733;</span>' : '';
          return '<div class="mcec-item">' +
            profileStar +
            '<span class="mcec-item-name" onclick="MCE_CLOUD.load(\\'' + p.id + '\\')">' + p.name + '</span>' +
            '<span class="mcec-item-date">' + d + '</span>' +
            '<button class="mcec-btn" style="padding:2px 5px;font-size:9px" title="Set as profile page" onclick="MCE_CLOUD.setProfile(\\'' + p.id + '\\',\\'' + safeName + '\\')">&#9733;</button>' +
            '<button class="mcec-btn danger" style="padding:2px 6px;font-size:10px" onclick="MCE_CLOUD.delete(\\'' + p.id + '\\',\\'' + safeName + '\\')">&#215;</button>' +
          '</div>';
        }).join('');
      } catch(e) {
        _listEl.innerHTML = '<div class="mcec-empty" style="color:#ef4444">Failed to connect</div>';
      }
    }
  };

  document.getElementById('mce-cloud-toggle').addEventListener('click', function() {
    var panel = document.getElementById('mce-cloud-panel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      loadUser();
      syncName();
    }
  });

  // Handle post-OAuth/checkout redirects
  var params = new URLSearchParams(window.location.search);
  if (params.get('auth') === 'success' || params.get('checkout') === 'success') {
    history.replaceState({}, '', window.location.pathname);
    document.getElementById('mce-cloud-panel').classList.add('open');
    loadUser();
  }

  setTimeout(function() { syncName(); }, 800);

  // Note: there is intentionally no silent autosave-on-unload here anymore.
  // It used to PUT whatever was in memory the instant a tab closed/refreshed,
  // which repeatedly clobbered published profiles with stale/partial in-memory
  // state from old tabs. Saving is explicit now — the Save button only.

  // Auto-restore last saved project on page load
  if (window.MCE_PROFILE && window.MCE_PROFILE.isOwner && window.MCE_PROFILE.data && window.MCE_PROFILE.projectId) {
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof UI !== 'undefined' && UI._loadJSON) {
        UI._loadJSON(window.MCE_PROFILE.data);
        _id = window.MCE_PROFILE.projectId;
        syncName();
        var ind = document.getElementById('autosave-status');
        if (ind) { ind.textContent = 'Restored'; setTimeout(function() { if (ind.textContent === 'Restored') ind.textContent = ''; }, 2500); }
      }
    });
  }
})();
</script>
`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function htmlEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function injectBeforeBodyEnd(html, injection) {
  const idx = html.lastIndexOf('</body>');
  return idx === -1 ? html + injection : html.slice(0, idx) + injection + '\n</body>' + html.slice(idx + 7);
}

// ── Landing page ──────────────────────────────────────────────────────────────
function landingPageHTML(user) {
  const userData = user ? {
    name: user.name || '',
    picture: user.picture || '',
    username: user.username || '',
    subscriptionStatus: user.subscriptionStatus || '',
  } : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Magic Cat Engine — Build Your Profile Page</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#fff;color:#111;min-height:100vh;line-height:1.5}
a{color:inherit;text-decoration:none}
nav{display:flex;align-items:center;padding:14px 48px;border-bottom:2px solid #000;position:sticky;top:0;background:#fff;z-index:100}
.nav-logo{height:52px;width:auto}
.nav-right{margin-left:auto;display:flex;align-items:center;gap:10px}
.nav-user{display:flex;align-items:center;gap:8px;font-size:13px;color:#333}
.nav-user img{width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid #000}
.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 22px;border-radius:0;font-size:14px;font-weight:700;cursor:pointer;border:2px solid #000;transition:all .12s;white-space:nowrap;letter-spacing:.01em}
.btn-primary{background:#000;color:#fff}
.btn-primary:hover{background:#333}
.btn-outline{background:#fff;color:#000}
.btn-outline:hover{background:#000;color:#fff}
.btn-sm{padding:7px 16px;font-size:13px}
.btn-ghost{background:transparent;color:#555;font-size:13px;padding:7px 12px;border:none;cursor:pointer}
.btn-ghost:hover{color:#000}
hero{display:block;text-align:center;padding:90px 24px 72px;border-bottom:2px solid #000}
.hero-logo{height:180px;width:auto;margin-bottom:32px}
hero h1{font-size:54px;font-weight:900;line-height:1.05;letter-spacing:-2px;margin-bottom:22px;color:#000}
hero p{font-size:19px;color:#444;max-width:500px;margin:0 auto 36px;line-height:1.65}
.url-demo{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:13px;background:#f5f5f5;border:2px solid #000;padding:6px 14px;color:#000;margin-bottom:36px}
.url-demo span{color:#666}
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:0;max-width:980px;margin:0 auto;padding:0 24px 0;border-bottom:2px solid #000}
.card{background:#fff;border-right:2px solid #000;padding:32px 28px}
.card:last-child{border-right:none}
.card-icon{font-size:24px;margin-bottom:14px}
.card h3{font-size:15px;font-weight:800;margin-bottom:7px;color:#000;text-transform:uppercase;letter-spacing:.05em}
.card p{font-size:13px;color:#555;line-height:1.6}
.discover{max-width:900px;margin:0 auto;padding:56px 24px;border-bottom:2px solid #000}
.discover h2{font-size:30px;font-weight:900;letter-spacing:-1px;margin-bottom:8px;color:#000;text-align:center}
.discover>.sub{color:#555;font-size:15px;text-align:center;margin-bottom:28px}
.search-box{max-width:480px;margin:0 auto 20px}
.search-box input{width:100%;padding:12px 16px;border:2px solid #000;font-size:15px;outline:none;font-family:inherit}
.search-box input:focus{background:#f9f9f9}
.search-results{max-width:480px;margin:0 auto;display:flex;flex-direction:column;gap:8px;min-height:0}
.search-result{display:flex;align-items:center;gap:12px;padding:10px 14px;border:2px solid #000;text-decoration:none;color:#000}
.search-result:hover{background:#000;color:#fff}
.search-result img{width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid #ccc}
.search-result .sr-name{font-size:14px;font-weight:700}
.search-result .sr-handle{font-size:12px;color:#777;display:block}
.search-result:hover .sr-handle{color:#ccc}
.search-empty{text-align:center;color:#888;font-size:13px;padding:12px}
.discover-cta{text-align:center;margin-top:20px}
.story-section{max-width:760px;margin:0 auto;padding:70px 24px;border-bottom:2px solid #000}
.story-section h2{font-size:30px;font-weight:900;letter-spacing:-1px;margin-bottom:20px;color:#000}
.story-section p{font-size:16px;color:#333;line-height:1.75}
.howitworks{max-width:760px;margin:0 auto;padding:70px 24px 60px;border-bottom:2px solid #000}
.howitworks h2{font-size:30px;font-weight:900;letter-spacing:-1px;margin-bottom:10px;color:#000}
.howitworks>.intro{font-size:16px;color:#333;line-height:1.75;margin-bottom:36px}
.concept{margin-bottom:28px}
.concept h3{font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;color:#000;border-left:3px solid #000;padding-left:10px}
.concept p{font-size:15px;color:#333;line-height:1.75;padding-left:13px}
.philosophy{font-size:17px;font-style:italic;color:#000;line-height:1.7;margin-top:36px;padding-top:28px;border-top:2px solid #000;font-weight:600}
.pricing{text-align:center;padding:60px 24px 100px}
.pricing h2{font-size:34px;font-weight:900;margin-bottom:10px;letter-spacing:-1px;color:#000}
.pricing>.sub{color:#555;margin-bottom:40px;font-size:15px}
.price-box{display:inline-flex;flex-direction:column;align-items:center;background:#fff;border:2px solid #000;padding:40px 52px;min-width:320px}
.price-num{font-size:64px;font-weight:900;color:#000;letter-spacing:-3px}
.price-per{font-size:16px;color:#555;margin-bottom:28px}
.price-list{list-style:none;text-align:left;margin-bottom:32px;display:flex;flex-direction:column;gap:10px}
.price-list li{font-size:14px;color:#222;display:flex;align-items:center;gap:8px}
.price-list li::before{content:'✓';font-weight:900;color:#000;flex-shrink:0}
.setup-panel{max-width:420px;margin:0 auto;background:#fff;border:2px solid #000;padding:28px;text-align:left;display:none;margin-top:28px}
.setup-panel h3{font-size:16px;font-weight:800;margin-bottom:6px;color:#000}
.setup-panel p{font-size:13px;color:#555;margin-bottom:18px}
.claim-row{display:flex;gap:0}
.claim-row input{flex:1;background:#fff;border:2px solid #000;border-right:none;padding:9px 12px;color:#000;font-size:13px;outline:none;font-family:monospace}
.claim-row input:focus{background:#f9f9f9}
.claim-hint{font-size:11px;margin-top:7px;min-height:16px}
.claim-hint.ok{color:#166534}
.claim-hint.err{color:#991b1b}
footer{border-top:2px solid #000;padding:20px 48px;text-align:center;color:#888;font-size:13px}
@media(max-width:700px){
  nav{padding:12px 20px}
  .nav-logo{height:40px}
  hero h1{font-size:36px}
  hero{padding:52px 20px 48px}
  .hero-logo{height:120px}
  .features{grid-template-columns:1fr}
  .card{border-right:none;border-bottom:2px solid #000}
  .card:last-child{border-bottom:none}
  .price-box{padding:30px 28px;min-width:0;width:100%;max-width:380px}
  .story-section,.howitworks{padding:48px 20px}
}
</style>
</head>
<body>
<div style="background:#000;color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:700;letter-spacing:.02em">Be Advised: Site In Alpha</div>
<nav>
  <img src="https://magiccatsoftware.ca/MCENGINELOGO.png" alt="Magic Cat Engine" class="nav-logo">
  <div class="nav-right" id="nav-right">
    <span class="nav-user" id="nav-user-info" style="display:none">
      <img id="nav-avatar" src="" alt="">
      <span id="nav-name"></span>
    </span>
    <a id="nav-editor-btn" href="#" class="btn btn-primary btn-sm" style="display:none">Open Editor →</a>
    <a id="nav-signin-btn" href="/auth/google" class="btn btn-outline btn-sm">Sign in with Google</a>
    <button id="nav-signout-btn" class="btn-ghost" style="display:none" onclick="MCELanding.logout()">Sign out</button>
  </div>
</nav>

<hero>
  <img src="https://magiccatsoftware.ca/MCENGINELOGO.png" alt="Magic Cat Engine" class="hero-logo">
  <h1>Build your profile<br>with a visual engine</h1>
  <div class="url-demo"><span>magiccatengine.com/</span>yourname</div><br>
  <div id="hero-cta">
    <a href="/auth/google" class="btn btn-primary">Sign in with Google — free to start</a>
    <a href="/demo" class="btn btn-outline" style="margin-left:10px">Try the demo →</a>
    <a href="/gallery" class="btn btn-outline" style="margin-left:10px">Community →</a>
    <a href="/examples" class="btn btn-outline" style="margin-left:10px">100 Examples →</a>
  </div>
</hero>

<div class="features">
  <div class="card">
    <div class="card-icon">🎛</div>
    <h3>Visual DB-Driven IDE</h3>
    <p>Drag, drop, and wire up databases, events, and logic. Build real interactive pages without writing code.</p>
  </div>
  <div class="card">
    <div class="card-icon">⚡</div>
    <h3>Your own URL</h3>
    <p>Claim <strong>magiccatengine.com/yourname</strong> and share your live profile with the world.</p>
  </div>
  <div class="card">
    <div class="card-icon">☁</div>
    <h3>Cloud Projects</h3>
    <p>Save unlimited projects, open on any device, and publish your profile page with a single click.</p>
  </div>
</div>

<div class="discover" id="discover">
  <h2>Find people</h2>
  <p class="sub">Search public profiles built with Magic Cat Engine.</p>
  <div class="search-box">
    <input id="user-search-input" type="text" placeholder="Search by name or username…" autocomplete="off" oninput="MCELanding.search(this.value)">
  </div>
  <div class="search-results" id="search-results"></div>
  <div class="discover-cta"><a href="/gallery" class="btn btn-outline btn-sm">Browse all public profiles →</a></div>
</div>

<div class="story-section" id="story">
  <h2>The Story</h2>
  <p>The story of Magic Cat Engine can't be told without telling a little bit about myself. The short story is I got very sick, psychologically, but found a way of building applications that was one hundred percent no code. I ended up in hospital, but the technology stayed with me, and with AI I tried to tackle it, but it wasn't until Claude Code produced a working demo that I finally realized I had a real find in the middle of misery and madness.</p>
</div>

<div class="howitworks" id="how-it-works">
  <h2>How It Works</h2>
  <p class="intro">Magic Cat Engine feels like a lot to take in, you're working with all these different languages at once. The idea is simple, keep it as close to no code as possible, but I did place a zone where people can put all the code they want in.</p>

  <div class="concept">
    <h3>Events</h3>
    <p>First you have events, events you create to be fired at different instances, any of the machines in the system can listen in for events and do something when that event is fired.</p>
  </div>

  <div class="concept">
    <h3>Database &amp; Pipes</h3>
    <p>Next you have the database and Pipes, pipes simply connect you right to the database. You create a pipe and that does a POST or a GET.</p>
  </div>

  <div class="concept">
    <h3>Machines</h3>
    <p>Then there are Machines. Every visual element you see on the page is a Machine — a button, a text input, an image, a list. Machines are the building blocks of everything. Each one can listen for events, respond to data coming through a pipe, or send out events of its own. They talk to each other through Wires.</p>
  </div>

  <div class="concept">
    <h3>Wires</h3>
    <p>Wires are how Machines share information. You connect one Machine to another and the data flows between them automatically. Change a value in one place and everything wired to it updates. No code required, no refresh needed. The idea was always that a person should be able to look at the screen and see the shape of how the application works, the way you might look at plumbing and understand where the water goes.</p>
  </div>

  <div class="concept">
    <h3>Loops</h3>
    <p>Loops came out of a simple problem — what do you do when you have a list of things? A list of products, a list of messages, a list of anything. A Loop takes a pipe, takes that data coming back, and automatically stamps out a Machine for each item. You design one, and the Loop handles the rest. It was one of those moments in development where something clicked into place so cleanly it almost felt like cheating.</p>
  </div>

  <div class="concept">
    <h3>Views</h3>
    <p>Views handle pages. When your application needs to show different screens depending on where the user is — a home page, a profile page, a settings page — Views manage that routing. The URL changes, the right content appears, and the whole thing stays inside that single file.</p>
  </div>

  <div class="concept">
    <h3>One File</h3>
    <p>And that single file is the point. Everything Magic Cat Engine produces is one standalone HTML file. No server required to run it, no framework to install, no dependencies to manage. You can put it on a USB stick. You can email it. You can open it ten years from now and it will still work. That felt important to me, especially building this the way I did — in hospital, on borrowed time, with no guarantee of infrastructure or stability. The output had to be something that could survive on its own.</p>
  </div>

  <div class="concept">
    <h3>Logic Panel</h3>
    <p>Finally there's the Logic Panel. This is where the no-code meets the can-code. The Logic Panel is a visual if-else system — you set up conditions, you define what happens when they're true, what happens when they're not. For most things that's enough. But if you need to go further, if you need to write actual JavaScript, there's a zone for that too. I didn't want to make a system that imprisoned people. I just wanted the door to be optional.</p>
  </div>

  <p class="philosophy">The whole thing is held together by one philosophy: the application should be readable by looking at it. Not at the source code, not at a terminal, not at a spreadsheet of configuration. At the screen itself. That was the dream I carried through some very dark places. I'm glad it made it out the other side.</p>
</div>

<div class="pricing" id="pricing">
  <h2>Simple pricing</h2>
  <p class="sub">One plan. Everything included.</p>
  <div class="price-box featured">
    <div class="price-num">$5</div>
    <div class="price-per">per month</div>
    <ul class="price-list">
      <li>Your own profile URL</li>
      <li>Full visual IDE access</li>
      <li>Instant publishing</li>
    </ul>
    <div id="pricing-cta" style="width:100%">
      <a href="/auth/google" class="btn btn-primary" style="width:100%;justify-content:center">Get started →</a>
    </div>
  </div>

  <div class="setup-panel" id="setup-panel" style="margin-top:28px">
    <h3 id="setup-title"></h3>
    <p id="setup-desc"></p>
    <div id="claim-form" style="display:none">
      <div class="claim-row">
        <input id="claim-input" type="text" placeholder="yourname" maxlength="30" oninput="MCELanding.checkSlug(this.value)">
        <button class="btn btn-primary btn-sm" id="claim-btn" onclick="MCELanding.claim()" disabled>Claim</button>
      </div>
      <div class="claim-hint" id="claim-hint"></div>
    </div>
  </div>
</div>

<footer>&copy; 2026 Magic Cat Software</footer>

<script>
(function() {
  var USER = ${JSON.stringify(userData)};
  var _checkTimer = null;
  var _searchTimer = null;

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function apiFetch(url, opts) {
    opts = Object.assign({ credentials: 'include' }, opts || {});
    if (opts.body && typeof opts.body === 'object') {
      opts.body = JSON.stringify(opts.body);
      opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    }
    return fetch(url, opts);
  }

  function renderNav() {
    if (!USER) return;
    document.getElementById('nav-signin-btn').style.display = 'none';
    document.getElementById('nav-signout-btn').style.display = '';
    var info = document.getElementById('nav-user-info');
    info.style.display = 'flex';
    if (USER.picture) document.getElementById('nav-avatar').src = USER.picture;
    document.getElementById('nav-name').textContent = USER.name || '';
    var btn = document.getElementById('nav-editor-btn');
    if (USER.username) {
      btn.href = '/develop/' + encodeURIComponent(USER.username);
      btn.textContent = 'Open Editor →';
      btn.style.display = '';
    } else {
      btn.href = '#';
      btn.textContent = 'Set up workspace →';
      btn.style.display = '';
      btn.addEventListener('click', function(e) { e.preventDefault(); MCELanding.showClaim(); });
    }
  }

  function renderHeroCTA() {
    var cta = document.getElementById('hero-cta');
    if (!USER) return;
    if (USER.username) {
      cta.innerHTML = '<a href="/develop/' + encodeURIComponent(USER.username) + '" class="btn btn-primary">Open your editor →</a>' +
        '<a href="/demo" class="btn btn-outline" style="margin-left:10px">Try the demo →</a>' +
        '<br><br><a href="/' + encodeURIComponent(USER.username) + '" class="btn btn-outline" style="margin-top:8px">View public profile →</a>';
    } else {
      cta.innerHTML = '<button class="btn btn-primary" onclick="MCELanding.showClaim()">Claim your username →</button>' +
        '<a href="/demo" class="btn btn-outline" style="margin-left:10px">Try the demo →</a>';
    }
  }

  function renderPricingCTA() {
    var cta = document.getElementById('pricing-cta');
    if (!USER) return;
    if (USER.username) {
      cta.innerHTML = '<a href="/develop/' + encodeURIComponent(USER.username) + '" class="btn btn-primary" style="width:100%;justify-content:center">Open your editor →</a>';
    } else {
      cta.innerHTML = '<button class="btn btn-primary" style="width:100%;justify-content:center" onclick="MCELanding.showClaim()">Claim your username →</button>';
    }
  }

  window.MCELanding = {
    logout: async function() {
      await apiFetch('/auth/logout', { method: 'POST' });
      location.href = '/';
    },

    subscribe: async function() {
      try {
        var res = await apiFetch('/stripe/create-checkout', { method: 'POST' });
        var j = await res.json();
        if (j.url) location.href = j.url;
        else alert('Error: ' + (j.error || 'unknown'));
      } catch(e) { alert('Error: ' + e.message); }
    },

    showClaim: function() {
      var panel = document.getElementById('setup-panel');
      document.getElementById('setup-title').textContent = 'Choose your username';
      document.getElementById('setup-desc').textContent = 'Your profile page will live at magiccatengine.com/yourname. You can start building right away.';
      document.getElementById('claim-form').style.display = '';
      panel.style.display = 'block';
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    checkSlug: function(val) {
      var btn = document.getElementById('claim-btn');
      var hint = document.getElementById('claim-hint');
      btn.disabled = true;
      hint.textContent = '';
      hint.className = 'claim-hint';
      clearTimeout(_checkTimer);
      var slug = val.toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (slug.length < 3) { hint.textContent = slug.length ? 'At least 3 characters' : ''; return; }
      _checkTimer = setTimeout(async function() {
        try {
          var res = await apiFetch('/api/profile/check/' + encodeURIComponent(slug));
          var j = await res.json();
          if (j.available) {
            hint.textContent = slug + ' is available';
            hint.className = 'claim-hint ok';
            btn.disabled = false;
          } else {
            hint.textContent = slug + ' is taken';
            hint.className = 'claim-hint err';
          }
        } catch(e) {}
      }, 380);
    },

    claim: async function() {
      var val = document.getElementById('claim-input').value.trim().toLowerCase();
      if (!val) return;
      document.getElementById('claim-btn').disabled = true;
      try {
        var res = await apiFetch('/api/profile/claim', { method: 'POST', body: { username: val } });
        var j = await res.json();
        if (!res.ok) { alert(j.error || 'Failed'); return; }
        location.href = '/develop/' + encodeURIComponent(j.username);
      } catch(e) { alert('Error: ' + e.message); }
    },

    search: function(val) {
      var box = document.getElementById('search-results');
      clearTimeout(_searchTimer);
      var q = val.trim();
      if (!q) { box.innerHTML = ''; return; }
      _searchTimer = setTimeout(async function() {
        try {
          var res = await apiFetch('/api/profile/search?q=' + encodeURIComponent(q));
          var j = await res.json();
          var results = j.results || [];
          if (!results.length) { box.innerHTML = '<div class="search-empty">No public profiles found</div>'; return; }
          box.innerHTML = results.map(function(u) {
            var pic = u.picture
              ? '<img src="' + esc(u.picture) + '" onerror="this.style.display=\\'none\\'">'
              : '<div style="width:32px;height:32px;border-radius:50%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">🐱</div>';
            return '<a class="search-result" href="/' + encodeURIComponent(u.username) + '">' + pic +
              '<span><span class="sr-name">' + esc(u.name || u.username) + '</span>' +
              '<span class="sr-handle">magiccatengine.com/' + esc(u.username) + '</span></span></a>';
          }).join('');
        } catch(e) {}
      }, 300);
    }
  };

  renderNav();
  renderHeroCTA();
  renderPricingCTA();

  // Handle post-checkout redirect
  var params = new URLSearchParams(location.search);
  if (params.get('checkout') === 'success' && USER) {
    history.replaceState({}, '', '/');
    if (USER.username) {
      location.href = '/develop/' + encodeURIComponent(USER.username);
    } else {
      MCELanding.showClaim();
    }
  }
})();
</script>
</body>
</html>`;
}

// ── Landing page route (/) ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(landingPageHTML(req.user || null));
});

// ── Community gallery ─────────────────────────────────────────────────────────
app.get('/gallery', async (req, res) => {
  const { isAdmin } = require('./middleware/auth');
  try {
    const projects = await Project.find({ public: true, isProfile: true })
      .populate('userId', 'username name picture')
      .sort('-updatedAt')
      .limit(48);
    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const cards = projects.filter(p => p.userId && p.userId.username).map(p => {
      const u = p.userId;
      const pic = u.picture ? `<img src="${esc(u.picture)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid #222;flex-shrink:0" onerror="this.style.display='none'">` : `<div style="width:40px;height:40px;border-radius:50%;background:#2a2a2a;display:flex;align-items:center;justify-content:center;font-size:16px;color:#666;flex-shrink:0">🐱</div>`;
      return `<a href="/${esc(u.username)}" style="display:flex;flex-direction:column;background:#0d0d1a;border:1px solid #1e1e2e;border-radius:8px;padding:20px;text-decoration:none;color:inherit;transition:border-color .2s" onmouseover="this.style.borderColor='#a78bfa'" onmouseout="this.style.borderColor='#1e1e2e'">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">${pic}<div><div style="font-size:14px;font-weight:700;color:#e2e8f0">${esc(u.name || u.username)}</div><div style="font-size:11px;color:#666">magiccatengine.com/${esc(u.username)}</div></div></div>
        <div style="font-size:12px;color:#888;line-height:1.5;flex:1">${esc(p.name)}</div>
        <div style="font-size:10px;color:#444;margin-top:10px;text-transform:uppercase;letter-spacing:1px">View profile →</div>
      </a>`;
    }).join('');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Community — Magic Cat Engine</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#06060f;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:40px 24px 80px}
h1{font-size:28px;font-weight:900;margin-bottom:6px}p.sub{color:#888;font-size:13px;margin-bottom:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;max-width:1100px;margin:0 auto}
nav{display:flex;align-items:center;gap:16px;max-width:1100px;margin:0 auto 40px;font-size:13px}
nav a{color:#888;text-decoration:none}nav a:hover{color:#fff}
</style></head><body>
<nav><a href="/" style="font-weight:900;font-size:16px;color:#a78bfa">Magic Cat Engine</a><a href="/">Home</a><a href="/demo">Demo</a><a href="/examples">Examples</a></nav>
<div style="max-width:1100px;margin:0 auto"><h1>Community</h1><p class="sub">Public profiles built with Magic Cat Engine — click any card to see the live app.</p></div>
<div class="grid">${cards || '<p style="color:#666;text-align:center;grid-column:1/-1;padding:40px 0">No public profiles yet — be the first!</p>'}</div>
</body></html>`);
  } catch(e) { res.status(500).send('Error: ' + e.message); }
});

// ── Examples showcase ──────────────────────────────────────────────────────────
// Serves the engine's own runtime (machines/pipes/events/wires/views/logic/loops
// interpreter) as a standalone script, stripped of the editor-UI bootstrap, so the
// /examples page can embed real interactive Magic Cat Engine widgets in iframes —
// the same buildHTML/buildExportCSS/buildExportScript path the editor's own "Live"
// tab and Export button already use, just driven by data instead of the UI.
app.get('/mce-runtime.js', (req, res) => {
  const engine = db.getEngine();
  if (!engine) return res.status(503).send('// engine not seeded');
  const html = engine.html;
  const scriptStart = html.indexOf('<script>') + '<script>'.length;
  const scriptEnd = html.lastIndexOf('</script>');
  let js = html.slice(scriptStart, scriptEnd);
  const initMarker = "document.addEventListener('DOMContentLoaded'";
  const initIdx = js.lastIndexOf(initMarker);
  if (initIdx !== -1) js = js.slice(0, initIdx);
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(js);
});

function examplesPageHTML() {
  const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const total = EXAMPLES.reduce((n, g) => n + g.items.length, 0);
  const live  = EXAMPLES.reduce((n, g) => n + g.items.filter(it => it.widget).length, 0);

  const WIDGETS = {};
  const sections = EXAMPLES.map((group, gi) => `
    <section class="ex-group">
      <h2>${esc(group.category)}</h2>
      <div class="ex-grid">
        ${group.items.map((it, ii) => {
          if (!it.widget) return `
          <div class="ex-card">
            <div class="ex-icon">${it.icon}</div>
            <div class="ex-title">${esc(it.title)}</div>
            <div class="ex-desc">${esc(it.desc)}</div>
          </div>`;
          const key = `g${gi}i${ii}`;
          WIDGETS[key] = it.widget;
          return `
          <div class="ex-card ex-card-live">
            <div class="ex-card-head">
              <div class="ex-icon">${it.icon}</div>
              <div>
                <div class="ex-title">${esc(it.title)} <span class="ex-live-badge">live</span></div>
                <div class="ex-desc">${esc(it.desc)}</div>
              </div>
            </div>
            <div class="ex-widget-host" data-widget-key="${key}"><div class="ex-widget-loading">loading widget…</div></div>
          </div>`;
        }).join('')}
      </div>
    </section>`).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>100 Examples — Magic Cat Engine</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#06060f;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:0 0 80px}
nav{display:flex;align-items:center;gap:16px;max-width:1100px;margin:0 auto;padding:24px;font-size:13px}
nav a{color:#888;text-decoration:none}
nav a:hover{color:#fff}
nav a.brand{font-weight:900;font-size:16px;color:#a78bfa}
header{max-width:1100px;margin:0 auto;padding:8px 24px 40px}
header h1{font-size:32px;font-weight:900;margin-bottom:8px}
header p{color:#888;font-size:14px;max-width:640px;line-height:1.6}
header .count{color:#a78bfa;font-weight:700}
.ex-group{max-width:1100px;margin:0 auto;padding:32px 24px 8px}
.ex-group h2{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#a78bfa;margin-bottom:18px;border-bottom:1px solid #1e1e2e;padding-bottom:12px}
.ex-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.ex-card{background:#0d0d1a;border:1px solid #1e1e2e;border-radius:8px;padding:18px;transition:border-color .2s}
.ex-card:hover{border-color:#a78bfa}
.ex-card-live{grid-column:span 2;min-width:0}
.ex-card-head{display:flex;gap:12px;margin-bottom:14px}
.ex-icon{font-size:22px;margin-bottom:10px;flex-shrink:0}
.ex-title{font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:6px;line-height:1.4}
.ex-live-badge{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#000;background:#a78bfa;border-radius:4px;padding:2px 6px;vertical-align:middle;margin-left:4px}
.ex-desc{font-size:12px;color:#888;line-height:1.5}
.ex-widget-host{border:1px solid #1e1e2e;border-radius:6px;overflow:hidden;min-height:160px;background:#06060f}
.ex-widget-host iframe{width:100%;border:0;display:block}
.ex-widget-loading{padding:16px;font-size:11px;color:#555;font-family:monospace}
@media(max-width:600px){header h1{font-size:26px}.ex-card-live{grid-column:span 1}}
</style></head><body>
<nav><a href="/" class="brand">Magic Cat Engine</a><a href="/">Home</a><a href="/demo">Demo</a><a href="/gallery">Community</a><a href="/examples">Examples</a></nav>
<header>
  <h1>100 things you can build</h1>
  <p>A running catalog of what Magic Cat Engine's machines, pipes, events, wires, views, and logic blocks can put together. <span class="count">${total} of 100</span> so far, <span class="count">${live} live</span> as working interactive widgets built with the engine itself — more converted regularly.</p>
</header>
${sections}
<script src="/mce-runtime.js"></script>
<script>
(function(){
  var WIDGETS = ${JSON.stringify(WIDGETS)};

  function renderWidget(host, example) {
    MCE.project   = { name: 'Example' };
    MCE.machines  = example.machines  || {};
    MCE.rootOrder = example.rootOrder || [];
    MCE.events    = example.events    || {};
    MCE.pipes     = example.pipes     || {};
    MCE.views     = example.views     || {};
    MCE.logic     = example.logic     || {};
    MCE.loops     = example.loops     || {};
    MCE.templates = example.templates || {};
    MCE.vars      = example.vars      || {};
    MCE.css       = example.css       || '';
    MCE._nextId   = example._nextId   || 1;

    DB._store = {};
    MockAPI._endpoints = {};
    (example.dbCollections || []).forEach(function(c) {
      DB.createCollection(c.name, c.isArray !== false);
      (c.seed || []).forEach(function(doc) { DB.insert(c.name, doc); });
    });
    Object.values(MCE.pipes).forEach(function(p) { MockAPI.registerPipeEndpoints(p); });

    var roots = MCE.rootOrder.filter(function(id) { return MCE.machines[id] && !MCE.machines[id].parentId; });
    var bodyHTML = roots.map(function(id) { return MachineSystem.buildHTML(id, true); }).join('\\n');
    var css = UI.buildExportCSS();
    var script = UI.buildExportScript();
    var srcdoc = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + css + '*{box-sizing:border-box}body{margin:0}</style></head><body>' + bodyHTML + '<script>' + script + '<\\/script></body></html>';

    host.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.style.height = '220px';
    iframe.setAttribute('scrolling', 'no');
    host.appendChild(iframe);
    iframe.srcdoc = srcdoc;
  }

  var hosts = document.querySelectorAll('.ex-widget-host');
  if (!('IntersectionObserver' in window)) {
    hosts.forEach(function(h) { var ex = WIDGETS[h.dataset.widgetKey]; if (ex) renderWidget(h, ex); });
    return;
  }
  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (!entry.isIntersecting) return;
      var h = entry.target;
      var ex = WIDGETS[h.dataset.widgetKey];
      if (ex) renderWidget(h, ex);
      io.unobserve(h);
    });
  }, { rootMargin: '200px' });
  hosts.forEach(function(h) { io.observe(h); });
})();
</script>
</body></html>`;
}

app.get('/examples', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(examplesPageHTML());
});

// ── Public sandbox demo (no auth, no cloud panel, no live DB) ─────────────────
// Serves the bare engine with the built-in starter project (loadStarterProject()
// only runs when window.MCE_PROFILE is unset, which is the case here). All pipes
// in that starter project default to live:false, so everything stays client-side
// mock data — nothing is saved, nothing hits the real API.
app.get('/demo', (req, res) => {
  const engine = db.getEngine();
  if (!engine) return res.status(503).send('Engine not seeded');

  const banner = `<script>window.MCE_DEMO_MODE = true;</script>
<div style="background:#a78bfa;color:#000;text-align:center;padding:8px 16px;font-size:13px;font-weight:700;letter-spacing:.02em;position:relative;z-index:100001">
  You're playing with a live demo — nothing here is saved.
  <a href="/" style="color:#000;text-decoration:underline;margin-left:8px">Sign up to keep your work &rarr;</a>
</div>`;

  const withBanner = engine.html.replace('<body>', '<body>' + banner);
  const html = injectBeforeBodyEnd(withBanner, libraryPanelHTML());
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});

// ── Editor route (/develop/:username) ────────────────────────────────────────
app.get('/develop/:username', async (req, res, next) => {
  try {
    const slug = req.params.username.toLowerCase();

    if (!req.user) {
      return res.redirect('/auth/google?return=' + encodeURIComponent('/develop/' + slug));
    }

    if (!req.user.username || req.user.username !== slug) {
      return res.status(403).send(`
        <html><body style="font:14px monospace;padding:40px;background:#06060f;color:#ef4444">
          <h2>Not your workspace</h2>
          <p style="color:#64748b;margin-top:12px">You are signed in as <strong style="color:#e2e8f0">${htmlEsc(req.user.name || req.user.email || '')}</strong>.</p>
          ${req.user.username
            ? `<p style="margin-top:12px"><a href="/develop/${htmlEsc(req.user.username)}" style="color:#a78bfa">Go to your editor →</a></p>`
            : `<p style="color:#64748b;margin-top:12px">You haven't claimed a username yet. <a href="/" style="color:#a78bfa">Get started →</a></p>`
          }
        </body></html>
      `);
    }

    const engine = db.getEngine();
    if (!engine) return res.status(503).send('Engine not seeded');

    const lastProject = await Project.findOne({ userId: req.user._id }, '_id name data').sort({ updatedAt: -1 });

    const inject = `<script>
window.MCE_PROFILE = {
  username:    ${JSON.stringify(req.user.username)},
  name:        ${JSON.stringify(req.user.name || '')},
  picture:     ${JSON.stringify(req.user.picture || '')},
  isOwner:     true,
  data:        ${JSON.stringify(lastProject ? lastProject.data : null)},
  projectId:   ${JSON.stringify(lastProject ? String(lastProject._id) : null)},
  projectName: ${JSON.stringify(lastProject ? lastProject.name : null)}
};
</script>`;

    const withHead = engine.html.replace('</head>', inject + '\n</head>');
    const html = injectBeforeBodyEnd(withHead, libraryPanelHTML() + cloudPanelHTML());
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (e) { next(e); }
});

// ── Admin page ────────────────────────────────────────────────────────────────
function adminPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Admin — Magic Cat Engine</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif}
body{background:#06060f;color:#e2e8f0;padding:24px}
h1{font-size:20px;margin-bottom:16px}
.toolbar{display:flex;gap:8px;margin-bottom:16px}
input[type=text]{flex:1;max-width:320px;padding:8px 10px;background:#11111e;border:1px solid #2e2e3e;border-radius:5px;color:#e2e8f0;font-size:13px;outline:none}
input[type=text]:focus{border-color:#a78bfa}
button{padding:7px 14px;border-radius:5px;border:1px solid #3a3a4e;background:#1a1a2a;color:#ccc;font-size:12px;cursor:pointer}
button:hover{background:#252535;border-color:#a78bfa;color:#fff}
button.danger{border-color:#ef444466;color:#ef4444}
button.danger:hover{background:#2a1010;border-color:#ef4444}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:8px 10px;border-bottom:1px solid #1e1e2e;text-align:left;white-space:nowrap}
th{color:#888;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
tr:hover td{background:#0d0d1a}
.badge{padding:2px 7px;border-radius:3px;font-size:10px;border:1px solid}
.badge.active{color:#4ade80;border-color:#16a34a55;background:#16a34a22}
.badge.inactive{color:#888;border-color:#444;background:#1a1a1a}
.badge.on{color:#a78bfa;border-color:#a78bfa55;background:#a78bfa22}
.row-actions{display:flex;gap:5px}
.row-actions button{padding:4px 9px;font-size:11px}
.section{margin-top:36px}
.reserve-form{display:flex;gap:8px;margin-bottom:12px}
.reserve-form input{padding:7px 10px;background:#11111e;border:1px solid #2e2e3e;border-radius:5px;color:#e2e8f0;font-size:12px;outline:none}
.muted{color:#666;font-size:11px}
.status{margin-left:8px;font-size:12px}
.status.ok{color:#22c55e}
.status.err{color:#ef4444}
.pager{display:flex;gap:8px;align-items:center;margin-top:12px;font-size:12px;color:#888}
</style>
</head>
<body>
<h1>Magic Cat Engine — Admin</h1>

<div class="toolbar">
  <input type="text" id="q" placeholder="Search by email, username, or name...">
  <button onclick="Admin.search()">Search</button>
  <span class="status" id="status"></span>
</div>

<table>
  <thead>
    <tr>
      <th>Email</th><th>Name</th><th>Username</th><th>Status</th><th>Period ends</th><th>Permanent</th><th>Paid</th><th>Joined</th><th>Actions</th>
    </tr>
  </thead>
  <tbody id="rows"><tr><td colspan="9" class="muted">Loading…</td></tr></tbody>
</table>
<div class="pager">
  <button onclick="Admin.prevPage()">&larr; Prev</button>
  <span id="page-info"></span>
  <button onclick="Admin.nextPage()">Next &rarr;</button>
</div>

<div class="section">
  <h1 style="font-size:16px">Reserved usernames</h1>
  <p class="muted" style="margin-bottom:10px">Block a username from public claim without assigning it to a user.</p>
  <div class="reserve-form">
    <input type="text" id="reserve-username" placeholder="username">
    <input type="text" id="reserve-reason" placeholder="reason (optional)">
    <button onclick="Admin.reserve()">Reserve</button>
  </div>
  <table>
    <thead><tr><th>Username</th><th>Reason</th><th>Reserved by</th><th>Date</th><th></th></tr></thead>
    <tbody id="reserved-rows"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody>
  </table>
</div>

<script>
(function() {
  var state = { q: '', page: 1, limit: 50 };

  function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '—'; }
  function status(msg, ok) {
    var el = document.getElementById('status');
    el.textContent = msg;
    el.className = 'status' + (ok === true ? ' ok' : ok === false ? ' err' : '');
    if (ok !== undefined) setTimeout(function(){ el.textContent=''; }, 2500);
  }
  function api(url, opts) {
    opts = Object.assign({ credentials: 'include' }, opts || {});
    if (opts.body && typeof opts.body === 'object') {
      opts.body = JSON.stringify(opts.body);
      opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    }
    return fetch(url, opts).then(function(r) {
      if (!r.ok) return r.json().then(function(j) { throw new Error(j.error || r.statusText); });
      return r.json();
    });
  }

  function userRow(u) {
    var tr = document.createElement('tr');

    function td(text) { var c = document.createElement('td'); c.textContent = text; return c; }
    tr.appendChild(td(u.email));
    tr.appendChild(td(u.name || '—'));
    tr.appendChild(td(u.username || '—'));

    var statusTd = document.createElement('td');
    var badge = document.createElement('span');
    badge.className = 'badge ' + (u.subscriptionStatus === 'active' ? 'active' : 'inactive');
    badge.textContent = u.subscriptionStatus;
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);

    tr.appendChild(td(fmtDate(u.subscriptionPeriodEnd)));

    var permTd = document.createElement('td');
    var permBtn = document.createElement('button');
    permBtn.textContent = u.isPermanent ? 'Yes ✕' : 'No';
    if (u.isPermanent) permBtn.classList.add('danger');
    permBtn.onclick = function() { Admin.togglePermanent(u.id, !u.isPermanent); };
    permTd.appendChild(permBtn);
    tr.appendChild(permTd);

    var paidTd = document.createElement('td');
    var paidBtn = document.createElement('button');
    paidBtn.textContent = u.manualPaid ? 'Yes ✕' : 'No';
    if (u.manualPaid) paidBtn.classList.add('danger');
    paidBtn.onclick = function() { Admin.togglePaid(u.id, !u.manualPaid); };
    paidTd.appendChild(paidBtn);
    tr.appendChild(paidTd);

    tr.appendChild(td(fmtDate(u.createdAt)));

    var actionsTd = document.createElement('td');
    var actions = document.createElement('div');
    actions.className = 'row-actions';
    var setBtn = document.createElement('button');
    setBtn.textContent = 'Set username';
    setBtn.onclick = function() { Admin.setUsername(u.id, u.username); };
    actions.appendChild(setBtn);
    actionsTd.appendChild(actions);
    tr.appendChild(actionsTd);

    return tr;
  }

  window.Admin = {
    async load() {
      status('Loading…');
      try {
        var qs = new URLSearchParams({ q: state.q, page: state.page, limit: state.limit });
        var j = await api('/api/admin/users?' + qs.toString());
        var tbody = document.getElementById('rows');
        tbody.innerHTML = '';
        if (!j.users.length) {
          var tr = document.createElement('tr');
          var c = document.createElement('td'); c.colSpan = 9; c.className = 'muted'; c.textContent = 'No users found.';
          tr.appendChild(c); tbody.appendChild(tr);
        } else {
          j.users.forEach(function(u) { tbody.appendChild(userRow(u)); });
        }
        document.getElementById('page-info').textContent = 'Page ' + j.page + ' · ' + j.total + ' total';
        status('', undefined);
      } catch (e) { status('Error: ' + e.message, false); }
    },

    search() { state.q = document.getElementById('q').value.trim(); state.page = 1; Admin.load(); },
    nextPage() { state.page++; Admin.load(); },
    prevPage() { if (state.page > 1) { state.page--; Admin.load(); } },

    async togglePermanent(id, value) {
      try { await api('/api/admin/users/' + id + '/permanent', { method: 'POST', body: { value: value } }); Admin.load(); }
      catch (e) { status('Error: ' + e.message, false); }
    },

    async togglePaid(id, value) {
      try { await api('/api/admin/users/' + id + '/paid', { method: 'POST', body: { value: value } }); Admin.load(); }
      catch (e) { status('Error: ' + e.message, false); }
    },

    async setUsername(id, current) {
      var val = prompt('Set username (blank to clear):', current || '');
      if (val === null) return;
      try {
        await api('/api/admin/users/' + id + '/username', { method: 'POST', body: { username: val.trim() } });
        Admin.load();
      } catch (e) { status('Error: ' + e.message, false); }
    },

    async loadReserved() {
      try {
        var list = await api('/api/admin/reserved');
        var tbody = document.getElementById('reserved-rows');
        tbody.innerHTML = '';
        if (!list.length) {
          var tr = document.createElement('tr');
          var c = document.createElement('td'); c.colSpan = 5; c.className = 'muted'; c.textContent = 'No reserved usernames.';
          tr.appendChild(c); tbody.appendChild(tr);
          return;
        }
        list.forEach(function(r) {
          var tr = document.createElement('tr');
          [r.username, r.reason || '—', r.reservedBy || '—', fmtDate(r.createdAt)].forEach(function(text) {
            var td = document.createElement('td'); td.textContent = text; tr.appendChild(td);
          });
          var actionsTd = document.createElement('td');
          var btn = document.createElement('button');
          btn.className = 'danger'; btn.textContent = 'Release';
          btn.onclick = function() { Admin.releaseReserved(r.username); };
          actionsTd.appendChild(btn);
          tr.appendChild(actionsTd);
          tbody.appendChild(tr);
        });
      } catch (e) { status('Error: ' + e.message, false); }
    },

    async reserve() {
      var username = document.getElementById('reserve-username').value.trim();
      var reason   = document.getElementById('reserve-reason').value.trim();
      if (!username) return;
      try {
        await api('/api/admin/reserved', { method: 'POST', body: { username: username, reason: reason } });
        document.getElementById('reserve-username').value = '';
        document.getElementById('reserve-reason').value = '';
        Admin.loadReserved();
      } catch (e) { status('Error: ' + e.message, false); }
    },

    async releaseReserved(username) {
      try { await api('/api/admin/reserved/' + encodeURIComponent(username), { method: 'DELETE' }); Admin.loadReserved(); }
      catch (e) { status('Error: ' + e.message, false); }
    }
  };

  document.getElementById('q').addEventListener('keydown', function(e) { if (e.key === 'Enter') Admin.search(); });
  Admin.load();
  Admin.loadReserved();
})();
</script>
</body>
</html>`;
}

app.get('/admin', (req, res) => {
  const { isAdmin } = require('./middleware/auth');
  if (!req.user) return res.redirect('/auth/google?return=' + encodeURIComponent('/admin'));
  if (!isAdmin(req.user)) return res.status(403).send('Admin access required');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(adminPageHTML());
});

// ── Public profile pages /:username ──────────────────────────────────────────
// Keep this LAST so it doesn't shadow any named route above.
app.get('/:username', async (req, res, next) => {
  try {
    const slug = req.params.username.toLowerCase();

    const owner = await User.findOne({ username: slug }, '_id name picture username');
    if (!owner) return res.status(404).send(`
      <html><body style="font:14px monospace;padding:40px;background:#06060f;color:#ef4444">
        <h2>Profile not found</h2>
        <p style="margin-top:12px;color:#64748b">No user has claimed <strong style="color:#e2e8f0">/${htmlEsc(slug)}</strong> yet.</p>
        <p style="margin-top:12px"><a href="/" style="color:#a78bfa">&#8592; magiccatengine.com</a></p>
      </body></html>
    `);

    const [profile, varStore] = await Promise.all([
      Project.findOne({ userId: owner._id, isProfile: true }, 'data'),
      VarStore.findOne({ userId: owner._id }),
    ]);
    const liveVars = varStore ? Object.fromEntries(varStore.vars) : {};
    const engine  = db.getEngine();
    if (!engine) return res.status(503).send('Engine not seeded');

    // No published content yet — show a placeholder
    if (!profile || !profile.data) {
      return res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEsc(owner.name || owner.username)} — Magic Cat Engine</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#06060f;color:#e2e8f0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:40px}img{width:80px;height:80px;border-radius:50%;border:2px solid #a78bfa}h1{font-size:24px;font-weight:700}p{color:#64748b;font-size:15px}a{color:#a78bfa;text-decoration:none}a:hover{text-decoration:underline}</style>
</head>
<body>
${owner.picture ? `<img src="${htmlEsc(owner.picture)}" alt="">` : ''}
<h1>${htmlEsc(owner.name || owner.username)}</h1>
<p>This profile page hasn't been published yet.</p>
<a href="/">← magiccatengine.com</a>
</body></html>`);
    }

    // Hide all IDE chrome — only the preview iframe is visible
    const chromeCss = `<style>
#header,#left-panel,#right-panel,#log-panel,#canvas-toolbar,#canvas-view,#dom-view,.modal-overlay{display:none!important}
#app,#main-layout,#center-panel,#canvas-views{height:100vh!important;width:100%!important;overflow:hidden}
#preview-view{display:block!important;position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;overflow-y:auto!important;z-index:99999}
#preview-frame{width:100%!important;min-height:100vh!important;border:none!important;display:block!important}
</style>`;

    const isOwner = !!(req.user && req.user._id.toString() === owner._id.toString());
    const inject = `<script>
window.MCE_PROFILE = {
  username: ${JSON.stringify(owner.username)},
  name:     ${JSON.stringify(owner.name || '')},
  picture:  ${JSON.stringify(owner.picture || '')},
  isOwner:  ${isOwner},
  data:     ${JSON.stringify(profile.data)}
};
window.MCE_LIVE_VARS = ${JSON.stringify(liveVars)};
window.MCE_PUBLIC_USERNAME = ${isOwner ? 'null' : JSON.stringify(owner.username)};
</script>${chromeCss}`;

    // Auto-load project data and trigger the engine's built-in preview renderer
    const autoRunJS = `<script>
(function(){
  var d = window.MCE_PROFILE && window.MCE_PROFILE.data;
  if(!d) return;
  // Normalize machine fields the engine assumes are always objects/arrays
  if(d.machines){
    Object.values(d.machines).forEach(function(m){
      if(!m.attrs)    m.attrs    = {};
      if(!m.css)      m.css      = {};
      if(!m.children) m.children = [];
      if(!m.wires)    m.wires    = [];
    });
  }
  // DOMContentLoaded listeners fire in registration order.
  // The engine's listener (registered earlier) runs UI.init()+loadStarterProject() first;
  // our listener runs after and overwrites with profile data.
  document.addEventListener('DOMContentLoaded', function(){
    // Merge live DB var values into project data for public vars
    if(window.MCE_LIVE_VARS && d.vars) {
      Object.keys(d.vars).forEach(function(k) {
        if(d.vars[k] && d.vars[k].public && MCE_LIVE_VARS[k] !== undefined) {
          d.vars[k].value = MCE_LIVE_VARS[k];
        }
      });
    }
    // Patch switchCanvasTab to a no-op while we call runPreview(),
    // preventing the runPreview→switchCanvasTab→runPreview mutual recursion.
    var origSwitch = UI.switchCanvasTab.bind(UI);
    UI.switchCanvasTab = function(){};
    UI._loadJSON(d);
    UI.runPreview();
    UI.switchCanvasTab = origSwitch;
  });
})();
<\/script>`;

    const withHead = engine.html.replace('</head>', inject + '\n</head>');
    const html = injectBeforeBodyEnd(withHead, autoRunJS);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(html);
  } catch (e) { next(e); }
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
(async () => {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`MCEngine listening on ${BASE_URL}`);
    if (ADMIN_KEY === 'changeme') console.warn('⚠  Set ADMIN_KEY in .env');
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'changeme-session')
      console.warn('⚠  Set SESSION_SECRET in .env');
  });
})();
