'use strict';
// Pure Node tests: no access to host OS secrets or actual profiles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const S = require('../lib/system-secrets');
const {createBackupManager}=require('../lib/encrypted-backup');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'alm82-safe-storage-'));
function provider() {
 const v={ready:true,plaintext:false,failDecrypt:false,failEncrypt:false,rotate:false,decryptCount:0,failSecondDecrypt:false,secondDifferent:false};
 return {
  v,
  async isAsyncEncryptionAvailable(){return v.ready;},
  getSelectedStorageBackend(){return v.plaintext?'basic_text':'dpapi';},
  async encryptStringAsync(value){if(v.failEncrypt)throw Error('simulated keystore failure');return Buffer.from('ASYNC|'+value);},
  async decryptStringAsync(bytes){v.decryptCount++;if(v.failDecrypt || (v.failSecondDecrypt && v.decryptCount%2===0))throw Error('temporary key store unavailable');const text=bytes.toString('utf8');if(!/^(LEGACY|ASYNC|ROTATE)\|/.test(text))throw Error('corrupt key');const result=text.slice(text.indexOf('|')+1)+(v.secondDifferent && v.decryptCount%2===0?'!':'');return {result,shouldReEncrypt:text.startsWith('ROTATE|')};},
  isEncryptionAvailable(){assert.fail('deprecated sync API invoked');},
  decryptString(){assert.fail('deprecated sync API invoked');},
  encryptString(){assert.fail('deprecated sync API invoked');}
 };
}
async function main(){
 try{
  const p=provider(),user=path.join(root,'profile');fs.mkdirSync(user);
  const savedKey=crypto.randomBytes(32).toString('base64');
  const oldFile=path.join(user,'connections-key.bin');fs.writeFileSync(oldFile,'LEGACY|'+savedKey);
  assert.equal(await S.configKey(p,user),savedKey,'legacy sync ciphertext must still decrypt');
  assert.equal(fs.readFileSync(oldFile,'utf8'),'LEGACY|'+savedKey,'ordinary legacy secret must not be rewritten');
  p.v.failDecrypt=true;await assert.rejects(S.configKey(p,user),{code:'ALM_SECURE_STORAGE_DECRYPT_FAILED'});
  assert.equal(fs.readFileSync(oldFile,'utf8'),'LEGACY|'+savedKey,'decryption failure must not erase ciphertext');p.v.failDecrypt=false;
  fs.writeFileSync(oldFile,'ROTATE|'+savedKey);let decrypts=p.v.decryptCount;assert.equal(await S.configKey(p,user),savedKey);assert.equal(p.v.decryptCount-decrypts,2,'rotation must confirm a second decrypt');assert.equal(fs.readFileSync(oldFile,'utf8'),'ASYNC|'+savedKey,'key rotation must write new ciphertext only after a verified decrypt');
  fs.writeFileSync(oldFile,'ROTATE|'+savedKey);p.v.failSecondDecrypt=true;p.v.decryptCount=0;await assert.rejects(S.configKey(p,user),{code:'ALM_SECURE_STORAGE_DECRYPT_FAILED'});assert.equal(fs.readFileSync(oldFile,'utf8'),'ROTATE|'+savedKey,'second OS read failure must retain previous ciphertext');p.v.failSecondDecrypt=false;
  fs.writeFileSync(oldFile,'ROTATE|'+savedKey);p.v.secondDifferent=true;p.v.decryptCount=0;await assert.rejects(S.configKey(p,user),{code:'ALM_SECURE_STORAGE_ROTATION_MISMATCH'});assert.equal(fs.readFileSync(oldFile,'utf8'),'ROTATE|'+savedKey,'mismatched OS reads must never replace ciphertext');p.v.secondDifferent=false;
  fs.writeFileSync(oldFile,'ROTATE|'+savedKey);p.v.failEncrypt=true;await assert.rejects(S.configKey(p,user),{code:'ALM_SECURE_STORAGE_ENCRYPT_FAILED'});assert.equal(fs.readFileSync(oldFile,'utf8'),'ROTATE|'+savedKey,'failed rotation retains original ciphertext');p.v.failEncrypt=false;
  fs.writeFileSync(oldFile,'CORRUPT');await assert.rejects(S.configKey(p,user),{code:'ALM_SECURE_STORAGE_DECRYPT_FAILED'});assert.equal(fs.readFileSync(oldFile,'utf8'),'CORRUPT');
  p.v.ready=false;await assert.rejects(S.configKey(p,user),{code:'ALM_SECURE_STORAGE_UNAVAILABLE'});p.v.ready=true;
  p.v.plaintext=true;await assert.rejects(S.configKey(p,user),{code:'ALM_SECURE_STORAGE_UNAVAILABLE'});p.v.plaintext=false;
  fs.rmSync(oldFile);
  const cfg=path.join(user,'data','config.json');fs.mkdirSync(path.dirname(cfg),{recursive:true});fs.writeFileSync(cfg,JSON.stringify({__protected:{version:1}}));
  await assert.rejects(S.configKey(p,user),{code:'ALM_SECURE_STORAGE_KEY_MISSING'});
  assert(!fs.existsSync(oldFile),'a protected config must not be paired with a new random key');fs.unlinkSync(cfg);
  p.v.failEncrypt=true;await assert.rejects(S.configKey(p,user),{code:'ALM_SECURE_STORAGE_ENCRYPT_FAILED'});assert(!fs.existsSync(oldFile));p.v.failEncrypt=false;
  const fresh=await S.configKey(p,user);assert.equal(Buffer.from(fresh,'base64').length,32);assert.equal(await S.configKey(p,user),fresh);
  const backup=path.join(user,'encrypted-backup-key.bin');const store=await S.backupStore(p,user);assert.equal(await store.load(),'');
  fs.writeFileSync(backup,'LEGACY|long enough password for backup');assert.equal(await store.load(),'long enough password for backup');
  p.v.failDecrypt=true;await assert.rejects(store.load(),{code:'ALM_SECURE_STORAGE_DECRYPT_FAILED'});assert(fs.existsSync(backup));p.v.failDecrypt=false;
  p.v.failEncrypt=true;await assert.rejects(store.save('new backup password here'),{code:'ALM_SECURE_STORAGE_ENCRYPT_FAILED'});assert.equal(fs.readFileSync(backup,'utf8'),'LEGACY|long enough password for backup');p.v.failEncrypt=false;
  await store.save('new backup password here');assert.equal(await store.load(),'new backup password here');
  p.v.ready=false;await assert.rejects(S.backupStore(p,user),{code:'ALM_SECURE_STORAGE_UNAVAILABLE'});p.v.ready=true;
  const manager=createBackupManager({settingsFile:path.join(root,'settings.json'),imagesDir:root,getPayload:async()=>({})});
  const rejected={load:async()=>{throw Error('mock keystore is temporarily unavailable');},save:async()=>{}};
  await assert.rejects(manager.configureStorage(rejected),/temporarily unavailable/);
  assert.equal(manager.state().secretStorage,'session','a failed configure must not silently register the secret store');
  await manager.configureStorage({load:()=>Promise.resolve('long enough password for backup'),save:async()=>{}});
  assert.equal(manager.state().unlocked,true);await assert.rejects(manager.configureStorage(rejected),/temporarily unavailable/);
  assert.equal(manager.state().unlocked,true,'prior secret must not be erased by a later failed reload');
  manager.stop();
  const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
  assert(!/safeStorage\.(?:isEncryptionAvailable|decryptString|encryptString)\(/.test(main),'deprecated methods must not be present in main');
  console.log('OK Beta82 safeStorage: legacy cipher, async result, atomic rotation, transient failures, missing key protection, basic_text refusal, backup store recovery and no sync calls.');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
