'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const smoke=require('../lib/release-smoke'),{validateProof}=require('./smoke-windows');
const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'alm-release-'))),nonce=crypto.randomBytes(32).toString('hex'),paths=[];let api,host;const keepAlive=setInterval(()=>{},1000);
(async()=>{
 assert.equal(smoke.prepareReleaseSmoke({},{ALM_RELEASE_SMOKE:'0'}),null);
 const env={ALM_RELEASE_SMOKE:'1',ALM_RELEASE_PROFILE:dir,ALM_RELEASE_NONCE:nonce};fs.writeFileSync(path.join(dir,'.alm-release-test.json'),JSON.stringify({nonce,phase:'seed',expectedCount:30430}));const app={setPath:(key,value)=>paths.push([key,value])};
 const context=smoke.prepareReleaseSmoke(app,env);assert.deepEqual(paths,[['userData',dir],['sessionData',dir]]);assert.equal(context.profile,dir);assert.equal(env.ALM_AUTOMATION_STARTUP,'0');
 assert.throws(()=>smoke.prepareReleaseSmoke(app,{...env,ALM_RELEASE_PROFILE:path.resolve(__dirname,'..')}),/PROFILE_REJECTED/);assert.throws(()=>smoke.prepareReleaseSmoke(app,{...env,ALM_RELEASE_NONCE:'0'.repeat(64)}),/TOKEN_REJECTED/);
 const base={status:'passed',nonce,phase:'verify',version:'2.0.0-beta.58',packaged:true,runtime:{electron:'44.1.1'},ui:true,catalogueCount:30430,episodesSeen:3,imported:1,backup:true,persistence:true};validateProof(base,{nonce,phase:'verify',version:base.version,expectedCount:30430,electron:'44.1.1'});for(const update of [{nonce:'wrong'},{packaged:false},{version:'old'},{catalogueCount:0},{catalogueCount:30429},{runtime:{electron:'old'}},{persistence:false}])assert.throws(()=>validateProof({...base,...update},{nonce,phase:'verify',version:base.version,expectedCount:30430,electron:'44.1.1'}));
 const payload=path.join(dir,'payload');fs.mkdirSync(payload);const source=path.resolve(__dirname,'..');const required=[...require('./package-local-modules').sourceRuntimeFiles(source)];for(const name of required){const target=path.join(payload,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,name),target);}
 // This source/version fixture must now include the declared production graph.
 // The real electron-builder collection is covered separately by Beta71.
 const invocation=require('./release-utils').npmInvocation(['ls','--omit=dev','--all','--parseable']);
 const installed=require('node:child_process').execFileSync(invocation.command,invocation.args,{cwd:source,encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
 require('./production-copy-roots').copyProductionModules(source,payload,installed);
 require('./ensure-asar-finished').ensureAsarFinished();const asar=require('@electron/asar'),integrity=require('./check-packaged-integrity');const archive=path.join(dir,'valid.asar');await asar.createPackage(payload,archive);assert(integrity.verifyPreparedSource(archive,source).files>=required.length);
 fs.appendFileSync(path.join(payload,'main.js'),'\n// altered');const wrongCode=path.join(dir,'wrong-code.asar');await asar.createPackage(payload,wrongCode);assert.throws(()=>integrity.verifyPreparedSource(wrongCode,source),/Code du paquet/);
 const pkg=JSON.parse(fs.readFileSync(path.join(payload,'package.json'),'utf8'));pkg.version='old';fs.writeFileSync(path.join(payload,'package.json'),JSON.stringify(pkg));const wrongVersion=path.join(dir,'wrong-version.asar');await asar.createPackage(payload,wrongVersion);assert.throws(()=>integrity.verifyPreparedSource(wrongVersion,source),/Version du paquet/);
 process.env.ALM_DATA_DIR=path.join(dir,'data');process.env.ALM_IMAGES_DIR=path.join(dir,'images');process.env.ALM_AUTOMATION_STARTUP='0';process.env.ALM_RELEASE_SMOKE='1';fs.mkdirSync(process.env.ALM_IMAGES_DIR);
 api=require('../server');const db=require('../db');await db.whenReady();host=await api.startServer(0);const origin='http://127.0.0.1:'+host.almPort,nativeFetch=global.fetch;
 const savedFetch=global.fetch,savedDocument=global.document;global.fetch=(url,options)=>nativeFetch(new URL(url,origin),options);global.document={title:'Anime Local Manager V2.0.0 Beta stable'};
 try{
  // Regression: a package with an ASAR header but no installed MP4 must fail.
  const original=global.fetch;
  global.fetch=async(url,opts)=>String(url).includes('/assets/alm-clip-complet-1080p.mp4')
   ? new Response('missing',{status:404}) : original(url,opts);
  await assert.rejects(smoke.rendererChecks({nonce,phase:'seed',expectedCount:30430}),/ALM_SMOKE_CLIP_MISSING/);
  global.fetch=original;
  const first=await smoke.rendererChecks({nonce,phase:'seed',expectedCount:30430});assert.equal(first.imported,1);assert.equal(first.catalogueCount,30430);assert(!first.persistence);const second=await smoke.rendererChecks({nonce,phase:'verify',expectedCount:30430});assert(second.persistence);const rows=api.__test.readAnimes();assert.equal(rows.length,1);assert.equal(rows[0].notes,'ALM release smoke '+nonce);assert.equal(rows[0].episodesSeen,'3');assert.equal(rows[0].score,'8');}
 finally{global.fetch=savedFetch;global.document=savedDocument;}
 await assert.rejects(global.fetch('https://example.com'),/SMOKE_OFFLINE/);
 console.log('OK Beta58 smoke: temporary profile and nonce guards, evidence/version checks, real SQLite catalogue, actual XML import, progress/notes, repeated reads and backup export, external fetch blocked. Native executable launch remains a Windows CI check.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await require('./runtime-cleanup').cleanupRuntime(dir,host);delete process.env.ALM_RELEASE_SMOKE;clearInterval(keepAlive);});
