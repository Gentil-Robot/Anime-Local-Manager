'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
(async()=>{for(const file of ['public/community-forms.js','community/site/community-forms.js']){
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="captcha"></div></body></html>',{runScripts:'outside-only',url:'https://fixture.invalid/'}),w=dom.window;
 try{w.ALM_COMMUNITY_T=x=>x;w.ALM_DESIGN={escape:x=>String(x),language:()=> 'fr'};w.ALM_COMMUNITY_SECURITY={};w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 const container=w.document.getElementById('captcha'),first=w.ALM_CAPTCHA.mount(container,'fictional-key');assert.equal(w.document.head.querySelectorAll('script').length,1);w.document.head.querySelector('script').dispatchEvent(new w.Event('error'));await assert.rejects(first,/ALM_NETWORK/);assert.equal(w.document.head.querySelectorAll('script').length,0);
 let widgets=0;w.turnstile={render:(_c,options)=>{options.callback('fictional-token');return ++widgets;},reset(){},remove(){}};
 const second=w.ALM_CAPTCHA.mount(container,'fictional-key'),third=w.ALM_CAPTCHA.mount(container,'fictional-key');assert.equal(w.document.head.querySelectorAll('script').length,1,'Concurrent retry shares one script');w.document.head.querySelector('script').dispatchEvent(new w.Event('load'));const handles=await Promise.all([second,third]);assert.equal(widgets,2);assert.equal(handles[0].token(),'fictional-token');handles[0].reset();assert.throws(()=>handles[0].token(),/ALM_CAPTCHA_REQUIRED/);handles.forEach(h=>h.destroy());
 }finally{w.close();}
 }
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/index.html'),'utf8'));try{assert.equal(dom.window.document.querySelectorAll('main').length,1);assert.equal(dom.window.document.getElementById('animeGrid').tagName,'DIV');}finally{dom.window.close();}
 console.log('OK Beta78: CAPTCHA failure can retry, concurrent mounts share a loader, tokens reset, desktop has one main landmark. No real CAPTCHA or email sent.');
})().catch(error=>{console.error(error);process.exitCode=1;});
