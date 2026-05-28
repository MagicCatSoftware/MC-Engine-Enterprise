// File-based storage — no native dependencies, works on all platforms.
// Layout:
//   data/engine.html        — the engine HTML
//   data/engine.json        — engine metadata (version, updated_at)
//   data/projects.json      — project index (id, name, timestamps, no data)
//   data/projects/{id}.json — individual project data

const fs   = require('fs');
const path = require('path');

const DATA     = path.join(__dirname, '../data');
const PROJ_DIR = path.join(DATA, 'projects');

fs.mkdirSync(DATA,     { recursive: true });
fs.mkdirSync(PROJ_DIR, { recursive: true });

const ENGINE_HTML = path.join(DATA, 'engine.html');
const ENGINE_META = path.join(DATA, 'engine.json');
const PROJ_INDEX  = path.join(DATA, 'projects.json');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { return fallback; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ---- Engine ----

function getEngine() {
  if (!fs.existsSync(ENGINE_HTML)) return null;
  const meta = readJSON(ENGINE_META, {});
  return {
    html:       fs.readFileSync(ENGINE_HTML, 'utf8'),
    version:    meta.version    || null,
    updated_at: meta.updated_at || null,
  };
}

function upsertEngine(html, version) {
  const now = Date.now();
  fs.writeFileSync(ENGINE_HTML, html, 'utf8');
  writeJSON(ENGINE_META, { version, updated_at: now });
  return { version, updated_at: now };
}

// ---- Projects ----

function readIndex() {
  return readJSON(PROJ_INDEX, []);
}

function writeIndex(index) {
  writeJSON(PROJ_INDEX, index);
}

function listProjects() {
  return readIndex();
}

function getProject(id) {
  const idx  = readIndex();
  const meta = idx.find(p => p.id === Number(id));
  if (!meta) return null;
  const data = readJSON(path.join(PROJ_DIR, `${id}.json`), {});
  return { ...meta, data };
}

function createProject(name, data) {
  const idx = readIndex();
  const id  = idx.length ? Math.max(...idx.map(p => p.id)) + 1 : 1;
  const now = Date.now();
  const meta = { id, name, created_at: now, updated_at: now };
  idx.push(meta);
  writeIndex(idx);
  writeJSON(path.join(PROJ_DIR, `${id}.json`), data);
  return meta;
}

function updateProject(id, name, data) {
  const idx = readIndex();
  const i   = idx.findIndex(p => p.id === Number(id));
  if (i === -1) return null;
  const now = Date.now();
  if (name) idx[i].name = name;
  idx[i].updated_at = now;
  writeIndex(idx);
  if (data !== undefined) writeJSON(path.join(PROJ_DIR, `${id}.json`), data);
  return { id: Number(id), name: idx[i].name, updated_at: now };
}

function deleteProject(id) {
  writeIndex(readIndex().filter(p => p.id !== Number(id)));
  const f = path.join(PROJ_DIR, `${id}.json`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

module.exports = { getEngine, upsertEngine, listProjects, getProject, createProject, updateProject, deleteProject };
