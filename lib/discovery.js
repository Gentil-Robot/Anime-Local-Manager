"use strict";
const {clean}=require('./synopsis-language');
function publicAnime(r){
 const list=v=>Array.isArray(v)?v.map(x=>clean(typeof x==='object'?x.name:x)).filter(Boolean):[];
 const malId=Number(r.malId)||null;
 return {malId,anilistId:Number(r.anilistId)||null,title:clean(r.titleRomaji||r.romajiTitle||r.officialTitle||r.title),titleEn:clean(r.titleEn||r.englishTitle),titleJa:clean(r.titleJa||r.japaneseTitle||r.title_japanese||r.nativeTitle),poster:r.imageUrl||r.poster||'',synopsis:clean(r.synopsis),publicScore:r.score||r.publicScore||'',rank:r.rank||'',popularity:r.popularity||'',members:r.members||'',type:r.type||'TV',episodesTotal:r.episodes||r.episodesTotal||'',startDate:r.startDate||'',endDate:r.endDate||'',genres:list(r.genres),studios:list(r.studios),synonyms:list(r.synonyms),duration:r.duration||'',trailer:r.trailer||null,malUrl:malId?`https://myanimelist.net/anime/${malId}`:''};
}
function mountDiscovery(app,{db,searchOnline,learn,translate,fetchDetails,upload,imagesDir}){
 const fs=require('fs'),path=require('path'),crypto=require('crypto'),pending=new Map(),cache=new Map();
 app.get('/api/discover',async(req,res)=>{try{await db.whenReady();const q=String(req.query.q||'').trim().slice(0,160);if(q.length<2)return res.json({items:[],source:'local'});let items=db.searchMetadataByTitle(q,20).map(publicAnime),remote=null,error=false;if(req.query.online==='1'){const key=q.toLowerCase();if(cache.get(key)?.until>Date.now())remote=cache.get(key).item;else{if(!pending.has(key))pending.set(key,Promise.resolve().then(()=>searchOnline(q)).then(item=>{if(item){learn(item);cache.set(key,{item,until:Date.now()+600000});if(cache.size>100)cache.delete(cache.keys().next().value);}return item;}).finally(()=>pending.delete(key)));try{remote=await pending.get(key);}catch{error=true;}}}if(remote){const item=publicAnime(remote),saved=items.find(x=>item.malId&&x.malId===item.malId);if(saved)for(const key of Object.keys(item)){if(item[key]==null||item[key]===''||(Array.isArray(item[key])&&!item[key].length))item[key]=saved[key];}items=[item,...items.filter(x=>!(item.malId&&x.malId===item.malId)&&x.title!==item.title)];}res.json({ok:true,items:items.slice(0,20),source:remote?'online':'local',onlineUnavailable:error||(req.query.online==='1'&&!remote)});}catch(e){res.status(500).json({error:e.message});}});
 const getPublic=id=>{const row=db.getMetadataByMalId(Number(id));return row?.malId&&Number(row.malId)===Number(id)?row:null;};
 const enriched=new Map();
 app.get('/api/discover/:malId/record',async(req,res)=>{try{
  await db.whenReady();const id=Number(req.params.malId);if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Invalid MAL identity'});
  const row=getPublic(id),cached=enriched.get(id);let item=row?publicAnime(row):{malId:id};
  if(cached&&Date.now()-cached.time<900000)return res.json({...item,...cached.item});
  if(fetchDetails&&(!item.synopsis||req.query.enrich==='1'||!row)){try{const fresh=await fetchDetails(id);if(fresh&&fresh.malId===id){for(const [key,value]of Object.entries(fresh))if(key==='trailer'||!item[key]||(Array.isArray(item[key])&&!item[key].length))item[key]=value;enriched.set(id,{item,time:Date.now()});while(enriched.size>128)enriched.delete(enriched.keys().next().value);}}catch{}}
  if(!item.title)return res.status(404).json({error:'Metadata missing'});res.json(item);
 }catch(e){res.status(500).json({error:e.message});}});
 app.get('/api/discover/:malId/synopsis',async(req,res)=>{try{await db.whenReady();const row=getPublic(req.params.malId),cached=enriched.get(Number(req.params.malId)),text=row?.synopsis||cached?.item?.synopsis;if(!row&&!text)return res.status(404).json({error:'Metadata missing'});res.json({ok:true,...await translate(text||'',req.query.lang)});}catch(e){res.status(500).json({error:e.message});}});
 app.post('/api/season-synopsis',async(req,res)=>{try{await db.whenReady();const row=getPublic(req.body?.malId);if(!row)return res.json({ok:true,unavailable:true,text:'',language:'en'});res.json({ok:true,...await translate(row.synopsis,req.body?.lang)});}catch(e){res.status(500).json({error:e.message});}});
 app.post('/api/local-images',(req,res,next)=>upload.single('file')(req,res,error=>{
  if(error)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:'Image limitée à 8 Mo. PNG, JPEG ou WebP.'});
  next();
 }),async(req,res)=>{
  const b=req.file?.buffer;
  if(!b)return res.status(400).json({error:'Image requise.'});
  const ext=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':b[0]===255&&b[1]===216&&b[2]===255?'jpg':b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'webp':null;
  if(!ext)return res.status(400).json({error:'PNG, JPEG ou WebP.'});
  const name='manual-'+crypto.createHash('sha256').update(b).digest('hex').slice(0,24)+'.'+ext;
  const destination=path.join(imagesDir,name),poster='/images/'+name;
  let temporary;
  try{
   await fs.promises.mkdir(imagesDir,{recursive:true});
   // A repeated upload is already content-addressed: avoid rewriting identical
   // images and unnecessary disk wear. Never trust a symlink as a saved image.
   let current;
   try{current=await fs.promises.lstat(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
   if(current){
    if(!current.isFile())return res.status(409).json({error:'ALM_LOCAL_IMAGE_CONFLICT'});
    if((await fs.promises.readFile(destination)).equals(b))return res.json({poster});
   }
   // A unique staging file avoids partial images and concurrent upload races.
   temporary=path.join(imagesDir,'.'+name+'.'+crypto.randomBytes(6).toString('hex')+'.tmp');
   await fs.promises.writeFile(temporary,b,{flag:'wx'});
   try{await fs.promises.rename(temporary,destination);}
   catch(error){
    // Windows can deny a concurrent rename when another identical upload has
    // already won the race. Report success only if the final bytes match.
    const already=await fs.promises.readFile(destination).then(bytes=>bytes.equals(b)).catch(()=>false);
    if(!already)throw error;
    await fs.promises.rm(temporary,{force:true});
   }
   return res.json({poster});
  }catch(error){
   if(temporary)await fs.promises.rm(temporary,{force:true}).catch(()=>{});
   return res.status(500).json({error:'ALM_LOCAL_IMAGE_WRITE_FAILED'});
  }
 });
}
module.exports={mountDiscovery,publicAnime};
