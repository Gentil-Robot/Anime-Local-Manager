(() => {
  'use strict';
  const D=window.ALM_DESIGN,$=id=>document.getElementById(id),e=D.escape,t=D.t;
  const tr=key=>window.ALM_RETOUCHES.t(key);
  let results=[],selected=null,serial=0,detailSerial=0,controller;
  const title=i=>window.ALM_TITLES.title(i);
  const safe=v=>window.safeUrlV2(v);
  const same=window.ALM_COLLECTION.same;
  const already=i=>window.ALM_COLLECTION.find(i);
  const detailViews=new Map(),detailVersions=new Map(),addChoices=new Map(),detailActions=new Map();
  const number=v=>v!==''&&v!=null&&Number.isFinite(Number(v))?new Intl.NumberFormat(D.language(),{maximumFractionDigits:2}).format(Number(v)):'—';
  const date=v=>{if(!v)return '';const d=new Date(String(v).slice(0,10)+'T12:00:00Z');return Number.isNaN(d.valueOf())?'':new Intl.DateTimeFormat(D.language(),{dateStyle:'medium',timeZone:'UTC'}).format(d);};
  const duration=v=>{const match=String(v||'').match(/^([\d.]+)\s*(?:min(?:ute)?s?(?:\s*per\s*ep\.?)?)?$/i);return match?number(match[1])+' '+t('searchMin'):'';};
  const fact=(key,value)=>`<div><dt>${e(t(key))}</dt><dd>${e(value||t('searchMissing'))}</dd></div>`;
  async function request(url,options){const r=await fetch(url,options),d=await r.json();if(!r.ok){const code=String(d?.error||'');throw Error(/^ALM_LOCAL_IMAGE_(?:CONFLICT|WRITE_FAILED)$/.test(code)?t('manualImageError'):code||t('searchError'));}return d;}
  function renderResults(){
    if(window.ALM_CATALOG_ENABLED)return;
    const scroll=$("discoveryResults").scrollTop;
    const sort=$("discoverySort").value, ordered=results.map((item,index)=>({item,index}));
    ordered.sort((a,b)=>sort==="score"?Number(b.item.publicScore||0)-Number(a.item.publicScore||0):sort==="recent"?String(b.item.startDate||"").localeCompare(String(a.item.startDate||"")):sort==="alphabetical"?title(a.item).localeCompare(title(b.item),D.language()):a.index-b.index);
    $('discoveryResults').innerHTML=ordered.map(({item:i,index:n})=>`<button type="button" class="discovery-result ${same(i,selected)?'active':''}" aria-pressed="${same(i,selected)}" data-discover="${n}">${i.poster?`<img src="${e(safe(i.poster))}" alt="" loading="lazy" data-image-fallback="true">`:D.icon('image')}<span><strong translate="no">${e(title(i))}</strong><small>${e([i.type,String(i.startDate||'').slice(0,4)].filter(Boolean).join(' · '))}</small><b>★ ${e(number(i.publicScore))} / 10</b></span></button>`).join('')||`<p>${e(t('searchEmpty'))}</p>`;
    $('discoveryResults').scrollTop=scroll;
    $('discoveryResults').querySelectorAll('[data-discover]').forEach(b=>b.onclick=()=>showDetail(results[Number(b.dataset.discover)]));
  }
  async function showDetail(i,hostId='discoveryDetail'){
    const prefix=hostId==='discoveryDetail'?'discovery':hostId==='calendarDetail'?'calendar':hostId==='animePeekDetail'?'peek':'ranking',field=suffix=>$(prefix+suffix);
    if(hostId==='discoveryDetail'){selected=i;renderResults();}
    const previous=detailViews.get(hostId);if(previous&&!same(previous,i))addChoices.delete(hostId);const addStatus=addChoices.get(hostId)||'Plan to Watch';detailViews.set(hostId,i);const version=(detailVersions.get(hostId)||0)+1;detailVersions.set(hostId,version);const lang=D.language();
    const otherTitles=[...new Set([i.title,i.titleEn,i.titleJa,...(i.synonyms||[])].filter(v=>v&&v!==title(i)))];
    const malId=Number(i.malId),malLink=Number.isSafeInteger(malId)&&malId>0?`https://myanimelist.net/anime/${malId}`:'';
    const facts=[fact('searchFormat',i.type),fact('searchDates',[date(i.startDate),date(i.endDate)].filter(Boolean).join(' — ')),fact('searchStudios',(i.studios||[]).join(' · ')),fact('searchRank',i.rank?'#'+number(i.rank):''),fact('searchPopularity',i.popularity?'#'+number(i.popularity):''),fact('searchMembers',i.members?number(i.members):'')];
    if(duration(i.duration))facts.push(fact('searchDuration',duration(i.duration)));
    $(hostId).innerHTML=`<div class="discovery-detail-heading">${i.poster?`<img class="discovery-poster" src="${e(safe(i.poster))}" alt="" data-image-fallback="true">`:''}<div><h2 translate="no">${e(title(i))}</h2><div class="discovery-facts"><span>${e(t('searchScore'))}<b>★ ${e(number(i.publicScore))} / 10</b></span><span>${e(t('searchEpisodes'))}<b>${e(number(i.episodesTotal))}</b></span><span>${e(t('searchYear'))}<b>${e(String(i.startDate||'—').slice(0,4))}</b></span></div><p>${(i.genres||[]).map(g=>e(window.ALM_CONTENT_LANGUAGE?.genre(g)||g)).join(' · ')}</p><div class="discovery-detail-actions">${already(i)?`<span class="collection-confirmation">✓ ${e(window.ALM_COLLECTION.label(already(i)))}</span><button type="button" id="${prefix}Open">${e(tr("open"))}</button>`:`<div class="catalog-add"><select id="${prefix}AddStatus" aria-label="${e(tr("add"))}">${window.ALM_WATCH_STATUS.options('Plan to Watch')}</select><button type="button" class="primary" id="${prefix}Add">${e(t("searchAdd"))}</button></div>`}${malLink?`<a class="discovery-mal-link" href="${malLink}" target="_blank" rel="noopener noreferrer">${e(t('searchMal'))} ↗</a>`:''}</div></div></div><dl class="discovery-metadata">${facts.join('')}</dl>${otherTitles.length?`<details class="discovery-titles"><summary>${e(t('searchTitles'))}</summary><ul translate="no">${otherTitles.map(v=>`<li>${e(v)}</li>`).join('')}</ul></details>`:''}<section class="discovery-synopsis"><h3>${e(t('searchSynopsis'))}</h3><p id="${prefix}Synopsis">${e(i.synopsis||t('searchNoSynopsis'))}</p><small id="${prefix}TranslationNote"></small><details id="${prefix}Original" hidden><summary>${e(t('searchOriginal'))}</summary><p lang="en">${e(i.synopsis)}</p></details></section>`;
    const videos=document.createElement('section'),heading=document.createElement('h3'),links=document.createElement('div');heading.textContent=t('videoTitle');links.className='discovery-video-links';
    const videoId=String(i.trailer?.youtube_id||i.youtubeVideoId||'');
    if(/^[A-Za-z0-9_-]{11}$/.test(videoId)){const button=document.createElement('button');button.type='button';button.textContent=t('videoWatch')+' ▶';button.onclick=()=>window.ALM_VIDEO.open(videoId,title(i),button);links.append(button);}else{const empty=document.createElement('p');empty.className='muted';empty.textContent=t('videoMissing');links.append(empty);}videos.append(heading,links);$(hostId).append(videos);
    field('Open')?.addEventListener('click',()=>window.openEdit?.(already(i)));
    if(field('AddStatus')){field('AddStatus').value=addStatus;field('Add').textContent=window.ALM_ADD_LABEL(addStatus);}
    field('AddStatus')?.addEventListener('change',()=>{const value=field('AddStatus').value;addChoices.set(hostId,value);field('Add').textContent=window.ALM_ADD_LABEL(value);});
    field('Add')?.addEventListener('click',async()=>{
      const button=field('Add'),status=field('AddStatus').value;if(already(i)){showDetail(i,hostId);return;}button.disabled=true;field('AddStatus').disabled=true;
      // Completed is an explicit user declaration. Unknown episode totals remain unknown.
      const episodesSeen=status==='Completed'&&Number(i.episodesTotal)>0?String(i.episodesTotal):status==='Plan to Watch'?'0':'';
      try{const payload=await window.ALM_BETA38.preparePayload({...i,status,episodesSeen,score:'',autoInfo:false,catalogAdd:true});if(!payload){button.disabled=false;field('AddStatus').disabled=false;return;}await request('/api/animes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});await window.load();}
      catch(err){if(button.isConnected){button.disabled=false;field('AddStatus').disabled=false;}window.notifyApp?.(err.message,'error');}
    });
    const localNotebook=already(i);if(localNotebook&&window.ALM_NOTEBOOK){const b=document.createElement('button');b.type='button';b.dataset.notebookAction='open-notebook';b.dataset.id=localNotebook.id;b.dataset.notebookText='notebook';b.setAttribute('data-no-i18n','');b.textContent=window.ALM_NOTEBOOK.t('notebook');$(hostId).querySelector('.discovery-detail-actions')?.append(b);}
    detailActions.get(hostId)?.(i);
    // The shared fiche is also used by Search, Ranking and Calendar. The catalogue
    // popup already has its dedicated friend button in its personal-info area.
    const snapshot=window.ALM_COMMUNITY?.snapshot();
    if(hostId!=='animePeekDetail'&&snapshot?.connected&&Number.isSafeInteger(malId)&&malId>0&&window.ALM_COMMUNITY_MODEL?.shareAllowed(malId,snapshot.own.age)){
      const recommend=document.createElement('button');recommend.type='button';recommend.className='comm-anime-recommend';recommend.textContent=window.ALM_COMMUNITY_T('recommendFriend');
      recommend.onclick=()=>window.ALM_COMMUNITY_WORKSPACE?.recommendAnime(malId,i).catch(error=>window.ALM_COMMUNITY?.toast(window.ALM_COMMUNITY_ERROR(error),true));
      $(hostId).querySelector('.discovery-detail-actions')?.append(recommend);
    }
    if(lang==='en'||!i.synopsis)return;
    field('Synopsis').textContent=t('sourceTranslating');let data;
    try{data=hostId==='calendarDetail'&&i.calendarKey?await request('/api/calendar/synopsis?'+new URLSearchParams({key:i.calendarKey,lang})):i.malId?await request(`/api/discover/${i.malId}/synopsis?lang=${encodeURIComponent(lang)}`):{};}catch{data={};}
    if(version!==detailVersions.get(hostId)||lang!==D.language())return;
    field('Synopsis').textContent=data.text||i.synopsis;field('Synopsis').lang=data.language||'en';field('TranslationNote').textContent=t(data.translated?'searchTranslated':'searchUnavailable');field('Original').hidden=!data.translated;
  }
  async function search(){
    const q=$('discoveryQuery').value.trim();if(q.length<2)return;
    const version=++serial;controller?.abort();controller=new AbortController();const signal=controller.signal;
    selected=null;results=[];++detailSerial;detailViews.delete("discoveryDetail");detailVersions.set("discoveryDetail",(detailVersions.get("discoveryDetail")||0)+1);renderResults();$('discoveryDetail').innerHTML=`<p>${e(t('searchLoading'))}</p>`;
    $('discoveryForm').setAttribute('aria-busy','true');$('discoveryStatus').textContent=t('searchLoading');
    const receive=items=>{
      const prior=selected;results=items;const next=prior&&items.find(i=>same(i,prior));
      if(next){selected=next;renderResults();if(JSON.stringify(next)!==JSON.stringify(prior))showDetail(next);}
      else if(!prior&&items.length)showDetail(items[0]);else renderResults();
    };
    try{
      try{const local=await request('/api/discover?'+new URLSearchParams({q,online:'0'}),{signal});if(version!==serial)return;receive(local.items||[]);}catch(err){if(err.name==='AbortError'||version!==serial)return;}
      if(version!==serial)return;$('discoveryStatus').textContent=t('searchCheckingOnline');
      try{
        const remote=await request('/api/discover?'+new URLSearchParams({q,online:'1'}),{signal});if(version!==serial)return;
        receive([...(remote.items||[]),...results.filter(i=>!(remote.items||[]).some(v=>same(v,i)))]);
        $('discoveryStatus').textContent=(remote.onlineUnavailable?t('searchOfflineResults'):t(remote.source==='online'?'searchRemote':'searchLocal'))+' · '+results.length;
      }catch(err){if(err.name==='AbortError'||version!==serial)return;$('discoveryStatus').textContent=t(results.length?'searchOfflineResults':'searchError');}
      if(!results.length)$('discoveryDetail').innerHTML=`<p>${e(t('searchEmpty'))}</p>`;
    }finally{if(version===serial)$('discoveryForm').setAttribute('aria-busy','false');}
  }
  window.ALM_FORM={
    sync(){const manual=$('manualMode').checked;$('manualFields').hidden=!manual;$('autoInfo').disabled=manual;if(manual)$('autoInfo').checked=false;},
    reset(i){$('manualMode').checked=false;$('autoInfo').checked=true;for(const [field,key]of [['manualPosterUrl','poster'],['manualSynopsis','synopsis'],['manualPublicScore','publicScore'],['manualRank','rank']])$(field).value=i?.[key]||'';$('manualPosterFile').value='';$('manualPosterPreview').hidden=true;this.sync();},
    async payload(){let poster=$('manualPosterUrl').value.trim();const f=$('manualPosterFile').files?.[0];if(f){const data=new FormData();data.append('file',f);poster=(await request('/api/local-images',{method:'POST',body:data})).poster;}return {poster,synopsis:$('manualSynopsis').value,publicScore:$('manualPublicScore').value,rank:$('manualRank').value};}
  };
  function init(){
    if(!window.ALM_CATALOG_ENABLED)$('navDiscovery').onclick=()=>{window.showV2Page('discoveryPage','navDiscovery');$('discoveryQuery').focus({preventScroll:true});};
    if(!window.ALM_CATALOG_ENABLED)$('discoverySort').onchange=renderResults;
    if(!window.ALM_CATALOG_ENABLED)$('discoveryForm').onsubmit=ev=>{ev.preventDefault();search();};$('manualMode').onchange=()=>window.ALM_FORM.sync();
    $('manualPosterFile').onchange=()=>{const f=$('manualPosterFile').files?.[0],img=$('manualPosterPreview');if(img.dataset.blob)URL.revokeObjectURL(img.dataset.blob);img.hidden=!f;if(f){img.dataset.blob=URL.createObjectURL(f);img.src=img.dataset.blob;}};
    window.addEventListener('alm:collection-changed',()=>{for(const [host,i]of detailViews)showDetail(i,host);});
    const language=()=>{const sort=$('discoverySort').value||'relevance';$('discoverySortLabel').textContent=tr('sort');$('discoverySort').innerHTML=['relevance','score','recent','alphabetical'].map(k=>`<option value="${k}">${e(tr(k))}</option>`).join('');$('discoverySort').value=sort;$('discoveryQuery').placeholder=t('searchPlaceholder');renderResults();for(const [host,i]of detailViews)showDetail(i,host);};window.addEventListener('alm:language-changed',language);language();
  }
  window.addEventListener('alm:titles-changed',()=>{renderResults();for(const [host,i]of detailViews)showDetail(i,host);});window.ALM_DISCOVERY={search,showDetail,setDetailActions(host,handler){if(handler)detailActions.set(host,handler);else detailActions.delete(host);},forgetDetail(host){detailActions.delete(host);detailViews.delete(host);detailVersions.set(host,(detailVersions.get(host)||0)+1);addChoices.delete(host);}};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
