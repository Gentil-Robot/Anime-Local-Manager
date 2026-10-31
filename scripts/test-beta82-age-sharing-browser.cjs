'use strict';
// Optional browser regression: real ALM app/SQLite/assets and fictional community
// responses. SQL/RLS enforcement is exercised separately by test-beta72-age.cjs.
// No request leaves localhost, no real accounts are edited, no messages are sent.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require(process.env.ALM_PLAYWRIGHT_MODULE||'playwright');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm82-age-sharing-'));
const output=path.resolve(process.env.ALM_UI_EVIDENCE||path.join(__dirname,'../test-artifacts/age-sharing82'));
fs.mkdirSync(output,{recursive:true});
process.env.ALM_DATA_DIR=directory;process.env.ALM_IMAGES_DIR=path.join(directory,'images');process.env.ALM_AUTOMATION_STARTUP='0';
fs.mkdirSync(process.env.ALM_IMAGES_DIR);
fs.writeFileSync(path.join(directory,'config.json'),JSON.stringify({preloadMetadataOnStart:false,metadataAutonomousUpdateOnStart:false,metadataUpdateOnStart:false}));
const nativeFetch=global.fetch;
global.fetch=(url,options)=>{let parsed;try{parsed=new URL(typeof url==='string'?url:url.url);}catch{return Promise.reject(Error('Offline fixture'));}return parsed.protocol==='http:'&&parsed.hostname==='127.0.0.1'?nativeFetch(url,options):Promise.reject(Error('External providers disabled in browser fixture'));};
const checks=[],errors=[],requests=[],blockedExternal=[];
let host,browser,page,report,origin,holdAge=null,rejectAge=false,rejectProfile=false,rejectStatus=false,unavailableAfterCommit=false;
const keepAlive=setInterval(()=>{},1000),ownerId='82000000-0000-0000-0000-000000000001',secondId='82000000-0000-0000-0000-000000000002';
const writes=()=>requests.filter(r=>r.method!=='GET');
const adult=excludeAdult=>({available:true,recorded:true,adult:true,excludeAdult});

