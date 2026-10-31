(()=>{
  'use strict';
  const $=id=>document.getElementById(id),D=window.ALM_DESIGN,t=D.t,e=D.escape;
  let currentKey='',returnFocus=null;
  const progress=g=>(g.progressUnknown?'?':g.seen)+' / '+(g.total||'?')+((g.unknown||g.gaps.length)&&g.total?' + ?':'');
  function statusControl(item,season,value){
    const label=document.createElement('label');label.className='series-status-control';
    const text=document.createElement('span');text.textContent=t('seriesStatus');
    const select=document.createElement('select');select.dataset.seasonStatus=String(season);
    const empty=document.createElement('option');empty.value='';empty.textContent=t('seriesChooseStatus');select.append(empty);
    select.insertAdjacentHTML('beforeend',window.ALM_WATCH_STATUS.options());
    select.value=value||'';select.setAttribute('aria-label',t('seriesStatus')+' '+(season?'S'+season:(window.ALM_TITLES?.title(item)||item.title)));
    select.onchange=async()=>{
      if(!select.value)return;select.disabled=true;
      try{
        const response=await fetch('/api/animes/'+encodeURIComponent(item.id)+'/season-status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({season,status:select.value})});
        const result=await response.json();if(!response.ok)throw Error(result.error||'HTTP '+response.status);
        await window.reloadAnimeLibrary();
        const replacement=$('seriesContents').querySelector('[data-anime-id="'+item.id+'"] [data-season-status="'+season+'"]');replacement?.focus({preventScroll:true});
      }catch(error){select.value=value||'';window.notifyApp?.(error.message,'error');}
      finally{select.disabled=false;}
    };
    label.append(text,select);return label;
  }
  function open(key,focus){
    const group=window.ALM_SERIES.groups(window._almAnimes||[]).find(g=>g.key===key);if(!group)return;
    currentKey=key;returnFocus=focus||returnFocus||document.activeElement;
    const dialog=$('seriesDialog'),host=$('seriesContents'),scrollTop=dialog.open?host.scrollTop:0;
    const sameGroup=host.dataset.groupKey===key;
    const openRanges=new Set([...host.querySelectorAll('details[data-season-range][open]')].map(d=>d.dataset.seasonRange));
    host.dataset.groupKey=key;
    $('seriesTitle').textContent=group.title;
    $('seriesSummary').textContent=t('seriesProgress',{value:progress(group)})+' · '+window.ALM_SERIES.summary(group,t);
    host.replaceChildren();
    if(group.unallocated){const p=document.createElement('p');p.className='series-gap';p.textContent=t('seriesUnallocated',{count:group.unallocated});host.append(p);}
    const root=group.seasons[0]||group.items[0];
    function section(items,label,parent=host){
      if(!items.length)return;
      const heading=document.createElement('h3');heading.textContent=t(label);parent.append(heading);
      for(const item of items){
        const s=window.ALM_SERIES.slot(item),row=document.createElement('article');row.className='series-season-row';row.dataset.animeId=item.id;
        const ownPoster=item.poster||item.imageUrl,poster=ownPoster||group.poster;
        const sourceSeason=item.betaseriesProgressScope==='season-marker'?Number(String(item.betaseriesEpisode||'').match(/^S(\d+)E/i)?.[1]):0;
        const number=sourceSeason?'S'+sourceSeason+' · BetaSeries':s.number?(item.betaseriesId||item.betaseriesSeriesId?t('seriesImportedSeason',{season:s.number}):'S'+s.number):(s.part||item===group.seasons[0])?'S1':'—';
        row.innerHTML=(poster?'<img loading="lazy" decoding="async" src="'+e(poster)+'" alt="" data-image-fallback="true">':'')+'<div><strong>'+e(label==='seriesSeasons'?number+(s.part?' · '+t('seriesPart',{part:s.part}):''):item.type||'')+'</strong><span translate="no">'+e(window.ALM_TITLES?.title(item)||item.title)+'</span><small>'+e((item.progressUnresolved?'?':item.episodesSeen||'0')+' / '+(item.episodesTotal||'?'))+'</small>'+(item.betaseriesProgressScope==='season-marker'?'<small>'+e(t('seriesImportedPosition',{position:item.betaseriesEpisode}))+'</small>':'')+(item.needsSequelCheck?'<small class="series-gap">'+e(t(item.unallocatedEpisodes?'progressImported':'seriesUnresolved'))+'</small>':'')+(!ownPoster&&poster?'<small>'+e(t('seriesPosterFallback'))+'</small>':'')+'</div><button type="button" class="series-open-season">'+e(t('seriesOpenSeason'))+'</button>';
        if(item.betaseriesEpisode&&item.betaseriesProgressScope!=='season-marker'){
          const imported=document.createElement('small');imported.className='series-import-reference';imported.textContent=t('seriesImportReference',{position:item.betaseriesEpisode});row.querySelector('div').append(imported);
        }
        if(item.seriesReference?.status==='provisional'){
          const pending=document.createElement('small');pending.className='series-reference-pending';pending.textContent=t('seriesReferencePending');row.querySelector('div').append(pending);
        }
        row.querySelector('div').append(statusControl(item,0,item.status));
        row.querySelector('button').onclick=()=>{dialog.close();window.openEdit(item);};parent.append(row);
      }
    }
    const active=group.active,earlier=group.seasons.filter(item=>item!==active);
    if(group.sourceSeason){
      const hint=document.createElement('p');hint.className='series-provider-hint';hint.textContent=t('seriesProviderHint');host.append(hint);
      for(const range of window.ALM_SERIES.providerRanges(group)){
        const details=document.createElement('details');details.className='series-earlier series-provider-range';details.dataset.seasonRange=String(range.from);
        details.open=sameGroup?openRanges.has(String(range.from)):range.to===group.sourceSeason;
        const summary=document.createElement('summary');summary.textContent=range.from===range.to?t('seriesSeasonSingle',{season:range.from}):t('seriesSeasonRange',{from:range.from,to:range.to});details.append(summary);
        for(const season of range.seasons){
          const item=group.seasons.find(a=>Number(String(a.betaseriesEpisode||'').match(/^S(\d+)E/i)?.[1])===season)||root;
          const row=document.createElement('article');row.className='series-missing-row series-provider-season';row.dataset.animeId=item.id;
          const label=document.createElement('div'),name=document.createElement('strong'),position=document.createElement('small');name.textContent='S'+season;
          position.textContent=season===group.sourceSeason?t('seriesImportedPosition',{position:item.betaseriesEpisode}):t('seriesProviderUnknown');label.append(name,position);
          row.append(label,statusControl(item,season,group.gapStatuses[season]||(season===group.sourceSeason?item.status:'')));details.append(row);
        }
        host.append(details);
      }
      const button=document.createElement('button');button.type='button';button.className='series-open-detail';button.textContent=t('seriesOpenRecord');
      button.onclick=()=>window.ALM_CATALOG.openRecords([root],0,button);host.append(button);
    }else if(group.seasons.length>8){
      section(active?[active]:[],'seriesSeasons');
      const details=document.createElement('details');details.className='series-earlier';const summary=document.createElement('summary');summary.textContent=t('seriesEarlier',{count:earlier.length});details.append(summary);section(earlier,'seriesSeasons',details);host.append(details);
    }else section(group.seasons,'seriesSeasons');
    if(group.gaps.length){
      const details=document.createElement('details');details.className='series-earlier';details.open=group.gaps.length<=4;
      const summary=document.createElement('summary');summary.textContent=t('seriesGapDetails',{count:group.gaps.length});details.append(summary);
      for(const gap of group.gaps){const row=document.createElement('article');row.className='series-missing-row';row.dataset.animeId=root.id;const p=document.createElement('span');p.textContent=t(group.gapStatuses[gap]?'seriesGapSaved':'seriesGap',{season:gap});row.append(p,statusControl(root,gap,group.gapStatuses[gap]));details.append(row);}
      host.append(details);
    }
    section(group.extras,'seriesExtras');
    const recovery=group.items.flatMap(a=>a.importRecoveryRecords||[]);
    if(recovery.length){
      const history=document.createElement('details');history.className='series-earlier';
      const summary=document.createElement('summary');summary.textContent=t('seriesImportHistory',{count:recovery.length});history.append(summary);
      const hint=document.createElement('p');hint.textContent=t('seriesImportHistoryHint');history.append(hint);
      for(const old of recovery){const row=document.createElement('p');row.textContent=[old.title,old.betaseriesEpisode,old.episodesSeen+' / '+(old.episodesTotal||'?'),old.notes].filter(Boolean).join(' · ');row.setAttribute('translate','no');history.append(row);}host.append(history);
    }
    host.scrollTop=scrollTop;
    if(!dialog.open){dialog.showModal();$('seriesClose').focus();}
    window.ALM_SCROLL_PROGRESS?.refresh?.();
  }
  function init(){
    const dialog=document.createElement('dialog');dialog.id='seriesDialog';dialog.className='series-dialog';dialog.setAttribute('data-no-i18n','');dialog.setAttribute('aria-labelledby','seriesTitle');
    dialog.innerHTML='<header><div><h2 id="seriesTitle" translate="no"></h2><p id="seriesSummary"></p></div><button type="button" id="seriesClose"></button></header><div id="seriesContents"></div><footer><button type="button" id="seriesFooterClose"></button></footer>';
    document.body.append(dialog);for(const id of ['seriesClose','seriesFooterClose'])$(id).onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});});
    const fields=document.createElement('section');fields.className='series-form-fields';fields.setAttribute('data-no-i18n','');
    fields.innerHTML='<label><span data-design-text="seriesGroupLabel"></span><input id="seriesGroupTitle" type="text" maxlength="300"></label><label><span data-design-text="seriesSeasonLabel"></span><input id="seriesSeasonNumber" type="number" min="1" max="100"></label><label class="check"><input id="seriesSeparate" type="checkbox"><span data-design-text="seriesSeparate"></span></label>';
    $('notes').closest('label').after(fields);
    const view=document.createElement('label');view.className='series-view-toggle check';view.setAttribute('data-no-i18n','');view.innerHTML='<input id="seriesView" type="checkbox"><span data-design-text="seriesView"></span>';
    $('sort').closest('.filters')?.append(view);if(!view.isConnected)$('sort').parentElement.after(view);
    $('seriesView').checked=D.storage.get('alm.series.view','grouped')!=='seasons';$('seriesView').onchange=()=>{D.storage.set('alm.series.view',$('seriesView').checked?'grouped':'seasons');window.render();};
    const translate=()=>{D.applyText(fields);D.applyText(view);$('seriesClose').textContent=t('closeDetail');$('seriesFooterClose').textContent=t('closeDetail');if(dialog.open)open(currentKey,returnFocus);};
    window.addEventListener('alm:language-changed',translate);window.addEventListener('alm:collection-changed',()=>{if(dialog.open)open(currentKey,returnFocus);});translate();
  }
  window.ALM_SERIES_UI={open,progress};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

