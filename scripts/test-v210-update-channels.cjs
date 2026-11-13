'use strict';
const assert=require('node:assert/strict');
const {createVersionCheck,RELEASES}=require('../lib/version-check');
const {chooseAsset}=require('../lib/integrated-updater');
const release=require('../release-version.json');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function main(){
 const gate=deferred(),calls=[];
 const listed=[{tag_name:'v2.1.2',prerelease:true,html_url:RELEASES+'/tag/v2.1.2'},
  {tag_name:'v2.0.1',prerelease:false,html_url:RELEASES+'/tag/v2.0.1'}];
 let offline=false;
 const versions=createVersionCheck({current:'2.0.0',fetchImpl:async()=>{
  const index=calls.length;calls.push(index);if(index===0)await gate.promise;
  if(offline)throw Error('fictional offline');return new Response(JSON.stringify(listed));
 }});
 const beta=versions.check(true,'beta'),stable=await versions.check(true,'stable');
 assert.equal(stable.latest,'v2.0.1');assert.equal(stable.prerelease,false);
 gate.resolve();assert.equal((await beta).latest,'v2.1.2');
 assert.equal(versions.state().channel,'stable','A late beta result cannot replace the selected stable channel');
 assert.equal(versions.state().latest,'v2.0.1');
 assert.equal((await versions.check(false,'beta')).latest,'v2.1.2');
 assert.equal((await versions.check(false,'stable')).latest,'v2.0.1');assert.equal(calls.length,2);
 offline=true;const failure=await versions.check(true,'stable');
 assert.equal(failure.available,false);assert.equal(failure.error,'ALM_UPDATE_SOURCE');
 assert(!failure.latest,'A failed refresh must not retain an old offered installer');
 assert.equal((await versions.check(false,'beta')).latest,'v2.1.2','The other channel cache remains independent');
 // The published 2.0.0 updater expects this generic name for future versions.
 assert.equal(release.installerName,'Anime-Local-Manager-2.1.2-Setup-x64.exe');
 const asset={name:release.installerName,state:'uploaded',size:1048576,digest:'sha256:'+'a'.repeat(64),
  browser_download_url:'https://github.com/Gentil-Robot/Anime-Local-Manager/releases/download/v2.1.2/'+release.installerName};
 const selected=chooseAsset({available:true,latest:'v2.1.2',prerelease:true,assets:[asset]},
  {current:'2.0.0',platform:'win32',arch:'x64',portable:false});
 assert.equal(selected.name,asset.name);assert.equal(selected.version,'2.1.2');
 console.log('OK 2.1.2: concurrent stable/beta checks, independent caches, failed refresh and 2.0.0 installer upgrade contract.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
