/* Community pages share the same permission-aware data and profile settings. */
(() => {
  'use strict';
  const D = window.ALM_DESIGN, M = window.ALM_COMMUNITY_MODEL, S = window.ALM_COMMUNITY_SECURITY;
  const t = key => window.ALM_COMMUNITY_T(key), e = D.escape, C = () => window.ALM_COMMUNITY;
  const filters = new Map(),accountRenders=new WeakMap();
  let selectedFriend = '', selectedData = null, selectionEpoch = 0, commonOnly = false, selectionLoading = false;
  const button = (action, label, attrs = '') => `<button type="button" data-comm-action="${action}" ${attrs}>${e(t(label))}</button>`;
  const accepted = () => {
    const {friends} = C().context();
    if (!friends) return [];
    return friends.relationships.filter(r => r.status === 'accepted').map(r => {
      const id = r.requester === friends.userId ? r.recipient : r.requester;
      return friends.cards.find(p => p.id === id) || {id, display_name:'ALM'};
    });
  };
  function visit(id) {
    const owner = C().snapshot()?.user?.id;
    if (!owner || !/^[a-f0-9-]{36}$/i.test(id)) return;
    try {
      const key = 'alm-visited-libraries-' + owner;
      const values = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify([...new Set([...values, id])].slice(-1000)));
    } catch {}
  }
  function visited() {
    try { return JSON.parse(localStorage.getItem('alm-visited-libraries-' + C().snapshot()?.user?.id) || '[]').length; } catch { return 0; }
  }
  function friendLibrary() {
    const people = accepted();
    if (selectedFriend && !people.some(p => p.id === selectedFriend)) { selectedFriend = ''; selectedData = null; }
    const person = people.find(p => p.id === selectedFriend);
    const data=selectedData&&(commonOnly?{...selectedData,items:commonRows()}:selectedData);
    const commonTitle=t('commonWith').replace('{friend}',person?S.tag(person):t('chooseFriend'));
    return `<header class="comm-friend-library-header"><div><h2>${e(t('friendsLibrary'))}</h2><form id="commChooseFriend" class="comm-friend-choice"><label for="commFriendChoice">${e(t('chooseFriend'))}</label><div class="comm-actions"><input id="commFriendChoice" list="commFriendChoices" autocomplete="off" value="${e(person ? S.tag(person) : '')}" placeholder="${e(t('chooseFriend'))}" maxlength="90"><datalist id="commFriendChoices">${people.map(p => `<option value="${e(S.tag(p))}">${e(p.display_name)}</option>`).join('')}</datalist><button type="submit">${e(t('open'))}</button></div></form></div>${stats(true,true)}</header><p class="comm-help">${e(t('friendsLibraryHint'))}</p>${commonOnly?`<div class="comm-common-heading"><h3>${e(commonTitle)}</h3><button type="button" class="comm-common-back" data-comm-common-back>${e(t('commonBack'))}</button></div><p class="comm-help">${e(t('commonScope'))}</p>`:''}${data ? library(data, (commonOnly?'common:':'friend:') + selectedFriend) : `<p class="comm-help" role="status">${e(t(selectionLoading?'running':people.length?'chooseFriend':'empty'))}</p>`}`;
  }

  // Compare the current user's LOCAL collection with the friend's already-authorized
  // shared rows. Do not filter the local side a second time: the profile summary
  // uses the full local library and both views must report the same common anime.
  function commonRows(){const own=C().snapshot()?.own;return own&&selectedData?M.commonItems(own.items||[],selectedData.items||[]):[];}

  async function chooseFriend(value, preserveMode = false) {
    const q = value.trim().toLocaleLowerCase(), people = accepted();
    const exact = people.filter(p => S.tag(p).toLocaleLowerCase() === q);
    const named = exact.length ? exact : people.filter(p => p.display_name?.toLocaleLowerCase() === q);
    if (named.length !== 1) throw Error('PROFILE_UNAVAILABLE');
    const version = ++selectionEpoch, id = named[0].id, owner=C().snapshot()?.user?.id;
    const previousMode=commonOnly,focused=document.activeElement,focusFilter=focused?.dataset?.commFilter;
    selectedFriend = id; selectedData = null; commonOnly=preserveMode&&previousMode;selectionLoading=true;C().paint();
    try {
      const data = await C().api('profiles/' + encodeURIComponent(id));
      if (version !== selectionEpoch || owner!==C().snapshot()?.user?.id || !C().snapshot()?.connected || !accepted().some(p=>p.id===id)) return;
      selectedData = data; visit(id);
    } finally {if(version===selectionEpoch){selectionLoading=false;C().paint();if(preserveMode&&focusFilter)document.querySelector('[data-comm-filter="'+focusFilter+'"]')?.focus({preventScroll:true});}}
  }
  const filterKeys = ['query','status','type','genre','studio','year','score','unrated','group','sort','mode'];
  const defaults = () => ({query:'',status:'',type:'',genre:'',studio:'',year:'',score:'',unrated:false,group:true,sort:'title',mode:'cards',page:0});
  let activeLibrary = null;
  function values(rows, key) { return [...new Set(rows.flatMap(row => Array.isArray(row[key]) ? row[key] : row[key] ? [row[key]] : []))].sort((a,b) => String(a).localeCompare(String(b))); }
  function options(values, selected, label) { return `<option value="">${e(label)}</option>` + values.map(v => `<option value="${e(v)}" ${String(selected) === String(v) ? 'selected' : ''}>${e(v)}</option>`).join(''); }
  function label(key, fallback) { const value = D.t(key); return value && value !== key ? value : t(fallback); }
  function filtered(rows, f) {
    const q = f.query.toLocaleLowerCase();
    return rows.filter(i => (!q || [i.title,...(i.genres||[]),...(i.studios||[])].join(' ').toLocaleLowerCase().includes(q))
      && (!f.status || i.status === f.status) && (!f.type || i.type === f.type)
      && (!f.genre || i.genres?.includes(f.genre)) && (!f.studio || i.studios?.includes(f.studio))
      && (!f.year || String(i.year || String(i.start_date||'').slice(0,4)) === f.year) && (!f.score || Math.round(Number(i.score)||0) === Number(f.score))
      && (!f.unrated || i.status === 'Completed' && !Number(i.score)))
      .sort((a,b) => {
        const title = () => a.title.localeCompare(b.title, D.language());
        if (f.sort === 'studio') return String(a.studios?.[0]||'').localeCompare(String(b.studios?.[0]||'')) || title();
        if (f.sort === 'scoreDesc') return b.score-a.score || title();
        if (f.sort === 'publicScoreDesc') return (b.public_score||0)-(a.public_score||0) || title();
        if (f.sort === 'rankAsc') return (a.rank||999999)-(b.rank||999999) || title();
        if (f.sort === 'progressDesc') return b.episodes_seen-a.episodes_seen || title();
        if (f.sort === 'startDateDesc') return String(b.start_date||b.year||'').localeCompare(String(a.start_date||a.year||'')) || title();
        if (f.sort === 'startDateAsc') return String(a.start_date||a.year||'9999').localeCompare(String(b.start_date||b.year||'9999')) || title();
        return title();
      });
  }
  function sectionRows(data,section){return (data.items||[]).filter(i=>section==='favorites'?i.favorite:section==='watching'?i.status==='Watching':true);}
  let visibleSeries=new Map();
  function groupedRows(rows){
    if(!window.ALM_SERIES)return rows.map(i=>({key:String(i.mal_id),title:i.title,items:[i]}));
    const source=rows.map(i=>({id:i.mal_id,malId:i.mal_id,title:i.title,type:i.type,startDate:i.start_date,imageUrl:M.poster(i.image_url),episodesSeen:i.episodes_seen,episodesTotal:i.episodes_total,status:i.status}));
    const groups=window.ALM_SERIES.groups(source),byId=new Map(rows.map(i=>[i.mal_id,i])),order=new Map(rows.map((row,index)=>[row,index]));
    return groups.map(g=>({...g,items:g.items.map(i=>byId.get(i.malId)).filter(Boolean)})).sort((a,b)=>order.get(a.items[0])-order.get(b.items[0]));
  }
  function seriesCard(group,foreign){
    const first=group.items[0],image=M.poster(group.poster||first.image_url),statuses=group.items.map(i=>i.status);
    const status=statuses.includes('Watching')?'Watching':statuses.every(s=>s==='Completed')?'Completed':statuses.includes('Plan to Watch')?'Plan to Watch':statuses.includes('On-Hold')?'On-Hold':first.status;
    const seen=group.items.reduce((sum,i)=>sum+(Number(i.episodes_seen)||0),0),total=group.items.reduce((sum,i)=>sum+(Number(i.episodes_total)||0),0),unknown=group.items.some(i=>!Number(i.episodes_total));
    return `<article class="comm-card comm-series-group comm-series-card ${foreign?'comm-ranking-card':''}" data-comm-series-key="${e(group.key)}"><button type="button" class="comm-series-cover" data-comm-series="${e(group.key)}" data-comm-series-poster data-mal-id="${Number(first.mal_id)}" aria-label="${e(t('viewSeasons')+' · '+group.title)}">${image?`<img class="comm-poster" src="${e(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:D.icon('image')}<span class="comm-series-type">${e(first.type||'TV')}</span></button><div class="comm-card-body"><h3 translate="no">${e(group.title)}</h3><p class="comm-series-meta">${e(t('sharedRating'))} : ${Number(first.score)>0?e(first.score):'—'}<br>${e(t('publicRating'))} : ${Number(first.public_score)>0?e(first.public_score):'—'}${first.rank?' / #'+Number(first.rank):''}<br>${e(t('seriesProgressLabel'))} : ${seen} / ${unknown?'?':total}<br><span data-watch-status="${e(status)}" data-no-i18n>${e(window.ALM_WATCH_STATUS.label(status))}</span></p><small>${e((first.genres||[]).join(' · '))}</small><p class="series-card-hint">${e(t('visibleSeasons').replace('{count}',group.items.length))}</p><button type="button" class="series-show" data-comm-series="${e(group.key)}">${e(t('viewSeasons'))}</button></div></article>`;
  }
  function results() {
    const {data,key,section}=activeLibrary,f=filters.get(key),rows=sectionRows(data,section),list=filtered(rows,f);
    const groups=f.group?groupedRows(list):list.map(i=>({key:String(i.mal_id),title:i.title,items:[i]})),size=48,pages=Math.max(1,Math.ceil(groups.length/size));f.page=Math.min(f.page,pages-1);
    const foreign=!key.startsWith('own:');visibleSeries=new Map();
    const cards=groups.slice(f.page*size,(f.page+1)*size).map(group=>{if(group.items.length===1)return C().cards(group.items,foreign,true);visibleSeries.set(group.key,{...group,foreign});return seriesCard(group,foreign);}).join('');
    return `<p class="comm-result-count" role="status">${list.length} / ${rows.length}</p><div class="comm-library-view" data-view="${e(f.mode)}"><div class="comm-grid ${foreign?'comm-ranking-grid':''}">${cards||C().cards([],foreign)}</div></div><nav class="comm-pagination" ${pages>1?'':'hidden'} aria-label="${e(t('library'))}"><button type="button" data-comm-page="first" aria-label="${e(D.t('libraryFirstPage'))}" ${f.page===0?'disabled':''}>&lt;&lt;</button><button type="button" data-comm-page="-1" aria-label="${e(t('previousPage'))}" ${f.page===0?'disabled':''}>&lt;</button><span>${f.page+1} / ${pages}</span><button type="button" data-comm-page="1" aria-label="${e(t('nextPage'))}" ${f.page>=pages-1?'disabled':''}>&gt;</button><button type="button" data-comm-page="last" aria-label="${e(D.t('libraryLastPage'))}" ${f.page>=pages-1?'disabled':''}>&gt;&gt;</button></nav>`;
  }
  function openSeries(key,source){
    const group=visibleSeries.get(key);if(!group)throw Error('INVALID_INPUT');
    const dialog=C().modal(`<h2 translate="no">${e(group.title)}</h2><p>${e(t('visibleSeasons').replace('{count}',group.items.length))}</p><div class="comm-library-view comm-series-dialog-records" data-view="compact">${C().cards(group.items,group.foreign)}</div><p class="comm-series-status" role="status"></p><div class="comm-actions comm-dialog-footer"><button type="button" data-close>${e(t('close'))}</button></div>`);
    dialog.setAttribute('aria-label',group.title);hydratePosters(dialog);
    dialog.addEventListener('close',()=>{dialog.removeAttribute('aria-label');if(source?.isConnected)source.focus({preventScroll:true});},{once:true});
  }

  function library(data,key='profile',section='library') {
    if(!filters.has(key))filters.set(key,defaults());activeLibrary={data,key,section};
    const f=filters.get(key),rows=sectionRows(data,section),counts=M.summary(rows),years=new Map();
    for(const row of rows){const year=Number(row.year)||Number(String(row.start_date||'').slice(0,4));if(year>0)years.set(year,(years.get(year)||0)+1);}
    const yearOptions=`<option value="">${e(t('allYears'))}</option>`+[...years].sort((a,b)=>b[0]-a[0]).map(([year,count])=>`<option value="${year}" ${String(year)===f.year?'selected':''}>${year} (${count})</option>`).join('');
    const sorts=[['title','sortTitle'],['studio','sortStudio'],['startDateDesc','sortNewest'],['startDateAsc','sortOldest'],['scoreDesc','sortMyScore'],['publicScoreDesc','sortPublicScore'],['rankAsc','sortRank'],['progressDesc','sortProgress']];
    const stats=`<div class="comm-stats comm-library-stats">${[['','total',counts.total],['Completed','completed',counts.completed],['On-Hold','onhold',counts.onhold],['Watching','watching',counts.watching],['Plan to Watch','plan',counts.planned]].map(([status,label,count])=>`<button type="button" class="comm-stat" data-comm-stat="${status}" aria-pressed="${f.status===status}"><strong>${count}</strong><span>${e(t(label))}</span></button>`).join('')}</div>`;
    return `${key.startsWith('own:')&&section==='favorites'?`<p class="comm-help">${e(t('favoritesRule'))}</p>`:''}${stats}<div class="comm-library-filters" role="group" aria-label="${e(t('library'))}" data-no-i18n><input data-comm-filter="query" type="search" value="${e(f.query)}" placeholder="${e(t('librarySearch'))}" aria-label="${e(t('search'))}"><select data-comm-filter="status" aria-label="${e(t('statusFilter'))}"><option value="">${e(t('allStatuses'))}</option>${window.ALM_WATCH_STATUS.options(f.status)}</select>${[['type','typeFilter','allTypes'],['genres','genreFilter','allGenres'],['studios','studioFilter','allStudios']].map(([dataKey,title,all])=>{const field={genres:'genre',studios:'studio'}[dataKey]||dataKey;return `<select data-comm-filter="${field}" aria-label="${e(t(title))}">${options(values(rows,dataKey),f[field],t(all))}</select>`;}).join('')}<select data-comm-filter="year" aria-label="${e(t('yearFilter'))}">${yearOptions}</select><select data-comm-filter="mode" aria-label="${e(t('viewFilter'))}">${[['cards','viewCards'],['compact','viewCompact'],['list','viewList']].map(([v,k])=>`<option value="${v}" ${f.mode===v?'selected':''}>${e(t(k))}</option>`).join('')}</select><select data-comm-filter="sort" aria-label="${e(t('sortFilter'))}">${sorts.map(([v,k])=>`<option value="${v}" ${f.sort===v?'selected':''}>${e(t(k))}</option>`).join('')}</select><button type="button" id="commResetFilters">${e(t('resetFilters'))}</button><label class="comm-check"><input type="checkbox" data-comm-filter="unrated" ${f.unrated?'checked':''}><span>${e(t('unratedOnly'))}</span></label><label class="comm-check"><input type="checkbox" data-comm-filter="group" ${f.group?'checked':''}><span>${e(t('groupSeries'))}</span></label></div><div id="commLibraryResults">${results()}</div>`;
  }
  function bindLibrary() {
    const root = document.getElementById('commPanel');
    if (!root) return;
    root.querySelector('#commChooseFriend')?.addEventListener('submit', ev => {ev.preventDefault();chooseFriend(root.querySelector('#commFriendChoice').value).catch(error => C().toast(window.ALM_COMMUNITY_ERROR(error),true));});
    root.querySelector('[data-comm-common]')?.addEventListener('click',()=>{if(!selectedData)return;commonOnly=!commonOnly;C().paint();document.querySelector('[data-comm-common]')?.focus({preventScroll:true});});
    root.querySelector('[data-comm-common-back]')?.addEventListener('click',()=>{commonOnly=false;C().paint();document.querySelector('[data-comm-common]')?.focus({preventScroll:true});});
    const output = root.querySelector('#commLibraryResults');
    if (!output || !activeLibrary) return;
    const change = ev => {const input=ev.target.closest('[data-comm-filter]');if(!input)return;const f=filters.get(activeLibrary.key);f[input.dataset.commFilter]=input.type==='checkbox'?input.checked:input.value;f.page=0;output.innerHTML=results();root.querySelectorAll('[data-comm-stat]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.commStat===f.status)));hydratePosters(output);};
    root.addEventListener('input', change);root.addEventListener('change',change);
    root.querySelectorAll('[data-comm-stat]').forEach(button=>button.addEventListener('click',()=>{const f=filters.get(activeLibrary.key);f.status=button.dataset.commStat;f.unrated=false;f.page=0;C().paint();}));
    root.querySelector('#commResetFilters')?.addEventListener('click',()=>{filters.set(activeLibrary.key,defaults());C().paint();});
    output.addEventListener('click',ev=>{const b=ev.target.closest('[data-comm-page]');if(!b||b.disabled)return;const current=filters.get(activeLibrary.key);current.page=b.dataset.commPage==='first'?0:b.dataset.commPage==='last'?Number.MAX_SAFE_INTEGER:current.page+Number(b.dataset.commPage);output.innerHTML=results();hydratePosters(output);window.ALM_SCROLL_PROGRESS?.toStart(root,output.querySelector('[data-comm-action="anime-detail"],[data-comm-series]'));});
  }
  function pendingRecommendations(rows) {
    const showRead = document.getElementById('commShowRead')?.checked || false;
    return rows.filter(r => showRead || !r.read_at);
  }
  const posterCache=new Map();
  async function hydratePosters(root){if(window.ALM_COMMUNITY_WEB)return;const pending=[...root.querySelectorAll('[data-comm-action="anime-detail"],[data-comm-series-poster]')].filter(b=>!b.querySelector('img'));let cursor=0;const worker=async()=>{while(cursor<pending.length){const b=pending[cursor++],id=Number(b.dataset.malId);if(!Number.isSafeInteger(id)||id<1)continue;if(!posterCache.has(id)){if(posterCache.size>=300)posterCache.delete(posterCache.keys().next().value);posterCache.set(id,fetch('/api/discover/'+id+'/record?local=1').then(r=>r.ok?r.json():null).then(row=>M.poster(row?.imageUrl||row?.poster)).catch(()=>''));}const url=await posterCache.get(id);if(!url||!b.isConnected||b.querySelector('img'))continue;const img=document.createElement('img');img.className='comm-poster';img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=url;b.querySelector(':scope>.studio-icon')?.remove();b.prepend(img);}};await Promise.all(Array.from({length:Math.min(4,pending.length)},worker));}
  function openAnime(malId, source) {
    if (!Number.isSafeInteger(malId) || malId < 1) throw Error('INVALID_INPUT');
    const ctx = C().context();
    const items = ctx.tab === 'friend-library' ? selectedData?.items || []
      : ['inbox','notifications'].includes(ctx.tab) ? (ctx.inbox?.items || []).filter(r => !r.read_at).map(r => r.anime)
      : ctx.view?.items || [];
    const item = items.find(i => Number(i.mal_id) === malId);
    if (!item) throw Error('INVALID_INPUT');
    if (!window.ALM_COMMUNITY_WEB && window.ALM_CATALOG?.openRecords) {
      const scope = source?.closest('.comm-library-view,.comm-series-dialog-records') || document.getElementById('commPanel');
      const visibleIds = [...new Set([...scope.querySelectorAll('[data-comm-action="anime-detail"]')].map(b => Number(b.dataset.malId)))];
      const visible = visibleIds.map(id => items.find(i => Number(i.mal_id) === id)).filter(Boolean);
      if (!visible.some(i => Number(i.mal_id) === malId)) visible.unshift(item);
      // A friend's status, rating, progress and favourites must never become the viewer's data.
      const records = visible.map(i => {
        const record = {malId:Number(i.mal_id),title:i.title};
        for (const [key,value] of Object.entries({poster:M.poster(i.image_url),type:i.type,startDate:i.start_date,
          episodesTotal:i.episodes_total,publicScore:i.public_score,rank:i.rank,genres:i.genres,studios:i.studios})) {
          if (Array.isArray(value) ? value.length : value) record[key] = value;
        }
        return record;
      });
      window.ALM_CATALOG.openRecords(records, visible.findIndex(i => Number(i.mal_id) === malId), source);
      return;
    }
    // The standalone website has no local catalogue. Show the already authorised shared record.
    const image = M.poster(item.image_url);
    const dialog = C().modal(`<h2 translate="no">${e(item.title)}</h2><div class="comm-web-detail">${image?`<img class="comm-poster" src="${e(image)}" alt="" referrerpolicy="no-referrer">`:''}<div><p>${e([item.type,item.year].filter(Boolean).join(' · '))}</p><p>${e((item.genres || []).join(' · '))}</p><p>${e((item.studios || []).join(' · '))}</p>${Number(item.public_score)>0?`<p>★ ${e(item.public_score)} / 10</p>`:''}</div></div><p class="comm-help">${e(t('planInApp'))}</p><div class="comm-actions"><a href="https://myanimelist.net/anime/${malId}" target="_blank" rel="noopener noreferrer">MyAnimeList ↗</a><button type="button" data-close>${e(t('close'))}</button></div>`);
    dialog.setAttribute('aria-label', item.title);
    dialog.addEventListener('close', () => {dialog.removeAttribute('aria-label');if(source?.isConnected)source.focus({preventScroll:true});}, {once:true});
  }
  async function addAnime(malId, status) {
    if (window.ALM_COMMUNITY_WEB) throw Error('INVALID_INPUT');
    if (!M.STATUSES.includes(status)) throw Error('INVALID_INPUT');
    const ctx = C().context(), item = [...(ctx.view?.items||[]),...(selectedData?.items||[]),...(ctx.inbox?.items||[]).map(r=>r.anime)].find(i=>Number(i.mal_id)===Number(malId));
    if (!item) throw Error('INVALID_INPUT');
    const current = await fetch('/api/animes').then(r=>{if(!r.ok)throw Error('ALM_NETWORK');return r.json();});
    const existing = current.find(i=>Number(i.malId||i.mal_id)===Number(malId));
    let payload = existing ? {status} : {title:item.title,malId:Number(malId),status,episodesSeen:'0',score:'0',autoInfo:false,catalogAdd:true};
    if (status === 'Completed') payload.episodesSeen=String(existing?.episodesTotal||item.episodes_total||0);
    const response = await fetch(existing?'/api/animes/'+encodeURIComponent(existing.id):'/api/animes',{method:existing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if (!response.ok) throw Error('ALM_NETWORK');
    window.markAnimeLibraryStale?.();await window.ensureAnimeLibraryFresh?.();await C().refresh();
  }
  function accountHtml(state) {
    if (!state) return `<p class="comm-account-loading" role="status" aria-live="polite">${e(t('running'))}</p><button type="button" data-comm-account-refresh>${e(t('retry'))}</button>`;
    if (!state.configured) return `<p class="comm-help">${e(t('notReady'))}</p><button type="button" data-comm-account-refresh>${e(t('retry'))}</button>`;
    if (state.mfaRequired) return window.ALM_COMMUNITY_MFA?.pendingMarkup(state)||'<p>'+e(t('mfaPending'))+'</p>';
    if (!state.connected) return `<p class="comm-help">${e(t('accountHint'))}</p><div class="comm-actions">${button('login','login')}${button('signup','signup')}</div>`;
    const p=state.own.profile, identity=state.identity||p, shared=p.visibility==='friends';
    return `<div class="comm-settings-identity"><img class="comm-avatar" src="${e(C().avatar(p))}" alt=""><div><strong class="comm-copy-id" role="button" tabindex="0" data-comm-copy-id="${e(S.tag(identity))}" title="${e(t('copyIdHint'))}">${e(S.tag(identity))}</strong><p>${e(state.user.email)}</p></div>${button('edit','edit')}</div><p class="comm-help">${e(t('privacyHint'))}</p>${window.ALM_COMMUNITY_MFA?.card(state)||''}${window.ALM_COMMUNITY_AGE?.account(D.language(),state.own.age)||'<p class="comm-help">'+e(t('adultSharingHelp'))+'</p>'}<div class="comm-actions">${button('publish','publish')}${button('withdraw','withdraw')}${button('account-copy','copyId')}<button type="button" data-comm-plus="invite">${e(t('invite'))}</button></div>${!window.ALM_COMMUNITY_WEB?`<label class="comm-check"><input type="checkbox" id="commAutoShare" ${state.sync?.auto?'checked':''} ${!shared||!state.sync?.publishedAt?'disabled':''}><span>${e(t('autoShare'))}</span></label><p class="comm-help">${e(t('autoShareHelp'))}</p>`:''}<p class="comm-help">${e(t(C().sharingStatus()))}</p><div class="comm-actions">${button('account-sessions','sessions')}${button('account-diagnostic','diagnostic')}<button type="button" data-alm-diagnostic>${e(t('sendDiagnostic'))}</button>${button('logout','logout')}</div><div class="comm-danger-zone"><p>${e(t('deleteHint'))}</p><button type="button" class="comm-danger" data-comm-plus="delete">${e(t('deleteAccount'))}</button></div><p class="comm-help"><a href="/community-charter.html" target="_blank" rel="noopener noreferrer">${e(t('charterTitle'))}</a> · <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">${e(t('privacyPolicy'))}</a> · <a href="/legal-notice.html" target="_blank" rel="noopener noreferrer">${e(t('legalNotice'))}</a></p><p class="comm-help">${e(t('diagnosticHelp'))}</p><p class="comm-status" id="commSettingsStatus" role="status"></p>`;
  }
  // A pending refresh can finish after an account dialog or test window closes.
  // Never touch a document that is no longer available.
  const accountPanel = () => window.document?.getElementById('commAccountSettings') || null;
  function showAccountRefreshError(error) {
    const status = accountPanel()?.querySelector('.comm-account-loading');
    if (status) status.textContent = window.ALM_COMMUNITY_ERROR(error);
  }
  async function renderAccount() {
    const panel=accountPanel();if(!panel||!C())return;
    window.ALM_COMMUNITY_AGE?.createForm(document,()=>panel.querySelector('[data-age-save]')?.click());
    const state=C().snapshot(),previous=panel.querySelector('.comm-age-settings'),draft=panel.dataset.ageOwner===state?.user?.id?{birthDate:previous?.querySelector('[name=birthDate]')?.value,attested:previous?.querySelector('[name=ageAttested]')?.checked}:null;
    const html=accountHtml(state);if(panel.firstElementChild&&accountRenders.get(panel)===html)return;accountRenders.set(panel,html);panel.innerHTML=html;panel.dataset.ageOwner=state?.user?.id||'';
    panel.querySelector('[data-comm-account-refresh]')?.addEventListener('click',async event=>{
      const control=event.currentTarget;control.disabled=true;
      const status=panel.querySelector('.comm-account-loading');if(status)status.textContent=t('running');
      try{await C().refresh({cached:false});await renderAccount();}
      catch(error){if(status)status.textContent=window.ALM_COMMUNITY_ERROR(error);control.disabled=false;}
    });
    if(draft&&panel.querySelector('[name=birthDate]')){panel.querySelector('[name=birthDate]').value=draft.birthDate||'';panel.querySelector('[name=ageAttested]').checked=draft.attested===true;}
    const ageSection=panel.querySelector('.comm-age-settings'),A=window.ALM_COMMUNITY_AGE;
    A?.applyExclusion?.(ageSection?.querySelector('#commAdultShare'),D.language(),C().snapshot()?.own?.age);
    async function saveAge(input,control){
      const status=ageSection.querySelector('[data-age-status]');control.disabled=true;status.textContent=A.t(D.language(),'working');
      try{await C().api('age','POST',input);await C().refresh();await renderAccount();C().paint();panel.querySelector('[data-age-status]').textContent=A.t(D.language(),'saved');}
      catch(error){status.textContent=A.t(D.language(),error.message==='AGE_LOCKED'?'locked':error.message==='AGE_INVALID'?'invalid':'unavailable');control.disabled=false;const old=C().snapshot().own.age;if(control.id==='commAdultShare')control.checked=old?.excludeAdult!==false;}finally{if(control.isConnected)control.disabled=false;}
    }
    ageSection?.querySelector('[data-age-save]')?.addEventListener('click',event=>{
      try{const birth=ageSection.querySelector('[name=birthDate]'),attest=ageSection.querySelector('[name=ageAttested]');if(!birth.reportValidity()||!attest.reportValidity())return;const value=A.declaration({birthDate:birth.value,ageAttested:attest.checked});saveAge({birthDate:value.birthDate,attested:true,excludeAdult:true},event.currentTarget);}
      catch{ageSection.querySelector('[data-age-status]').textContent=A.t(D.language(),'invalid');}
    });
    ageSection?.querySelector('#commAdultShare')?.addEventListener('change',event=>saveAge({excludeAdult:event.target.checked},event.target));
    panel.querySelector('#commAutoShare')?.addEventListener('change',async ev=>{const input=ev.target;input.disabled=true;try{await C().api('sync','POST',{enabled:input.checked});await C().refresh();renderAccount();}catch(error){input.checked=!input.checked;panel.querySelector('#commSettingsStatus').textContent=window.ALM_COMMUNITY_ERROR(error);input.disabled=false;}});
  }
  async function openAccount() {
    if(!C().snapshot())C().refresh({cached:true}).catch(showAccountRefreshError);
    if (!window.ALM_COMMUNITY_WEB && window.ALM_SETTINGS) {
      const dialog=document.getElementById('settingsDialog');if(!dialog.open)dialog.showModal();window.ALM_SETTINGS.select('account');await renderAccount();
    } else {
      const dialog=C().modal(`<h2>${e(t('myAccount'))}</h2><section id="commAccountSettings"></section><button type="button" data-close>${e(t('close'))}</button>`);await renderAccount();
    }
    C().refresh({cached:true}).then(renderAccount).catch(showAccountRefreshError);
  }
  function closeSettings() { const d=document.getElementById('settingsDialog');if(d?.open)d.close(); }
  function stats(totalsOnly=false,includeCommon=false) {
    const state=C().snapshot(),network=C().context().friends?.libraryStats;
    const totals=[['friendLibraries',network?.available?network.libraries:null],['friendLibraryAnimes',network?.available?network.animes:null]];
    const rows=totalsOnly?totals:[['friendsCount',accepted().length],['librariesVisited',visited()],['sharedAnimes',state?.sync?.publishedAt?M.shared(state.own).items.length:0],...totals];
    const person=accepted().find(p=>p.id===selectedFriend),title=t('commonWith').replace('{friend}',person?S.tag(person):t('chooseFriend'));
    const common=`<button type="button" class="comm-stat comm-common-stat" data-comm-common aria-pressed="${commonOnly}" ${selectedData?'':'disabled'} title="${e(t('commonScope'))}"><strong>${selectedData?groupedRows(commonRows()).length:'—'}</strong><span>${e(title)}</span></button>`;
    return `<div class="comm-stats comm-network-stats ${totalsOnly?'comm-network-stats-two':'comm-network-stats-five'}${includeCommon?' comm-network-stats-three':''}"${includeCommon?' data-common-statistics':''} aria-label="${e(t('communityStatistics'))}">${rows.map(([k,n],i)=>`${includeCommon&&i===1?common:''}<div class="comm-stat" data-community-stat="${k}" title="${e(t(n===null?'statisticsUnavailable':k==='friendLibraries'||k==='friendLibraryAnimes'?'friendLibraryCountHint':k))}"><strong>${n===null?'—':Number(n)||0}</strong><span>${e(t(k))}</span></div>`).join('')}</div>`;
  }
  function refreshStats(){
    for(const node of document.querySelectorAll('.comm-network-stats')){const template=document.createElement('template');template.innerHTML=stats(node.classList.contains('comm-network-stats-two'),node.hasAttribute('data-common-statistics'));node.replaceWith(template.content.firstElementChild);}
  }
  async function readAvatar(file) {
    if(!file || file.size>2000000 || !/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(file.type))throw Error('INVALID_INPUT');
    const bitmap=await createImageBitmap(file);
    try {
      const canvas=document.createElement('canvas');
      const size=Math.min(bitmap.width,bitmap.height),x=(bitmap.width-size)/2,y=(bitmap.height-size)/2;
      if(!Number.isFinite(size)||size<=0)throw Error('INVALID_INPUT');
      for(const pixels of [256,192,128]){
        canvas.width=pixels;canvas.height=pixels;
        canvas.getContext('2d').drawImage(bitmap,x,y,size,size,0,0,pixels,pixels);
        for(const quality of [0.82,0.68,0.5]){
          const result=canvas.toDataURL('image/webp',quality),encoded=result.split(',')[1]||'';
          const bytes=encoded.length*3/4-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
          if(bytes<=32768&&M.avatarImage(result))return result;
        }
      }
      throw Error('PAYLOAD_LIMIT');
    } finally {bitmap.close();}
  }
  function updateRecommendationButtons() {
    // A local card can be rendered before the account snapshot, or before the
    // latest library publication. Neither makes its recommendation action disappear.
    for(const control of document.querySelectorAll('#animeGrid [data-action="recommend"]')){
      const id=Number(control.dataset.malId);
      control.hidden=!Number.isSafeInteger(id)||id<1;
      control.textContent=t('recommendFriend');
    }
  }
  async function recommendAnime(malId,record=null) {
    const id=Number(malId);if(!Number.isSafeInteger(id)||id<1)throw Error('INVALID_INPUT');
    const waiting=C().modal(`<h2>${e(t('recommendFriend'))}</h2><p role="status" class="comm-loading">${e(t('running'))}</p><button type="button" data-close>${e(t('close'))}</button>`),marker=waiting.firstElementChild;
    const current=()=>waiting.open&&waiting.firstElementChild===marker;
    try{
      await C().refresh({cached:true});
      if(!current())return;
      const state=C().snapshot();
      if(!state?.connected){
        const login=C().modal(`<h2>${e(t('recommendFriend'))}</h2><p class="comm-help">${e(t('accountHint'))}</p><div class="comm-actions"><button type="button" data-recommend-login>${e(t('login'))}</button><button type="button" data-close>${e(t('close'))}</button></div>`);
        login.querySelector('[data-recommend-login]').addEventListener('click',()=>C().auth('login'));
        return;
      }
      const owner=state.user?.id,owned=state.own.items.find(i=>i.mal_id===id);
      // The authoritative catalogue policy still gates every send, including a
      // card that has not been included in the cached account snapshot yet.
      if(!M.shareAllowed(owned||id,state.own.age))throw Error('CONTENT_NOT_SHARED');
      const item=owned||{mal_id:id,title:String(record?.officialTitle||record?.title||('MAL #'+id)).slice(0,300)};
      const people=accepted();
      if(!people.length){C().modal(`<h2>${e(t('recommendFriend'))}</h2><p>${e(t('noAcceptedFriends'))}</p><button type="button" data-close>${e(t('close'))}</button>`);return;}
      const dialog=C().modal(`<form><h2>${e(t('recommendFriend'))}</h2><p>${e(item.title)}</p><label>${e(t('chooseFriend'))}<select name="recipient" required><option value="">${e(t('chooseFriend'))}</option>${people.map(p=>`<option value="${e(p.id)}">${e(S.tag(p)||p.display_name)}</option>`).join('')}</select></label><label>${e(t('message'))}<textarea name="message" maxlength="500" rows="3"></textarea></label><p class="comm-help">${e(t('socialQuotaHelp'))}</p><p class="comm-status" role="status"></p><div class="comm-actions"><button type="submit">${e(t('send'))}</button><button type="button" data-close>${e(t('close'))}</button></div></form>`);
      const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]');let sending=false;
      form.onsubmit=async event=>{event.preventDefault();if(sending||!form.reportValidity())return;sending=true;submit.disabled=true;
        try{
          if(!C().snapshot()?.connected||C().snapshot()?.user?.id!==owner)throw Error('SESSION_EXPIRED');
          const data=new FormData(form),recipient=data.get('recipient');if(!people.some(p=>p.id===recipient)||!accepted().some(p=>p.id===recipient))throw Error('INVALID_INPUT');
          await C().api('recommendations','POST',{recipient,malId:item.mal_id,message:data.get('message')});
          // Closing a window does not cancel a request already sent. Its result
          // must not close a newer dialog or expose the previous account's state.
          if(C().snapshot()?.user?.id===owner){if(dialog.open&&dialog.contains(form))dialog.close();C().toast(t('sent'));}
        }catch(error){
          if(dialog.open&&dialog.contains(form)&&C().snapshot()?.user?.id===owner)form.querySelector('[role=status]').textContent=window.ALM_COMMUNITY_ERROR(error);
          window.ALM_COMMUNITY_PLUS?.report(error);
        }finally{sending=false;if(submit.isConnected)submit.disabled=false;}
      };
    }catch(error){
      if(current()){
        const status=waiting.querySelector('[role=status]');status.classList.remove('comm-loading');status.textContent=window.ALM_COMMUNITY_ERROR(error);
      }
      window.ALM_COMMUNITY_PLUS?.report(error);
    }
  }
  function init() {
    const nav=document.querySelector('.side-nav'), anchor=document.getElementById('navSettings');
    if(nav&&anchor){const group=document.createElement('div');group.className='comm-side-group';group.innerHTML=`${[['navFriends','friends','friends'],['navFriendLibrary','friendsLibrary','friend-library'],['navCommunityInbox','receivedRecommendations','inbox']].map(([id,key,section])=>`<button class="nav-item" type="button" id="${id}" data-comm-section="${section}" aria-label="${e(t(key))}" title="${e(t(key))}">${D.icon(section==='friends'?'heart':section==='friend-library'?'library':'news')}<span class="studio-nav-label">${e(t(key))}</span></button>`).join('')}`;group.insertAdjacentHTML('beforeend', '<a class="nav-item" href="https://discord.gg/9KJ8MqhKh7" target="_blank" rel="noopener noreferrer" aria-label="Discord ALM" title="Discord ALM">'+D.icon('compass')+'<span class="studio-nav-label" data-design-text="discordALM">'+e(t('discordALM'))+'</span></a>');anchor.before(group);}
    document.addEventListener('click',ev=>{
      const series=ev.target.closest('[data-comm-series]');if(series){try{openSeries(series.dataset.commSeries,series);}catch(error){C().toast(window.ALM_COMMUNITY_ERROR(error),true);}return;}
      const record=ev.target.closest('.comm-series-dialog-records [data-comm-action]');if(record){
        const report=error=>{document.querySelector('#commDialog .comm-series-status')?.replaceChildren(document.createTextNode(window.ALM_COMMUNITY_ERROR(error)));};
        const name=record.dataset.commAction;
        if(name==='anime-detail'){try{openAnime(Number(record.dataset.malId),record);}catch(error){report(error);}return;}
        if(name==='add-status'||name==='favorite'){
          record.disabled=true;const id=Number(record.dataset.malId);
          (async()=>{if(name==='add-status')await addAnime(id,record.dataset.status);else{const old=C().snapshot().own.items.find(i=>i.mal_id===id);await C().api('favorite','PUT',{malId:id,value:!old?.favorite});await C().refresh();}C().paint();const item=C().snapshot().own.items.find(i=>i.mal_id===id);for(const b of document.querySelectorAll('#commDialog [data-comm-action="add-status"][data-mal-id="'+id+'"]'))b.setAttribute('aria-pressed',String(item?.status===b.dataset.status));if(name==='favorite'){record.setAttribute('aria-pressed',String(item?.favorite));record.textContent=(item?.favorite?'♥':'♡')+' '+t('favorites');}document.querySelector('#commDialog .comm-series-status')?.replaceChildren(document.createTextNode(t('saved')));})().catch(report).finally(()=>{if(record.isConnected)record.disabled=false;});
        }
        return;
      }
      const section=ev.target.closest('[data-comm-section]');if(section){C().open('',section.dataset.commSection,section.id).catch(error=>C().toast(window.ALM_COMMUNITY_ERROR(error),true));return;}
      const action=ev.target.closest('[data-comm-action]');if(!action||!action.closest('#commAccountSettings'))return;
      const name=action.dataset.commAction;
      if(name==='edit'||name==='login'||name==='signup'){closeSettings();name==='edit'?C().edit():C().auth(name);}
      else if(name==='account-copy')window.ALM_COMMUNITY_PLUS.copy(S.tag(C().snapshot().identity||C().snapshot().own.profile));else if(name==='account-diagnostic'){if(window.ALM_SUPPORT)window.ALM_SUPPORT.copy();else window.ALM_COMMUNITY_PLUS.copy(window.ALM_COMMUNITY_PLUS.diagnostic());}
      else if(name==='account-sessions'){closeSettings();C().open('','sessions');}
      else if(['publish','withdraw','logout'].includes(name)){action.disabled=true;C().api(name,'POST',{}).then(()=>C().refresh()).then(()=>{renderAccount();C().paint();}).catch(error=>{document.getElementById('commSettingsStatus').textContent=window.ALM_COMMUNITY_ERROR(error);action.disabled=false;}).finally(()=>{if(action.isConnected)action.disabled=false;});}
    });
    const copyIdentity=ev=>{const target=ev.target.closest('[data-comm-copy-id]');if(!target)return;ev.preventDefault();ev.stopPropagation();window.ALM_COMMUNITY_PLUS.copy(target.dataset.commCopyId).catch(error=>C().toast(window.ALM_COMMUNITY_ERROR(error),true));};
    const accountShortcut=ev=>{if(!ev.target.closest('[data-comm-account-shortcut]'))return;ev.preventDefault();ev.stopPropagation();openAccount().catch(error=>C().toast(window.ALM_COMMUNITY_ERROR(error),true));};
    document.addEventListener('dblclick',accountShortcut);
    document.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' ')accountShortcut(ev);});
    document.addEventListener('dblclick',copyIdentity);
    document.addEventListener('keydown',ev=>{if((ev.key==='Enter'||ev.key===' ')&&ev.target.closest('[data-comm-copy-id]'))copyIdentity(ev);});
    window.addEventListener('alm:community-changed',()=>{
      const person=accepted().find(p=>p.id===selectedFriend),refresh=!!(person&&selectedData&&C()?.context()?.tab==='friend-library');selectionEpoch++;
      if(refresh){chooseFriend(S.tag(person),true).catch(error=>C().toast(window.ALM_COMMUNITY_ERROR(error),true));return;}
      selectedData=null;selectionLoading=false;commonOnly=false;if(C()?.context()?.tab==='friend-library')C().paint();else refreshStats();
    });window.addEventListener('alm:community-changed',updateRecommendationButtons);window.addEventListener('alm:library-rendered',updateRecommendationButtons);window.addEventListener('alm:language-changed',updateRecommendationButtons);
    window.addEventListener('alm:community-changed',renderAccount);
    window.addEventListener('alm:language-changed',()=>{renderAccount();for(const [id,key]of [['navFriends','friends'],['navFriendLibrary','friendsLibrary'],['navCommunityInbox','receivedRecommendations']]){const b=document.getElementById(id);if(b){b.querySelector('span').textContent=t(key);b.setAttribute('aria-label',t(key));b.title=t(key);}}const h=document.querySelector('.comm-side-heading');if(h)h.textContent=t('communityTitle');});
  }
  window.ALM_COMMUNITY_WORKSPACE={readAvatar,commonCount:rows=>groupedRows(rows).length,library,bindLibrary,friendLibrary,stats,visit,addAnime,openAnime,hydratePosters,openAccount,renderAccount,showAccountRefreshError,pendingRecommendations,recommendAnime,updateRecommendationButtons,sourceItems:()=>selectedData?.items||[],reset(){visibleSeries.clear();selectedFriend='';selectedData=null;commonOnly=false;selectionLoading=false;selectionEpoch++;filters.clear();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
