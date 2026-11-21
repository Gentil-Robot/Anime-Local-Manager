'use strict';
// ALM 2.2 — independent personal score and viewing chronology selectors.
// Data source: the local ALM library. Never infer watch dates from airing dates.
(function(root,factory){
 const model=factory();
 if(typeof module==='object'&&module.exports)module.exports=model;
 if(root)root.ALM_V220_PERSONAL_INSIGHTS=model;
})(typeof window!=='undefined'?window:null,()=>{
 const safeId=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:0;};
 const dateISO=value=>{
  const s=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
  const d=new Date(s+'T12:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)return '';
  const year=Number(s.slice(0,4));
  return year>=1900&&year<=9998?s:'';
 };
 const score=value=>{
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(value);
  return Number.isInteger(n)&&n>=1&&n<=10?n:null;
 };
 function scoreLanes(records,{maxPerLane=24}={}){
  const max=Math.max(1,Math.min(60,Math.floor(Number(maxPerLane)||24)));
  const all=Array.isArray(records)?records:[];
  const lanes=Array.from({length:10},(_,index)=>({score:10-index,items:[],count:0}));
  const none={score:null,items:[],count:0};
  const groups=new Map(lanes.map(row=>[row.score,row]));
  const seen=new Set();
  for(const record of all){
   const id=safeId(record?.id);if(!id||seen.has(id))continue;seen.add(id);
   const lane=groups.get(score(record.score))||none;
   lane.count++;
   if(lane.items.length<max)lane.items.push({id,title:String(record.title||'').slice(0,300),anime:record});
  }
  return {lanes:[...lanes,none],total:seen.size,rated:lanes.reduce((sum,row)=>sum+row.count,0),unrated:none.count};
 }
 function events(records,{maxEvents=15000}={}){
  const out=[],seen=new Set(),limit=Math.max(1,Math.min(20000,Number(maxEvents)||15000));
  for(const anime of (Array.isArray(records)?records:[])){
   const id=safeId(anime?.id);if(!id||seen.has(id))continue;seen.add(id);
   const base={id,malId:safeId(anime.malId),title:String(anime.title||'').slice(0,300),anime};
   const completed=dateISO(anime?.completedOn);
   if(anime?.status==='Completed'&&completed){
    out.push({...base,date:completed,kind:'completed',episodes:0});if(out.length>=limit)break;
   }
   const watched=new Set();
   for(const event of (Array.isArray(anime?.watchEvents)?anime.watchEvents.slice(0,400):[])){
    const d=dateISO(event?.date),num=Number(event?.episodes);
    if(!d||!Number.isSafeInteger(num)||num<1||num>100000)continue;
    const fingerprint=typeof event.id==='string'&&event.id?event.id:d+':'+num;
    if(watched.has(fingerprint))continue;watched.add(fingerprint);
    out.push({...base,date:d,kind:'watched',episodes:num});
    if(out.length>=limit)break;
   }
   if(out.length>=limit)break;
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
 }
 function years(records){
  return [...new Set(events(records).map(row=>Number(row.date.slice(0,4))))].sort((a,b)=>b-a);
 }
 function timeline(records,year,{maxDays=365}={}){
  const y=Number(year),data=events(records).filter(e=>Number(e.date.slice(0,4))===y);
  const perDay=new Map(),perMonth=Array.from({length:12},(_,index)=>({month:index+1,completed:0,episodes:0,events:0}));
  for(const event of data){
   let day=perDay.get(event.date);
   if(!day){day={date:event.date,items:[],completed:0,episodes:0};perDay.set(event.date,day);}
   day.items.push(event);
   if(event.kind==='completed')day.completed++;
   if(event.kind==='watched')day.episodes+=event.episodes;
   const month=perMonth[Number(event.date.slice(5,7))-1];
   if(month){month.events++;if(event.kind==='completed')month.completed++;else month.episodes+=event.episodes;}
  }
  const days=[...perDay.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const completed=data.filter(item=>item.kind==='completed').length;
  return {year:y,days:days.slice(0,Math.max(1,Math.min(366,Number(maxDays)||365))),
   month:perMonth,eventCount:data.length,completed,episodes:data.reduce((sum,item)=>sum+(item.kind==='watched'?item.episodes:0),0),
   daysCount:days.length,events:data};
 }
 return Object.freeze({dateISO,score,scoreLanes,events,years,timeline});
});
