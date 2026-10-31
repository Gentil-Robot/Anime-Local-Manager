'use strict';
const policy=require('../data/database/community-content-policy.json'),allowedIds=new Set(policy.allowedIds),adultIds=new Set(policy.adultIds||[]);
const genres=value=>(Array.isArray(value)?value:typeof value==='string'?value.split(','):[]).map(x=>String(typeof x==='object'?x.name:x).normalize('NFKC').trim().toLowerCase());
function allowed(item){
 const id=Number(typeof item==='object'?item?.mal_id||item?.malId:item);
 if(!allowedIds.has(id))return false;
 if(!item||typeof item!=='object')return true;
 const rating=String(item.rating||'').trim();
 return item.isAdult!==true&&!/^R\+|^Rx|18\+|Adults? Only|Mature Audiences/i.test(rating)&&!genres(item.genres).some(g=>['ecchi','erotica','hentai'].includes(g));
}
const adult=item=>adultIds.has(Number(typeof item==='object'?item?.mal_id||item?.malId:item));
module.exports={allowed,adult,revision:policy.revision,sourceSha256:policy.sourceSha256};
