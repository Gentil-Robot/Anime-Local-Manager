(()=>{'use strict';const D=window.ALM_DESIGN,$=id=>document.getElementById(id);
function init(){
 const button=document.createElement('button');button.type='button';button.id='completionOpenIssues';button.hidden=true;button.className='completion-progress-secondary';button.dataset.designText='completionOpenIssues';button.setAttribute('data-no-i18n','');
 $('completionProgressDismiss').before(button);button.onclick=()=>{$('navAudit').click();};
 const panel=$('completionIssuesPanel'),heading=panel.querySelector('h2'),header=document.createElement('div');header.className='completion-issues-header';heading.before(header);header.append(heading);
 const actions=document.createElement('div');actions.className='completion-actions';header.after(actions);
 const retry=document.createElement('button');retry.type='button';retry.id='completionIssuesRetry';retry.dataset.designText='completionAll';retry.setAttribute('data-no-i18n','');actions.append(retry);
 retry.onclick=async()=>{retry.disabled=true;try{await window.ALM_COMPLETION_ISSUES.complete();}finally{retry.disabled=false;}};
 const selected=document.createElement('button');selected.type='button';selected.id='completionIssuesSelected';selected.dataset.designText='completionSelected';selected.setAttribute('data-no-i18n','');selected.disabled=true;actions.append(selected);
 selected.onclick=async()=>{const ids=window.ALM_COMPLETION_ISSUES.selectedIds();if(!ids.length)return;selected.disabled=true;try{await window.ALM_COMPLETION_ISSUES.complete(ids);}finally{selected.disabled=!window.ALM_COMPLETION_ISSUES.selectedIds().length;}};
 D.applyText();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();})();

