(() => {
 'use strict';const D=window.ALM_DESIGN,$=id=>document.getElementById(id),e=D.escape,t=D.t;
 let services=[],busy=new Set(),running=false,done=0,loaded=false;
 const states={retired:'apiRetired',available:'apiAvailable',unconfigured:'apiUnconfigured',limited:'apiLimited',denied:'apiDenied',invalid:'apiInvalid',timeout:'apiTimeout',network:'apiNetwork',unavailable:'apiUnavailable',redirect:'apiRedirect'};
 const stamp=v=>v?new Intl.DateTimeFormat(D.language(),{dateStyle:'short',timeStyle:'medium'}).format(new Date(v)):'';
 function paint(){
  const output=$('apiServiceResults');if(!output)return;
  output.innerHTML=['metadata','translation','news'].map(group=>`<section class="service-group"><h3>${e(t({metadata:'apiMetadata',translation:'apiTranslation',news:'apiNews'}[group]))}</h3>${services.filter(s=>s.group===group).map(s=>{const r=s.last,state=r?.state||(s.retired?'retired':!s.configured?'unconfigured':'idle');return `<article class="service-row" data-service="${e(s.id)}"><div><strong>${e(s.name)}</strong>${s.lang?` <small lang="en">${e(s.lang)}</small>`:''}<small class="service-time">${r?.checkedAt?e(t('apiLastCheck')+' · '+stamp(r.checkedAt)):''}</small></div><div class="service-result"><span class="service-badge" data-state="${busy.has(s.id)?'running':e(state)}">${e(t(busy.has(s.id)?'apiTesting':states[state]||'apiIdle'))}</span><small>${r?.httpStatus?'HTTP '+e(r.httpStatus)+' · ':''}${r?.latencyMs!=null?e(t('apiLatency')+' '+new Intl.NumberFormat(D.language()).format(r.latencyMs)+' ms'):''}${r?.cached?' · '+e(t('apiCached')):''}</small></div><button type="button" data-test-service="${e(s.id)}" ${busy.has(s.id)||running?'disabled':''} aria-label="${e(t('apiTest')+' '+s.name)}">${e(t('apiTest'))}</button></article>`;}).join('')}</section>`).join('');
  output.querySelectorAll('[data-test-service]').forEach(b=>b.onclick=()=>testOne(b.dataset.testService));
  $('apiTestAll').disabled=running||busy.size>0||!services.length;$('apiExport').disabled=busy.size>0||!services.some(s=>s.last);
  $('apiProgress').textContent=running?t('apiProgress',{done,total:services.length}):done?t('apiCompleted')+' · '+t('apiProgress',{done,total:services.length}):'';
 }
 async function fetchJson(url,options){const r=await fetch(url,options);if(!r.ok)throw Error();return r.json();}
 async function load(){try{const data=await fetchJson('/api/services');services=data.services||[];loaded=true;paint();}catch{$('apiServiceResults').textContent=t('apiLoadError');$('apiTestAll').disabled=false;}}
 async function testOne(id){if(busy.has(id))return;busy.add(id);paint();try{const result=await fetchJson('/api/services/'+encodeURIComponent(id)+'/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({force:true})});const item=services.find(s=>s.id===id);if(item)item.last=result;}catch{const item=services.find(s=>s.id===id);if(item)item.last={state:'network',checkedAt:new Date().toISOString()};}finally{busy.delete(id);if(running)done++;paint();}}
 async function testAll(){if(running||busy.size)return;if(!loaded)await load();if(!services.length)return;running=true;done=0;paint();const queue=services.map(s=>s.id);await Promise.all(Array.from({length:3},async()=>{while(queue.length)await testOne(queue.shift());}));running=false;paint();}
 function init(){
  const main=document.querySelector('#settingsDialog .settings-main');if(!main||$('settingsSections'))return;
  const settings=$('settingsDialog'),grid=main.parentElement,help=grid.querySelector('.settings-help');
  const definitions=[['account','myAccount','settings','#commAccountPlaceholder'],['language','languageInterface','compass','#almLanguageSettings'],['appearance','appearance','moon','.studio-preferences'],['library','settingsLibrary','library','#metadataSettingsStatus'],['backup','settingsBackup','import','#exportBackup'],['restoration','restoration','import','#beta42RestorationPlaceholder'],['connections','settingsConnections','compass','#betaseriesApiKey'],['maintenance','settingsMaintenance','settings','#clearNewsCache'],['updates','updateTitle','import','#almUpdateCheck']];
  const nav=document.createElement('nav');nav.id='settingsSections';nav.setAttribute('role','tablist');nav.setAttribute('aria-orientation','vertical');nav.dataset.designAria='settingsNavigation';
  const select=(key,focus=false)=>{for(const [id]of definitions){const active=id===key,button=$('settingsTab-'+id);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$('settingsPanel-'+id).hidden=!active;}if(key==='connections'&&!loaded)load();if(key==='account')window.ALM_COMMUNITY_WORKSPACE?.renderAccount();if(key==='maintenance'){$('settingsPanel-maintenance').querySelectorAll('details').forEach(d=>d.open=true);window.dispatchEvent(new Event('alm:diagnostic-refresh'));}if(focus)$('settingsTab-'+key).focus();};
  for(const [key,label,icon,selector]of definitions){
   const old=main.querySelector(selector),section=old?.closest('details.settings-disclosure');
   const button=document.createElement('button');button.type='button';button.id='settingsTab-'+key;button.setAttribute('role','tab');button.setAttribute('aria-controls','settingsPanel-'+key);button.innerHTML=D.icon(icon)+`<span data-design-text="${label}" data-no-i18n></span>`;button.onclick=()=>select(key);nav.append(button);
   const panel=document.createElement('section');panel.id='settingsPanel-'+key;panel.className='settings-tab-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panel.tabIndex=0;
   panel.innerHTML=`<h2 data-design-text="${label}" data-no-i18n></h2>`;
   if(section){if(key!=='connections'){section.open=true;section.classList.add('settings-primary-section');}panel.append(section);}
   if(key==='account')panel.insertAdjacentHTML('beforeend','<section id="commAccountSettings" data-no-i18n></section>');if(key==='maintenance'&&$('almDiagnostics'))panel.append($('almDiagnostics'));
   main.append(panel);
  }
  nav.addEventListener('keydown',ev=>{const tabs=[...nav.querySelectorAll('[role=tab]')].filter(button=>!button.disabled&&!button.hidden),index=tabs.indexOf(document.activeElement);if(index<0)return;let next;if(['ArrowDown','ArrowRight'].includes(ev.key))next=(index+1)%tabs.length;else if(['ArrowUp','ArrowLeft'].includes(ev.key))next=(index+tabs.length-1)%tabs.length;else if(ev.key==='Home')next=0;else if(ev.key==='End')next=tabs.length-1;if(next!==undefined){ev.preventDefault();tabs[next].click();tabs[next].focus();}});
  const placeLanguage=()=>{const section=$('almLanguageSettings'),panel=$('settingsPanel-language');if(section&&section.parentElement!==panel){section.open=true;panel.append(section);}};
  placeLanguage();new MutationObserver(placeLanguage).observe(main,{childList:true});
  const rail=document.createElement('div');rail.className='settings-nav-rail';rail.append(nav);
  if(help){help.innerHTML='<img src="/assets/design/aster-cat.webp" alt="" loading="lazy"><span>Aster</span>';rail.append(help);}grid.prepend(rail);
  const panel=$('settingsPanel-connections'),diagnostic=document.createElement('div');diagnostic.className='services-diagnostic';diagnostic.setAttribute('data-no-i18n','');diagnostic.innerHTML='<p data-design-text="settingsConnectionsIntro"></p><div class="services-toolbar"><button type="button" id="apiTestAll" class="primary" data-design-text="apiTestAll"></button><button type="button" id="apiExport" data-design-text="apiExport" disabled></button></div><p id="apiProgress" role="status" aria-live="polite"></p><div id="apiServiceResults"></div><p class="muted" data-design-text="apiUnavailableHelp"></p>';
  panel.querySelector('h2').after(diagnostic);$('apiTestAll').onclick=testAll;
  $('apiExport').onclick=async()=>{const report=await window.ALM_SUPPORT.build(),url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ALM-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const footer=settings.querySelector('form > menu');footer.querySelector('button[type=submit]')?.remove();const note=document.createElement('small');note.dataset.designText='settingsFooter';note.setAttribute('data-no-i18n','');footer.prepend(note);
  $('settingsForm').addEventListener('submit',ev=>ev.preventDefault());
  window.addEventListener('alm:language-changed',paint);window.addEventListener('alm:providers-changed',load);select('appearance');D.applyText();
  // Only the catalog is loaded on demand. External checks always require a click.
  window.ALM_SETTINGS={select,testAll};
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
