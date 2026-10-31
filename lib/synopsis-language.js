"use strict";
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const LANGUAGES=['fr','en','ja','es','de','pt-BR','zh-CN'];
const clean=v=>String(v||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\[Written by[^\]]*\]/gi,'').replace(/\s+/g,' ').replace(/\s+([.,])/g,'$1').trim();
function oldUtf8Excerpt(value,max=450){const text=clean(value);let out='';for(const c of text){if(Buffer.byteLength(out+c)>max-3)break;out+=c;}return out.length<text.length?out+'…':out;}
// Translation requests are bounded in UTF-8 bytes without cutting a word.
function splitSynopsis(value,max=450){
 let rest=clean(value),chunks=[];
 while(rest){
  if(Buffer.byteLength(rest)<=max){chunks.push(rest);break;}
  let prefix='';for(const c of rest){if(Buffer.byteLength(prefix+c)>max)break;prefix+=c;}
  let cut=prefix.lastIndexOf(' ');const sentence=[...prefix.matchAll(/[.!?。！？]\s+/gu)].pop();
  if(sentence&&sentence.index>prefix.length/3)cut=sentence.index+1;
  if(cut<1)throw Error('Unbreakable translation input');
  chunks.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();
 }
 return chunks;
}
function utf8Excerpt(value,max=450){const text=clean(value);if(Buffer.byteLength(text)<=max)return text;try{return splitSynopsis(text,max-3)[0]+'…';}catch{return '';}}
function knownDescription(text,lang){const m=clean(text).match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)) (season|part) of (.+?)\.?$/i);if(!m)return null;const n=['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth'].indexOf(m[1].toLowerCase())+1||parseInt(m[1]),title=m[3].trim(),p=m[2].toLowerCase()==='part';return {fr:`${p?'Partie':'Saison'} ${n} de ${title}.`,en:`${title}: ${p?'part':'season'} ${n}.`,ja:`『${title}』第${n}${p?'部':'期'}。`,es:`${p?'Parte':'Temporada'} ${n} de ${title}.`,de:`${title}: ${p?'Teil':'Staffel'} ${n}.`,'pt-BR':`${p?'Parte':'Temporada'} ${n} de ${title}.`,'zh-CN':`《${title}》第${n}${p?'部':'季'}。`}[lang];}
function createSynopsisLanguage({directory,fetchText}){
 const file=path.join(directory,'cache/synopsis-translations.json');let cache={};try{cache=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 const pending=new Map(),waiting=[];let active=0,cooldown=0;
 const enter=()=>active<2?(active++,Promise.resolve()):new Promise(r=>waiting.push(r)),leave=()=>waiting.length?waiting.shift()():active--;
 const fallback=original=>({text:original,original,language:'en',translated:false,unavailable:true,retryAt:Date.now()+1800000});
 return async(text,language)=>{const lang=LANGUAGES.includes(language)?language:'fr',original=clean(text);if(!original)return {text:'',language:lang,translated:false};if(lang==='en')return {text:original,original,language:lang,translated:false};const known=knownDescription(text,lang);if(known)return {text:known,original,language:lang,translated:true,provider:'local'};
 const key=crypto.createHash('sha256').update('full-v2|'+lang+'|'+original).digest('hex'),hit=cache[key];if(hit&&(!hit.retryAt||hit.retryAt>Date.now()))return hit;if(pending.has(key))return pending.get(key);if(pending.size>=40||cooldown>Date.now())return fallback(original);
 const task=(async()=>{await enter();try{if(cooldown>Date.now())return fallback(original);let result;try{if(Buffer.byteLength(original)>9000)throw Error('Translation input budget');const translated=[];
 for(const chunk of splitSynopsis(original)){
  const response=await fetchText('https://api.mymemory.translated.net/get?'+new URLSearchParams({q:chunk,langpair:'en|'+(lang==='pt-BR'?'pt':lang)}),{timeoutMs:6500,maxBytes:200000});
  const data=JSON.parse(response.text),v=clean(data.responseData?.translatedText);
  if(!response.response.ok||Number(data.responseStatus)!==200||!v||data.quotaFinished||/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE/i.test(v))throw Error('Translation unavailable');
  translated.push(v);
 }
 result={text:translated.join(' '),original,language:lang,translated:true,provider:'MyMemory'};}catch{cooldown=Date.now()+30000;result=fallback(original);}cache[key]=result;const entries=Object.entries(cache);if(entries.length>3000)cache=Object.fromEntries(entries.slice(-3000));try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(cache));fs.renameSync(file+'.tmp',file);}catch{}return result;}finally{leave();}})();pending.set(key,task);try{return await task;}finally{pending.delete(key);}};
}
module.exports={createSynopsisLanguage,utf8Excerpt,splitSynopsis,clean,knownDescription,LANGUAGES};
