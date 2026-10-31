'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.resolve(process.env.ALM_TEST_ROOT||path.join(__dirname,'..')),source=f=>fs.readFileSync(path.join(root,f),'utf8');
async function inspect(){const results={};
 const dom=new JSDOM(source('public/index.html'),{url:'http://127.0.0.1:3123',runScripts:'outside-only'}),w=dom.window;
 try{await new Promise(r=>setTimeout(r,0));w.ALM_DESIGN={escape:String,t:k=>k,icon:()=>'',language:()=> 'fr'};w.ALM_COMMUNITY_T=k=>k;w.ALM_COMMUNITY_MODEL={STATUSES:['Watching','Completed'],shareAllowed:()=>true};w.ALM_COMMUNITY_SECURITY={};let stale=false,reloaded=false,body;
  w.ALM_COMMUNITY={context:()=>({view:{items:[{mal_id:1,title:'Fictional record'}]}}),snapshot:()=>null,refresh:async()=>{}};
  w.markAnimeLibraryStale=()=>{stale=true;};w.ensureAnimeLibraryFresh=async()=>{if(stale)reloaded=true;};w.fetch=async(url,options)=>{if(url==='/api/animes')return {ok:true,json:async()=>[{id:7,malId:1,notes:'Old personal note',tags:['Old tag'],episodesTotal:12}]};body=JSON.parse(options.body);return {ok:true};};
  w.eval(source('public/community-workspace.js'));await w.ALM_COMMUNITY_WORKSPACE.addAnime(1,'Watching');results.minimalStatusPatch=JSON.stringify(body)==='{"status":"Watching"}';results.localLibraryReloaded=reloaded;await w.ALM_COMMUNITY_WORKSPACE.addAnime(1,'Completed');results.completedCounter=body.status==='Completed'&&body.episodesSeen==='12'&&!('notes'in body);
 }finally{w.close();}
 const server=source('server.js'),start=server.indexOf('app.get("/api/v2/profile",'),end=server.indexOf('\n// ═',start);let handler;vm.runInNewContext(server.slice(start,end),{app:{get:(url,fn)=>handler=fn},readAnimesAsync:async()=>[1,2].map(id=>({id,title:'Fictional '+id,score:8,genres:['__proto__','constructor']})),isAnimeFeatureEligible:()=>true});const res={code:200,status(code){this.code=code;return this;},json(value){this.value=value;}};await handler({},res);results.prototypeGenres=res.code===200&&Object.hasOwn(res.value.patterns||{},'__proto__')&&res.value.patterns.__proto__.count===2&&res.value.patterns.constructor.count===2;
 return results;
}
module.exports={inspect};if(require.main===module)inspect().then(results=>{console.log(JSON.stringify(results,null,2));for(const [name,value]of Object.entries(results))assert(value,name);console.log('OK Beta78: community status changes preserve personal fields, completed counter and local refresh; special genre names work.');}).catch(e=>{console.error(e);process.exitCode=1;});
