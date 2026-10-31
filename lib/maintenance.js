'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomicJson}=require('./atomic-file');
const DEFAULTS={enabled:false,unmeteredOnly:true,installOnExit:false,channel:'beta',tasks:{news:{enabled:true,hours:2},seasons:{enabled:true,hours:24},catalog:{enabled:true,hours:48},application:{enabled:true,hours:6}}};
function normalize(raw={}){const out={...DEFAULTS,...Object.fromEntries(['enabled','unmeteredOnly','installOnExit'].map(k=>[k,typeof raw[k]==='boolean'?raw[k]:DEFAULTS[k]])),channel:raw.channel==='beta'||raw.channel===undefined?'beta':'stable',tasks:{}};for(const [id,d]of Object.entries(DEFAULTS.tasks)){const v=raw.tasks?.[id]||{};out.tasks[id]={enabled:typeof v.enabled==='boolean'?v.enabled:d.enabled,hours:[1,2,6,12,24,48,72,168].includes(Number(v.hours))?Number(v.hours):d.hours};}return out;}
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;return fallback;}}
function createMaintenance({directory,handlers={},now=Date.now,network=async()=>({online:true,metered:null})}){
 const file=path.join(directory,'maintenance-settings.json'),stateFile=path.join(directory,'maintenance-state.json');
 let settings=normalize(read(file,{})),state=read(stateFile,{tasks:{}}),pending=null,stopped=false,timer=null;
 // The desktop single-instance lock prevents another live desktop runner.
 // A persisted running phase therefore belongs to an interrupted prior run.
 state.tasks=state.tasks&&typeof state.tasks==='object'?state.tasks:{};
 for(const [id,task]of Object.entries(state.tasks))if(task?.phase==='running')state.tasks[id]={...task,phase:'error',error:'ALM_MAINTENANCE_INTERRUPTED',nextRetry:new Date(now()+15*60000).toISOString()};
 const errorCode=error=>/^ALM_MAINTENANCE_[A-Z_]+$/.test(String(error?.message||''))?error.message:'ALM_MAINTENANCE_TASK_FAILED';
 const evidence=result=>Object.fromEntries(['checked','done','count','fetched','merged','newRows','successfulSources'].filter(k=>Number.isFinite(result[k])&&result[k]>=0).map(k=>[k,result[k]]));
 const snapshot=()=>({settings:JSON.parse(JSON.stringify(settings)),running:!!pending,tasks:JSON.parse(JSON.stringify(state.tasks||{})),lastRun:state.lastRun||'',reason:state.reason||''});
 const save=()=>atomicJson(stateFile,state);
 const api={state:snapshot,configure(input){const next=normalize(input);atomicJson(file,next);settings=next;return snapshot();},
  async run({force=false}={}){if(pending)return pending;if(stopped)return snapshot();if(!settings.enabled&&!force)return {...snapshot(),reason:'disabled'};
   const runSettings=settings;
   pending=(async()=>{const connection=await network();if(!connection.online||runSettings.unmeteredOnly&&connection.metered!==false){state.reason=!connection.online?'offline':connection.metered?'metered':'network-unknown';save();return snapshot();}
    state.reason='';state.lastRun=new Date(now()).toISOString();save();
    for(const [id,option]of Object.entries(runSettings.tasks)){if(stopped||!settings.enabled&&!force)break;if(!option.enabled||!settings.tasks[id]?.enabled)continue;const old=state.tasks[id]||{};const success=Date.parse(old.lastSuccess||''),retry=Date.parse(old.nextRetry||'');if(!force&&(old.phase!=='error'&&Number.isFinite(success)&&now()-success<option.hours*3600000||Number.isFinite(retry)&&retry>now()))continue;
     state.tasks[id]={...old,phase:'running',lastAttempt:new Date(now()).toISOString(),error:''};save();
     try{if(!handlers[id])throw Error('ALM_MAINTENANCE_UNSUPPORTED');const result=await handlers[id]({settings:runSettings,force});if(result?.ok!==true||result?.error)throw Error('ALM_MAINTENANCE_SOURCE');if(result.cancelled||Array.isArray(result.errors)&&result.errors.length)throw Error('ALM_MAINTENANCE_PARTIAL');const skipped=result.skipped===true;state.tasks[id]={...state.tasks[id],phase:skipped?'skipped':'done',lastSuccess:skipped?old.lastSuccess||'':new Date(now()).toISOString(),nextRetry:skipped?new Date(now()+15*60000).toISOString():'',reason:typeof result.reason==='string'&&/^[a-z-]{1,50}$/.test(result.reason)?result.reason:'',result:evidence(result),error:''};}
     catch(error){state.tasks[id]={...state.tasks[id],phase:'error',error:errorCode(error),nextRetry:new Date(now()+15*60000).toISOString()};}save();
    }return snapshot();
   })().finally(()=>{pending=null;});return pending;
  },start(){if(timer||stopped)return;timer=setInterval(()=>api.run().catch(()=>{}),120000);timer.unref?.();},async stop(){stopped=true;clearInterval(timer);timer=null;if(pending)await pending;}};return api;
}
module.exports={DEFAULTS,normalize,createMaintenance};
