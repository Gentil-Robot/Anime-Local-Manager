'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),{atomicJson}=require('./atomic-file');
function createNotificationCenter({file,now=Date.now}) {
 let saved={muted:false,items:[]};
 try{const data=JSON.parse(fs.readFileSync(file,'utf8'));saved.muted=data.muted===true;saved.items=(Array.isArray(data.items)?data.items:[]).filter(i=>typeof i.id==='string'&&Number.isFinite(i.createdAt)).slice(0,200);}catch{}
 const state=()=>({muted:saved.muted,unread:saved.items.filter(i=>!i.read).length,items:saved.items.map(i=>({...i}))});
 const commit=next=>{atomicJson(file,next);saved=next;return state();};
 return {
  state,
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
  clear(){return commit({...saved,items:[]});},
  configure(muted){return commit({...saved,muted:muted===true});}
 };
}
module.exports={createNotificationCenter};
