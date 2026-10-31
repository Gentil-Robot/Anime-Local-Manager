'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
require('./test-beta60-runtime.cjs');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const M=require('../public/community-model'),{validIpcSender}=require('../lib/local-security');
const image='data:image/png;base64,iVBORw0KGgo=';
assert.equal(M.profile({avatar_image:image}).avatar_image,image);
assert.equal(M.profile({avatar_image:'data:image/svg+xml;base64,PHN2Zz4='}).avatar_image,'');
assert.equal(M.profile({avatar_image:'https://tracker.invalid/a.png'}).avatar_image,'');
const item=M.items([{malId:40,title:'A',type:'TV',year:2024,publicScore:8.4,rank:12,startDate:'2024-01-01',notes:'private',mediaPath:'/secret'}])[0];
assert.equal(item.year,2024);assert.equal(item.type,'TV');assert(!JSON.stringify(item).includes('private'));assert(!JSON.stringify(item).includes('/secret'));
const context={window:{ALM_DESIGN_COPY:{},ALM_DESIGN:{language:()=> 'fr'}},document:{documentElement:{lang:'fr'},getElementById:()=>null,readyState:'loading',addEventListener(){}}};
context.window.addEventListener=()=>{};vm.createContext(context);
for(const f of ['community-copy.js','community-upgrade-copy.js','community-site-copy.js','community-workspace-copy.js','legal-content.js'])vm.runInContext(read('public/'+f),context);
for(const lang of ['fr','en','es','de','ja','pt-BR','zh-CN']){
 for(const key of ['myAccount','friendsLibrary','receivedRecommendations','avatarUpload','privacyPolicy','legalNotice','discordALM'])assert(context.window.ALM_COMMUNITY_COPY[lang][key],lang+':'+key);
 for(const [key,value]of Object.entries(context.window.ALM_LEGAL_COPY.fr))assert(context.window.ALM_LEGAL_COPY[lang][key],lang+':legal:'+key);
}
// Execute the real clipboard registration with the same sender validator as Electron.
const source=read('main.js'),handler=source.match(/ipcMain.handle\('clipboard-write',[\s\S]*?\n  \}\);/)[0];
const frame={url:'http://127.0.0.1:3123/'},wc={mainFrame:frame},mainWindow={webContents:wc},writes=[];let copy;
vm.runInNewContext(handler,{ipcMain:{handle:(_,fn)=>{copy=fn;}},clipboard:{writeText:v=>writes.push(v)},trusted:event=>{if(!validIpcSender(event,mainWindow,'http://127.0.0.1:3123'))throw Error('Untrusted IPC sender');}});
const event={sender:wc,senderFrame:frame};assert.equal(copy(event,'Fixture#0001'),true);assert.equal(writes[0],'Fixture#0001');
for(const bad of [{sender:{},senderFrame:frame},{sender:wc,senderFrame:{url:frame.url}},{sender:wc,senderFrame:{url:'https://evil.invalid'}}])assert.throws(()=>copy(bad,'fail'),/Untrusted/);
assert.throws(()=>copy(event,'x'.repeat(100001)),/INVALID_INPUT/);assert.throws(()=>copy(event,{}),/INVALID_INPUT/);assert.equal(writes.length,1);
for(const f of ['public/privacy-policy.html','public/legal-notice.html','community/site/privacy-policy.html','community/site/legal-notice.html']){const html=read(f);assert(html.includes('almLegalContent'));assert(html.includes('legal-content.js'));assert(!html.includes('jesuisungentilrobot'));}
assert(!/delete from/i.test(read('supabase/migrations/20261016173601_alm_beta61_community_workspace.sql')),'Privacy changes must retain owner copies');
assert.deepEqual(JSON.parse(read('package.json')).build.win.target,['nsis']);
console.log('OK Beta61 runtime: raster-only avatars, seven-language legal/account copy, minimal sharing data, trusted write-only clipboard IPC, retained owner copies and NSIS-only Windows target.');
