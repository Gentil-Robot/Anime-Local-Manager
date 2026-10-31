'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os'),path=require('node:path'),Module=require('node:module');
const ownLoad=Module._load;
let creator;
try{
 Module._load=function(name,from,isMain){if(name==='@supabase/supabase-js')return {createClient:()=>{throw Error('No network client expected');}};return ownLoad.apply(this,arguments);};
 creator=require('../lib/community').createCommunity;
}finally{Module._load=ownLoad;}
async function main(){
 for(const surface of ['public/app.js','public/catalog.js','public/discovery.js']){
  const body=await fs.readFile(path.join(__dirname,'..',surface),'utf8');
  assert(body.includes('recommendAnime('),surface+' must offer friend recommendations');
  // Local cards keep the action available while account state loads. The shared
  // recommendation workflow and service enforce the policy at action time.
  const policySurface=surface==='public/app.js'?'public/community-workspace.js':surface;
  assert((await fs.readFile(path.join(__dirname,'..',policySurface),'utf8')).includes('shareAllowed('),surface+' must route through the existing sharing policy');
 }
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'alm-recommend-'));
 const uid='00000000-0000-4000-8000-000000000001',recipient='00000000-0000-4000-8000-000000000002';
 const calls=[];
 const client={auth:{getSession:async()=>({data:{session:{user:{id:uid},access_token:'test-session'}}}),getUser:async()=>({data:{user:{id:uid}}}),stopAutoRefresh(){}} ,rpc:async(name,args)=>{calls.push({name,args});return {data:name==='alm_account_age_state'?{recorded:true,adult:false,excludeAdult:true}:{ok:true}};}};
 const fixture={directory,getAnimes:()=>[],getCatalogByMalId:id=> id===20?{malId:20,title:'Trusted MAL Title',imageUrl:'https://cdn.myanimelist.net/images/trusted.jpg',genres:['Fantasy'],rating:'PG-13'}:id===19?{malId:19,title:'Adult title',genres:['Violence'],rating:'R+'}:null,clientFactory:()=>client,config:{url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_fixture'},encryptionKey:null};
 let service;
 try{
  service=creator(fixture);
  await service.recommend(recipient,20,'A beautiful one');
  const sent=calls.filter(x=>x.name==='alm_recommend');assert.equal(sent.length,1);
  assert.equal(sent[0].args.p_anime.mal_id,20);
  assert.equal(sent[0].args.p_anime.title,'Trusted MAL Title');
  assert.equal(sent[0].args.p_anime.image_url,'https://cdn.myanimelist.net/images/trusted.jpg');
  assert.equal(sent[0].args.p_recipient,recipient);
  await assert.rejects(service.recommend(recipient,19,'Must be denied'),/CONTENT_NOT_SHARED/);
  await assert.rejects(service.recommend(recipient,999991,'Unknown'),/ALM_COMMUNITY_ANIME/);
  await assert.rejects(service.recommend('not-a-uuid',20,'Untrusted'),/ALM_COMMUNITY_INPUT/);
  assert.equal(calls.filter(x=>x.name==='alm_recommend').length,1,'Denied suggestions must not reach Supabase');
  // Sending an owned anime must not compute watch activity and DNA; an owner
  // entry is sufficient. This synthetic accessor would have thrown if the
  // previous full own() snapshot was still built before the RPC.
  const owned={malId:20,title:'Trusted Owned Anime',rating:'PG-13',imageUrl:'https://cdn.myanimelist.net/images/trusted.jpg',genres:['Fantasy']};
  Object.defineProperty(owned,'watchEvents',{get(){throw Error('Unexpected full activity aggregation');}});
  const ownedService=creator({...fixture,getAnimes:()=>[owned]});
  try {
   await ownedService.recommend(recipient,20,'An owned anime');
   const delivered=calls.filter(x=>x.name==='alm_recommend');
   assert.equal(delivered.length,2);
   assert.equal(delivered[1].args.p_anime.title,'Trusted Owned Anime');
   assert.equal(delivered[1].args.p_anime.mal_id,20);
  } finally {await ownedService.close();}
  console.log('OK beta82 recommendations: catalog and owner identity, age, blocked content, no full-library activity work during send.');
 }finally{await service?.close();await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
