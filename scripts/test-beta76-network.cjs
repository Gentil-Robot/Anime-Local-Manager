'use strict';
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),zlib=require('node:zlib');
const {createPublicFetch}=require('../lib/public-fetch'),{boundedTextFetch}=require('../lib/bounded-text-fetch'),{publicIp,fetchBinary}=require('../lib/public-network');
const {createMetadataProviders}=require('../lib/metadata-providers');
(async()=>{
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','192.168.0.1','192.0.2.1','198.51.100.1','203.0.113.1','::1','::ffff:127.0.0.1','fe80::1','fd00::1','2001:db8::1','2001:20::1','2002:7f00:1::','3fff::1'])assert.equal(publicIp(address),false,address);
 for(const address of ['8.8.8.8','1.1.1.1','203.0.1.1','198.51.1.1','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(publicIp(address),true,address);
 let resolutions=0,requests=0,body=Buffer.from('日本語 fixture'),status=200,headers={};
 const fetchImpl=createPublicFetch({lookup:async()=>{resolutions++;return [{address:'8.8.8.8',family:4}];},request:(url,options,callback)=>{
  requests++;options.lookup(url.hostname,{all:true},(error,values)=>{assert.equal(error,null);assert.deepEqual(values,[{address:'8.8.8.8',family:4}]);});
  const req=new EventEmitter();req.write=()=>{};req.end=()=>{const stream=new PassThrough();stream.statusCode=status;stream.headers=headers;callback(stream);stream.end(body);};return req;
 }});
 assert.equal(await (await fetchImpl('https://rebind.example.test')).text(),'日本語 fixture');assert.equal(resolutions,1);assert.equal(requests,1);
 await assert.rejects(fetchImpl('http://127.0.0.1/private'),/PRIVATE_ADDRESS/);assert.equal(requests,1);
 await assert.rejects(fetchImpl('http://public.example:8080/private'),/URL/);assert.equal(requests,1);
 status=302;headers={location:'http://127.0.0.1/private'};await assert.rejects(boundedTextFetch('https://source.example',{fetchImpl}),/PRIVATE_ADDRESS/);assert.equal(requests,2);
 status=200;body=zlib.gzipSync(Buffer.from('x'.repeat(4000)));headers={'content-encoding':'gzip'};await assert.rejects(fetchImpl('https://source.example',{maxBytes:100}),/too large/);
 body=Buffer.from('x'.repeat(200));headers={};await assert.rejects(fetchImpl('https://source.example',{maxBytes:100}),/too large/);
 const slow=createPublicFetch({lookup:()=>new Promise(()=>{}),request:()=>{throw Error('must not connect');}});await assert.rejects(slow('https://source.example',{timeoutMs:15}),/CANCELLED/);
 await assert.rejects(fetchBinary('http://example.test/catalogue.gz',{requireHttps:true}),/URL/);
 let clock=0,calls=0;
 const providers=createMetadataProviders({getClientId:()=> 'fixture',now:()=>clock,fetchText:async()=>{calls++;throw Error('offline');}});
 await providers.byId(1);assert.equal(calls,2);clock=61000;await providers.byId(2);assert.equal(calls,4);await providers.byId(3);assert.equal(calls,4);clock=122000;await providers.byId(4);assert.equal(calls,6);
 console.log('OK Beta76: socket lookup uses validated IP only, private/reserved IPv4/IPv6 and ports rejected, redirects rechecked, compressed/body/time budgets, HTTPS-only snapshots and renewed provider cooldown.');
})().catch(error=>{console.error(error);process.exitCode=1;});
