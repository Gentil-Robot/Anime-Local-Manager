'use strict';
// Offline regression: real catalogue controller, simulated DOM and API, no user data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const langs=['fr','en','es','de','ja','pt-BR','zh-CN'];
const html=read('public/index.html');
assert.match(html,/<button type="button" id="catalogReset"[^>]*data-design-text="catalogReset"/);
assert.match(read('public/beta42.css'),/\.discovery-search \.catalog-reset:focus-visible/);
const copy={window:{}};
vm.runInNewContext(read('public/design-copy.js'),copy,{filename:'design-copy.js'});
for(const lang of langs){assert.equal(typeof copy.window.ALM_DESIGN_COPY[lang].catalogReset,'string');assert(copy.window.ALM_DESIGN_COPY[lang].catalogReset.length>0);}
const elements=new Map(),events=new Map(),requests=[];
function node(id){if(elements.has(id))return elements.get(id);
 const object={id,value:'',checked:false,hidden:false,disabled:false,innerHTML:'',textContent:'',dataset:{},attrs:{},listeners:{},children:[],
  classList:{contains(){return false;},add(){},remove(){}},
  setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},getAttribute(k){return this.attrs[k];},
  append(...items){this.children.push(...items);},after(){},replaceChildren(){this.children=[];},
  addEventListener(k,fn){this.listeners[k]=fn;},querySelector(){return null;},querySelectorAll(){return [];},
  closest(){return node('fakePagerWrapper');},focus(){this.focused=true;}};
 elements.set(id,object);return object;
}
const document={readyState:'loading',body:node('body'),
 getElementById:node,querySelector:node,querySelectorAll(){return[];},createElement:()=>node('created_'+(elements.size+1)),addEventListener(k,fn){events.set(k,fn);}};
const window={ALM_DESIGN:{t:(key,opts)=>key==='catalogCount'?'count '+opts.count+' page '+opts.page:key,
 language:()=> 'fr',escape:val=>String(val),applyText(){}},
 ALM_COLLECTION:{find:()=>null,same:()=>false,label:()=>''},
 ALM_WATCH_STATUS:{options:()=>'<option>Completed</option>'},
 ALM_SCROLL_PROGRESS:{toStart(){}},_almAnimes:[],filteredAnimes:()=>[],
 showV2Page(){},addEventListener(k,fn){events.set(k,fn);}};
let delayedResolve=null;
const fetch=async (url,options={})=>{
 const endpoint=new URL(String(url),'http://127.0.0.1:3123');
 requests.push({endpoint,signal:options.signal});
 if(endpoint.pathname==='/api/catalog/facets')return {ok:true,json:async()=>({years:['2026'],genres:['Fantasy'],studios:['Studio'],types:['TV']})};
 if(endpoint.pathname==='/api/catalog'){
  if(endpoint.searchParams.get('q')==='stale-request')return new Promise(resolve=>{delayedResolve=resolve;});
  return {ok:true,json:async()=>({items:[],page:Number(endpoint.searchParams.get('page')),total:110,updatedAt:null})};
 }
 throw Error('Unexpected API request: '+url);
};
vm.runInNewContext(read('public/catalog.js'),{window,document,fetch,URLSearchParams,AbortController,Date,Intl,console,queueMicrotask,clearTimeout,setTimeout},{filename:'catalog.js'});
assert.equal(typeof events.get('DOMContentLoaded'),'function');
events.get('DOMContentLoaded')();
assert.equal(typeof node('catalogReset').onclick,'function','Reset button must have a click handler');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 await window.ALM_CATALOG.enter();await flush();
 const last=()=>requests.filter(r=>r.endpoint.pathname==='/api/catalog').at(-1);
 assert.equal(last().endpoint.searchParams.get('page'),'1');
 node('discoveryQuery').value='Mushi';node('discoverySort').value='score';
 for(const key of ['year','decade','genre','studio','type'])node('catalogFilter-'+key).value=key;
 node('catalogHideOwned').checked=true;
 node('discoveryForm').onsubmit({preventDefault(){}});await flush();
 assert.equal(last().endpoint.searchParams.get('q'),'Mushi');
 assert.equal(last().endpoint.searchParams.get('genre'),'genre');
 assert.equal(last().endpoint.searchParams.get('hideOwned'),'1');
 node('catalogNext').onclick();await flush();
 assert.equal(last().endpoint.searchParams.get('page'),'2');
 await node('catalogReset').onclick();await flush();
 assert.equal(node('discoveryQuery').value,'');
 assert.equal(node('discoverySort').value,'relevance');
 for(const key of ['year','decade','genre','studio','type'])assert.equal(node('catalogFilter-'+key).value,'',key);
 assert.equal(node('catalogHideOwned').checked,false);
 assert.equal(node('discoveryQuery').focused,true);
 const values=last().endpoint.searchParams;
 assert.equal(values.get('q'),'');assert.equal(values.get('page'),'1');
 assert.equal(values.get('sort'),'relevance');assert.equal(values.get('hideOwned'),'0');
 for(const key of ['year','decade','genre','studio','type'])assert.equal(values.get(key),'',key);
 assert.equal(node('catalogPageNumber').textContent,'1 / 3');
 assert.equal(node('discoveryForm').attrs['aria-busy'],'false');
 // A response from an older search must not overwrite the reset view.
 node('discoveryQuery').value='stale-request';node('discoveryForm').onsubmit({preventDefault(){}});
 await flush();assert(delayedResolve);
 const oldSignal=last().signal; // Pending fetch, before reset.
 await node('catalogReset').onclick();await flush();
 assert.equal(oldSignal.aborted,true);
 delayedResolve({ok:true,json:async()=>({items:[],page:3,total:0})});await flush();
 assert.equal(node('catalogPageNumber').textContent,'1 / 3');
 assert.equal(node('discoveryStatus').textContent,'count 110 page 1');
 console.log('OK catalogue reset: clear query, all 5 facets, sort, owned checkbox, pagination, concurrent request, focus and 7 languages.');
})().catch(err=>{console.error(err);process.exitCode=1;});
