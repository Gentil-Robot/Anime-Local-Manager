'use strict';
// Exercise the real Express app and its final error handler on an isolated
// profile. Fixture routes exist only in this process, never in the product.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const multer = require('multer');
const {cleanupRuntime} = require('./runtime-cleanup');

const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alm-v200-http-errors-'));
process.env.ALM_DATA_DIR = directory;
process.env.ALM_IMAGES_DIR = path.join(directory, 'images');
process.env.ALM_RELEASE_SMOKE = '1';
process.env.ALM_MAINTENANCE_MODE = '1';
process.env.ALM_AUTOMATION_STARTUP = '0';
// Exercise the desktop session guard as well as HTTP error propagation.
process.env.ALM_SESSION_TOKEN = 'fictional-http-error-session';
fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({
  metadataAutonomousUpdateOnStart: false,
  metadataUpdateOnStart: false,
  metadataAutonomousLearnFromSearch: false
}));

const localFetch = global.fetch;
global.fetch = (url, ...args) => String(url).startsWith('http://127.0.0.1:')
  ? localFetch(url, ...args) : Promise.reject(Error('No live providers in HTTP error tests'));
const unhandled = [];
const observe = reason => unhandled.push(reason);
let listener;

async function main() {
  process.on('unhandledRejection', observe);
  try {
    const api = require('../server');
    const db = require('../db');
    await db.whenReady();
    const {app} = api;
    // Express 4's error middleware is terminal. Insert fixture routes before
    // that existing middleware without copying or recreating production code.
    const stack = app._router.stack;
    const finalErrorHandler = stack.pop();
    assert.equal(finalErrorHandler.handle.length, 4);
    const prefix = '/api/__http-error-test';
    const privateDetail = 'FICTIONAL_PRIVATE_PATH_AND_STACK';
    const fail = () => { throw Error(privateDetail); };
    let acceptedUploads = 0;
    try {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        app[method](prefix + '/' + method, [[(_req, _res, next) => next(), async () => fail()]]);
      }
      app.get(prefix + '/sync', fail);
      app.get(prefix + '/promise', () => Promise.reject(Error(privateDetail)));
      for (const [index, reason] of [undefined, null, false, 0, '', 'route', 'router'].entries()) {
        app.get(prefix + '/empty-rejection/' + index, () => Promise.reject(reason));
      }
      app.get(prefix + '/client-error', async () => {
        throw Object.assign(Error('Fictional request rejected'), {status: 422, code: 'ALM_TEST_REJECTED'});
      });
      app.get(prefix + '/status-code', async () => {
        throw Object.assign(Error('Fictional conflict'), {statusCode: 409});
      });
      app.get(prefix + '/invalid-status', async () => {
        throw Object.assign(Error(privateDetail), {status: 200, code: '<unsafe-code>'});
      });
      app.get(prefix + '/route-error-handler', fail, (error, _req, res, _next) => {
        assert.equal(error.message, privateDetail);
        res.status(422).json({code: 'ALM_TEST_HANDLED'});
      });
      app.post(prefix + '/upload', multer({storage: multer.memoryStorage(), limits: {fileSize: 32}}).single('file'), (_req, res) => {
        acceptedUploads++;
        res.json({ok: true});
      });
    } finally {
      stack.push(finalErrorHandler);
    }
    app.set('alm-http-error-fixture', 'preserved');
    assert.equal(app.get('alm-http-error-fixture'), 'preserved', 'app.get(setting) must retain Express semantics');

    listener = await new Promise(resolve => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    const origin = 'http://127.0.0.1:' + listener.address().port;
    const request = (route, options = {}) => localFetch(origin + route, {
      ...options,
      headers: {Cookie: 'alm_session=' + process.env.ALM_SESSION_TOKEN, ...options.headers},
      signal: AbortSignal.timeout(5000)
    });
    async function expectError(route, options, status, code) {
      const response = await request(route, options);
      assert.equal(response.status, status, route);
      assert.match(response.headers.get('content-type'), /^application\/json\b/);
      const text = await response.text();
      const value = JSON.parse(text);
      assert.equal(value.code, code, route);
      assert(!Object.hasOwn(value, 'stack'));
      assert(!text.includes(privateDetail), 'Internal error details must stay out of responses');
      if (status >= 500) assert.equal(value.error, 'Erreur interne.');
      return value;
    }
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      await expectError(prefix + '/' + method, {method: method.toUpperCase()}, 500, 'ALM_INTERNAL_ERROR');
    }
    for (const route of ['/sync', '/promise', '/invalid-status']) {
      await expectError(prefix + route, {}, 500, 'ALM_INTERNAL_ERROR');
    }
    for (let index = 0; index < 7; index++) {
      await expectError(prefix + '/empty-rejection/' + index, {}, 500, 'ALM_INTERNAL_ERROR');
    }
    const client = await expectError(prefix + '/client-error', {}, 422, 'ALM_TEST_REJECTED');
    assert.equal(client.error, 'Fictional request rejected');
    await expectError(prefix + '/status-code', {}, 409, 'ALM_REQUEST_REJECTED');
    assert.equal((await request(prefix + '/route-error-handler')).status, 422);

    await expectError(prefix + '/post', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{'}, 400, 'ALM_REQUEST_REJECTED');
    await expectError(prefix + '/post', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: 'x'.repeat(257 * 1024)})}, 413, 'ALM_REQUEST_SIZE');
    await expectError(prefix + '/post', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text: 'x'.repeat(20 * 1024 * 1024)})}, 413, 'ALM_REQUEST_REJECTED');
    const form = bytes => {
      const data = new FormData();
      data.append('file', new Blob([Buffer.alloc(bytes)]), 'fictional.txt');
      return data;
    };
    await expectError(prefix + '/upload', {method: 'POST', body: form(33)}, 413, 'LIMIT_FILE_SIZE');
    assert.equal(acceptedUploads, 0, 'An oversized upload must not run its route');
    assert.equal((await request(prefix + '/upload', {method: 'POST', body: form(32)})).status, 200);
    assert.equal(acceptedUploads, 1);
    assert.equal((await request(prefix + '/not-found')).status, 404, 'Unknown routes keep their 404');
    const healthy = await request('/api/animes');
    assert.equal(healthy.status, 200, 'The real library remains available after every error');
    assert.deepEqual(await healthy.json(), []);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, [], 'Route failures must never become unhandled rejections');

    // Execute the actual host module with a fictional parent boundary. This
    // checks logging and a subsequent RPC, not recovery of arbitrary DB work.
    const hostProcess = new EventEmitter();
    hostProcess.parentPort = new EventEmitter();
    const messages = [], logs = [];
    hostProcess.parentPort.postMessage = message => messages.push(message);
    vm.runInNewContext(fs.readFileSync(path.join(root, 'lib/server-host.js'), 'utf8'), {
      require: name => {
        if (name === '../server') return {startServer: async () => ({almPort: 3123})};
        if (name === '../db') return {};
        throw Error('Unexpected host dependency: ' + name);
      },
      process: hostProcess, console: {error: (...args) => logs.push(args)},
      setTimeout, clearTimeout
    }, {filename: 'server-host.js', timeout: 1000});
    hostProcess.emit('unhandledRejection', 'fictional-background-rejection');
    assert.equal(logs.length, 1);
    assert(logs[0].join(' ').includes('fictional-background-rejection'));
    hostProcess.parentPort.emit('message', {data: {id: 1, method: 'start', args: [3123]}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages[0].value.port, 3123);
    console.log('OK V2 HTTP errors: async/sync failures, empty rejection reasons, JSON 400/413, Multer 413, status preservation, no leaked stack, healthy library and host logging.');
  } finally {
    process.removeListener('unhandledRejection', observe);
    global.fetch = localFetch;
    await cleanupRuntime(directory, listener);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
