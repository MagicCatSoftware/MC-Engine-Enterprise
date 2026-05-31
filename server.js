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
app.use('/stripe',       require('./routes/stripe').router);

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = req.user;
  const { isAdmin } = require('./middleware/auth');
  res.json({
    user: {
      id:                 u._id,
      name:               u.name,
      email:              u.email,
      picture:            u.picture,
      username:           u.username,
      subscriptionStatus: u.subscriptionStatus,
      isAdmin:            isAdmin(u),
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
    badge.style.display = user.subscriptionStatus === 'active' ? '' : 'none';
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
    if (!_user.isAdmin && _user.subscriptionStatus !== 'active') { showPanel('mcec-gate-subscribe'); return; }
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
      dbCollections: (MCE.dbCollections || []).slice(),
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

  // Save on page close/refresh (keepalive survives unload)
  window.addEventListener('beforeunload', function() {
    if (!_id || typeof MCE === 'undefined') return;
    var data = mceData();
    if (!data) return;
    fetch('/api/projects/' + _id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({ name: (MCE.project && MCE.project.name) || 'Untitled', data: data })
    });
  });

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
}
</style>
</head>
<body>
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
  <p>Magic Cat Engine is a no-code IDE for crafting interactive, database-driven profile pages.</p>
  <div class="url-demo"><span>magiccatengine.com/</span>yourname</div><br>
  <div id="hero-cta">
    <a href="/auth/google" class="btn btn-primary">Sign in with Google — free to start</a>
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

<div class="pricing" id="pricing">
  <h2>Simple pricing</h2>
  <p class="sub">One plan. Everything included.</p>
  <div class="price-box featured">
    <div class="price-num">$5</div>
    <div class="price-per">per month</div>
    <ul class="price-list">
      <li>Your own profile URL</li>
      <li>Unlimited cloud projects</li>
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
        '<br><br><a href="/' + encodeURIComponent(USER.username) + '" class="btn btn-outline" style="margin-top:8px">View public profile →</a>';
    } else {
      cta.innerHTML = '<button class="btn btn-primary" onclick="MCELanding.showClaim()">Claim your username →</button>';
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
    const html = injectBeforeBodyEnd(withHead, cloudPanelHTML());
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { next(e); }
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
#preview-view{display:block!important;position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;z-index:99999}
#preview-frame{width:100%!important;height:100%!important;border:none!important}
</style>`;

    const inject = `<script>
window.MCE_PROFILE = {
  username: ${JSON.stringify(owner.username)},
  name:     ${JSON.stringify(owner.name || '')},
  picture:  ${JSON.stringify(owner.picture || '')},
  isOwner:  false,
  data:     ${JSON.stringify(profile.data)}
};
window.MCE_LIVE_VARS = ${JSON.stringify(liveVars)};
window.MCE_PUBLIC_USERNAME = ${JSON.stringify(owner.username)};
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
