'use strict';

// A separate facts store: no SQL supplied by a provider, no fake MAL ids, no
// writes to the personal library. Updates are local, explicit and hash checked.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {atomicWrite, atomicJson} = require('./atomic-file');
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_RECORDS = 100000;
const LANGUAGES = ['fr', 'en', 'ja', 'es', 'de', 'pt-BR', 'zh-CN'];
const SOURCE = Object.freeze({id: 'wikidata', license: 'CC0-1.0', url: 'https://www.wikidata.org/'});
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(new Error(code), {code}); };
const normalize = s => String(s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const validText = v => typeof v === 'string' && v.trim() && v.length <= 400 && !/[\u0000-\u001f<>]/.test(v);
const versionOk = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:\.[1-9]\d{0,5})?$/.test(v);

function validateCatalogue(data) {
  if (data?.schema !== 1 || !versionOk(data.version) || !Array.isArray(data.records) ||
      data.records.length < 1 || data.records.length > MAX_RECORDS ||
      JSON.stringify(data.sources) !== JSON.stringify([SOURCE])) fail('ALM_CATALOGUE_FORMAT');
  const ids = new Set();
  for (const row of data.records) {
    if (!/^alm:wd:Q[1-9]\d{0,11}$/.test(row?.id) || ids.has(row.id) ||
        !validText(row.title) || row.source !== 'wikidata' || row.license !== 'CC0-1.0' ||
        row.sourceUrl !== 'https://www.wikidata.org/wiki/' + row.id.slice(7) ||
        !row.titles || typeof row.titles !== 'object' || Array.isArray(row.titles) ||
        !Object.keys(row.titles).length || Object.entries(row.titles).some(([lang, title]) => !LANGUAGES.includes(lang) || !validText(title)) ||
        !Object.values(row.titles).includes(row.title) ||
        (row.episodes !== undefined && (!Number.isSafeInteger(row.episodes) || row.episodes < 1 || row.episodes > 100000)) ||
        (row.sourceRevision !== undefined && (!Number.isSafeInteger(row.sourceRevision) || row.sourceRevision < 1)) ||
        Object.keys(row).some(k => !['id', 'title', 'titles', 'episodes', 'source', 'license', 'sourceUrl', 'sourceRevision'].includes(k))) fail('ALM_CATALOGUE_RECORD');
    ids.add(row.id);
  }
  return data;
}

function fromWikidata(result, version) {
  if (!versionOk(version) || !Array.isArray(result?.results?.bindings) || result.results.bindings.length > 500000) fail('ALM_WIKIDATA_FORMAT');
  const groups = new Map();
  let ignored = 0;
  for (const binding of result.results.bindings) {
    const match = /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d{0,11})$/.exec(binding?.item?.value || '');
    const label = binding?.label || binding?.itemLabel;
    const language = ({pt: 'pt-BR', 'pt-br': 'pt-BR', 'zh-hans': 'zh-CN', zh: 'zh-CN'})[label?.['xml:lang']] || label?.['xml:lang'];
    if (!match || !LANGUAGES.includes(language) || !validText(label?.value)) { ignored++; continue; }
    const qid = match[1];
    if (!groups.has(qid)) groups.set(qid, {titles: {}, episodes: new Set(), revisions: new Set(), ambiguousLabels: new Set()});
    const group = groups.get(qid);
    if (group.titles[language] && group.titles[language] !== label.value.trim()) group.ambiguousLabels.add(language);
    else group.titles[language] = label.value.trim();
    const raw = binding.episodes?.value;
    if (raw !== undefined && /^\d+$/.test(raw) && Number(raw) > 0 && Number(raw) <= 100000) group.episodes.add(Number(raw));
    if (/^\d+$/.test(binding.revision?.value) && Number.isSafeInteger(Number(binding.revision.value)) && Number(binding.revision.value) > 0) group.revisions.add(Number(binding.revision.value));
  }
  const records = [];
  let ambiguous = 0;
  for (const [qid, group] of [...groups].sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))) {
    for (const language of group.ambiguousLabels) { delete group.titles[language]; ambiguous++; }
    const titles = Object.fromEntries(LANGUAGES.filter(lang => group.titles[lang]).map(lang => [lang, group.titles[lang]]));
    const title = Object.values(titles)[0];
    if (!title) { ignored++; continue; }
    if (group.episodes.size > 1) ambiguous++;
    records.push({id: 'alm:wd:' + qid, title, titles,
      ...(group.episodes.size === 1 ? {episodes: [...group.episodes][0]} : {}),
      ...(group.revisions.size === 1 ? {sourceRevision: [...group.revisions][0]} : {}),
      source: SOURCE.id, license: SOURCE.license, sourceUrl: 'https://www.wikidata.org/wiki/' + qid});
  }
  const catalogue = validateCatalogue({schema: 1, version, sources: [SOURCE], records});
  return {catalogue, report: {records: records.length, ignoredBindings: ignored, ambiguitiesOmitted: ambiguous,
    withEpisodes: records.filter(r => r.episodes).length, withPinnedRevisions: records.filter(r => r.sourceRevision).length,
    languages: Object.fromEntries(LANGUAGES.map(lang => [lang, records.filter(r => r.titles[lang]).length])),
    images: 0, synopses: 0, scores: 0, coverageValidated: false}};
}

