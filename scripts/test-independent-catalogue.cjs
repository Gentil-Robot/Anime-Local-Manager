'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createCatalogue, fromWikidata, validateCatalogue, verify} = require('../lib/independent-catalogue');

// Synthetic fixtures only. Q1/Q2 here do not describe the real Wikidata items.
function binding(qid, title, language = 'en', episodes = '12') {
  return {item: {value: 'http://www.wikidata.org/entity/' + qid}, label: {value: title, 'xml:lang': language},
    episodes: {value: episodes}, picture: {value: 'https://cdn.myanimelist.net/unreviewed.jpg'}, synopsis: {value: 'Unreviewed text'}};
}
const input = () => ({results: {bindings: [binding('Q1', 'Synthetic Moon'), binding('Q1', '月のテスト', 'ja'), binding('Q2', 'Synthetic Étoile', 'fr')]}});
const candidate = version => fromWikidata(input(), version).catalogue;
function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alm-independent-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return {directory, store: createCatalogue(directory)};
}

test('Wikidata facts have stable independent ids and discard all unreviewed fields', () => {
  const {catalogue, report} = fromWikidata(input(), '2026-11-05');
  assert.equal(catalogue.records[0].id, 'alm:wd:Q1');
  assert.equal(catalogue.records[0].sourceUrl, 'https://www.wikidata.org/wiki/Q1');
  assert.equal(catalogue.records[0].episodes, 12);
  assert.equal(catalogue.records[0].titles.ja, '月のテスト');
  assert(!JSON.stringify(catalogue).includes('myanimelist'));
  assert.equal(report.images, 0); assert.equal(report.synopses, 0);
  assert.equal(report.coverageValidated, false);
});

test('ambiguous labels and episode counts are omitted instead of silently chosen', () => {
  const data = input(); data.results.bindings.push(binding('Q1', 'Conflicting title', 'en', '24'));
  const {catalogue, report} = fromWikidata(data, '2026-11-05');
  const row = catalogue.records.find(r => r.id === 'alm:wd:Q1');
  assert.equal(row.episodes, undefined); assert.equal(row.titles.en, undefined);
  assert(report.ambiguitiesOmitted >= 2);
});

test('source, field and identity validation reject malformed or reassigned data', () => {
  const data = candidate('2026-11-05');
  data.records[0].malId = 123;
  assert.throws(() => validateCatalogue(data), /ALM_CATALOGUE_RECORD/);
  delete data.records[0].malId;
  data.records.push({...data.records[0]});
  assert.throws(() => validateCatalogue(data), /ALM_CATALOGUE_RECORD/);
  assert.throws(() => fromWikidata({results: {bindings: []}}, '2026-11-05'), /ALM_CATALOGUE_FORMAT/);
  assert.throws(() => fromWikidata(input(), '../../escape'), /ALM_WIKIDATA_FORMAT/);
});

test('local entity exports preserve revisions without importing MAL ids or artwork', () => {
  const entity = {id: 'Q1', lastrevid: 12345, labels: {en: {language: 'en', value: 'Synthetic entity'}},
    claims: {P4086: [{rank: 'normal', mainsnak: {snaktype: 'value', datavalue: {value: '999'}}}],
      P18: [{mainsnak: {datavalue: {value: 'Unreviewed image.jpg'}}}]}};
  const {catalogue, report} = require('../lib/independent-catalogue').fromWikidataEntities({entities: {Q1: entity}}, '2026-11-05');
  assert.equal(catalogue.records[0].sourceRevision, 12345);
  assert.equal(report.withPinnedRevisions, 1);
  assert(!Object.hasOwn(catalogue.records[0], 'malId'));
  assert(!JSON.stringify(catalogue).includes('image.jpg'));
});

test('same titles cannot silently associate Wikidata entities with imported seasons', () => {
  const collection = require('../public/collection-state');
  const season = require('../lib/season-identity');
  const a = {catalogueId: 'alm:wd:Q1', title: 'Same title'};
  const imported = {malId: '123', title: 'Same title'};
  assert.equal(collection.same(a, imported), false);
  assert.equal(season.sameSeason(a, imported), false);
  assert.equal(collection.same(a, {...a, catalogueId: 'alm:wd:Q2'}), false);
  assert.equal(collection.same(a, {...a, title: 'Revised label'}), true);
  assert.equal(season.sameSeason(a, {...a, title: 'Revised label'}), true);
});

test('install, multilingual search and version updates keep the same identities', t => {
  const {store} = temporary(t);
  assert.equal(store.read(), null);
  const first = store.install(candidate('2026-11-05'));
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.equal(store.search('etoile').items[0].id, 'alm:wd:Q2');
  assert.equal(store.search('月の').items[0].id, 'alm:wd:Q1');
  assert.equal(store.search('', {limit: 1, offset: 1}).items.length, 1);
  const next = candidate('2026-11-05.2'); next.records[0].title = 'Revised Moon'; next.records[0].titles.en = 'Revised Moon';
  store.install(next);
  assert.equal(store.get('alm:wd:Q1').title, 'Revised Moon');
  assert.equal(store.rollback().sha256, first.sha256);
  assert.equal(store.get('alm:wd:Q1').title, 'Synthetic Moon');
});

