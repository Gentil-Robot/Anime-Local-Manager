'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('offline prototype preserves personal work through add, progress, notebook, XML import and restart', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alm-rescue-http-'));
  const originalFetch = global.fetch;
  process.env.ALM_DATA_DIR = directory;
  process.env.ALM_IMAGES_DIR = path.join(directory, 'images');
  process.env.ALM_AUTOMATION_STARTUP = '0';
  process.env.ALM_SQLJS_ONLY = process.env.ALM_SQLJS_ONLY || '0';
  const sentinel = {id: 1, title: 'Synthetic offline work', status: 'Watching', episodesSeen: '2', episodesTotal: '12', notes: 'Notes personnelles 💜\nDeuxième ligne', malId: '999999', anilistId: '888888', manualMetadata: true};
  fs.writeFileSync(path.join(directory, 'animes.json'), JSON.stringify([sentinel]));
  const stableEvidence = path.join(directory, 'stable-profile-evidence.json');
  fs.writeFileSync(stableEvidence, JSON.stringify({unchanged: true, notes: sentinel.notes}));
  const stableBytes = fs.readFileSync(stableEvidence);
  const store = require('../lib/independent-catalogue').createCatalogue(path.join(directory, 'independent-catalogue'));
  const data = require('../lib/independent-catalogue').fromWikidata({results: {bindings: [
    {item: {value: 'http://www.wikidata.org/entity/Q1'}, label: {value: 'Synthetic offline work', 'xml:lang': 'en'}}
  ]}}, '2026-11-05').catalogue;
  store.install(data);
  let listener, server, db;
  t.after(async () => {
    if (server) { server.stopBackups(); server.stopMaintenance(); server.closeCommunity(); }
    if (listener) await new Promise(resolve => listener.close(resolve));
    if (db) db.close();
    global.fetch = originalFetch;
    fs.rmSync(directory, {recursive: true, force: true});
  });
  server = require('../server'); db = require('../db');
  await db.whenReady();
  listener = await server.startServer(49000 + Math.floor(Math.random() * 1000));
  const origin = 'http://127.0.0.1:' + listener.almPort;
  async function call(route, method = 'GET', body, expected = 200) {
    const response = await originalFetch(origin + route, {method, headers: body === undefined ? {} : {'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
    const result = await response.json();
    assert.equal(response.status, expected, route + ': ' + JSON.stringify(result));
    return result;
  }
  assert.equal(db.getMetadataCount(), 0, 'the legacy MAL snapshot must not seed the profile');
  assert.equal((await call('/api/rescue/status')).offline, true);
  const first = (await call('/api/animes')).find(a => a.id === 1);
  for (const key of ['notes', 'malId', 'anilistId', 'episodesSeen']) assert.equal(String(first[key]), String(sentinel[key]));
  const catalog = await call('/api/independent-catalogue?q=offline'); assert.equal(catalog.total, 1);
  const added = await call('/api/independent-catalogue/add', 'POST', {catalogueId: 'alm:wd:Q1'});
  assert.equal(added.existing, false);
  assert.notEqual(added.id, 1, 'same title is not proof of a link between MAL and Wikidata');
  assert.equal((await call('/api/independent-catalogue/add', 'POST', {catalogueId: 'alm:wd:Q1'})).existing, true);
  const personal = (await call('/api/animes')).find(a => a.id === added.id);
  assert.equal(personal.catalogueId, 'alm:wd:Q1'); assert(!personal.malId);
  const progressed = await call('/api/library/1/episode', 'POST', {delta: 1}); assert.equal(progressed.anime.episodesSeen, '3');
  const notebook = await call('/api/library/1/notebook');
  const updatedNotes = sentinel.notes + '\nSouvenir conservé.';
  await call('/api/library/1/notebook', 'PATCH', {revision: notebook.revision, notes: updatedNotes, personalJournal: notebook.personalJournal});
  assert.equal((await call('/api/library/1/notebook')).notes, updatedNotes);
  const form = new FormData();
  form.append('file', new Blob(['<myanimelist><anime><series_animedb_id>1234567</series_animedb_id><series_title>Personal XML import</series_title><series_episodes>12</series_episodes><my_watched_episodes>4</my_watched_episodes><my_status>Watching</my_status><my_score>8</my_score></anime></myanimelist>'], {type: 'application/xml'}), 'personal.xml');
  const imported = await originalFetch(origin + '/api/import/xml', {method: 'POST', body: form});
  assert.equal(imported.status, 200, await imported.text());
  assert((await call('/api/animes')).some(a => a.title === 'Personal XML import'));
  for (const route of ['/api/metadata/preload', '/api/metadata/sync']) {
    const skipped = await call(route, 'POST', {force: true}); assert.equal(skipped.reason, 'ALM_RESCUE_OFFLINE');
  }
  assert.equal((await call('/api/config/providers')).malConfigured, false);
  const html = await originalFetch(origin + '/');
  const csp = html.headers.get('content-security-policy');
  assert(csp.includes("img-src 'self' data:")); assert(!csp.includes('https:'));
  assert((await html.text()).includes('rescue-notice.js'));
  db.flush();
  const persisted = JSON.parse(fs.readFileSync(path.join(directory, 'animes.json'), 'utf8'));
  assert.equal(persisted.find(a => a.id === 1).notes, updatedNotes);
  assert.equal(persisted.find(a => a.id === added.id).catalogueId, 'alm:wd:Q1');
  assert.deepEqual(fs.readFileSync(stableEvidence), stableBytes);
  await assert.rejects(global.fetch('https://graphql.anilist.co'), /ALM_RESCUE_OFFLINE/);
  // A separate process proves that the recovery JSON is usable after restart.
  const {spawnSync} = require('node:child_process');
  const child = spawnSync(process.execPath, ['-e', "const db=require('./db');db.initDb(process.env.ALM_DATA_DIR).then(()=>{const a=db.getAllAnimes();if(!a.some(x=>x.catalogueId==='alm:wd:Q1')||!a.some(x=>x.notes.includes('Souvenir conservé.')))process.exitCode=1;db.close();});"], {cwd: path.resolve(__dirname, '..'), env: {...process.env, ALM_SQLJS_ONLY: '1'}, encoding: 'utf8', timeout: 20000});
  assert.equal(child.status, 0, child.stderr + child.stdout);
});
