'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {copyRoots,copyProductionModules}=require('./production-copy-roots');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alm82-copy-roots-'));
function list(folder){
 const result=[];const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const abs=path.join(dir,e.name);if(e.isDirectory())walk(abs);else result.push([path.relative(folder,abs).replace(/\\/g,'/'),crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')]);}};
 walk(folder);return result.sort((a,b)=>a[0].localeCompare(b[0]));
}
function oldCopy(source,payload,listing){for(const dir of listing.trim().split(/\r?\n/)){const rel=path.relative(source,dir);if(!rel)continue;assert(rel.startsWith('node_modules'+path.sep));fs.cpSync(dir,path.join(payload,rel),{recursive:true});}}
function middle(values){return [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];}
(async()=>{
 try{
  const src=path.join(temp,'source'),nm=path.join(src,'node_modules');fs.mkdirSync(nm,{recursive:true});const dirs=[src];
  for(let i=0;i<10;i++){
   const parent=path.join(nm,'lib-'+i);fs.mkdirSync(parent);dirs.push(parent);
   for(let n=0;n<5;n++){
    const nested=path.join(parent,'node_modules','leaf-'+n);fs.mkdirSync(nested,{recursive:true});dirs.push(nested);
    for(let f=0;f<15;f++)fs.writeFileSync(path.join(nested,'file-'+f+'.txt'),Buffer.alloc(4096,(i*73+n*17+f)%255));
   }
  }
  const listing=dirs.join('\n');
  const minimal=copyRoots(src,listing);assert.equal(minimal.length,10);assert.deepEqual(copyRoots(src,listing),[...minimal]);
  assert.deepEqual(copyRoots(src,dirs.slice(1).reverse().join('\n')),minimal);
  assert.throws(()=>copyRoots(src,path.join(temp,'outside','bad')),/outside project/);
  assert.throws(()=>copyRoots(src,path.join(nm,'..','..','outside')),/outside project/);
  const oldMs=[],newMs=[];
  for(let k=0;k<7;k++){
   const a=path.join(temp,'old-'+k),b=path.join(temp,'new-'+k);fs.mkdirSync(a);fs.mkdirSync(b);
   const first=process.hrtime.bigint();oldCopy(src,a,listing);oldMs.push(Number(process.hrtime.bigint()-first)/1e6);
   const second=process.hrtime.bigint();assert.equal(copyProductionModules(src,b,listing),10);newMs.push(Number(process.hrtime.bigint()-second)/1e6);
   assert.deepEqual(list(a),list(b),'Copied production tree must be byte-for-byte identical');
  }
  const data={schema:1,scenario:'10 parent packages, 50 nested packages, 750 files, seven independent repetitions',oldMedianMs:middle(oldMs),newMedianMs:middle(newMs),oldMs,newMs,copiesBefore:60,copiesAfter:10,identical:true};
  console.log('ALM_PRODUCTION_COPY_BENCH '+JSON.stringify(data));
  console.log('OK Beta82: copy root selection, exact file hashes and rejection of external paths.');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