test('hash mismatches fail closed; rollback recovers a corrupted current payload', t => {
  const {directory, store} = temporary(t);
  const old = store.install(candidate('2026-11-05'));
  const current = store.install(candidate('2026-11-05.2'));
  fs.appendFileSync(path.join(directory, current.file), 'corruption');
  assert.throws(() => store.search('moon'), /ALM_CATALOGUE_HASH/);
  assert.equal(store.rollback().sha256, old.sha256);
  assert.equal(store.read().manifest.version, '2026-11-05');
});

test('failed pointer replacement leaves the previous catalogue readable', t => {
  const {directory, store} = temporary(t);
  const first = store.install(candidate('2026-11-05'));
  const rename = fs.renameSync;
  fs.renameSync = (source, target) => {
    if (target === path.join(directory, 'current.json')) throw Error('Simulated disk failure');
    return rename(source, target);
  };
  try { assert.throws(() => store.install(candidate('2026-11-05.2')), /Simulated disk failure/); }
  finally { fs.renameSync = rename; }
  assert.equal(store.read().manifest.sha256, first.sha256);
  assert(!fs.existsSync(path.join(directory, 'update.lock')));
});

test('truncation, reused versions, traversal and overlapping writes are refused', t => {
  const {directory, store} = temporary(t);
  const old = store.install(candidate('2026-11-05'));
  const shrink = candidate('2026-11-05.2'); shrink.records.pop();
  assert.throws(() => store.install(shrink), /ALM_CATALOGUE_SHRINK/);
  const reused = candidate('2026-11-05'); reused.records[0].episodes = 13;
  assert.throws(() => store.install(reused), /ALM_CATALOGUE_VERSION_REUSED/);
  assert.throws(() => store.install(candidate('2026-11-04')), /ALM_CATALOGUE_OLD_VERSION/);
  assert.throws(() => verify(directory, {...old, file: '../../outside'}), /ALM_CATALOGUE_MANIFEST/);
  fs.writeFileSync(path.join(directory, 'update.lock'), 'another update');
  assert.throws(() => store.install(candidate('2026-11-05.2')), /ALM_CATALOGUE_BUSY/);
  assert.equal(store.read().manifest.sha256, old.sha256);
});

test('network policy blocks providers and redirects before any transport or DNS', async () => {
  const rescue = require('../lib/rescue-mode');
  let transportCalls = 0, validateCalls = 0;
  const transport = async () => { transportCalls++; return new Response('{}'); };
  const guarded = rescue.guardFetch(transport);
  for (const url of ['https://graphql.anilist.co', 'https://api.myanimelist.net/v2/anime', 'https://kitsu.app/api/edge/anime', 'https://query.wikidata.org/sparql', 'http://localhost.evil.test/', 'https://127.0.0.1/']) {
    await assert.rejects(guarded(url), /ALM_RESCUE_OFFLINE/);
  }
  await assert.rejects(require('../lib/bounded-text-fetch').boundedTextFetch('https://graphql.anilist.co', {fetchImpl: transport, validate: async () => { validateCalls++; }}), /ALM_RESCUE_OFFLINE/);
  await assert.rejects(require('../lib/public-network').fetchBinary('https://cdn.myanimelist.net/cover.jpg'), /ALM_RESCUE_OFFLINE/);
  await assert.rejects(require('../lib/public-fetch').publicFetch('https://api.tvmaze.com/search/shows'), /ALM_RESCUE_OFFLINE/);
  assert.equal(transportCalls, 0); assert.equal(validateCalls, 0);
  let redirect;
  await rescue.guardFetch(async (_url, options) => { redirect = options.redirect; return new Response('{}'); })('http://127.0.0.1:3143/api/animes');
  assert.equal(redirect, 'error');
});

test('prototype packaging is blocked and legacy snapshots are absent from the branch', async () => {
  const root = path.resolve(__dirname, '..');
  const pkg = require('../package.json');
  assert.equal(pkg.build.appId, 'fr.gentilrobot.animelocalmanager.secours');
  for (const name of ['metadata-full.sql.gz', 'metadata-recovery.sql.gz', 'metadata-manifest.json']) {
    assert(!fs.existsSync(path.join(root, 'data/database', name)));
    assert(!pkg.build.files.includes('data/database/' + name));
  }
  const bundled = createCatalogue(path.join(root, 'data/independent-catalogue')).read();
  assert.equal(bundled.data.records.length, 3);
  assert(bundled.data.records.every(r => r.sourceRevision));
  await assert.rejects(require('./prepare-metadata-release').prepareMetadataRelease(), /ALM_RESCUE_NOT_RELEASE_READY/);
});
