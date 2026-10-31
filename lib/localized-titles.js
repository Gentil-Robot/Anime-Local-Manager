'use strict';
const fs=require('node:fs'),{atomicJson}=require('./atomic-file'),{boundedTextFetch}=require('./bounded-text-fetch');
const LANGS=['fr','en','ja','es','de','pt-BR','zh-CN'];
const ID=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
function exactEntity(entity,id){
 const claims=(entity.claims?.P4086||[]).filter(c=>c.rank!=='deprecated');
 // A label of a whole franchise must never rename one of its seasons.
 return claims.length===1&&!claims[0].qualifiers&&String(claims[0].mainsnak?.datavalue?.value)===String(id);
}
function labelsOf(entity){const result={};for(const lang of LANGS){const source=lang==='pt-BR'?'pt':lang==='zh-CN'?'zh':lang;const value=(lang==='zh-CN'&&(entity.labels?.['zh-hans']?.value||entity.labels?.['zh-cn']?.value))||entity.labels?.[source]?.value;if(typeof value==='string'&&value.trim()&&value.length<300)result[lang]=value.trim();}return result;}
function titleFor(item,lang){return require('../public/title-preference').custom(item)||item.localizedTitles?.[lang]||(lang==='en'&&item.titleEn)||(lang==='ja'&&item.titleJa)||item.canonicalTitle||item.title||'';}
function createLocalizedTitles({file,fetchImpl=global.fetch,now=Date.now}){
 let cache={};try{cache=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../data/localized-titles-seed.json'),'utf8'));}catch{}try{cache={...cache,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch{}const pending=new Map();
 const request=async url=>{const {response,text}=await boundedTextFetch(url,{fetchImpl,timeoutMs:8000,maxBytes:2*1024*1024,maxRedirects:1,headers:{'User-Agent':'AnimeLocalManager/'+require('../package.json').version,'Accept':'application/json'}});if(!response.ok)throw Error('ALM_TITLES_SOURCE');return JSON.parse(text);};
 async function batch(ids){
  const signature=ids.join(',');if(pending.has(signature))return pending.get(signature);
  const work=(async()=>{
   try{
    const values=ids.map(id=>'"'+id+'"').join(' '),query='SELECT ?mal ?item WHERE { VALUES ?mal { '+values+' } ?item wdt:P4086 ?mal. }';
    const found=await request('https://query.wikidata.org/sparql?'+new URLSearchParams({query,format:'json'}));
    const matches=new Map();for(const row of found.results?.bindings||[]){const id=ID(row.mal?.value),qid=String(row.item?.value||'').match(/\/Q\d+$/)?.[0].slice(1);if(ids.includes(id)&&qid){if(!matches.has(id))matches.set(id,new Set());matches.get(id).add(qid);}}
    const qids=[...new Set([...matches.values()].flatMap(s=>[...s]))];let entities={};
    if(qids.length){const data=await request('https://www.wikidata.org/w/api.php?'+new URLSearchParams({action:'wbgetentities',ids:qids.join('|'),props:'labels|claims',languages:'fr|en|ja|es|de|pt|zh|zh-hans|zh-cn',format:'json'}));entities=data.entities||{};}
    const next={...cache};for(const id of ids){const candidates=[...(matches.get(id)||[])].map(q=>entities[q]).filter(Boolean).filter(e=>exactEntity(e,id));next[id]=candidates.length===1?{titles:labelsOf(candidates[0]),entity:candidates[0].id,checkedAt:now(),source:'Wikidata'}:{titles:cache[id]?.titles||{},checkedAt:now(),entity:cache[id]?.entity||'',source:'Wikidata'};}
    atomicJson(file,next);cache=next;
   }catch{/* Keep verified cached names during an outage; failed requests are not negative evidence. */}
  })().finally(()=>pending.delete(signature));pending.set(signature,work);return work;
 }
 return {
  matchingIds(q){const text=String(q||" ").normalize("NFKC").toLocaleLowerCase();return Object.entries(cache).filter(([,entry])=>Object.values(entry.titles||{}).some(v=>String(v).normalize("NFKC").toLocaleLowerCase().includes(text))).map(([id])=>Number(id));},
  cached(ids){return Object.fromEntries(ids.filter(ID).map(id=>[ID(id),cache[ID(id)]?.titles||{}]));},
  async resolve(raw,{force=false}={}){const ids=[...new Set(raw.map(ID).filter(Boolean))].slice(0,100),stale=ids.filter(id=>force||!cache[id]||now()-cache[id].checkedAt>(Object.keys(cache[id].titles||{}).length?30:1)*86400000);for(let n=0;n<stale.length;n+=25)await batch(stale.slice(n,n+25));return this.cached(ids);},
  decorate(item){return {...item,localizedTitles:{...(item.localizedTitles||{}),...(cache[ID(item.malId)]?.titles||{})}};}
 };
}
module.exports={createLocalizedTitles,titleFor,exactEntity,labelsOf};
