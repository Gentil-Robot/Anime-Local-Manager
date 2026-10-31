'use strict';
const crypto=require('node:crypto');

// Collections and object key order do not constitute a change in shared data.
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
function snapshotHash(data){
 const snapshot={...data,items:[...data.items].sort((a,b)=>a.mal_id-b.mal_id),dna:[...data.dna].sort((a,b)=>a.genre.localeCompare(b.genre)),activity:[...data.activity].sort((a,b)=>a.date.localeCompare(b.date))};
 return crypto.createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex');
}
module.exports={snapshotHash};
