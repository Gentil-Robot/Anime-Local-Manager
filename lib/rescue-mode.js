'use strict';

// This branch is deliberately offline. Changing the source policy requires a
// reviewed commit; saved settings and environment variables cannot enable APIs.
const path = require('node:path');
const active = true;
const PROFILE_NAME = 'anime-local-manager-secours';
const CODE = 'ALM_RESCUE_OFFLINE';

function assertNetworkAllowed(input) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  const url = new URL(raw);
  if (url.protocol === 'http:' && !url.username && !url.password &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return;
  throw Object.assign(new Error(CODE), {code: CODE, retryable: false});
}

function guardFetch(fetchImpl) {
  return async (input, options) => {
    assertNetworkAllowed(input);
    // A permitted loopback request cannot redirect to the internet.
    return fetchImpl(input, {...options, redirect: 'error'});
  };
}

let bootstrapped = false;
function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  const root = process.env.ALM_RESCUE_PROFILE_DIR || path.join(__dirname, '..', '.rescue-profile');
  process.env.ALM_DATA_DIR ||= path.join(root, 'data');
  process.env.ALM_IMAGES_DIR ||= path.join(root, 'images');
  if (global.fetch) global.fetch = guardFetch(global.fetch);
}

function skipped() { return {ok: true, skipped: true, reason: CODE, status: 'offline-prototype'}; }

module.exports = {active, PROFILE_NAME, CODE, assertNetworkAllowed, guardFetch, bootstrap, skipped};
