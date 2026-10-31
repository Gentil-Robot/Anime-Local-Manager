'use strict';
// Harmless synthetic bodies verify rejection before a vulnerable decoder is
// invoked. This is a mitigation regression test, not a CVE exploit.
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const zlib=require('node:zlib');
const {createPublicFetch}=require('../lib/public-fetch');

(async()=>{
 let encoding='',body=Buffer.from('Fictional source response'),capturedHeaders,decoderCalls=0;
 const descriptor=Object.getOwnPropertyDescriptor(zlib,'createBrotliDecompress');
 Object.defineProperty(zlib,'createBrotliDecompress',{...descriptor,value:()=>{decoderCalls++;throw Error('Brotli must never be invoked');}});
 const request=createPublicFetch({
  lookup:async()=>[{address:'8.8.8.8',family:4}],
  request:(_url,options,callback)=>{
   capturedHeaders=options.headers;
   const outgoing=new EventEmitter();outgoing.write=()=>{};
   outgoing.end=()=>{const incoming=new PassThrough();incoming.statusCode=200;incoming.headers=encoding?{'content-encoding':encoding}:{};callback(incoming);incoming.end(body);};
   return outgoing;
  }
 });
 try{
  for(const type of ['', 'identity', 'gzip', 'deflate']){
   encoding=type;const plain=Buffer.from('Fictional compressed source — 日本語');
   body=type==='gzip'?zlib.gzipSync(plain):type==='deflate'?zlib.deflateSync(plain):plain;
   const response=await request('https://source.example.test',{headers:{'accept-encoding':'br'}});
   assert.equal(capturedHeaders['accept-encoding'],'gzip, deflate');
   assert.equal(await response.text(),plain.toString());
   assert.equal(response.headers.has('content-encoding'),false);
  }
  for(const type of ['br','BR','zstd','gzip, br']){
   encoding=type;body=Buffer.from('Harmless bytes: no compressed exploit');
   await assert.rejects(request('https://source.example.test'),/ALM_NETWORK_ENCODING/);
  }
  for(const type of ['gzip','deflate']){
   encoding=type;const plain=Buffer.from('x'.repeat(4000));body=type==='gzip'?zlib.gzipSync(plain):zlib.deflateSync(plain);
   await assert.rejects(request('https://source.example.test',{maxBytes:100}),/too large/);
  }
  assert.equal(decoderCalls,0);
  console.log('OK Beta82 public encoding: no Brotli negotiation/decoder invocation, unknown encodings rejected, gzip/deflate/identity preserved, decoded-body limits enforced.');
 }finally{Object.defineProperty(zlib,'createBrotliDecompress',descriptor);}
})().catch(error=>{console.error(error);process.exitCode=1;});
