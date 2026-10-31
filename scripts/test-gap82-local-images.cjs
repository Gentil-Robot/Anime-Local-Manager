'use strict';
// Isolated, real filesystem exercise of the discovery image-upload handler.
// Express and remote APIs are deliberately not needed; no user files are read.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {mountDiscovery}=require('../lib/discovery');
const base=fs.mkdtempSync(path.join(os.tmpdir(),'alm-gap82-local-images-'));
const magic=Buffer.from([137,80,78,71,13,10,26,10]);
const image=(i=1)=>{const b=Buffer.alloc(128*1024,i);magic.copy(b,0);b.writeUInt32BE(i,10);return b;};
function route(dir){const app={get(){},post(name,...handlers){if(name==='/api/local-images')app.localHandler=handlers.at(-1);}};mountDiscovery(app,{db:{},imagesDir:dir,upload:{single:()=>(_req,_res,next)=>next()}});return app.localHandler;}
function invoke(handler,b){return new Promise((resolve,reject)=>{const res={code:200,status(code){this.code=code;return this;},json(payload){resolve({status:this.code,payload});return this;}};try{const r=handler({file:b?{buffer:b}:null},res);if(r&&typeof r.catch==='function')r.catch(reject);}catch(error){reject(error);}});}
(async()=>{
 try{
  const images=path.join(base,'images'),handler=route(images);
  const b=image(1),result=await invoke(handler,b);assert.equal(result.status,200);assert.match(result.payload.poster,/^\/images\/manual-[a-f0-9]{24}\.png$/);
  const dest=path.join(images,path.basename(result.payload.poster));assert.deepEqual(fs.readFileSync(dest),b);
  const originalStat=fs.statSync(dest);
  const duplicate=await invoke(handler,b);assert.equal(duplicate.status,200);assert.equal(duplicate.payload.poster,result.payload.poster);
  assert.equal(fs.statSync(dest).mtimeMs,originalStat.mtimeMs,'Identical content must not be rewritten');
  const concurrent=await Promise.all(Array.from({length:4},()=>invoke(handler,image(2))));assert(concurrent.every(row=>row.status===200&&row.payload.poster===concurrent[0].payload.poster));
  assert.deepEqual(fs.readFileSync(path.join(images,path.basename(concurrent[0].payload.poster))),image(2));
  assert.equal((await invoke(handler)).status,400);assert.equal((await invoke(handler,Buffer.from('<svg><script>evil</script></svg>'))).status,400);
  const blocked=path.join(base,'not-a-directory');fs.writeFileSync(blocked,'fixture');const failure=await invoke(route(blocked),image(3));assert.equal(failure.status,500);assert.equal(failure.payload.error,'ALM_LOCAL_IMAGE_WRITE_FAILED');
  const failingName='manual-'+crypto.createHash('sha256').update(image(4)).digest('hex').slice(0,24)+'.png';
  const target=path.join(images,failingName);
  const rename=fs.promises.rename;
  try{fs.promises.rename=async()=>{throw Object.assign(Error('Simulated filesystem failure'),{code:'EACCES'});};
   const interrupted=await invoke(handler,image(4));assert.equal(interrupted.status,500);assert(!fs.existsSync(target));
  }finally{fs.promises.rename=rename;}
  assert.equal(fs.readdirSync(images).filter(s=>s.endsWith('.tmp')).length,0,'Temporary files must be cleaned after an atomic rename failure');
  if(process.platform!=='win32'){
   const toLink='manual-'+crypto.createHash('sha256').update(image(5)).digest('hex').slice(0,24)+'.png';
   fs.symlinkSync(dest,path.join(images,toLink));
   const symlink=await invoke(handler,image(5));assert.equal(symlink.status,409,'Symlinks must not be treated as saved user images');
  }
  const vm=require('node:vm'),screen={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/design-copy.js'),'utf8'),screen);
  for(const lang of ['fr','en','ja','es','de','pt-BR','zh-CN']){
   const translated=screen.window.ALM_DESIGN_COPY[lang]?.manualImageError;
   assert.equal(typeof translated,'string');assert(translated.length>=12,lang+' image-error locale missing');
  }
  assert.match(fs.readFileSync(path.join(__dirname,'../public/discovery.js'),'utf8'),/ALM_LOCAL_IMAGE_\(\?:CONFLICT\|WRITE_FAILED\)/,'The renderer must translate the controlled upload errors.');
  console.log('OK GAP82 uploads: atomic async save, byte integrity, duplicate skip, concurrency, invalid input, filesystem failure, temporary cleanup, seven error languages and symlink rejection.');
 }finally{fs.rmSync(base,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
