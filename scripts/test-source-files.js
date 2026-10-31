'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { checkSource, REQUIRED, FIXTURES } = require('./check-source-files');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alm-source-integrity-'));
try {
  const files = [];
  for (const name of REQUIRED) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const bytes = Buffer.from(`fixture ${name}`);
    fs.writeFileSync(target, bytes);
    files.push({ path: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  const manifest = JSON.stringify({ schema: 1, files });
  fs.writeFileSync(path.join(root, 'SOURCE-MANIFEST.json'), manifest);
  assert.equal(checkSource(root).ok, true);
  for (const name of FIXTURES) {
    const target = path.join(root, name), bytes = fs.readFileSync(target);
    fs.unlinkSync(target);
    assert.ok(checkSource(root).issues.includes(`Fichier absent : ${name}`));
    fs.writeFileSync(target, bytes);
    // A present fixture omitted by the archive manifest must also fail early.
    fs.writeFileSync(path.join(root, 'SOURCE-MANIFEST.json'), JSON.stringify({ schema: 1, files: files.filter(entry => entry.path !== name) }));
    assert.ok(checkSource(root).issues.includes(`Fichier non reference dans le manifeste : ${name}`));
    fs.writeFileSync(path.join(root, 'SOURCE-MANIFEST.json'), manifest);
    assert.equal(checkSource(root).ok, true);
  }
  const server = fs.readFileSync(path.join(root, 'server.js'));
  fs.unlinkSync(path.join(root, 'server.js'));
  assert.ok(checkSource(root).issues.includes('Fichier absent : server.js'));
  fs.writeFileSync(path.join(root, 'server.js'), server);
  fs.appendFileSync(path.join(root, 'db.js'), 'corrupted');
  assert.ok(checkSource(root).issues.includes('Fichier incomplet ou modifie : db.js'));
  fs.writeFileSync(path.join(root, 'SOURCE-MANIFEST.json'), '{');
  assert.ok(checkSource(root).issues.some(s => s.includes('absent ou illisible')));
  fs.writeFileSync(path.join(root, 'SOURCE-MANIFEST.json'), JSON.stringify({ schema: 1, files: [{ path: '../outside', sha256: '0'.repeat(64), bytes: 0 }] }));
  assert.ok(checkSource(root).issues.includes('Entree invalide dans SOURCE-MANIFEST.json.'));
  console.log('OK : archive complete, fixtures absentes ou non referencees, server.js manquant, fichier altere et manifeste invalide detectes.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