function fromWikidataEntities(payload, version) {
  const entities = Array.isArray(payload) ? payload : Object.values(payload?.entities || {});
  if (!entities.length || entities.length > MAX_RECORDS) fail('ALM_WIKIDATA_FORMAT');
  const bindings = [];
  for (const entity of entities) {
    if (!/^Q[1-9]\d{0,11}$/.test(entity?.id) || !entity.claims?.P4086?.some(c => c.rank !== 'deprecated' && c.mainsnak?.snaktype === 'value')) continue;
    const episodes = (entity.claims?.P1113 || []).filter(c => c.rank !== 'deprecated' && c.mainsnak?.snaktype === 'value').map(c => String(c.mainsnak.datavalue?.value?.amount || '').replace(/^\+/, ''));
    for (const label of Object.values(entity.labels || {})) {
      for (const count of episodes.length ? episodes : [undefined]) bindings.push({
        item: {value: 'https://www.wikidata.org/entity/' + entity.id},
        label: {value: label.value, 'xml:lang': label.language},
        ...(count ? {episodes: {value: count}} : {}),
        ...(Number.isSafeInteger(entity.lastrevid) ? {revision: {value: String(entity.lastrevid)}} : {})
      });
    }
  }
  return fromWikidata({results: {bindings}}, version);
}

function readBounded(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > MAX_BYTES) fail('ALM_CATALOGUE_SIZE');
  const bytes = fs.readFileSync(file);
  if (bytes.length > MAX_BYTES) fail('ALM_CATALOGUE_SIZE');
  return bytes;
}

function verify(directory, manifest) {
  if (manifest?.schema !== 1 || !versionOk(manifest.version) || !/^[0-9a-f]{64}$/.test(manifest.sha256) ||
      manifest.file !== 'catalogue-' + manifest.sha256 + '.json' ||
      !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > MAX_BYTES ||
      !Number.isSafeInteger(manifest.records) || manifest.records < 1 || manifest.records > MAX_RECORDS) fail('ALM_CATALOGUE_MANIFEST');
  const bytes = readBounded(path.join(directory, manifest.file));
  if (bytes.length !== manifest.bytes || sha256(bytes) !== manifest.sha256) fail('ALM_CATALOGUE_HASH');
  const data = validateCatalogue(JSON.parse(bytes.toString('utf8')));
  if (data.records.length !== manifest.records || data.version !== manifest.version) fail('ALM_CATALOGUE_COUNT');
  return data;
}

function createCatalogue(directory) {
  const currentFile = path.join(directory, 'current.json');
  const previousFile = path.join(directory, 'previous.json');
  const lockFile = path.join(directory, 'update.lock');
  function pointer(file) {
    try { return JSON.parse(readBounded(file).toString('utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function read() { const manifest = pointer(currentFile); return manifest ? {manifest, data: verify(directory, manifest)} : null; }
  function withLock(task) {
    fs.mkdirSync(directory, {recursive: true});
    let fd;
    try { fd = fs.openSync(lockFile, 'wx', 0o600); return task(); }
    catch (error) { if (error.code === 'EEXIST') fail('ALM_CATALOGUE_BUSY'); throw error; }
    finally { if (fd !== undefined) { fs.closeSync(fd); fs.unlinkSync(lockFile); } }
  }
  function install(data) {
    validateCatalogue(data);
    const bytes = Buffer.from(JSON.stringify(data) + '\n');
    if (bytes.length > MAX_BYTES) fail('ALM_CATALOGUE_SIZE');
    const hash = sha256(bytes);
    const manifest = {schema: 1, version: data.version, file: 'catalogue-' + hash + '.json', sha256: hash, bytes: bytes.length, records: data.records.length};
    return withLock(() => {
      const old = read();
      if (old?.manifest.sha256 === hash) return old.manifest;
      if (old?.manifest.version === data.version) fail('ALM_CATALOGUE_VERSION_REUSED');
      if (old) {
        const parts = v => { const [date, revision = '0'] = v.split('.'); return [date, Number(revision)]; };
        const a = parts(data.version), b = parts(old.manifest.version);
        if (a[0] < b[0] || a[0] === b[0] && a[1] < b[1]) fail('ALM_CATALOGUE_OLD_VERSION');
      }
      if (old && data.records.length < old.data.records.length * 0.9) fail('ALM_CATALOGUE_SHRINK');
      atomicWrite(path.join(directory, manifest.file), bytes);
      verify(directory, manifest);
      if (old) atomicJson(previousFile, old.manifest);
      // The commit point is one rename. A failed update keeps the old pointer.
      atomicJson(currentFile, manifest);
      return manifest;
    });
  }
  function rollback() {
    return withLock(() => {
      const previous = pointer(previousFile);
      if (!previous) fail('ALM_CATALOGUE_NO_ROLLBACK');
      verify(directory, previous);
      // A corrupted current payload must not prevent recovery to the last good
      // version. Its pointer is retained for diagnosis, never loaded as data.
      atomicJson(currentFile, previous);
      return previous;
    });
  }
  function search(query = '', {limit = 30, offset = 0} = {}) {
    const current = read();
    const q = normalize(query).slice(0, 160);
    const found = (current?.data.records || []).filter(row => !q || Object.values(row.titles).some(title => normalize(title).includes(q)));
    const size = Math.max(1, Math.min(Number(limit) || 30, 100));
    const start = Math.max(0, Math.min(Number(offset) || 0, MAX_RECORDS));
    return {items: found.slice(start, start + size), total: found.length, version: current?.manifest.version || null, source: 'wikidata', experimental: true};
  }
  return {read, install, rollback, search, get(id) { return read()?.data.records.find(row => row.id === id) || null; }};
}

module.exports = {createCatalogue, fromWikidata, fromWikidataEntities, validateCatalogue, verify, readBounded, MAX_BYTES, SOURCE};
