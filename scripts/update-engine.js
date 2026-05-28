// Updates the engine HTML in the database from a local file.
// Use this whenever you have a new version of magiccatengine.html.
// Usage:
//   npm run update-engine
//   node scripts/update-engine.js [path/to/magiccatengine.html] [version-tag]

const fs   = require('fs');
const path = require('path');
const db   = require('../db');

const enginePath = process.argv[2]
  || path.join(__dirname, '../../Magic Cat Engine/magiccatengine.html');

const version = process.argv[3]
  || new Date().toISOString().slice(0, 10) + '-' + Date.now().toString(36);

if (!fs.existsSync(enginePath)) {
  console.error('File not found:', enginePath);
  process.exit(1);
}

const html = fs.readFileSync(enginePath, 'utf8');
if (!html.includes('</body>')) {
  console.error('File does not look like valid HTML (no </body> tag found)');
  process.exit(1);
}

const old = db.getEngine();
if (old) {
  console.log('Previous version:', old.version, '—', new Date(old.updated_at).toLocaleString());
}

db.upsertEngine(html, version);
console.log('Engine updated successfully');
console.log('New version     :', version);
console.log('Size            :', (html.length / 1024).toFixed(1) + ' KB');
