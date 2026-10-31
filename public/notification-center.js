(() => {
 'use strict';
 const D=window.ALM_DESIGN,$=id=>document.getElementById(id);
 let data={items:[],muted:false,unread:0},busy=false,refreshing=false;
 const community=()=>{const state=window.ALM_COMMUNITY?.snapshot();return state?.connected?state.notifications:null;};
 async function api(path,body){const r=await fetch('/api/notifications'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw Error('ALM_NOTIFICATION_STORE');return r.json();}
 function section(kind,key,icon){const node=document.createElement('section');node.className='notification-group';node.dataset.kind=kind;const heading=document.createElement('h3');heading.innerHTML=D.icon(icon);heading.append(document.createTextNode(D.t(key)));node.append(heading);return node;}
 function openCommunity(sectionName){$('notificationCenter').hidden=true;$('notificationBell').setAttribute('aria-expanded','false');window.ALM_COMMUNITY.open('',sectionName,sectionName==='friends'?'navFriends':'navCommunityInbox').catch(()=>window.notifyApp?.(D.t('notificationError'),'error'));}
 function paint(){
  const button=$('notificationBell'),panel=$('notificationCenter');if(!button||!panel)return;
  const pending=community(),count=Math.max(0,Number(data.unread)||0)+(pending?.requests?.length||0)+(pending?.recommendations?.length||0);
  button.innerHTML=D.icon(data.muted?'moon':'bell')+(count?'<span class="notification-badge">'+Math.min(99,count)+'</span>':'');
  button.setAttribute('aria-label',D.t('notificationCenter')+(count?' · '+count:'')+(data.muted?' · '+D.t('notificationMute'):''));
  button.title=button.getAttribute('aria-label');button.dataset.muted=String(data.muted);
  $('notificationQuiet').textContent=D.t(data.muted?'notificationResume':'notificationMute');$('notificationQuiet').setAttribute('aria-pressed',String(data.muted));
  $('notificationClear').disabled=!data.items.length;$('notificationQuietHint').hidden=!data.muted;
  const list=$('notificationList');list.replaceChildren();const calendar=section('calendar','calendarNotifications','season');
  for(const item of data.items){
   const row=document.createElement('button');row.type='button';row.className='notification-entry';
   const name=document.createElement('strong'),meta=document.createElement('small'),anime=(window._almAnimes||[]).find(a=>a.id===item.animeId);
   name.textContent=item.type==='test'?D.t('notificationTestEntry'):(anime?window.ALM_TITLES.title(anime):item.title)+' · '+D.t('airingEpisode',{episode:item.episode});
   const formatter=new Intl.DateTimeFormat(D.language(),{dateStyle:'medium',timeStyle:'short'}),format=v=>Number.isFinite(new Date(v).getTime())?formatter.format(new Date(v)):'';
   meta.textContent=(item.airingAt?D.t('notificationAired',{date:format(item.airingAt*1000)})+' · ':'')+D.t('notificationReceived',{date:format(item.createdAt)})+(item.source?' · '+item.source:'');
   row.append(name,meta);row.disabled=!anime;
   if(anime)row.onclick=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');window.showAnimesV1?.('Watching');window.openEdit(anime);$('manualMode').checked=false;window.ALM_FORM.sync();$('autoInfo').checked=true;};
   calendar.append(row);
  }
  if(!data.items.length){const p=document.createElement('p');p.textContent=D.t('notificationEmpty');calendar.append(p);}list.append(calendar);
  if(pending){
   const group=section('community','communityNotifications','heart'),requests=pending.requests||[],recommendations=pending.recommendations||[];
   if(requests.length){const row=document.createElement('button');row.type='button';row.className='notification-entry';row.textContent=D.t('friendRequestsCount',{count:requests.length});row.onclick=()=>openCommunity('friends');group.append(row);}
   if(recommendations.length){const summary=document.createElement('p');summary.textContent=D.t('recommendationsCount',{count:recommendations.length});group.append(summary);for(const item of recommendations){const row=document.createElement('button');row.type='button';row.className='notification-entry';row.textContent=item.anime?.title||D.t('receivedRecommendations');row.onclick=()=>openCommunity('inbox');group.append(row);}}
   if(!requests.length&&!recommendations.length){const p=document.createElement('p');p.textContent=D.t('notificationEmpty');group.append(p);}list.append(group);
  }
  D.applyText(panel);
 }
 async function refresh(){if(refreshing)return true;refreshing=true;try{data=await api('');paint();return true;}catch{if(!$('notificationCenter').hidden)$('notificationList').textContent=D.t('notificationError');return false;}finally{refreshing=false;}}
 function init(){
  const button=document.createElement('button');button.type='button';button.id='notificationBell';button.setAttribute('aria-controls','notificationCenter');button.setAttribute('aria-expanded','false');$('backupBtn').after(button);
  const panel=document.createElement('section');panel.id='notificationCenter';panel.className='notification-center';panel.hidden=true;panel.setAttribute('data-no-i18n','');panel.setAttribute('aria-labelledby','notificationCenterHeading');
  panel.innerHTML='<header><h2 id="notificationCenterHeading" data-design-text="notificationCenter"></h2><button type="button" id="notificationClose" data-design-text="close"></button></header><div class="notification-actions"><button type="button" id="notificationQuiet"></button><button type="button" id="notificationClear" data-design-text="notificationClearCalendar"></button></div><p id="notificationQuietHint" data-design-text="notificationMutedHint" hidden></p><div id="notificationList"></div>';
  document.body.append(panel);
  const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();};$('notificationClose').onclick=close;
  button.onclick=async()=>{if(!panel.hidden){close();return;}panel.hidden=false;button.setAttribute('aria-expanded','true');await refresh();try{data=await api('/read',{});paint();}catch{}$('notificationClose').focus();};
  document.addEventListener('click',ev=>{if(!panel.hidden&&!ev.composedPath().includes(panel)&&!ev.composedPath().includes(button))close();});
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!panel.hidden){ev.preventDefault();close();}});
  async function change(path,body){if(busy)return;busy=true;try{data=await api(path,body);paint();}catch{window.notifyApp?.(D.t('notificationError'),'error');}finally{busy=false;}}
  $('notificationQuiet').onclick=()=>change('/settings',{muted:!data.muted});$('notificationClear').onclick=()=>change('/clear',{});
  window.addEventListener('alm:language-changed',paint);window.addEventListener('alm:community-changed',paint);
  refresh();const localTimer=setInterval(refresh,15000),communityTimer=setInterval(async()=>{if(document.hidden||!window.ALM_COMMUNITY?.snapshot()?.connected)return;try{await window.ALM_COMMUNITY.refresh();}catch{}},60000);
  window.addEventListener('pagehide',()=>{clearInterval(localTimer);clearInterval(communityTimer);},{once:true});window.ALM_NOTIFICATIONS={refresh,paint};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();