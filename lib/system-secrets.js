'use strict';
// Electron 45+ async OS key store. Old synchronous ciphertext is readable via
// decryptStringAsync; do not silently replace a missing/corrupt key.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {atomicWrite} = require('./atomic-file');

function failure(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}
async function available(provider) {
  if (!provider || typeof provider.isAsyncEncryptionAvailable !== 'function' ||
      typeof provider.encryptStringAsync !== 'function' ||
      typeof provider.decryptStringAsync !== 'function') return false;
  let ready;
  try { ready = await provider.isAsyncEncryptionAvailable(); }
  catch (error) { throw failure('ALM_SECURE_STORAGE_UNAVAILABLE', error); }
  return ready === true && provider.getSelectedStorageBackend?.() !== 'basic_text';
}
function readBytes(file) {
  let stat;
  try { stat = fs.lstatSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > 65536)
    throw failure('ALM_SECURE_STORAGE_INVALID_FILE');
  return fs.readFileSync(file);
}
async function save(provider, file, value) {
  if (typeof value !== 'string' || !value.length) throw failure('ALM_SECURE_STORAGE_INVALID_SECRET');
  let encrypted;
  try { encrypted = await provider.encryptStringAsync(value); }
  catch (error) { throw failure('ALM_SECURE_STORAGE_ENCRYPT_FAILED', error); }
  if (!Buffer.isBuffer(encrypted) || !encrypted.length || encrypted.length > 65536)
    throw failure('ALM_SECURE_STORAGE_ENCRYPT_FAILED');
  // atomicWrite fsyncs before rename and preserves the previous ciphertext on failure.
  atomicWrite(file, encrypted);
}
async function load(provider, file) {
  const bytes = readBytes(file);
  if (!bytes) return null;
  let decoded;
  try { decoded = await provider.decryptStringAsync(bytes); }
  catch (error) { throw failure('ALM_SECURE_STORAGE_DECRYPT_FAILED', error); }
  if (!decoded || typeof decoded.result !== 'string' || !decoded.result)
    throw failure('ALM_SECURE_STORAGE_DECRYPT_FAILED');
  if (decoded.shouldReEncrypt === true) {
    // Electron recommends a second decrypt when the OS key provider reports
    // rotation. Only replace the old ciphertext when both reads agree.
    let second;
    try { second = await provider.decryptStringAsync(bytes); }
    catch (error) { throw failure('ALM_SECURE_STORAGE_DECRYPT_FAILED', error); }
    if (!second || typeof second.result !== 'string' || !second.result || second.result !== decoded.result)
      throw failure('ALM_SECURE_STORAGE_ROTATION_MISMATCH');
    // Atomic replace only after successful verification and new encryption.
    await save(provider, file, second.result);
  }
  return decoded.result;
}
async function configKey(provider, userData) {
  const file = path.join(userData, 'connections-key.bin');
  if (!(await available(provider))) {
    if (fs.existsSync(file)) throw failure('ALM_SECURE_STORAGE_UNAVAILABLE');
    return null;
  }
  const stored = await load(provider, file);
  if (stored !== null) {
    const keyBytes = Buffer.from(stored, 'base64');
    if (keyBytes.length !== 32 || keyBytes.toString('base64') !== stored)
      throw failure('ALM_SECURE_STORAGE_INVALID_SECRET');
    return stored;
  }
  // A missing key must not silently replace a key used by an existing protected config.
  const config = path.join(userData, 'data', 'config.json');
  if (fs.existsSync(config)) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(config, 'utf8')); }
    catch (error) { throw failure('ALM_SECURE_STORAGE_CONFIG_UNREADABLE', error); }
    if (parsed && typeof parsed === 'object' && parsed.__protected)
      throw failure('ALM_SECURE_STORAGE_KEY_MISSING');
  }
  const fresh = crypto.randomBytes(32).toString('base64');
  await save(provider, file, fresh);
  return fresh;
}
async function backupStore(provider, userData) {
  const file = path.join(userData, 'encrypted-backup-key.bin');
  if (!(await available(provider))) {
    if (fs.existsSync(file)) throw failure('ALM_SECURE_STORAGE_UNAVAILABLE');
    return null;
  }
  return {
    load: async () => (await load(provider, file)) ?? '',
    save: async password => save(provider, file, password)
  };
}
module.exports = {available, load, save, configKey, backupStore};
