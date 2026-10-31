'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('../public/community-model'),{createCommunity}=require('../lib/community');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'alm-beta64-favorites-'));
 const rows=[{malId:1,title:'Nine',score:9},{malId:20,title:'Ten',score:10},{malId:21,title:'Manual',score:7},{malId:22,title:'Imported favorite',score:6,isFavorite:true},{malId:5,title:'Unrated'}];
 let c;
 try{
  fs.writeFileSync(path.join(directory,'community-favorites.json'),JSON.stringify([21]));
  c=createCommunity({directory,getAnimes:()=>rows});
  const favorite=id=>c.own().items.find(i=>i.mal_id===id).favorite;
  assert(favorite(1)&&favorite(20)&&favorite(21)&&favorite(22));assert(!favorite(5));
  assert(!M.items(rows)[0].favorite,'Shared rows never infer favorites from another person’s score');
  assert.equal(M.preview(c.own()).items.length,0,'Private profile still publishes no items');
  c.favorite(1,false);rows[0].score=10;assert(!favorite(1),'Explicit removal beats automatic scores');
  c.favorite(20,true);rows[1].score=8;assert(favorite(20),'Manual choice survives a lower score');
  rows[0].score=8;c.favorite(1,true);assert(favorite(1));
  c.favorite(22,false);assert(!favorite(22),'Imported favorites can also be removed');
  rows[2].score=9;c.favorite(21,false);rows[2].score=10;assert(!favorite(21));
  c.favorite(5,true);assert(favorite(5),'Unrated anime can be selected manually');
  const before=JSON.stringify(rows);await c.close();c=createCommunity({directory,getAnimes:()=>rows});
  assert(favorite(1)&&favorite(20)&&favorite(5));assert(!favorite(21)&&!favorite(22));assert.equal(JSON.stringify(rows),before,'Community choices never change the local scores');
  await c.saveProfile({display_name:'Fixture',visibility:'friends',share_favorites:true});
  const published=M.shared(c.own()).items;assert.deepEqual(published.map(i=>i.mal_id),[1,20,5]);
  assert(!published.some(i=>'included' in i||'excluded' in i),'Local overrides are not shared');
  assert.throws(()=>c.favorite(999,true),/ANIME/);
  console.log('OK Beta64 favorites: 9–10 automatic, legacy/manual picks, persistent removal precedence, score changes, restart, private sharing and unchanged library.');
 }finally{await c?.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
