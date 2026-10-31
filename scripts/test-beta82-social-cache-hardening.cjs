'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const dns=require('node:dns').promises;
const https=require('node:https');
const Model=require('../public/community-model');
const {safeSource,createCoverCache}=require('../lib/cover-cache');
const {fetchBinary}=require('../lib/public-network');
const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(900,0x41)]);

async function fixture(fn){const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'alm-gap-social-'));try{return await fn(dir);}finally{await fsp.rm(dir,{recursive:true,force:true});}}

async function main(){
 // The web deployment is built from these shared assets. Catch stale web
 // snapshots before packaging, without deploying or invoking external APIs.
 const siteManifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../community/site/release-manifest.json'),'utf8'));
 for(const name of ['community.js','community-copy.js','community-workspace.js','community-workspace.css']){
  const local=fs.readFileSync(path.join(__dirname,'../public',name));
  const website=fs.readFileSync(path.join(__dirname,'../community/site',name));
  assert(local.equals(website),name+' must not drift between desktop and web');
  const listed=siteManifest.files.find(entry=>entry.path===name);
  assert(listed&&listed.bytes===website.length,'Site manifest must describe '+name);
  assert.equal(listed.sha256,require('node:crypto').createHash('sha256').update(website).digest('hex'));
 }
 console.log('OK: static community site and desktop community assets are synchronized and hash-verified.');
 // Source-derived execution: run the actual commonRows() function from the
 // friend-library UI against a private owner and an authorized friend profile.
 const workspace=fs.readFileSync(path.join(__dirname,'../public/community-workspace.js'),'utf8');
 const definition=workspace.match(/  function commonRows\(\)\{[^\n]+\}/)?.[0];
 assert(definition,'The real friend-library commonRows() function must exist');
 const getCommon=new Function('C','selectedData','M',`${definition};return commonRows()`);
 const owner={profile:Model.profile({visibility:'private',share_library:false,share_watching:false}),items:[
  {mal_id:19,title:'Monster',status:'Watching'},
  {mal_id:24,title:'Own only'},
 ]};
 const visibleFriend={items:[{mal_id:19,title:'Monster (shared)'},{mal_id:43,title:'Friend only'}]};
 assert.equal(Model.shared(owner).items.length,0,'Owner must not publish private library');
 assert.deepEqual(getCommon(()=>({snapshot:()=>({own:owner})}),visibleFriend,Model).map(x=>x.mal_id),[19], 'Friend view must match the profile summary without requiring owner publishing');
 assert.equal(getCommon(()=>({snapshot:()=>({own:owner})}),{items:[]},Model).length,0, 'Revoked sharing must reveal nothing');
 assert.equal(getCommon(()=>({snapshot:()=>null}),visibleFriend,Model).length,0, 'Logout must reveal nothing');
 console.log('OK: consistent local-only common anime across profile and friend library; revocation and logout fail closed.');

 // Cache-source canonicalization must not vary with URL fragment. Very long
 // inputs must be discarded rather than hashed/stored and downloaded.
 assert.equal(safeSource('https://cdn.myanimelist.net/a.jpg#v1'),'https://cdn.myanimelist.net/a.jpg');
 assert.equal(safeSource('https://cdn.myanimelist.net/a.jpg#v2'),safeSource('https://cdn.myanimelist.net/a.jpg#v1'));
 assert.equal(safeSource('https://cdn.myanimelist.net/a.jpg?param='+ 'a'.repeat(2400)),'');
 assert.equal(safeSource('https://evil.example/a.jpg'),'');

 await fixture(async directory=>{
  let time=1_000_000,calls=0;
  const cache=createCoverCache({directory,now:()=>time,fetchImage:async (_url,options)=>{
   calls++;assert(options.allowedHosts.has('cdn.myanimelist.net'));
   assert(!options.allowedHosts.has('evil.example'));
   if(calls===1)throw Error('ALM_IMAGE_TIMEOUT');
   return {bytes:jpeg};
  }});
  const url='https://cdn.myanimelist.net/ok.jpg';
  assert.equal(await cache.get(url),'');
  time+=89_000;assert.equal(await cache.get(url),'');assert.equal(calls,1,'No retry storm during temporary cooldown');
  time+=2_000;const file=await cache.get(url);assert.equal(calls,2,'Transient outage must recover in less than 30 minutes');
  assert((await fsp.readFile(file)).equals(jpeg));
  assert.equal(await cache.get(url,{offline:true}),file,'Offline cache must persist');
 });
 await fixture(async directory=>{
  let time=1_000_000,calls=0;
  const cache=createCoverCache({directory,now:()=>time,fetchImage:async()=>{calls++;throw Error('ALM_IMAGE_FORMAT')}});
  const url='https://cdn.myanimelist.net/bad.jpg';
  await cache.get(url);time+=120_000;await cache.get(url);
  assert.equal(calls,1,'Invalid image must keep 30-minute cooldown');
  time+=30*60*1000;await cache.get(url);assert.equal(calls,2);
 });
 console.log('OK: canonical cache keys, URL size budget, bounded transient retry and long cooldown for bad images.');

 // Offline redirect test. Mock DNS and HTTPS, including a valid public IP;
 // no connection is made to any external service.
 const oldLookup=dns.lookup,oldGet=https.get;
 let requests=0;
 try {
  dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
  https.get=(_url,_options,onResponse)=>{
   requests++;
   const req=new EventEmitter();req.destroy=err=>{if(err)req.emit('error',err);req.emit('close');};
   process.nextTick(()=>{
    const res=new PassThrough();res.statusCode=302;res.headers={location:'https://outside-provider.example/image.jpg'};
    onResponse(res);res.end();req.emit('close');
   });
   return req;
  };
  await assert.rejects(fetchBinary('https://cdn.myanimelist.net/images/foo.jpg',{
   requireHttps:true,allowedHosts:new Set(['cdn.myanimelist.net']),timeoutMs:1000,
  }),/ALM_IMAGE_HOST/);
  assert.equal(requests,1,'A redirect outside the image-CDN allowlist must be refused before a second request');
 } finally {dns.lookup=oldLookup;https.get=oldGet;}
 console.log('OK: redirect cannot escape approved image CDNs, using entirely mocked HTTPS transport.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
