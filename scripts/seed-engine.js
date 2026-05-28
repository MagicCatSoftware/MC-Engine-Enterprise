// Seeds magiccatengine.html into the database for the first time.
// Usage:
//   npm run seed
//   node scripts/seed-engine.js [path/to/magiccatengine.html]

const fs   = require('fs');
const path = require('path');
const db   = require('../db');

const enginePath = process.argv[2]
  || path.join(__dirname, '../../Magic Cat Engine/magiccatengine.html');

if (!fs.existsSync(enginePath)) {
  console.error('Engine file not found:', enginePath);
  console.error('Pass the path as an argument: node scripts/seed-engine.js /path/to/magiccatengine.html');
  process.exit(1);
}

const html    = fs.readFileSync(enginePath, 'utf8');
const version = '1.0.0-' + new Date().toISOString().slice(0, 10);
db.upsertEngine(html, version);
console.log('Engine seeded successfully');
console.log('Version :', version);
console.log('Size    :', (html.length / 1024).toFixed(1) + ' KB');
