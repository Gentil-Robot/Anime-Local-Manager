'use strict';
const normalize=value=>String(value||'').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const stop=new Set('the a an of to and or in on for from with by at as is was were be been being that this these those it its my your his her their our i you he she they we le la les un une des de du d l et ou dans sur pour par avec est sont ete etre anime tv movie film season saison part partie cour episode episodes'.split(' '));
const grams=value=>[...new Set(Array.from({length:Math.max(0,value.length-2)},(_,i)=>value.slice(i,i+3)))];
function build(rows){
 const titles=rows.map(r=>[r.title,r.titleEn,r.titleRomaji,...(r.synonyms||[])].map(normalize).filter(Boolean)),postings=new Map();
 titles.forEach((values,index)=>{for(const gram of new Set(values.flatMap(grams))){let list=postings.get(gram);if(!list){list=[];postings.set(gram,list);}list.push(index);}});
 const signature=require('node:crypto').createHash('sha256').update(JSON.stringify(rows.map(r=>[r.malId,r.title,r.titleEn,r.titleRomaji,r.synonyms,r.type,r.episodes,r.startDate]))).digest('hex');
 return {rows,titles,postings,signature};
}
function candidates(index,query){
 const parts=grams(query);if(!parts.length)return index.rows.map((_,i)=>i);
 const lists=parts.map(g=>index.postings.get(g)||[]).sort((a,b)=>a.length-b.length);
 if(!lists[0].length)return [];
 const others=lists.slice(1).map(a=>new Set(a));
 return lists[0].filter(i=>others.every(s=>s.has(i))&&index.titles[i].some(t=>t.includes(query)));
}
function search(index,query,limit=100,tokenMode=false){
 const q=normalize(query);if(!q)return [];
 const bound=Math.max(1,Math.min(Number(limit)||20,tokenMode?160:100));
 if(tokenMode){
  const tokens=[...new Set(q.split(' ').filter(t=>t.length>=3&&!stop.has(t)))].sort((a,b)=>b.length-a.length||a.localeCompare(b)).slice(0,8);
  if(tokens.length<2)return [];
  const hits=new Map();for(const token of tokens)for(const i of candidates(index,token))hits.set(i,(hits.get(i)||0)+1);
  return [...hits].sort((a,b)=>b[1]-a[1]||Number(index.rows[b[0]].score||0)-Number(index.rows[a[0]].score||0)||String(index.rows[a[0]].title).localeCompare(String(index.rows[b[0]].title))).slice(0,bound).map(([i])=>index.rows[i]);
 }
 const rank=i=>{const names=index.titles[i];const exact=names.indexOf(q);if(exact>=0)return Math.min(3,exact);const prefix=names.slice(0,3).findIndex(t=>t.startsWith(q));return prefix<0?7:prefix+4;};
 return candidates(index,q).sort((a,b)=>rank(a)-rank(b)||Number(index.rows[b].score||0)-Number(index.rows[a].score||0)||String(index.rows[a].title).localeCompare(String(index.rows[b].title))).slice(0,bound).map(i=>index.rows[i]);
}
module.exports={build,search,normalize};
