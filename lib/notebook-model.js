'use strict';
const crypto=require('node:crypto');
const normalizeTitle=require('./catalogue-title-index').normalize;
const STATUSES=['Completed','Watching','On-Hold','Plan to Watch','Dropped'];
const fail=code=>{throw Object.assign(new Error(code),{code});};
function text(value,max=50000){if(typeof value!=='string'||value.length>max||value.includes('\0'))fail('NOTEBOOK_INVALID');return value.replace(/\r\n?/g,'\n');}
function notes(value){return typeof value==='string'?value.replace(/\r\n?/g,'\n'):'';}
function mergeNotes(...values){return [...new Set(values.map(notes).filter(v=>v.trim()))].join('\n\n');}
function journal(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))fail('NOTEBOOK_INVALID');
 const episodes=value.episodes||[],awards=value.awards||[];
 if(!Array.isArray(episodes)||episodes.length>300||!Array.isArray(awards)||awards.length>300)fail('NOTEBOOK_LIMIT');
 const seen=new Set(),keys=new Set();
 const out={episodes:episodes.map(e=>{
  const number=Number(e?.number);if(!Number.isInteger(number)||number<1||number>100000||seen.has(number))fail('NOTEBOOK_EPISODE');seen.add(number);
  const score=e.score==null||e.score===''?null:Number(e.score);if(score!==null&&(!Number.isInteger(score)||score<1||score>10))fail('NOTEBOOK_SCORE');
  return {number,title:text(e.title||'',200),text:text(e.text||'',10000),score};
 }).sort((a,b)=>a.number-b.number),awards:awards.map(a=>{
  const year=Number(a?.year),kind=a?.kind,episode=kind==='episode'?Number(a?.episode):null;
  if(!Number.isInteger(year)||year<1900||year>new Date().getFullYear()||!['anime','episode'].includes(kind))fail('NOTEBOOK_YEAR');
  if(kind==='episode'&&(!Number.isInteger(episode)||episode<1||episode>100000))fail('NOTEBOOK_EPISODE');
  const key=year+':'+kind;if(keys.has(key))fail('NOTEBOOK_AWARD');keys.add(key);
  return {year,kind,episode,text:text(a.text||'',2000)};
 }).sort((a,b)=>b.year-a.year||a.kind.localeCompare(b.kind))};
 if(JSON.stringify(out).length>180000)fail('NOTEBOOK_LIMIT');return out;
}
function readJournal(value){
 // Reading a backup or a merged record must not hide an entire notebook because
 // one old entry exceeds today's editing limits. Writes still use journal().
 const episodes=Array.isArray(value?.episodes)?value.episodes:[],awards=Array.isArray(value?.awards)?value.awards:[];
 return {episodes:episodes.filter(e=>Number.isInteger(Number(e?.number))&&Number(e.number)>0&&Number(e.number)<=100000).map(e=>({number:Number(e.number),title:notes(e.title),text:notes(e.text),score:Number.isInteger(Number(e.score))&&Number(e.score)>=1&&Number(e.score)<=10?Number(e.score):null})).sort((a,b)=>a.number-b.number),awards:awards.filter(a=>Number.isInteger(Number(a?.year))&&Number(a.year)>=1900&&Number(a.year)<=9998&&['anime','episode'].includes(a.kind)&&(a.kind==='anime'||Number.isInteger(Number(a.episode))&&Number(a.episode)>0&&Number(a.episode)<=100000)).map(a=>({year:Number(a.year),kind:a.kind,episode:a.kind==='episode'?Number(a.episode):null,text:notes(a.text)})).sort((a,b)=>b.year-a.year||a.kind.localeCompare(b.kind))};
}
function mergeJournal(a,b){
 const first=readJournal(a),second=readJournal(b),episodes=new Map(first.episodes.map(e=>[e.number,e])),awards=new Map(first.awards.map(e=>[e.year+':'+e.kind,e]));
 for(const e of second.episodes){const old=episodes.get(e.number);episodes.set(e.number,old?{...e,...old,title:old.title||e.title,text:mergeNotes(old.text,e.text),score:old.score??e.score}:e);}
 for(const e of second.awards){const key=e.year+':'+e.kind,old=awards.get(key);awards.set(key,old?{...e,...old,text:mergeNotes(old.text,e.text)}:e);}
 return {episodes:[...episodes.values()].sort((a,b)=>a.number-b.number),awards:[...awards.values()].sort((a,b)=>b.year-a.year)};
}
function revision(anime){return crypto.createHash('sha256').update(JSON.stringify([notes(anime.notes),readJournal(anime.personalJournal)])).digest('hex');}
function status(value){const n=normalizeTitle(value);const names={Completed:['completed','complete','terminé','terminés','vu','vus','finished','done','terminado','abgeschlossen','concluído','視聴済み','已看完'],Watching:['watching','en cours','en curso','wird angesehen','assistindo','視聴中','在看'], 'On-Hold':['on hold','en pause','paused','en pausa','pausiert','em pausa','保留中','暂停'], 'Plan to Watch':['plan to watch','à voir','to watch','planned','watchlist','por ver','geplant','planejo assistir','視聴予定','想看'],Dropped:['dropped','abandonné','abandonado','abgebrochen','視聴中止','已弃']};for(const [key,list]of Object.entries(names))if(list.some(v=>normalizeTitle(v)===n))return key;return '';}
function csvRecords(source,delimiter){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<source.length;i++){
  const ch=source[i];if(ch==='"'&&(quoted||cell==='')){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(ch===delimiter||ch==='\n')){row.push(cell);cell='';if(ch==='\n'){if(row.some(v=>v.trim()))rows.push(row);row=[];}}
  else cell+=ch;
 }
 if(quoted)fail('LIST_QUOTES');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
