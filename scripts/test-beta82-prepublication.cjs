'use strict';
// Pure-node prepublication regression tests: no live provider call, email or DB write.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));
assert.equal(pkg.version,'2.1.2');
assert.equal(pkg.version,lock.version);
assert.equal(lock.packages[''].version,pkg.version);
assert.equal(pkg.devDependencies.electron,'45.3.1');
assert.equal(lock.packages[''].devDependencies.electron,'45.3.1');
assert.equal(lock.packages['node_modules/electron'].version,'45.3.1');
assert.equal(lock.packages['node_modules/electron'].resolved,'https://registry.npmjs.org/electron/-/electron-45.3.1.tgz');
// Independent registry pin, not a value copied from the lock under test.
assert.equal(lock.packages['node_modules/electron'].integrity,'sha512-1oYau2B4RXF27Df2fzvrFDJoy8AOSVlgS6gklo6wkLZ/QWJemJCJHkY4+uuacvSFUtR8IimiLukLNFoYP0fmjA==');
assert.equal(read('.nvmrc'),read('.node-version'));
assert.equal(read('supabase/functions/alm-public/release.ts').includes('"2.1.2"'),true);
assert.equal(read('public/design-core.js').includes('release-version.json') || read('public/design-core.js').includes('ALM_RELEASE'),true);
assert.equal(read('community/site/design-core.js'),read('public/design-core.js'));
assert.equal(JSON.parse(read('community/site/release-manifest.json')).version,pkg.version);
const preload=read('preload.js');
for(const blocked of [/\bBuffer\b/,/\bsetImmediate\b/,/\bclearImmediate\b/,/require\s*\(\s*['"](?:events|timers|url)['"]\s*\)/])assert(!blocked.test(preload),'Electron 45 preload uses removed sandbox feature: '+blocked);
const main=read('main.js');
for(const check of [/contextIsolation:\s*true/,/nodeIntegration:\s*false/,/sandbox:\s*true/,/setWindowOpenHandler/])assert(check.test(main));
const http=read('server.js');
assert.match(http,/EADDRINUSE/);
assert.match(http,/attempt < 20/);
assert.match(http,/safePort \+ 1/);
// Compile the TypeScript endpoint in isolation (the source is valid JavaScript except for imports/exports).
let edge=read('supabase/functions/alm-public/index.ts');
edge=edge.replace(/^import\s+\{[^\n]+\}\s+from\s+['"][^'"]+['"];\s*$/gm,'');
edge=edge.replace('export async function handle(', 'async function handle(');
const ctx={URL,Response,Request,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto:crypto.webcrypto,RELEASE_VERSION:pkg.version};
vm.runInNewContext(edge+'\nthis.prepub={handle,allowedOrigin};',ctx,{filename:'alm-public/index.ts',timeout:2000});
const {handle,allowedOrigin}=ctx.prepub;
for(const origin of ['https://animelocalmanager.com','http://127.0.0.1:3123','http://127.0.0.1:3124','http://localhost:3143'])assert.equal(allowedOrigin(origin),true,origin);
for(const origin of ['http://127.0.0.1:3144','http://localhost:3122','http://0.0.0.0:3123','http://127.0.0.2:3123','http://evil.invalid:3123','http://localhost:9999','https://localhost:3124','null','', 'http://127.0.0.1:3123.evil.invalid'])assert.equal(allowedOrigin(origin),false,origin);
(async()=>{
 const secrets={ALM_TURNSTILE_SITE_KEY:'public-fixture',ALM_TURNSTILE_SECRET:'private-fixture',RESEND_API_KEY:'private-fixture',ALM_CONTACT_TO:'owner@example.test',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'private-fixture'};
 const deps={env:key=>secrets[key],fetch:async()=>{throw Error('No external request in isolated test');},crypto:crypto.webcrypto};
 const ask=(origin,method='OPTIONS',suffix='')=>new Request('https://fixture.invalid/functions/v1/alm-public'+suffix,{method,headers:{Origin:origin}});
 for(const origin of ['https://animelocalmanager.com','http://127.0.0.1:3123','http://127.0.0.1:3124','http://127.0.0.1:3143','http://localhost:3124']){
  const response=await handle(ask(origin),deps);
  assert.equal(response.status,204,origin);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  const config=await handle(ask(origin,'GET','/config'),deps);
  assert.equal(config.status,200,origin);
  assert.equal((await config.json()).releaseVersion,pkg.version);
 }
 for(const origin of ['http://127.0.0.1:3144','http://localhost:3122','https://attacker.invalid','http://evil.invalid:3123']){
  const response=await handle(ask(origin),deps);
  assert.equal(response.status,403,origin);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 }
 const post=new Request('https://fixture.invalid/functions/v1/alm-public',{method:'POST',headers:{Origin:'http://127.0.0.1:3124','Content-Type':'application/json'},body:JSON.stringify({action:'contact',email:'sample@example.test',category:'problem',message:'Fixture showing CAPTCHA remains mandatory',consent:true,website:''})});
 // The local port fix must not bypass CAPTCHA even if the origin is allowed.
 assert.equal((await handle(post,deps)).status,403); // Missing Turnstile token: fail closed even on port 3124.
 console.log('OK Beta82: 45.3.1 lock, Node pins, sandboxed preload, loopback fallback 3123-3143, strict deny rules, release versions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
