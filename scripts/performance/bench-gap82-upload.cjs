'use strict';
const assert=require('node:assert/strict');
const os=require('node:os'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const project=path.resolve(process.argv[2] || path.join(__dirname,'../..'));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-gap82-upload-'));
const routes=new Map();
const app={get(){},post(name,...handlers){routes.set(name,handlers);}};
const upload={single:()=>((req,res,next)=>next())};
require(path.join(project,'lib/discovery.js')).mountDiscovery(app,{db:{},upload,imagesDir:directory});
const uploadHandler=routes.get('/api/local-images')?.at(-1);assert.equal(typeof uploadHandler,'function');
function percent(data,p){return data[Math.min(data.length-1,Math.ceil(data.length*p)-1)];}
async function run(){const completed=[],immediate=[],rss=[];let ok=0;
 for(let i=0;i<20;i++){
  const buffer=Buffer.alloc(7*1024*1024,0);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(buffer,0);
  buffer.writeUInt32BE(i+1,40);
  const response={statusCode:200,status(s){this.statusCode=s;return this;},json(o){this.result=o;reply({code:this.statusCode,payload:o});return this;}};
  let reply,rejectReply;const final=new Promise((resolve,reject)=>{reply=resolve;rejectReply=reject;});
  const started=performance.now();let ret;
  try{ret=uploadHandler({file:{buffer}},response);if(ret&&typeof ret.then==='function')ret.catch(rejectReply);}catch(e){rejectReply(e);}
  const untilReturn=performance.now()-started;
  const result=await final;
  const total=performance.now()-started;
  assert.equal(result.code,200,'Upload failed');
  const photo=fs.readFileSync(path.join(directory,path.basename(result.payload.poster)));
  assert.deepEqual(photo,buffer,'Image differs from upload');
  if(i>=3){immediate.push(untilReturn);completed.push(total);rss.push(process.memoryUsage().rss);}
  ok++;
 }
 for(const arr of [immediate,completed,rss])arr.sort((a,b)=>a-b);
 console.log(JSON.stringify({scenario:'upload_png_7mib_dummy',platform:process.platform,node:process.version,iterations:20,warmup:3,filesVerified:ok,conditions:'filesystem temp + pseudo Express handler; bytes synthetic; no real HTTP; no external network',immediateMedianMs:+percent(immediate,.5).toFixed(3),immediateP95Ms:+percent(immediate,.95).toFixed(3),totalMedianMs:+percent(completed,.5).toFixed(3),totalP95Ms:+percent(completed,.95).toFixed(3),rssMedianMiB:+(percent(rss,.5)/1048576).toFixed(1)},null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(directory,{recursive:true,force:true}));
