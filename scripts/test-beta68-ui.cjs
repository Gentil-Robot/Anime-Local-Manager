'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 const dom=new JSDOM(read('public/index.html'),{url:'http://127.0.0.1:3123',runScripts:'outside-only'}),w=dom.window;
 try{
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  let language='fr';w.ALM_I18N={getLanguage:()=>language};w.matchMedia=()=>({matches:false});
  for(const file of ['design-copy.js','design-core.js','community-content.js','community-model.js','community-copy.js','community-workspace-copy.js','community-workspace.js'])w.eval(read('public/'+file));
  const model=w.ALM_COMMUNITY_MODEL,workspace=w.ALM_COMMUNITY_WORKSPACE;
  // Legacy uploaded images must remain readable when new uploads get a smaller limit.
  const image=bytes=>'data:image/webp;base64,'+Buffer.alloc(bytes).toString('base64');
  assert(model.avatarImage(image(40000)));
  let decoded=0,closed=0,draws=0,encoded=0,mode='normal';
  w.createImageBitmap=async()=>{decoded++;return {width:800,height:500,close:()=>closed++};};
  const create=w.document.createElement.bind(w.document);
  w.document.createElement=function(name){if(name!=='canvas')return create(name);return {width:0,height:0,getContext:()=>({drawImage:()=>draws++}),toDataURL(){encoded++;return image(mode==='never'?40000:mode==='fallback'&&this.width>192?40000:mode==='quality'&&encoded%3!==0?40000:32768);}};};
  await assert.rejects(workspace.readAvatar({size:2000001,type:'image/png'}),/INVALID_INPUT/);assert.equal(decoded,0);
  await assert.rejects(workspace.readAvatar({size:1000,type:'image/svg+xml'}),/INVALID_INPUT/);assert.equal(decoded,0);
  const file={size:2000000,type:'image/png'};
  assert.equal(await workspace.readAvatar(file),image(32768));assert.equal(closed,1);
  mode='quality';encoded=0;assert.equal(await workspace.readAvatar(file),image(32768));assert.equal(encoded,3);assert.equal(closed,2);
  mode='fallback';encoded=0;draws=0;assert.equal(await workspace.readAvatar(file),image(32768));assert.equal(draws,2);assert.equal(closed,3);
  mode='never';await assert.rejects(workspace.readAvatar(file),/PAYLOAD_LIMIT/);assert.equal(closed,4);
  const banner=w.document.querySelector('#dnaDashboard .dna-site-banner'),clip=w.document.querySelector('#aboutPage .donation-karaoke');
  assert(banner,'Anime DNA keeps the linked GIF');assert.equal(banner.previousElementSibling.id,'dnaSideStats');assert.equal(banner.parentElement.id,'dnaDashboard');assert.equal(banner.href,'https://animelocalmanager.com/');assert(banner.querySelector('#almRetroBanner'));
  assert(clip,'About keeps the video player');assert.equal(clip.parentElement.className,'about-media-main');assert.equal(w.document.querySelector('#aboutPage .about-site-row, #aboutPage .alm-retro-banner, #aboutPage .about-site-link'),null);
  assert(!w.document.querySelector('.alm-project-budget'));assert(!w.document.querySelector('.alm-support-budget-row'));assert.equal(w.document.querySelectorAll('.wallpaper-grid a').length,4);
  for(const lang of ['fr','en','es','de','ja','pt-BR','zh-CN']){
   language=lang;w.document.documentElement.lang=lang;w.ALM_DESIGN.applyText();
   const copy=w.ALM_COMMUNITY_COPY[lang].avatarHint;
   assert(copy&&!copy.includes('20 MB')&&!copy.includes('20 Mo'));assert(copy.includes('32'));
   assert.equal(banner.getAttribute('aria-label'),w.ALM_DESIGN.t('bannerLabel'));
  }
  console.log('OK Beta68 UI: avatar limits, compression, bitmap cleanup, legacy compatibility and seven languages; budget removed, linked GIF in Anime DNA, About video and four wallpapers retained.');
 }finally{w.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
