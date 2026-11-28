'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const store=require('../lib/streaming-sources'),media=require('../lib/media-associations');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alm-v220-sources-')),file=path.join(dir,'sources.json');
 try{
  for(const url of ['javascript:alert(1)','file:///tmp/test','data:text/html,test','https://a:b@example.com/','https://example.com/ bad','https://example.com/\\foo'])assert.throws(()=>store.validateUrl(url));
  assert.deepEqual(store.list(file,42),[]);
  const first=store.put(file,{malId:42,episode:0,label:'Service',url:'https://example.com/anime'});
  const other=store.put(file,{malId:43,episode:1,label:'Other',url:'https://example.com/episode'});
  assert.equal(store.list(file,42).length,1);assert.equal(store.put(file,{malId:42,episode:0,label:'Service',url:'https://example.com/anime'}).key,first.key);
  assert.throws(()=>store.put(file,{malId:42,episode:0,label:'bad',url:'https://example.com/',key:other.key}));
  assert.equal(store.remove(file,42,other.key),false);
  const edit=store.put(file,{malId:42,episode:4,label:'Episode',url:'https://example.com/episode/4',key:first.key});
  assert.equal(store.get(file,42,first.key).episode,4);assert.equal(store.get(file,42,first.key).url,edit.url);assert.equal(store.remove(file,42,first.key),true);
  const local=path.join(dir,'media.json'),filename='ep4.mkv';fs.writeFileSync(path.join(dir,filename),'fixture');
  const entry=media.record(local,{root:dir,relativePath:filename,filename,malId:42,episodeGuess:4});
  assert.equal((await media.locateKey(local,42,entry.key)).ok,true);
  assert.equal((await media.locateKey(local,43,entry.key)).ok,false);
  assert.equal(media.remove(local,entry.key),true);assert(fs.existsSync(path.join(dir,filename)));
  console.log('OK: private bookmarks, validated URLs, editing, scoped removal, selected file opens without changing progression.');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
