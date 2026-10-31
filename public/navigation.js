(() => {
'use strict';const D=window.ALM_DESIGN;let current=null,restoring=false,scrollFrame=0;
const controls=()=>[...document.querySelectorAll('.filters input[id],.filters select[id]')];
const snapshot=()=>({alm:true,view:current||document.body.dataset.studioView||'library',y:scrollY,x:scrollX,filters:Object.fromEntries(controls().map(n=>[n.id,n.value]))});
const replace=()=>{if(!restoring&&current)try{history.replaceState(snapshot(),'');}catch{}};
function sync(view){if(restoring)return;if(!current){current=view;replace();return;}if(current===view)return;current=view;try{history.pushState(snapshot(),'');}catch{}}
function restore(state){if(!state?.alm)return;restoring=true;current=state.view;
if(['library','watching','plan'].includes(state.view)){window.showAnimesV1?.(state.view==='watching'?'Watching':state.view==='plan'?'Plan to Watch':'');for(const [id,value]of Object.entries(state.filters||{})){const n=document.getElementById(id);if(n)n.value=value;}window.render?.();}
else if(state.view==='memoryPage')window.ALM_MEMORIES_PAGE?.open();else if(state.view==='communityPage')window.ALM_COMMUNITY?.open();else if(state.view==='aboutPage')window.showAboutView?.();else{const ids={dnaPage:'navDna',newsV2Page:'navNewsV2',recoPage:'navReco',seasonNewsPage:'navSeasonNews',lexiconPage:'navLexicon',auditPage:'navAudit',discoveryPage:'navDiscovery',rankingPage:'navRanking',calendarPage:'navCalendar'};window.showV2Page?.(state.view,ids[state.view]);if(state.view==='dnaPage')window.renderDNA?.();if(state.view==='rankingPage')window.ALM_RANKINGS?.load();}
D.syncView?.();requestAnimationFrame(()=>requestAnimationFrame(()=>{window.scrollTo({left:state.x||0,top:state.y||0,behavior:'instant'});restoring=false;}));}
function init(){try{history.scrollRestoration='manual';}catch{}document.addEventListener('click',replace,true);window.addEventListener('scroll',()=>{if(restoring||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;replace();});},{passive:true});window.addEventListener('popstate',ev=>restore(ev.state));window.addEventListener('keydown',ev=>{if(ev.altKey&&['ArrowLeft','ArrowRight'].includes(ev.key)){ev.preventDefault();ev.key==='ArrowLeft'?history.back():history.forward();}});window.animeManager?.onNavigation?.(d=>d==='back'?history.back():history.forward());current=document.body.dataset.studioView||'library';replace();}
window.ALM_NAV={sync};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
