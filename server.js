require('dotenv').config();
const express    = require('express');
const multer     = require('multer');
const cors       = require('cors');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const passport   = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

const db              = require('./db');
const { connect: connectMongo } = require('./db/mongoose');
const User            = require('./models/User');
const Project         = require('./models/Project');
const { handleWebhook } = require('./routes/stripe');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme';
const PORT      = process.env.PORT || 3000;
const BASE_URL  = process.env.BASE_URL || `http://localhost:${PORT}`;

// ── Stripe webhook (raw body, BEFORE json middleware) ──────────────────────────
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), handleWebhook);

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
app.use('/stripe',       require('./routes/stripe').router);

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = req.user;
  res.json({
    user: {
      id:                 u._id,
      name:               u.name,
      email:              u.email,
      picture:            u.picture,
      username:           u.username,
      subscriptionStatus: u.subscriptionStatus,
    },
  });
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
    if (_user.subscriptionStatus !== 'active') { showPanel('mcec-gate-subscribe'); return; }
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

    async save() {
      var data = mceData();
      if (!data) return status('MCE not ready', false);
      var name = (MCE.project && MCE.project.name) || 'Untitled';
      status('Saving…');
      try {
        var res = await apiFetch(_id ? '/api/projects/' + _id : '/api/projects', {
          method: _id ? 'PUT' : 'POST',
          body: { name: name, data: data }
        });
        if (!res.ok) { var e = await res.json(); throw new Error(e.error || res.statusText); }
        var j = await res.json();
        _id = j.id;
        syncName();
        status('Saved: ' + name, true);
        MCE_CLOUD.refresh();
      } catch(e) { status('Error: ' + e.message, false); }
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
})();
</script>
`;
}

// ── Engine route (/) ──────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const engine = db.getEngine();
  if (!engine) {
    return res.status(503).send(`
      <html><body style="font:14px monospace;padding:40px;background:#111;color:#ef4444">
        <h2>Engine not seeded</h2>
        <p>Run: <code style="color:#22c55e">npm run seed</code> to load magiccatengine.html into the database.</p>
      </body></html>
    `);
  }
  const html = engine.html.replace('</body>', cloudPanelHTML() + '\n</body>');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ── Public profile pages /:username ──────────────────────────────────────────
// Keep this LAST so it doesn't shadow any named route above.
app.get('/:username', async (req, res) => {
  const slug = req.params.username.toLowerCase();

  const owner = await User.findOne({ username: slug }, '_id name picture username');
  if (!owner) return res.status(404).send(`
    <html><body style="font:14px monospace;padding:40px;background:#111;color:#ef4444">
      <h2>Profile not found</h2><p>No user has claimed the username <strong>${slug}</strong> yet.</p>
      <a href="/" style="color:#a78bfa">&#8592; Back to Magic Cat Engine</a>
    </body></html>
  `);

  const profile = await Project.findOne({ userId: owner._id, isProfile: true }, 'data');
  const engine  = db.getEngine();
  if (!engine) return res.status(503).send('Engine not seeded');

  const isOwner = req.user && req.user._id.toString() === owner._id.toString();

  const inject = `
<script>
window.MCE_PROFILE = {
  username: ${JSON.stringify(owner.username)},
  name:     ${JSON.stringify(owner.name)},
  picture:  ${JSON.stringify(owner.picture || '')},
  isOwner:  ${isOwner},
  data:     ${JSON.stringify(profile ? profile.data : null)}
};
</script>`;

  const html = engine.html
    .replace('</head>', inject + '\n</head>')
    .replace('</body>', cloudPanelHTML() + '\n</body>');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
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
