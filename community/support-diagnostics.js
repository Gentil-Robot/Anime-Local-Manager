import {normalizeDiagnostic} from '../supabase/functions/alm-public/support-model.ts';
const events=[],t=key=>window.ALM_COMMUNITY_T(key);
function record(source,code,hresult=null){events.push({at:new Date().toISOString(),source,code,hresult});if(events.length>20)events.shift();}
async function build(){let snapshot={};
 if(!window.ALM_COMMUNITY_WEB){try{const r=await fetch('/api/support-diagnostic',{signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error();snapshot=await r.json();}catch{record('support','ALM_DIAGNOSTIC_FAILED');}}
 if(window.animeManager?.maintenanceState){let timeout;try{const state=await Promise.race([window.animeManager.maintenanceState(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error()),6000);})]);snapshot.scheduler={...state.schedulerState,supported:state.schedulerSupported};}catch{record('maintenance','ALM_SCHEDULE_FAILED');}finally{clearTimeout(timeout);}}
 const account=window.ALM_COMMUNITY?.snapshot?.();
 const community=account?.connected?{connected:true,confirmed:account.confirmed,visibility:account.own?.profile?.visibility,autoShare:account.sync?.auto,dirty:account.sync?.dirty,pendingRequests:account.notifications?.requests?.length,pendingRecommendations:account.notifications?.recommendations?.length}:undefined;
 return normalizeDiagnostic({...snapshot,sectionsVersion:2,version:window.ALM_DESIGN.VERSION,generatedAt:new Date().toISOString(),language:window.ALM_DESIGN.language(),surface:window.ALM_COMMUNITY_WEB?'web':'local',community,events});
}
async function copy(){const report=await build();const copied=await window.ALM_COMMUNITY_PLUS.copy(JSON.stringify(report,null,2));const status=document.getElementById('commSettingsStatus');if(status)status.textContent=t(copied===false?'copyManual':'diagnosticCopied');}
async function open(){return window.ALM_PUBLIC_FORMS.open('contact','problem',{diagnostic:await build()});}
function init(){for(const id of ['settingsPanel-storage','almDiagnostics']){const host=document.getElementById(id);if(host&&!host.querySelector('[data-alm-diagnostic]')){const b=document.createElement('button');b.type='button';b.dataset.almDiagnostic='';b.dataset.noI18n='';host.querySelector('.storage-actions,.settings-disclosure-body')?.append(b);}}for(const b of document.querySelectorAll('[data-alm-diagnostic]'))b.textContent=t('sendDiagnostic');}
document.addEventListener('click',event=>{const b=event.target.closest('[data-alm-diagnostic]');if(!b)return;event.preventDefault();b.disabled=true;open().catch(()=>window.notifyApp?.(t('diagnosticUnavailable'),'error')).finally(()=>{b.disabled=false;});});
window.addEventListener('alm:language-changed',()=>{for(const b of document.querySelectorAll('[data-alm-diagnostic]'))b.textContent=t('sendDiagnostic');});
window.ALM_SUPPORT={build,copy,open,record,normalize:normalizeDiagnostic};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
