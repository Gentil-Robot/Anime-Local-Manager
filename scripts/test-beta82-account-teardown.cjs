'use strict';
// Regression: a community refresh may settle after the Settings dialog or its
// browser window has closed. Its background continuation must not access a
// destroyed document or produce an unhandled rejection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'community-workspace.js'), 'utf8');

async function scenario(outcome) {
  let resolveRefresh, rejectRefresh;
  const inFlight = new Promise((resolve, reject) => {
    resolveRefresh = resolve;
    rejectRefresh = reject;
  });
  const doc = {
    readyState: 'loading',
    addEventListener() {},
    getElementById(id) { return id === 'settingsDialog' ? {open: true} : null; }
  };
  const window = {
    document: doc,
    ALM_DESIGN: {escape: value => String(value)},
    ALM_COMMUNITY_MODEL: {}, ALM_COMMUNITY_SECURITY: {},
    ALM_COMMUNITY_T: key => key,
    ALM_COMMUNITY_ERROR: error => error.message,
    ALM_SETTINGS: {select(section) { assert.equal(section, 'account'); }},
    ALM_COMMUNITY_WEB: false,
    ALM_COMMUNITY: {
      snapshot: () => ({configured: false}),
      refresh: () => inFlight
    }
  };
  const globals = {window, Map, WeakMap};
  Object.defineProperty(globals, 'document', {get() { return window.document; }});
  vm.runInNewContext(source, globals, {filename: 'public/community-workspace.js'});
  await window.ALM_COMMUNITY_WORKSPACE.openAccount();
  window.document = undefined;
  if (outcome === 'success') resolveRefresh({connected: false});
  else rejectRefresh(new Error('ALM_NETWORK'));
  // Allow chained then/catch callbacks and Node's unhandled rejection check to run.
  await new Promise(resolve => setTimeout(resolve, 15));
}

(async () => {
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await scenario('success');
    await scenario('failure');
    assert.deepEqual(unhandled.map(error => error?.message), [],
      'Background refresh must be safe when the account document is destroyed');
    console.log('OK Beta82 account: refresh success and failure after closing the browser do not access the destroyed document.');
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