const aliases={title:['title','titre','anime','anime title','nom','name','título','titel','タイトル','标题'],notes:['notes','note personnelle','notes personnelles','commentaire','commentaires','critique','review','impressions','comentarios','comentários','notizen','メモ','感想','笔记'],score:['score','note','rating','ma note','note sur 10','nota','bewertung','評価','评分'],status:['status','statut','état','estado','状態','状态']};
for(const [key,names]of Object.entries(aliases))names.push(...Object.values(require('../public/notebook-copy').copy).map(v=>v[key]));
function parseList(input){
 const source=text(input?.text||'',500000).replace(/^\uFEFF/,'');if(!source.trim())fail('LIST_EMPTY');
 const delimiter=input.delimiter==='tab'?'\t':input.delimiter==='semicolon'?';':input.delimiter==='comma'?',':input.delimiter==='lines'?'':(()=>{const line=source.split('\n')[0];if(line.includes('\t'))return '\t';if(line.includes(';'))return ';';return '';})();
 let rows=delimiter?csvRecords(source,delimiter):source.split('\n').filter(v=>v.trim()).map(v=>[v.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/,'').trim()]);
 const first=rows[0]||[],detected=Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,first.findIndex(v=>names.some(name=>normalizeTitle(name)===normalizeTitle(v)))]));
 const hasHeader=input.header===true||(input.header!=='false'&&input.header!==false&&delimiter&&detected.title>=0);
 const map={title:0,notes:-1,score:-1,status:-1,...(hasHeader?detected:{}),...(input.columns||{})};
 if(Object.keys(map).some(k=>!Object.hasOwn(aliases,k))||Object.values(map).some(v=>!Number.isInteger(Number(v))||Number(v)<-1||Number(v)>30)||Number(map.title)<0)fail('LIST_COLUMNS');
 if(hasHeader)rows=rows.slice(1);if(!rows.length)fail('LIST_EMPTY');if(rows.length>500)fail('LIST_LIMIT');
 const defaultStatus=input.status||'Completed';if(!STATUSES.includes(defaultStatus))fail('LIST_STATUS');
 return rows.map((row,index)=>{
  const get=k=>Number(map[k])>=0?row[Number(map[k])]||'':'';
  const title=text(get('title').trim(),300),note=text(get('notes')),rawScore=get('score').trim().replace(',','.'),score=rawScore===''?'':Number(rawScore),rawStatus=get('status').trim(),resolved=rawStatus?status(rawStatus):defaultStatus;
  return {key:String(index),title,notes:note,score:score===''?'':String(score),status:resolved,invalid:!title?'LIST_TITLE':!resolved?'LIST_STATUS':score!==''&&(!Number.isInteger(score)||score<1||score>10)?'NOTEBOOK_SCORE':''};
 });
}
module.exports={STATUSES,text,notes,mergeNotes,journal,readJournal,mergeJournal,revision,parseList};
