'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {JSDOM} = require('jsdom');

test('catalogue DOM can search the local sample and persist an addition; notice follows the UI language', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alm-rescue-dom-'));
  const nativeFetch = global.fetch;
  process.env.ALM_DATA_DIR = directory;
  process.env.ALM_IMAGES_DIR = path.join(directory, 'images');
  process.env.ALM_AUTOMATION_STARTUP = '0';
  const server = require('../server'), db = require('../db');
  let listener, dom, notice;
  t.after(async () => {
    dom?.window.close(); notice?.window.close();
    server.stopBackups(); server.stopMaintenance(); server.closeCommunity();
    if (listener) await new Promise(resolve => listener.close(resolve));
    db.close(); global.fetch = nativeFetch;
    fs.rmSync(directory, {recursive: true, force: true});
  });
  await db.whenReady();
  listener = await server.startServer(51000 + Math.floor(Math.random() * 1000));
  const origin = 'http://127.0.0.1:' + listener.almPort;
  const waitFor = async condition => {
    const until = Date.now() + 5000;
    while (!condition()) {
      if (Date.now() > until) throw Error('DOM_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  dom = await JSDOM.fromURL(origin + '/catalogue-independant.html', {
    resources: 'usable', runScripts: 'dangerously',
    beforeParse(window) { window.fetch = (url, options) => nativeFetch(new URL(url, origin).href, options); }
  });
  const document = dom.window.document;
  await waitFor(() => document.querySelectorAll('.rescue-card').length === 3);
  const query = document.getElementById('catalogue-query');
  query.value = 'Chihiro'; query.dispatchEvent(new dom.window.Event('input'));
  await waitFor(() => document.querySelectorAll('.rescue-card').length === 1);
  const add = document.querySelector('.rescue-card button'); add.click();
  await waitFor(() => add.textContent === 'Ajouté à la bibliothèque');
  assert(db.getAllAnimes().some(a => a.catalogueId === 'alm:wd:Q155653'));
  notice = new JSDOM('<html lang="fr"><body></body></html>', {runScripts: 'outside-only', url: origin});
  notice.window.eval(fs.readFileSync(path.join(__dirname, '../public/rescue-notice.js'), 'utf8'));
  assert.equal(notice.window.document.querySelectorAll('.rescue-notice').length, 1);
  notice.window.document.documentElement.lang = 'ja';
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(notice.window.document.querySelector('.rescue-notice').textContent.includes('オフライン'));
});
