#!/usr/bin/env node
'use strict';
const path = require('node:path');
const {createCatalogue, fromWikidata, fromWikidataEntities, readBounded} = require('../lib/independent-catalogue');

function main(args = process.argv.slice(2)) {
  const root = path.resolve(__dirname, '..');
  const flags = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input', '--version', '--directory', '--action'].includes(args[i]) || !args[i + 1]) throw Error('Arguments: --input result.json --version YYYY-MM-DD[.revision] [--directory DIR] | --action status|rollback');
    flags.set(args[i], args[i + 1]);
  }
  const dataDir = process.env.ALM_DATA_DIR || path.join(process.env.ALM_RESCUE_PROFILE_DIR || path.join(root, '.rescue-profile'), 'data');
  const directory = path.resolve(flags.get('--directory') || path.join(dataDir, 'independent-catalogue'));
  const store = createCatalogue(directory);
  const action = flags.get('--action') || 'install';
  if (action === 'status') {
    const current = store.read();
    console.log(JSON.stringify({ok: true, manifest: current?.manifest || null, directory}, null, 2));
  } else if (action === 'rollback') {
    console.log(JSON.stringify({ok: true, manifest: store.rollback()}, null, 2));
  } else if (action === 'install') {
    if (!flags.get('--input') || !flags.get('--version')) throw Error('--input and --version are required; no network download is performed.');
    const input = path.resolve(flags.get('--input'));
    const payload = JSON.parse(readBounded(input).toString('utf8'));
    const convert = payload?.results?.bindings ? fromWikidata : fromWikidataEntities;
    const {catalogue, report} = convert(payload, flags.get('--version'));
    const manifest = store.install(catalogue);
    console.log(JSON.stringify({ok: true, manifest, report, directory}, null, 2));
  } else throw Error('Unknown action');
}

module.exports = {main};
if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
