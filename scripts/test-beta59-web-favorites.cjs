'use strict';
const assert=require('node:assert/strict'),express=require('express');
const {chromium}=require(process.env.ALM_PLAYWRIGHT_MODULE||'playwright');
const ref='aaaaaaaaaaaaaaaaaaaa',uid='00000000-0000-0000-0000-000000000001';
let host,browser;
(async()=>{
 const app=express();app.use(express.static(require('node:path').join(__dirname,'../community/site')));
 host=app.listen(0,'127.0.0.1');await new Promise(r=>host.once('listening',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.ALM_CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let savedItems=[{owner_id:uid,mal_id:1,title:'Fixture anime',status:'Completed',favorite:false,genres:['Fantasy'],score:8,episodes_seen:12,episodes_total:12}],published;
 const profile={id:uid,handle:'fixture_user',display_name:'Fixture profile',visibility:'friends',share_library:true,discriminator:1,featured:[]};
 const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 await page.route('**/community-config.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({url:'https://'+ref+'.supabase.co',publishableKey:'sb_publishable_fixture'})}));
 await page.route('https://'+ref+'.supabase.co/**',async r=>{
  const url=new URL(r.request().url());let body;
  if(url.pathname==='/auth/v1/user')body=user;
  else if(url.pathname==='/auth/v1/logout')body={};
  else if(url.pathname==='/rest/v1/rpc/alm_ensure_identity')body=profile;
  else if(url.pathname==='/rest/v1/alm_profiles')body=[profile];
  else if(url.pathname==='/rest/v1/alm_friendships'||url.pathname==='/rest/v1/alm_recommendations')body=[];
  else if(url.pathname==='/rest/v1/alm_library')body=savedItems;
  else if(url.pathname==='/rest/v1/alm_dna'||url.pathname==='/rest/v1/alm_activity')body=[{data:[]}];
  else if(url.pathname==='/rest/v1/rpc/alm_publish_profile'){published=r.request().postDataJSON();savedItems=published.p_items;Object.assign(profile,published.p_profile);body=null;}
  else throw Error('Unexpected fixture request: '+url.pathname);
  await r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 await page.addInitScript(({ref,token,user})=>localStorage.setItem('sb-'+ref+'-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user})),{ref,token,user});
 await page.goto('http://127.0.0.1:'+host.address().port+'/compte.html');await page.waitForFunction(()=>window.ALM_COMMUNITY_API);
 const changed=await page.evaluate(()=>window.ALM_COMMUNITY_API('favorite','PUT',{malId:1,value:true}));
 assert.equal(changed.profile.display_name,'Fixture profile');assert.equal(changed.items[0].favorite,true);
 await page.evaluate(()=>window.ALM_COMMUNITY_API('status'));await page.evaluate(()=>window.ALM_COMMUNITY_API('publish','POST',{}));
 assert.equal(published.p_items[0].favorite,true,'publication keeps the favorite after fetching server data');
 const persisted=await page.evaluate(()=>window.ALM_COMMUNITY_API('status'));assert.equal(persisted.own.items[0].favorite,true);assert.equal(persisted.own.profile.display_name,'Fixture profile');
 await page.evaluate(()=>window.ALM_COMMUNITY_API('favorite','PUT',{malId:1,value:false}));await page.evaluate(()=>window.ALM_COMMUNITY_API('publish','POST',{}));assert.equal(published.p_items[0].favorite,false);
 assert.deepEqual(errors,[]);console.log('OK Beta59 portal: favorite draft survives refresh, publication persists both toggles, existing profile is retained.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();host?.close();});

