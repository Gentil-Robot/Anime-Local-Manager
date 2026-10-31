'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
async function build(){
 const root=path.join(__dirname,'..'),snapshot=fs.readFileSync(path.join(root,'data/database/metadata-full.sql.gz'));
 const SQL=await require('sql.js')({locateFile:()=>require.resolve('sql.js/dist/sql-wasm.wasm')}),db=new SQL.Database();
 try{
  db.exec(zlib.gunzipSync(snapshot).toString('utf8'));const result=db.exec('select malId,rating,genres from metadata order by malId')[0],allowedIds=[],adultIds=[];let blockedCount=0,unclassifiedCount=0;
  for(const [id,rating,genres]of result.values){const g=JSON.parse(genres||'[]').map(x=>String(x).toLowerCase()),v=String(rating||'').trim();if(g.some(x=>['ecchi','erotica','hentai'].includes(x))||/^(R\+|Rx)/.test(v)){blockedCount++;adultIds.push(id);}else if(/^(G -|PG -|PG-13 -|R - 17\+)/.test(v))allowedIds.push(id);else unclassifiedCount++;}
  return {schema:2,revision:'alm-2026-10-beta72',sourceSha256:crypto.createHash('sha256').update(snapshot).digest('hex'),allowedIds,adultIds,blockedCount,unclassifiedCount,sourceCount:result.values.length};
 }finally{db.close();}
}
module.exports={build};
if(require.main===module)build().then(policy=>{const file=path.join(__dirname,'../data/database/community-content-policy.json');if(process.argv.includes('--write'))fs.writeFileSync(file,JSON.stringify(policy)+'\n');else assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),policy);console.log('OK Community content policy: '+policy.sourceCount+' source records; '+policy.allowedIds.length+' classified entries allowed; '+policy.blockedCount+' blocked and '+policy.unclassifiedCount+' unclassified.');}).catch(error=>{console.error(error);process.exitCode=1;});
