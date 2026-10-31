"use strict";
const fs = require('node:fs');
const path = require('node:path');

// Only clean a test-owned directory. Never load a new server during teardown.
async function cleanupRuntime(directory, listener, root = path.resolve(__dirname, '..')) {
  const loaded = name => require.cache[path.join(root, name + '.js')]?.exports;
  const api = loaded('server'), db = loaded('db');
  api?.stopBackups?.();
  if (listener?.listening) {
    await new Promise((resolve, reject) => {
      listener.close(error => error ? reject(error) : resolve());
      listener.closeAllConnections?.();
    });
  }
  // Startup can still be importing the seed when a test fails early.
  if (db) {
    try { await db.whenReady(); } catch { /* The test reports startup failure. */ }
    db.close();
  }
  // Windows antivirus/indexers may briefly retain a file after SQLite closes.
  // Retry only temporary locks, for a bounded time; permanent errors still fail.
  await fs.promises.rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}
module.exports = {cleanupRuntime};
