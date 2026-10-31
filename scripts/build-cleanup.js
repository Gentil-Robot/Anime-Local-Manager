"use strict";
const fs = require('node:fs');
const {setTimeout: delay} = require('node:timers/promises');
const RETRYABLE = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM', 'EMFILE', 'ENFILE']);
async function removeBuildTree(directory, {remove = fs.promises.rm, wait = delay, attempts = 16} = {}) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 20) throw Error('Invalid cleanup attempt limit');
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { await remove(directory, {recursive: true, force: true, maxRetries: 0}); return; }
    catch (error) {
      if (!RETRYABLE.has(error.code) || attempt === attempts - 1) {
        error.message += ' [nettoyage build : ' + directory + ', ' + (attempt + 1) + ' tentative(s); erreur non ignoree]';
        throw error;
      }
      // Asynchronous retries leave the event loop free for process/stream closure.
      await wait(Math.min(200 * (attempt + 1), 2000));
    }
  }
}
function observeUtility(child) {
  let exited = false;
  const done = new Promise(resolve => child.once('exit', code => { exited = true; resolve(code); }));
  return {
    async stop(timeoutMs = 10000) {
      if (exited) return;
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('Le processus Electron de test ne se ferme pas; nettoyage refuse.')), timeoutMs);
      });
      try { child.kill(); await Promise.race([done, timeout]); } finally { clearTimeout(timer); }
    }
  };
}
module.exports = {removeBuildTree, observeUtility};
