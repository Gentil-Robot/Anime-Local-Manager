'use strict';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

// Use the signed-in client's existing row permissions, including partial sharing.
// Exact HEAD counts avoid downloading libraries and the API's row-return limit.
async function libraryStats(client,userId,relationships){
 if(!uuid(userId))return {available:false,libraries:null,animes:null};
 const ids=[...new Set(relationships.filter(r=>r.status==='accepted'&&(r.requester===userId||r.recipient===userId))
  .map(r=>r.requester===userId?r.recipient:r.requester).filter(id=>uuid(id)&&id!==userId))];
 let libraries=0,animes=0;
 try{
  for(let offset=0;offset<ids.length;offset+=50){
   const batch=ids.slice(offset,offset+50);
   const profiles=await client.from('alm_profiles').select('id,share_library,share_favorites,share_watching,featured').in('id',batch).eq('visibility','friends');
   if(profiles.error||!Array.isArray(profiles.data))throw Error('ALM_NETWORK');
   const visible=[...new Set(profiles.data.filter(p=>batch.includes(p.id)&&(p.share_library===true||p.share_favorites===true||p.share_watching===true||Array.isArray(p.featured)&&p.featured.length>0)).map(p=>p.id))];
   if(!visible.length)continue;
   const result=await client.from('alm_library').select('mal_id',{count:'exact',head:true}).in('owner_id',visible);
   if(result.error||!Number.isSafeInteger(result.count)||result.count<0)throw Error('ALM_NETWORK');
   libraries+=visible.length;animes+=result.count;
  }
  return {available:true,libraries,animes};
 }catch{return {available:false,libraries:null,animes:null};}
}
module.exports={libraryStats};