(async()=>{
 const server=require('../server'),db=require('../db'),M=require('../public/community-model');await db.whenReady();
 const rows=[
  {id:1,malId:1,title:'Safe fictional entry',status:'Completed',genres:['Action'],notes:'A private notebook preserved.',personalJournal:{episodes:[],awards:[]}},
  {id:2,malId:25,title:'Restricted fictional entry',status:'Watching',genres:['Ecchi'],notes:'Another private notebook preserved.',personalJournal:{episodes:[],awards:[]}},
  {id:3,malId:99999999,title:'Unclassified fictional entry',status:'Plan to Watch',notes:'An unclassified private entry.',personalJournal:{episodes:[],awards:[]}}
 ];
 db.writeAllAnimes(rows);
 host=await new Promise(resolve=>{const listener=server.app.listen(0,'127.0.0.1',()=>resolve(listener));});
 origin='http://127.0.0.1:'+host.address().port;
 const preserved=await nativeFetch(origin+'/api/notebook').then(r=>r.json()).then(r=>r.items);
 const profile=M.profile({id:ownerId,display_name:'GentilRobot',discriminator:4,visibility:'friends',share_library:true,share_favorites:true,share_watching:true,share_dna:true,featured:[1]});
 const own={profile,items:M.items(rows),summary:M.summary(rows),dna:[],activity:[],age:adult(true)};
 const state={configured:true,connected:true,user:{id:ownerId,email:'fixture@example.test'},identity:profile,own,sync:{dirty:false,publishedAt:'2026-10-20T00:00:00Z',auto:false},notifications:{count:0}};
 const friends={userId:ownerId,relationships:[],cards:[],libraryStats:{available:true,libraries:0,animes:0}};
 browser=await chromium.launch({headless:true,executablePath:process.env.ALM_CHROMIUM_EXECUTABLE||process.env.ALM_CHROMIUM||process.env.ALM_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{localStorage.setItem('alm-language','fr');localStorage.setItem('alm.visual.motion','reduced');});
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){blockedExternal.push(url.origin);return route.abort();}
  if(!url.pathname.startsWith('/api/community/')){
   if(process.env.ALM_UI_BASELINE){const asset=path.resolve(process.env.ALM_UI_BASELINE,'.'+url.pathname);if(asset.startsWith(path.resolve(process.env.ALM_UI_BASELINE)+path.sep)&&fs.existsSync(asset)&&fs.statSync(asset).isFile())return route.fulfill({path:asset});}
   return route.continue();
  }
  const name=url.pathname.slice('/api/community/'.length),method=request.method(),body=method==='GET'?undefined:request.postDataJSON();
  requests.push({name,method,...(body?{body}:{})});
  const respond=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(name==='status'&&method==='GET')return rejectStatus?respond({error:'ALM_NETWORK'},503):respond(state);
  if(name==='friends'&&method==='GET')return respond(friends);
  if(['recommendations','sessions'].includes(name)&&method==='GET')return respond({items:[]});
  if(name==='age'&&method==='POST'){
   const owner=state.user.id,ageAtRequest={...own.age};
   if(holdAge){holdAge.seen=true;await holdAge.promise;}
   if(rejectAge===true)return respond({error:'ALM_NETWORK'},503);
   const next={...ageAtRequest,excludeAdult:ageAtRequest.available===true&&ageAtRequest.recorded===true&&ageAtRequest.adult===true?body.excludeAdult!==false:true};
   if(state.user.id===owner)own.age=next;
   if(rejectAge==='committed'){
    if(unavailableAfterCommit)rejectStatus=true;
    return respond({error:'ALM_NETWORK'},503);
   }
   // The website RPC returns these three fields; available is added by its
   // status adapter. The profile editor must accept this actual response shape.
   const {available,...rpcState}=next;return respond(rpcState);
  }
  if(name==='profile'&&method==='PUT'){
   if(rejectProfile)return respond({error:'ALM_NETWORK'},503);
   for(const key of ['age','adult','excludeAdult','birthDate','available','recorded'])assert.equal(Object.hasOwn(body,key),false,'Profile payload must not embed '+key);
   own.profile=M.profile({...body,id:state.user.id,discriminator:state.identity.discriminator});state.identity=own.profile;return respond(own);
  }
  return respond({error:'UNEXPECTED_FIXTURE_ACTION'},400);
 });
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 async function waitFor(predicate,detail='application state'){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){if(await page.evaluate(predicate))return;await page.waitForTimeout(50);}
  throw Error('Timed out waiting for '+detail+'; recent requests '+JSON.stringify(requests.slice(-8)));
 }
 async function waitOutside(predicate,detail='fixture request'){
  const deadline=Date.now()+10000;while(Date.now()<deadline){if(predicate())return;await page.waitForTimeout(25);}throw Error('Timed out waiting for '+detail);
 }
 async function check(name,fn){await settle();await fn();checks.push(name);console.log('OK '+name);}
 async function load(age=own.age){own.age={...age};await page.goto(origin,{waitUntil:'domcontentloaded'});await waitFor(()=>window._almAnimes?.length===3&&window.ALM_COMMUNITY?.snapshot()?.connected&&window.ALM_COMMUNITY.context()?.friends,'connected fixture');await page.locator('#commProfileEntry').click();await page.waitForSelector('#communityPage .comm-profile-toolbar');}
 async function openEdit(){await page.locator('#communityPage [data-comm-action="edit"]').click();await page.waitForSelector('#commEditForm');}
 async function closeEdit(){await page.locator('#commEditForm [data-close]').click();await page.waitForSelector('#commDialog',{state:'hidden'});}
 async function saveEdit(){await page.locator('#commEditForm button[type="submit"]').click();await page.waitForSelector('#commDialog',{state:'hidden'});await waitFor(()=>window.ALM_COMMUNITY.snapshot().own.profile.display_name==='GentilRobot');}
 async function account(){await page.locator('#communityPage [data-comm-action="account"]').click();await page.waitForSelector('#settingsDialog[open] #commAdultShare');}
 async function closeAccount(){await page.keyboard.press('Escape');await page.waitForSelector('#settingsDialog',{state:'hidden'});}
 const checkbox=()=>page.locator('#commProfileAdultShare');

 await load(adult(true));await openEdit();
 await check('Adult profile exposes the same active exclusion control as My account',async()=>{
  assert.equal(await checkbox().count(),1,'The profile editor must render a real age-aware exclusion control');assert.equal(await checkbox().isDisabled(),false);assert.equal(await checkbox().isChecked(),true);
  const text=await page.locator('#commShareChoices').innerText();assert.doesNotMatch(text,/Ce filtre est obligatoire dans la communauté/);assert.match(text,/tu peux choisir/i);assert.match(text,/amis majeurs/);assert.match(text,/non classées restent privées/);assert.match(text,/bibliothèque locale/);
 });
 const beforeCancel=writes().length;await checkbox().uncheck();await closeEdit();await openEdit();
 await check('Cancelling an adult choice leaves the saved exclusion unchanged',async()=>{assert.equal(writes().length,beforeCancel);assert.equal(await checkbox().isChecked(),true);});
 await checkbox().uncheck();const beforeSave=writes().length;await saveEdit();
 await check('Adult opt-in saves false through the existing age endpoint before profile',async()=>{
  const changed=writes().slice(beforeSave);assert.deepEqual(changed.map(r=>[r.name,r.method]),[['age','POST'],['profile','PUT']]);assert.deepEqual(changed[0].body,{excludeAdult:false});assert.equal(own.age.excludeAdult,false);
 });
 await openEdit();
 await check('Saved adult choice survives profile reopening',async()=>{assert.equal(await checkbox().isChecked(),false);assert.equal(await checkbox().isDisabled(),false);});
 await closeEdit();await account();
 await check('My account immediately reflects the exclusion changed in profile',async()=>{assert.equal(await page.locator('#commAdultShare').isChecked(),false);assert.equal(await page.locator('#commAdultShare').isDisabled(),false);});
 await page.locator('#commAdultShare').check();await waitFor(()=>window.ALM_COMMUNITY.snapshot().own.age.excludeAdult===true);await closeAccount();await openEdit();
 await check('Changing exclusion in My account is reflected by the profile editor',async()=>{assert.equal(await checkbox().isChecked(),true);assert.equal(own.age.excludeAdult,true);});
 const unchanged=writes().length;await saveEdit();
 await check('Saving an unchanged exclusion does not issue a redundant age write',async()=>{assert.deepEqual(writes().slice(unchanged).map(r=>r.name),['profile']);});
 await load(adult(false));await openEdit();
 await check('Adult opt-in survives a full application reload',async()=>{assert.equal(await checkbox().isChecked(),false);});
 await checkbox().check();await saveEdit();await openEdit();
 await check('Adults can restore exclusion and reopen the checked control',async()=>{assert.equal(own.age.excludeAdult,true);assert.equal(await checkbox().isChecked(),true);});
 await closeEdit();

 for(const [name,age,copy] of [
  ['minor',{available:true,recorded:true,adult:false,excludeAdult:false},/avant 18 ans/i],
  ['undeclared age',{available:true,recorded:false,adult:false,excludeAdult:false},/date de naissance|attestation/],
  ['unavailable age',{available:false,recorded:true,adult:true,excludeAdult:false},/indisponible|pas disponible/]
 ]){
  await load(age);await openEdit();
  await check(name+': exclusion stays checked, disabled and explained',async()=>{assert.equal(await checkbox().isChecked(),true);assert.equal(await checkbox().isDisabled(),true);assert.match(await page.locator('#commShareChoices').innerText(),copy);});
  const unchanged=writes().length;await saveEdit();
  await check(name+': normal profile save never attempts to loosen the age rule',async()=>{assert.equal(writes().slice(unchanged).filter(r=>r.name==='age').length,0);assert.equal(writes().slice(unchanged).filter(r=>r.name==='profile').length,1);});
 }

 await load(adult(true));await openEdit();await checkbox().uncheck();rejectAge=true;const beforeError=writes().length;
 await page.locator('#commEditForm button[type="submit"]').click();
 await waitFor(()=>Boolean(document.querySelector('#commFormStatus')?.textContent.trim())&&!document.querySelector('#commEditForm button[type=submit]')?.disabled,'visible failed save');
 await check('Age write failure stays visible and prevents a misleading profile save',async()=>{assert.equal(await page.locator('#commDialog').evaluate(n=>n.open),true);assert.match(await page.locator('#commFormStatus').textContent(),/n’a pas pu être confirmé|vérifier le réglage/i);assert.deepEqual(writes().slice(beforeError).map(r=>r.name),['age']);assert.equal(own.age.excludeAdult,true);assert.equal(await checkbox().isChecked(),true);});
 rejectAge=false;await checkbox().uncheck();await saveEdit();
 await check('An adult can retry a failed save successfully',async()=>{assert.equal(own.age.excludeAdult,false);});

 await load(adult(true));await openEdit();await checkbox().uncheck();rejectAge='committed';const beforeCommitted=writes().length;
 await page.locator('#commEditForm button[type="submit"]').click();
 await waitFor(()=>window.ALM_COMMUNITY.snapshot().own.age.excludeAdult===false&&!document.querySelector('#commEditForm button[type=submit]')?.disabled,'authoritative preference after an uncertain write');
 await check('An age write committed before an error is reconciled from the server',async()=>{
  assert.equal(own.age.excludeAdult,false);assert.equal(await checkbox().isChecked(),false);assert.equal(await checkbox().isDisabled(),false);assert.equal(await page.locator('#commDialog').evaluate(n=>n.open),true);assert.match(await page.locator('#commFormStatus').textContent(),/n’a pas pu être confirmé|vérifier le réglage/i);assert.deepEqual(writes().slice(beforeCommitted).map(r=>r.name),['age']);
 });
 rejectAge=false;await closeEdit();await account();
 await check('My account displays the reconciled committed preference after an error',async()=>{assert.equal(await page.locator('#commAdultShare').isChecked(),false);});
 await closeAccount();

 await load(adult(true));await openEdit();await checkbox().uncheck();rejectAge='committed';unavailableAfterCommit=true;const beforeUnknown=writes().length;
 await page.locator('#commEditForm button[type="submit"]').click();
 await waitFor(()=>window.ALM_COMMUNITY.snapshot().own.age.available===false&&!document.querySelector('#commEditForm button[type=submit]')?.disabled,'unknown preference when verification also fails');
 await check('If verification fails too, age state stays unavailable without retrying a write',async()=>{
  assert.equal(own.age.excludeAdult,false,'The fixture server did commit: the UI must not claim cached true was saved');assert.equal(await checkbox().isDisabled(),true);assert.equal(await checkbox().evaluate(n=>n.indeterminate),true);assert.equal(await checkbox().getAttribute('aria-checked'),'mixed');assert.match((await page.locator('#commProfileAdultShareHint').textContent())+' '+(await page.locator('#commFormStatus').textContent()),/indisponible|pas disponible|impossible|vérif|réessaie/i);assert.deepEqual(writes().slice(beforeUnknown).map(r=>r.name),['age']);assert.equal(await page.locator('#commDialog').evaluate(n=>n.open),true);
 });
 rejectAge=false;rejectStatus=false;unavailableAfterCommit=false;await closeEdit();await page.evaluate(()=>window.ALM_COMMUNITY.refresh());await openEdit();
 await check('A fresh successful read restores the true preference after verification failure',async()=>{assert.equal(await checkbox().isDisabled(),false);assert.equal(await checkbox().isChecked(),false);assert.deepEqual(writes().slice(beforeUnknown).map(r=>r.name),['age']);});
 await closeEdit();

 await load(adult(true));await openEdit();await checkbox().uncheck();rejectProfile=true;const beforePartial=writes().length;
 await page.locator('#commEditForm button[type="submit"]').click();
 await waitFor(()=>Boolean(document.querySelector('#commFormStatus')?.textContent.trim())&&!document.querySelector('#commEditForm button[type=submit]')?.disabled,'visible failed profile save');
 await check('A successful age write is retained if the following profile save fails',async()=>{
  assert.equal(await page.locator('#commDialog').evaluate(n=>n.open),true);assert.match(await page.locator('#commFormStatus').textContent(),/réseau|enregistrer|connexion|disponible/i);assert.deepEqual(writes().slice(beforePartial).map(r=>r.name),['age','profile']);assert.equal(own.age.excludeAdult,false);assert.equal(await checkbox().isChecked(),false);assert.equal(await page.evaluate(()=>window.ALM_COMMUNITY.snapshot().own.age.excludeAdult),false);
 });
 rejectProfile=false;const beforeRetry=writes().length;await saveEdit();
 await check('Retry after a partial save does not send the age preference twice',async()=>{assert.deepEqual(writes().slice(beforeRetry).map(r=>r.name),['profile']);assert.equal(own.age.excludeAdult,false);});

 await load(adult(true));await openEdit();await checkbox().uncheck();
 let release;holdAge={seen:false,promise:new Promise(resolve=>{release=resolve;})};const beforePending=writes().length;
 await page.locator('#commEditForm button[type="submit"]').click();await waitOutside(()=>holdAge.seen);
 await page.locator('#commEditForm').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await check('Pending profile save is disabled and duplicate submit does not write twice',async()=>{assert.equal(await page.locator('#commEditForm button[type="submit"]').isDisabled(),true);assert.equal(writes().slice(beforePending).filter(r=>r.name==='age').length,1);});
 release();holdAge=null;await page.waitForSelector('#commDialog',{state:'hidden'});
 await check('Single pending save settles with one age write and one profile write',async()=>{assert.deepEqual(writes().slice(beforePending).map(r=>r.name),['age','profile']);assert.equal(own.age.excludeAdult,false);});

 await load(adult(true));await openEdit();await checkbox().uncheck();
 holdAge={seen:false,promise:new Promise(resolve=>{release=resolve;})};const beforeClose=writes().length;
 const closedAgeResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/community/age');
 await page.locator('#commEditForm button[type="submit"]').click();await waitOutside(()=>holdAge.seen);await closeEdit();await openEdit();
 await page.locator('#commEditForm [name=bio]').fill('A new unsaved draft');release();holdAge=null;await (await closedAgeResponse).finished();
 await waitFor(()=>window.ALM_COMMUNITY.snapshot().own.age.excludeAdult===false,'closed form age response reflected in account state');
 await check('A completed age write after Close preserves the newly opened profile form',async()=>{
  assert.equal(await page.locator('#commDialog').evaluate(n=>n.open),true);assert.equal(await page.locator('#commEditForm [name=bio]').inputValue(),'A new unsaved draft');assert.equal(writes().slice(beforeClose).filter(r=>r.name==='profile').length,0);assert.equal(own.age.excludeAdult,false);
 });
 await closeEdit();await openEdit();
 await check('Reopening after a closed pending save shows the authoritative saved age choice',async()=>{assert.equal(await checkbox().isChecked(),false);assert.equal(await checkbox().isDisabled(),false);});
 await closeEdit();

 await load(adult(true));await openEdit();await checkbox().uncheck();
 holdAge={seen:false,promise:new Promise(resolve=>{release=resolve;})};const beforeSwitch=writes().length;
 const switchedAgeResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/community/age');
 await page.locator('#commEditForm button[type="submit"]').click();await waitOutside(()=>holdAge.seen);
 state.user={id:secondId,email:'second-fixture@example.test'};state.identity=M.profile({...profile,id:secondId,display_name:'SecondFixture',discriminator:7});own.profile=state.identity;own.age={available:true,recorded:true,adult:false,excludeAdult:true};friends.userId=secondId;
 await page.evaluate(()=>window.ALM_COMMUNITY.refresh());release();holdAge=null;await (await switchedAgeResponse).finished();await settle();
 await check('A response from the previous account cannot write the new account profile',async()=>{assert.equal(writes().slice(beforeSwitch).filter(r=>r.name==='profile').length,0);assert.equal(state.user.id,secondId);assert.equal(own.age.adult,false);assert.equal(own.age.excludeAdult,true);});
 await page.evaluate(()=>{document.querySelector('#commDialog[open]')?.close();});await page.reload({waitUntil:'domcontentloaded'});await waitFor(()=>window.ALM_COMMUNITY?.snapshot()?.user?.id==='82000000-0000-0000-0000-000000000002');await page.locator('#commProfileEntry').click();await openEdit();
 await check('After account switch the minor profile is locked with the new identity',async()=>{assert.equal(await checkbox().isChecked(),true);assert.equal(await checkbox().isDisabled(),true);assert.equal(await page.locator('#commEditForm [name=display_name]').inputValue(),'SecondFixture');});

 await check('All seven translations use the shared age-rule component',async()=>{
  const languages=await page.evaluate(()=>{const A=window.ALM_COMMUNITY_AGE;return A.languages.map(language=>{const root=document.createElement('div');root.innerHTML=A.exclusion(language,{available:true,recorded:true,adult:true,excludeAdult:false},'checkAdult');const adult=root.querySelector('input');const adultResult={checked:adult.checked,disabled:adult.disabled,copy:root.textContent};root.innerHTML=A.exclusion(language,{available:true,recorded:true,adult:false,excludeAdult:false},'checkMinor');const minor=root.querySelector('input');return {language,adult:adultResult,minor:{checked:minor.checked,disabled:minor.disabled,copy:root.textContent}};});});
  assert.equal(languages.length,7);for(const value of languages){assert.equal(value.adult.checked,false);assert.equal(value.adult.disabled,false);assert.equal(value.minor.checked,true);assert.equal(value.minor.disabled,true);assert(value.adult.copy.length>80);assert(value.minor.copy.length>50);assert.notEqual(value.adult.copy,value.minor.copy);}
 });
 await check('App and website share identical age/profile runtime files',async()=>{for(const file of ['community-age.js','community.js'])assert.equal(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),fs.readFileSync(path.join(__dirname,'../community/site',file),'utf8'));});
 const after=await nativeFetch(origin+'/api/notebook').then(r=>r.json()).then(r=>r.items);
 await check('All local library entries, notes and journals stay untouched',async()=>{assert.deepEqual(after,preserved);assert.equal(after.length,3);assert.deepEqual(errors,[]);assert.equal(writes().filter(r=>['publish','recommendations','auth','logout'].includes(r.name)).length,0);});
 report={status:'passed',browser:await browser.version(),checks,errors,requests,blockedExternalOrigins:[...new Set(blockedExternal)],scope:'Real ALM Express/SQLite/frontend with fictional community API responses; SQL/RLS separately tested by test-beta72-age.cjs; no production changes or messages.'};
 console.log(checks.length+' age-sharing browser checks passed.');
})().catch(error=>{report={status:'failed',message:error.message,stack:error.stack,checks,errors,requests};console.error(error);process.exitCode=1;}).finally(async()=>{
 fs.writeFileSync(path.join(output,'age-sharing-checks.json'),JSON.stringify(report,null,2)+'\n');
 await browser?.close();global.fetch=nativeFetch;await require('./runtime-cleanup').cleanupRuntime(directory,host);clearInterval(keepAlive);process.exit(process.exitCode||0);
});
