'use strict';
const {boundedTextFetch}=require('./bounded-text-fetch');
const REPOSITORY='Gentil-Robot/Anime-Local-Manager',RELEASES='https://github.com/'+REPOSITORY+'/releases';
const RELEASE_CHANNEL = require('../release-version.json').distributionChannel;
function version(value){const m=String(value||'').match(/^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);return m?{numbers:m.slice(1,4).map(x=>Number(x||0)),pre:m[4]?m[4].split('.'):[]}:null;}
function compare(a,b){a=version(a);b=version(b);if(!a||!b)return 0;for(let i=0;i<3;i++)if(a.numbers[i]!==b.numbers[i])return Math.sign(a.numbers[i]-b.numbers[i]);if(!a.pre.length||!b.pre.length)return Math.sign(b.pre.length-a.pre.length);for(let i=0;i<Math.max(a.pre.length,b.pre.length);i++){if(a.pre[i]===b.pre[i])continue;if(a.pre[i]===undefined)return -1;if(b.pre[i]===undefined)return 1;const an=/^\d+$/.test(a.pre[i]),bn=/^\d+$/.test(b.pre[i]);if(an&&bn)return Math.sign(Number(a.pre[i])-Number(b.pre[i]));if(an!==bn)return an?-1:1;return a.pre[i]>b.pre[i]?1:-1;}return 0;}
function selectRelease(items,current,allowBeta=!!version(current)?.pre.length){return (Array.isArray(items)?items:[]).filter(r=>!r.draft&&(!r.prerelease||allowBeta)&&!(String(r.tag_name).replace(/^v/,'')===require('../release-version.json').technicalVersion&&require('../release-version.json').githubPrerelease&&!r.prerelease)&&version(r.tag_name)&&typeof r.html_url==='string'&&r.html_url.startsWith(RELEASES+'/tag/')&&compare(r.tag_name,current)>0).sort((a,b)=>compare(b.tag_name,a.tag_name))[0]||null;}
function createVersionCheck({current=require('../package.json').version,fetchImpl=global.fetch,now=Date.now}={}) {
 const cached=new Map(),pending=new Map();let selected=RELEASE_CHANNEL;
 const initial=channel=>({current,available:false,releaseUrl:RELEASES,checkedAt:'',error:'',channel});
 return {
  state:()=>({...cached.get(selected)||initial(selected)}),
  async check(force=false,channel) {
   const requested=(channel||RELEASE_CHANNEL)==='beta'?'beta':'stable';selected=requested;
   if(pending.has(requested))return pending.get(requested);
   const saved=cached.get(requested);
   if(!force&&saved?.checkedAt&&now()-Date.parse(saved.checkedAt)<6*3600000)return {...saved};
   const request=(async()=>{
    let result;
    try {
     const {response,text}=await boundedTextFetch('https://api.github.com/repos/'+REPOSITORY+'/releases?per_page=100',{
      timeoutMs:10000,maxBytes:4*1024*1024,maxRedirects:0,fetchImpl,
      headers:{Accept:'application/vnd.github+json','User-Agent':'AnimeLocalManager/'+current}
     });
     if(!response.ok)throw Error('ALM_UPDATE_SOURCE');
     const list=JSON.parse(text);if(!Array.isArray(list))throw Error('ALM_UPDATE_SOURCE');
     const release=selectRelease(list,current,requested==='beta');
     result={current,available:!!release,latest:release?.tag_name||'',releaseUrl:release?.html_url||RELEASES,
      checkedAt:new Date(now()).toISOString(),error:'',channel:requested,prerelease:release?.prerelease===true,
      publishedAt:release?.published_at||'',assets:(release?.assets||[]).map(a=>({
       name:a.name,size:a.size,digest:a.digest,state:a.state,browser_download_url:a.browser_download_url
      }))};
    }catch {
     // Do not retain a previously offered installer after a failed refresh.
     result={...initial(requested),checkedAt:new Date(now()).toISOString(),error:'ALM_UPDATE_SOURCE'};
    }
    cached.set(requested,result);return {...result};
   })().finally(()=>{pending.delete(requested);});
   pending.set(requested,request);return request;
  }
 };
}
module.exports={version,compare,selectRelease,createVersionCheck,REPOSITORY,RELEASES};
