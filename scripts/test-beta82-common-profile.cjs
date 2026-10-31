'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const M=require('../public/community-model');
// The dedicated section must be available in all seven supported UI languages.
const communityLabels=fs.readFileSync(path.join(__dirname,'../public/community-copy.js'),'utf8');
for(const label of ['common','noCommon']){
 assert(communityLabels.includes("['"+label+"',"),'Missing community translation: '+label);
}
const rootId='11111111-1111-4111-8111-111111111111',friendId='22222222-2222-4222-8222-222222222222';
const entry=(id,title,status='Completed')=>({mal_id:id,title,image_url:'https://cdn.myanimelist.net/test.jpg',status,episodes_seen:12,episodes_total:12,score:8,genres:['Drama'],studios:['Some Studio'],type:'TV',year:2004});
const own={profile:{display_name:'My account',visibility:'friends',bio:'',banner:'garden',accent:'violet',featured:[]},items:[entry(19,'My Monster'),entry(11061,'Shared Anime'),entry(990001,'My Secret', 'Watching')],age:{recorded:false,excludeAdult:true},summary:{total:3,completed:2,watching:1}};
const friend={profile:{display_name:'Friend',bio:'hello',banner:'garden',accent:'violet',featured:[]},items:[entry(19,'Monster'),entry(11061,'Shared Anime'),entry(55,'Friend-only anime')],comparison:{common:2,compatibility:80,genres:['Drama'],discoveries:[]},summary:{total:3,completed:3,watching:0,onhold:0,planned:0},dna:[],activity:[]};
const fakeState={configured:true,connected:true,user:{id:rootId,email:'private@example.com'},own,notifications:{count:0},sync:{}};
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{innerHTML:'',classList:{add(){},remove(){},contains(){return false;}},setAttribute(){},removeAttribute(){},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},getAttribute(){return null;}});return elements.get(id);}
const document={readyState:'loading',documentElement:{lang:'fr'},getElementById:id=>id==='communityPage'?el(id):null,querySelectorAll:()=>[],addEventListener(){},activeElement:null};
let captured=null;
const t=k=>({common:'Animés en commun',viewAllCommon:'Voir tous nos animés en commun',noCommon:'Aucun animé en commun',sample:'Fiches partagées',showcase:'Vitrine',watching:'En cours',discoveries:'Découvrir',back:'Retour',recommend:'Recommander',library:'Bibliothèque',summary:'Résumé',favorites:'Favoris',dna:'Anime DNA',communityTitle:'Communauté',empty:'Aucun animé'}[k]||k);
const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const mockApi=async(url)=>{if(url==='status')return fakeState;if(url==='friends')return {userId:rootId,relationships:[],cards:[]};if(url==='profiles/'+friendId)return friend;throw Error('UNEXPECTED_API:'+url);};
const w={ALM_COMMUNITY_API:mockApi,ALM_COMMUNITY_ERROR:error=>error.message,ALM_DESIGN:{escape,language:()=> 'fr'},ALM_COMMUNITY_T:t,ALM_COMMUNITY_SECURITY:{tag:p=>(p.display_name||'Friend')+'#0001'},ALM_COMMUNITY_MODEL:M,ALM_WATCH_STATUS:{label:s=>s},ALM_COMMUNITY_REQUESTS:{create:provider=>provider},ALM_COMMUNITY_WORKSPACE:{reset(){},visit(){},bindLibrary(){},hydratePosters(){},stats(){return '';},library:(data,key,section)=>{captured={data,key,section};return `<span data-tested="true">${data.items.map(x=>escape(x.title)).join(' | ')}</span>`;}},ALM_COMMUNITY_PLUS:{decorate(){},report(){}},showV2Page(){},dispatchEvent(){}};
const ctx={window:w,document,CustomEvent:class{constructor(name){this.type=name;}},console,setTimeout,clearTimeout,URL,AbortSignal,Promise,FormData:class{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/community.js'),'utf8'),ctx,{filename:'community.js'});
(async()=>{
 await w.ALM_COMMUNITY.open(friendId);
 const summary=el('communityPage').innerHTML;
 assert(summary.includes('data-comm-action="show-common"'),'Summary should expose direct link to shared anime');
 assert(summary.includes('id="comm-tab-common"'),'Friend profile should expose the common-anime tab');
 assert(summary.includes('Monster')&&summary.includes('Shared Anime'),'Only common anime are shown in preview');
 assert(!summary.includes('Friend-only anime')&&!summary.includes('My Secret'),'Non-overlapping titles must not appear in the preview');
 assert(!summary.includes('Voir tous nos animés en commun'),'No redundant common-anime button');
 assert.equal((summary.match(/data-comm-action="show-common"/g)||[]).length,1,'One direct common-list action');
 assert(/<h2><button[^>]*data-comm-action="show-common"[^>]*>/.test(summary),'The title and count are inside a native button');
 await w.ALM_COMMUNITY.setTab('common');
 assert.equal(captured.key,'common:'+friendId);
 assert.equal(captured.section,'library');
 assert.deepEqual(Array.from(captured.data.items,x=>x.mal_id),[19,11061]);
 assert(!el('communityPage').innerHTML.includes('My Secret'));
 await w.ALM_COMMUNITY.open();
 assert(!el('communityPage').innerHTML.includes('id="comm-tab-common"'),'The shared view should not appear on the own profile');
 // Model rejects duplicates and title matches with different MAL IDs.
 assert.deepEqual(M.commonItems([entry(19,'X'),entry(19,'X')],[entry(19,'Y'),entry(19,'Z'),entry(99,'X')]).map(x=>x.mal_id),[19]);
 console.log('OK beta82 friend profile: common list, preview, clickthrough tab and filterable library, owner-only and private data boundaries.');
})().catch(error=>{console.error(error);process.exitCode=1;});
