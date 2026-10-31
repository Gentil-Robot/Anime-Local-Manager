/* Private, read-only view of local notebooks. Filtering never changes saved notes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = (key, vars) => window.ALM_NOTEBOOK?.t(key, vars) || key;
  const locale = () => window.ALM_I18N?.getLanguage?.() || document.documentElement?.lang || 'fr';
  const title = row => window.ALM_TITLES?.title(row) || row.title || '';
  const statusValue = value => window.ALM_WATCH_STATUS?.normalize(value) ?? (value==='On Hold'?'On-Hold':value);
  const textKey = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase(locale()).replace(/\s+/g,' ').trim();
  const value = id => $(id)?.value || '';
  const PER_PAGE = 24;
  const excerpt = value => {const text=String(value||'');return text.length>600?text.slice(0,600).replace(/[\uD800-\uDBFF]$/,'').trimEnd()+'…':text;};
  let rows = [], prepared = [], visibleRows = [], page = 1, filteredCount = 0, filterKey = '', requestVersion = 0, controller = null, loading = false;
  const array = value => Array.isArray(value) ? value : [];
  function releaseDate(row) {
    const raw = String(row.startDate || row.year || '').trim();
    if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(raw)) return '';
    const year = Number(raw.slice(0,4));
    if (year < 1900 || year > 9998) return '';
    if (raw.length > 4) {
      const full = raw.length === 7 ? raw+'-01' : raw;
      const date = new Date(full+'T12:00:00Z');
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== full) return '';
    }
    return raw;
  }
  function prepare() {
    // Legacy machine notes have no provenance field. Recognise exact ALM
    // templates only. A sequel's source must still match a known title;
    // ambiguous text, including "Saison 1/2", remains a personal comment.
    const knownTitles = new Set(rows.flatMap(row => [row.title,row.titleEn,row.titleJa,...Object.values(row.localizedTitles||{})]).filter(Boolean).map(textKey));
    prepared = rows.map(row => {
      const automatic = [], kept = [], tags = array(row.tags).map(textKey);
      const seasonTag = tags.some(tag => ['nouvelle saison','contenu lie','recommandation'].includes(tag));
      for (const line of String(row.notes || '').split(/\r?\n/)) {
        const clean = line.trim();let origin = '';
        if (/^Ajouté depuis Recommandations\.$/.test(clean)) origin = 'originRecommendation';
        else if (/^Ajouté depuis Nouvelles saisons\.$/.test(clean)) origin = 'originSequel';
        else {
          const match = /^(?:Suite détectée depuis|Suite liée à) : (.+)$/.exec(clean);
          if (match && seasonTag) {
            const parts = match[1].split(' • '), source = textKey(parts[0]);
            const relation = parts.length === 1 || (parts.length === 2 && /^(?:sequel|prequel|side story|parent story|full story|summary|alternative (?:version|setting)|other|suite|préquelle|histoire parallèle)$/i.test(parts[1]));
            if (relation && (knownTitles.has(source) || (row.sourceTitle && textKey(row.sourceTitle) === source))) origin = 'originSequel';
          }
        }
        if (origin) automatic.push({text:line,origin});else kept.push(line);
      }
      const note = kept.join('\n').trim(), journal = row.personalJournal || {}, date = releaseDate(row);
      return {row,note,automatic,date,releaseYear:date.slice(0,4),episodes:array(journal.episodes),awards:array(journal.awards),genres:array(row.genres).filter(v=>typeof v==='string')};
    });
  }
  function fillSelect(id, options, emptyKey) {
    const select = $(id);if (!select) return;
    const old = select.value;
    select.innerHTML = `<option value="">${escape(t(emptyKey))}</option>` + options.map(([id,label])=>`<option value="${escape(id)}">${escape(label)}</option>`).join('');
    select.value = options.some(([id])=>String(id)===old) ? old : '';
  }
  function fillFilters() {
    const compare = new Intl.Collator(locale(),{numeric:true,sensitivity:'base'}).compare;
    const memories = prepared.filter(item=>item.note || item.automatic.length || item.episodes.length || item.awards.length);
    fillSelect('memoryPageNotebook',memories.map(item=>[String(item.row.id),title(item.row)]).sort((a,b)=>compare(a[1],b[1])),'allNotebooks');
    fillSelect('memoryPageGenre',[...new Set(memories.flatMap(item=>item.genres))].sort(compare).map(genre=>[genre,window.ALM_CONTENT_LANGUAGE?.genre(genre)||genre]),'allGenres');
    fillSelect('memoryPageReleaseYear',[...new Set(memories.map(item=>item.releaseYear).filter(Boolean))].sort((a,b)=>Number(b)-Number(a)).map(year=>[year,year]),'allYears');
    fillSelect('memoryPageYear',[...new Set(memories.flatMap(item=>item.awards.map(award=>Number(award.year))).filter(year=>Number.isInteger(year)&&year>=1900&&year<=9998))].sort((a,b)=>b-a).map(year=>[String(year),year]),'allYears');
    window.ALM_SELECTS?.refresh();
  }
  function cover(row) {
    const raw = String(row.poster || row.imageUrl || '').trim();
    if (!raw) return '';
    const safe = typeof window.safeUrlV2 === 'function' ? window.safeUrlV2(raw) : (/^\/(?:images|assets)\/[a-z0-9_./% -]+$/i.test(raw) ? raw : '');
    if (!safe || safe === '#') return '';
    const malId = Number(row.malId);
    // Reuse the library's bounded local cover cache, never a new image fetch per filter.
    const cached = Number.isSafeInteger(malId) && malId > 0 && /^https:\/\/(?:cdn\.myanimelist\.net|s4\.anilist\.co|static\.tvmaze\.com|media\.kitsu\.io)\//i.test(safe);
    return `<img src="${escape(cached ? '/api/cover-cache/'+malId : safe)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"${cached?' data-alm-managed-cover="1"':''} data-image-fallback="true">`;
  }
  function entry(item) {
    const {row,note,episodes,awards,automatic} = item, id = Number(row.id), name = title(row);
    const origin = [...new Set(item.origins)].map(key=>t(key)).join(' · ') || t('originPersonal');
    const facts = [statusValue(row.status)?t('status_'+statusValue(row.status)):'',row.type,item.releaseYear].filter(Boolean);
    const more=Math.max(0,episodes.length-3)+Math.max(0,awards.length-3)+Math.max(0,automatic.length-3);
    const content = [note?`<p class="memory-card-note">${escape(excerpt(note))}</p>`:'',
      episodes.slice(0,3).map(episode=>`<details class="memory-card-episode"><summary>${escape(t('episode'))} ${escape(episode.number)}${episode.title?' · '+escape(episode.title):''}${episode.score?' · ★ '+escape(episode.score)+'/10':''}</summary><p class="notebook-text">${escape(excerpt(episode.text))}</p></details>`).join(''),
      awards.slice(0,3).map(award=>`<p class="memory-card-award">✦ ${escape(award.year)} · ${escape(t(award.kind==='anime'?'animeAward':'episodeAward'))}${award.episode?' · '+escape(t('episode'))+' '+escape(award.episode):''}${award.text?' — '+escape(excerpt(award.text)):''}</p>`).join(''),
      automatic.length?`<details class="memory-card-automatic"><summary>${escape(t('automaticNote'))} · ${automatic.length}</summary>${automatic.slice(0,3).map(item=>`<p class="notebook-text">${escape(excerpt(item.text))}</p>`).join('')}</details>`:'',
      more?`<p class="memory-page-hint">${escape(t('moreInNotebook',{count:more}))}</p>`:''].join('');
    return `<article class="memory-card" data-memory-id="${id}"><div class="memory-card-head"><button type="button" class="memory-card-cover" data-memory-detail="${id}" aria-label="${escape(t('openAnime',{title:name}))}"><span aria-hidden="true">✧</span>${cover(row)}</button><div class="memory-card-heading"><h2><button type="button" class="memory-card-title" data-memory-detail="${id}" translate="no">${escape(name)}</button></h2><small>${facts.map(escape).join(' · ')}</small><span class="memory-card-origin">${escape(origin)}</span></div></div><div class="memory-card-content">${content}</div><button type="button" data-memory-open="${id}">${escape(t('editMemory'))}</button></article>`;
  }
  function update() {
    if (!$('memoryPageEntries') || loading) return;
    const query = textKey(value('memoryPageSearch')), year = Number(value('memoryPageYear'))||0, kind = value('memoryPageFilter')||'all', status = value('memoryPageStatus'), notebook = value('memoryPageNotebook'), genre = value('memoryPageGenre'), releaseYear = value('memoryPageReleaseYear'), sort = value('memoryPageSort')||'az', showAutomatic = !!$('memoryPageAutomatic')?.checked;
    const key = JSON.stringify([query,year,kind,status,notebook,genre,releaseYear,sort,showAutomatic]);
    if (key !== filterKey) {filterKey=key;page=1;}
    let hiddenAutomatic = 0;
    visibleRows = prepared.flatMap(item=>{
      if (status && statusValue(item.row.status) !== status || notebook && String(item.row.id)!==notebook || genre && !item.genres.includes(genre) || releaseYear && item.releaseYear!==releaseYear) return [];
      const chosenAwards = year ? item.awards.filter(award=>Number(award.year)===year) : item.awards;
      if (year && !chosenAwards.length) return [];
      const note = kind==='all'||kind==='notes' ? item.note : '', episodes = kind==='all'||kind==='episodes' ? item.episodes : [], awards = kind==='all'||kind==='awards' ? chosenAwards : [], automatic = showAutomatic&&(kind==='all'||kind==='automatic') ? item.automatic : [];
      const searchParts = [item.row.title,item.row.titleEn,item.row.titleJa,...Object.values(item.row.localizedTitles||{}),note,...episodes.flatMap(v=>[v.title,v.text,v.number]),...awards.flatMap(v=>[v.text,v.year])];
      // Count annotations that this same selection/search could reveal. A query
      // with no matches must not advertise unrelated hidden notebooks.
      if (!showAutomatic && kind==='all' && item.automatic.length && (!query || textKey([...searchParts,...item.automatic.map(v=>v.text)].join(' ')).includes(query))) hiddenAutomatic += item.automatic.length;
      if (!note && !episodes.length && !awards.length && !automatic.length) return [];
      if (query) {
        const haystack = textKey([...searchParts,...automatic.map(v=>v.text)].join(' '));
        if (!haystack.includes(query)) return [];
      }
      return [{...item,note,episodes,awards,automatic,origins:item.automatic.map(v=>v.origin).concat(note||episodes.length||awards.length?['originPersonal']:[])}];
    });
    const compare = new Intl.Collator(locale(),{numeric:true,sensitivity:'base'}).compare;
    visibleRows.sort((a,b)=>{
      if (sort==='newest'||sort==='oldest') {
        if (!!a.date !== !!b.date) return a.date ? -1 : 1;
        const chronological = a.date.localeCompare(b.date)*(sort==='newest'?-1:1);
        if (chronological) return chronological;
      }
      return compare(title(a.row),title(b.row))*(sort==='za'?-1:1) || Number(a.row.id)-Number(b.row.id);
    });
    filteredCount=visibleRows.length;
    const counts=visibleRows.reduce((count,item)=>({notes:count.notes+(item.note?1:0),episodes:count.episodes+item.episodes.length,awards:count.awards+item.awards.length,automatic:count.automatic+item.automatic.length}),{notes:0,episodes:0,awards:0,automatic:0});
    const pages=Math.max(1,Math.ceil(filteredCount/PER_PAGE));page=Math.max(1,Math.min(page,pages));
    $('memoryPageSummary').textContent=filteredCount+' · '+t('summary',counts)+(counts.automatic?' · '+t('automaticSummary',{count:counts.automatic}):'');
    $('memoryPageEntries').innerHTML=filteredCount?visibleRows.slice((page-1)*PER_PAGE,page*PER_PAGE).map(entry).join(''):`<div class="memory-page-empty"><span aria-hidden="true">✧</span><p>${escape(t('empty'))}</p></div>`;
    // Keep failed managed covers connected: beta45 owns the bounded same-origin
    // retry after reconnect. The placeholder remains behind the hidden image.
    $('memoryPageEntries').querySelectorAll('.memory-card-cover img').forEach(img=>img.addEventListener('error',()=>{if(img.dataset.almManagedCover!=='1')img.remove();},{once:true}));
    const stats=$('memoryPageStats');if(stats)stats.innerHTML=[['withNotes',counts.notes],['withEpisodes',counts.episodes],['withAwards',counts.awards]].map(([key,n])=>`<div class="memory-stat"><strong>${n}</strong><span>${escape(t(key))}</span></div>`).join('');
    const hint=$('memoryPageAutomaticHint');if(hint)hint.textContent=hiddenAutomatic?t('hiddenAutomatic',{count:hiddenAutomatic}):t('autoHint');
    const dateHint=$('memoryPageSortHint');if(dateHint){dateHint.hidden=sort!=='newest'&&sort!=='oldest';dateHint.textContent=t('sortDateHelp');}
    $('memoryPageNumber').textContent=page+' / '+pages;
    const pager=$('memoryPagePagination');pager.hidden=pages<=1;
    for(const [kind,key]of [['first','libraryFirstPage'],['prev','libraryPreviousPage'],['next','libraryNextPage'],['last','libraryLastPage']])pager.querySelector('[data-memory-page="'+kind+'"]')?.setAttribute('aria-label',window.ALM_DESIGN?.t(key)||kind);
    pager.querySelectorAll('[data-memory-page]').forEach(button=>{button.disabled=(button.dataset.memoryPage==='first'||button.dataset.memoryPage==='prev')?page<=1:page>=pages;});
  }
  async function load() {
    if (!$('memoryPageEntries')) return;
    const version=++requestVersion;controller?.abort();controller=typeof AbortController==='function'?new AbortController():null;
    loading=true;$('memoryPageSummary').textContent=t('loading');$('memoryPageEntries').replaceChildren();$('memoryPageStats')?.replaceChildren();$('memoryPagePagination').hidden=true;$('memoryPageEntries').setAttribute('aria-busy','true');
    const retry=$('memoryPageRetry');if(retry)retry.hidden=true;
    try {
      const response=await fetch('/api/notebook',controller?{signal:controller.signal}:undefined);if(!response.ok)throw Error('NOTEBOOK_LOAD');
      const data=await response.json();if(version!==requestVersion)return;
      rows=array(data.items).filter(row=>row&&Number.isSafeInteger(Number(row.id))&&Number(row.id)>0);prepare();fillFilters();loading=false;update();
    } catch(error) {
      if(version!==requestVersion || error.name==='AbortError')return;
      rows=[];prepared=[];visibleRows=[];filteredCount=0;loading=false;$('memoryPageSummary').textContent=t('loadError');$('memoryPageEntries').replaceChildren();$('memoryPagePagination').hidden=true;if(retry)retry.hidden=false;
    } finally {if(version===requestVersion)$('memoryPageEntries').setAttribute('aria-busy','false');}
  }
  function labels() {
    document.querySelectorAll('#memoryPage [data-notebook-text],#navMemories [data-notebook-text]').forEach(node=>node.textContent=t(node.dataset.notebookText));
    $('memoryPagePagination')?.setAttribute('aria-label',t('collectionNotebook'));
  }
  function open(){window.showV2Page?.('memoryPage','navMemories');labels();return load();}
  function init() {
    labels();$('navMemories')?.addEventListener('click',open);
    for(const id of ['memoryPageSearch','memoryPageFilter','memoryPageYear','memoryPageStatus','memoryPageNotebook','memoryPageGenre','memoryPageReleaseYear','memoryPageSort','memoryPageAutomatic'])$(id)?.addEventListener('input',()=>{
      if(id==='memoryPageFilter'&&value(id)==='automatic'&&$('memoryPageAutomatic'))$('memoryPageAutomatic').checked=true;
      if(id==='memoryPageAutomatic'&&!$('memoryPageAutomatic').checked&&value('memoryPageFilter')==='automatic'){$('memoryPageFilter').value='all';window.ALM_SELECTS?.refresh();}
      update();
    });
    $('memoryPageReset')?.addEventListener('click',()=>{
      for(const id of ['memoryPageSearch','memoryPageYear','memoryPageStatus','memoryPageNotebook','memoryPageGenre','memoryPageReleaseYear'])if($(id))$(id).value='';
      $('memoryPageFilter').value='all';if($('memoryPageSort'))$('memoryPageSort').value='az';if($('memoryPageAutomatic'))$('memoryPageAutomatic').checked=false;
      // Assigning native values does not emit change; synchronise the visible
      // custom-select labels even while a notebook refresh is still pending.
      window.ALM_SELECTS?.refresh();update();
    });
    $('memoryPageRetry')?.addEventListener('click',load);
    $('memoryPageExport')?.addEventListener('click',()=>window.ALM_NOTEBOOK?.exports());
    $('memoryPagePagination')?.addEventListener('click',event=>{
      const button=event.target.closest('[data-memory-page]');if(!button||button.disabled||loading)return;
      const count=Math.max(1,Math.ceil(filteredCount/PER_PAGE)),kind=button.dataset.memoryPage;page=kind==='first'?1:kind==='last'?count:page+(kind==='prev'?-1:1);update();window.ALM_SCROLL_PROGRESS?.toStart($('memoryPage'),$('memoryPageEntries').querySelector('[data-memory-detail]'));
    });
    $('memoryPageEntries')?.addEventListener('click',event=>{
      const detail=event.target.closest('[data-memory-detail]');
      if(detail?.dataset.memoryDetail){
        const id=Number(detail.dataset.memoryDetail),index=visibleRows.findIndex(item=>Number(item.row.id)===id);if(index<0)return;
        // Existing shared anime dialog, with the exact filtered season selected.
        // Do not use openLibrary(): its current library filters may exclude this anime.
        const local=new Map(array(window._almAnimes).map(row=>[Number(row.id),row]));
        const records=visibleRows.map(item=>({...local.get(Number(item.row.id)),...item.row}));
        window.ALM_CATALOG?.openRecords(records,index,detail);return;
      }
      const button=event.target.closest('[data-memory-open]');if(button?.dataset.memoryOpen)window.ALM_NOTEBOOK?.open(Number(button.dataset.memoryOpen));
    });
    window.addEventListener('alm:collection-changed',()=>{if(!$('memoryPage')?.classList.contains('hidden'))void load();});
    window.addEventListener('alm:language-changed',()=>{labels();if(!loading){prepare();fillFilters();update();}});
  }
  window.ALM_MEMORIES_PAGE={open,refresh:load};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
