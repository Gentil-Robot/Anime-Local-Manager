'use strict';
// Regression coverage for user-facing publication messages. Historical scripts
// remain identified by their original filenames only inside technical reports.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {verifyProject,displayName,diagnosticHeadline}=require('./verify-project');
const root=path.resolve(__dirname,'..'),release=require('../release-version.json');
const files=JSON.parse(fs.readFileSync(path.join(root,'scripts/verification-plan.json'),'utf8')).steps;
const banned=/\b(?:test-beta\d+|beta\s+\d+|beta\d+|nocturne)\b/i;

async function main(){
 assert.equal(release.technicalVersion,'2.0.0');
 assert.equal(release.distributionChannel,'beta');
 assert.equal(release.publicName,'Anime Local Manager V2.0.0 Bêta stable');
 assert(files.length>=151,'Le plan de recette ne doit pas perdre de contrôles');
 // The same public release metadata must reach both community diagnostics.
 for(const surface of ['public','community/site']){
  const context={window:{ALM_COMMUNITY_T:key=>key,ALM_DESIGN:{escape:v=>v,language:()=>'fr'},ALM_COMMUNITY_SECURITY:{errorCode:()=>'UNKNOWN'},ALM_COMMUNITY_MODEL:{},addEventListener(){}},document:{addEventListener(){}},setInterval:()=>0,clearInterval(){} };
  vm.runInNewContext(fs.readFileSync(path.join(root,surface,'release-version.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(path.join(root,surface,'community-ui-extra.js'),'utf8'),context);
  const diagnostic=()=>JSON.parse(context.window.ALM_COMMUNITY_PLUS.diagnostic());
  assert.equal(diagnostic().application,release.publicName);
  context.window.ALM_RELEASE={...context.window.ALM_RELEASE,publicName:'Anime Local Manager V2.0.1 Bêta stable'};
  assert.equal(diagnostic().application,'Anime Local Manager V2.0.1 Bêta stable');
  context.window.ALM_COMMUNITY_PLUS.report(Error('Fictional issue'));
  assert.equal(diagnostic().application,'Anime Local Manager V2.0.1 Bêta stable');
 }
 for(const file of files){
  const label=displayName(file);
  assert(label.trim().length>2,`Empty label for ${file}`);
  assert(!banned.test(label),`Historical version leaks to console: ${file} => ${label}`);
  assert(!/\.(?:js|cjs)$/.test(label),`Technical extension leaks to console: ${file}`);
 }
 assert.equal(displayName('scripts/test-beta76-imports.cjs'),'Imports : contrôle des données');
 assert.equal(displayName('scripts/test-beta78-storage.cjs'),'Stockage : persistance et récupération');
 assert.equal(displayName('scripts/test-beta82-production-copy.cjs'),'Copie de publication : intégrité');
 assert.equal(displayName('scripts/test-beta-stable.js'),'Conformité V2.0.0 Bêta stable');
 assert(!banned.test(diagnosticHeadline('AssertionError: expected test-beta76-imports.cjs')));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-v200-publication-display-'));
 try{
  const consoleLines=[];
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const slow=new Set(['test-beta-stable.js','test-beta51-http.js','test-beta53-http.js','test-beta46-cleanup.js','test-beta58-smoke.js','test-beta76-imports.cjs','test-beta78-storage.cjs','test-beta82-production-copy.cjs']);
  const good=await verifyProject({root,reportFile:path.join(dir,'success.json'),logFile:path.join(dir,'success.log'),heartbeatMs:5,consoleOutput:line=>consoleLines.push(line),run:async(_command,args,{log})=>{
   const file=path.basename(args[0]);
   if(slow.has(file))await delay(60);
   log.write('OK technical fixture for '+file+'\n');
   return {code:0,output:'OK technical fixture for '+file};
  }});
  assert.equal(good.status,'passed');
  assert.equal(good.checks.length,files.length);
  assert(good.checks.every(c=>c.test&&c.label&&c.status==='passed'));
  assert.equal(good.release.technicalVersion,'2.0.0');
  assert(consoleLines.some(line=>line.includes(release.publicName+' · '+files.length+' suites')));
  for(const label of [displayName('test-beta51-http.js'),displayName('test-beta53-http.js'),displayName('test-beta76-imports.cjs'),displayName('test-beta78-storage.cjs')]){
   assert(consoleLines.some(line=>line.includes(label)&&line.includes('en cours')),`Missing heartbeat: ${label}`);
  }
  assert(consoleLines.every(line=>!banned.test(line)),consoleLines.filter(line=>banned.test(line)).join('\n'));
  const raw=fs.readFileSync(path.join(dir,'success.log'),'utf8');
  assert(raw.includes('[trace technique] script=scripts/test-beta76-imports.cjs'));
  assert(JSON.parse(fs.readFileSync(path.join(dir,'success.json'),'utf8')).checks.some(c=>c.test==='scripts/test-beta76-imports.cjs'&&c.label==='Imports : contrôle des données'));

  const failures=[];
  await assert.rejects(verifyProject({root,reportFile:path.join(dir,'failure.json'),logFile:path.join(dir,'failure.log'),heartbeatMs:5,consoleOutput:line=>failures.push(line),run:async(_command,args,{log})=>{
   const file=path.basename(args[0]);
   if(file==='test-beta76-imports.cjs'){
    const output='AssertionError [ERR_ASSERTION]: simulated error in test-beta76-imports.cjs';
    log.write(output+'\n');
    return {code:1,output};
   }
   return {code:0,output:''};
  }}),/Contrôle « Imports : contrôle des données » en échec/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'failure.json'),'utf8')).status,'failed');
  assert(failures.every(line=>!banned.test(line)),failures.filter(line=>banned.test(line)).join('\n'));
  assert(fs.readFileSync(path.join(dir,'failure.log'),'utf8').includes('test-beta76-imports.cjs'));
  console.log('OK '+release.publicVersion+': '+files.length+' intitulés fonctionnels, progressions et erreurs lisibles, traces techniques et identité de version conservées.');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
