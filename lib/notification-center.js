'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{atomicJson}=require('./atomic-file'),{version,compare,RELEASES}=require('./version-check');
function createNotificationCenter({file,now=Date.now}) {
 let saved={muted:false,items:[],updateHistory:{}};
 let current=require('../release-version.json').technicalVersion,channel='beta';
 try{const data=JSON.parse(fs.readFileSync(file,'utf8'));saved.muted=data.muted===true;saved.updateHistory=Object.fromEntries(Object.entries(data.updateHistory||{}).filter(([key])=>version(key)).slice(-200));saved.items=(Array.isArray(data.items)?data.items:[]).filter(i=>typeof i.id==='string'&&Number.isFinite(i.createdAt)).slice(0,200);}catch{}
 const active=i=>i.type!=='update'||(version(i.version)&&compare(i.version,current)>0&&(channel==='beta'||!i.prerelease));
 const state=()=>{const items=saved.items.filter(active);return {muted:saved.muted,unread:items.filter(i=>!i.read).length,items:items.map(i=>({...i}))};};
 const commit=next=>{atomicJson(file,next);saved=next;return state();};
 return {
  state,
  reconcileUpdates(installed,selected){current=installed;channel=selected==='stable'?'stable':'beta';return state();},
  recordUpdate(release){
   const tag=String(release?.latest||''),key=tag.replace(/^v/,'');
   if(!release?.available||release.error||!version(tag)||compare(tag,current)<=0||release.releaseUrl!==RELEASES+'/tag/'+tag||(channel==='stable'&&release.prerelease))return state();
   const previous=saved.items.find(i=>i.type==='update'&&i.version===key);
   if(previous){if(previous.prerelease===(release.prerelease===true))return state();return commit({...saved,items:saved.items.map(i=>i===previous?{...i,prerelease:release.prerelease===true}:i)});}
   if(Object.hasOwn(saved.updateHistory,key))return state();
   const entry={id:crypto.randomUUID(),type:'update',version:key,prerelease:release.prerelease===true,createdAt:now(),read:false};
   const history=Object.fromEntries([...Object.entries(saved.updateHistory),[key,{desktopAttempted:false}]].slice(-200));
   return commit({...saved,updateHistory:history,items:[entry,...saved.items].slice(0,200)});
  },
  claimUpdateNotification(offeredVersion){
   if(saved.muted)return null;
   const item=saved.items.filter(i=>i.type==='update'&&active(i)&&(!offeredVersion||i.version===String(offeredVersion).replace(/^v/,''))).sort((a,b)=>compare(b.version,a.version))[0];
   if(!item||saved.updateHistory[item.version]?.desktopAttempted)return null;
   // Persist before calling the OS: a denied popup must not repeat on every check/restart.
   commit({...saved,updateHistory:{...saved.updateHistory,[item.version]:{desktopAttempted:true}}});
   return {...item};
  },
  invalidate(ids){const changed=new Set(ids.map(Number));return commit({...saved,items:saved.items.map(i=>changed.has(Number(i.animeId))?{...i,associationOutdated:true,read:true}:i)});},
  record(item,type='episode') {
   const identity=type==='episode'?String(item.malId?'mal:'+item.malId:item.animeId?'local:'+item.animeId:item.key||'')+':'+Number(item.episode):'';
   const airingAt=Number(item.airingAt),details={malId:Number(item.malId)||null,airingAt:Number.isSafeInteger(airingAt)&&airingAt>0?airingAt:null,sourceUrl:String(item.sourceUrl||item.url||'').slice(0,2000)};
   const previous=type==='episode'&&saved.items.find(i=>i.identity===identity);
   if(previous){if(!previous.airingAt&&details.airingAt)return commit({...saved,items:saved.items.map(i=>i===previous?{...i,...details}:i)});return state();}
   const entry={...details,id:crypto.randomUUID(),identity,type:type==='test'?'test':'episode',animeId:Number(item.animeId)||0,title:String(item.title||'Anime Local Manager').slice(0,300),episode:Number(item.episode)||0,source:String(item.source||'').slice(0,100),createdAt:now(),read:false};
   return commit({...saved,items:[entry,...saved.items].slice(0,200)});
  },
  read(){return commit({...saved,items:saved.items.map(i=>({...i,read:true}))});},
  clear(){return commit({...saved,items:saved.items.filter(i=>i.type==='update')});},
  configure(muted){return commit({...saved,muted:muted===true});}
 };
}
module.exports={createNotificationCenter};
