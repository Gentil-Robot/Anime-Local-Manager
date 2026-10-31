/* Nocturne - coherent, local, accessible visual layer for ALM. */
(() => {
  'use strict';
  const D=window.ALM_DESIGN, $=id=>document.getElementById(id);
  if (!D) return;
  const keys={memoryPage:'memories',communityPage:'communityDashboard',library:'library',watching:'watching',plan:'plan',aboutPage:'about',dnaPage:'Anime DNA',newsV2Page:'news',recoPage:'reco',seasonNewsPage:'seasons',lexiconPage:'dictionary',auditPage:'audit',discoveryPage:'searchPage',rankingPage:'ranking',calendarPage:'calendarPage'};
  let viewFrame=0;
  function go(where) {
    const ids={search:'navDiscovery',news:'navNewsV2',reco:'navReco',dna:'navDna',seasons:'navSeasonNews',dictionary:'navLexicon',audit:'navAudit',settings:'settingsBtn',import:'importXmlBtn',add:'openAdd',export:'backupBtn'};
    if (ids[where]) $(ids[where])?.click();
    else if (where==='library') document.querySelector('.nav-item[data-filter=""]')?.click();
    else if (where==='plan') document.querySelector('.nav-item[data-filter="Plan to Watch"]')?.click();
    else if (where==='about') window.showAboutView?.();
    else if (where==='support') window.showDonationsV1?.();
    else if (where==='credits' || where==='karaoke') {
      window.showAboutView?.();
      requestAnimationFrame(()=>{
        const target=where==='credits'?document.querySelector('.about-thanks'):document.querySelector('.donation-karaoke');
        target?.scrollIntoView({block:'start',behavior:'auto'});
      });
    }
    closeMenu();syncView();
  }
  function closeMenu() {
    document.body.classList.remove('studio-nav-open');
    $('studioMenuButton')?.setAttribute('aria-expanded','false');
  }
  function visiblePage() {
    if ($('aboutPage') && !$('aboutPage').classList.contains('hidden')) return 'aboutPage';
    for(const id of ['memoryPage','communityPage','dnaPage','newsV2Page','recoPage','seasonNewsPage','lexiconPage','auditPage','discoveryPage','rankingPage','calendarPage']) if($(id) && !$(id).classList.contains('hidden')) return id;
    if(document.querySelector('.nav-item[data-filter="Watching"]')?.classList.contains('active'))return 'watching';
    return document.querySelector('.nav-item[data-filter="Plan to Watch"]')?.classList.contains('active')?'plan':'library';
  }
  function syncView() {
    const view=visiblePage();document.body.dataset.studioView=view;
    const isLibrary=['library','watching','plan'].includes(view);
    const hero=$('studioLibraryHero');if(hero)hero.hidden=!isLibrary;
    const empty=$('studioEmptyState');if(empty)empty.hidden=!isLibrary || Boolean($('animeGrid')?.querySelector('.card'));
    const title=$('studioLibraryTitle');if(title){title.dataset.designText=view==='watching'?'watching':view==='plan'?'plan':'library';}
    const intro=$('studioLibraryIntro');if(intro){intro.dataset.designText=view==='watching'?'watchingIntro':view==='plan'?'planIntro':'libraryIntro';}
    const crumb=$('studioBreadcrumb');
    if(crumb){const key=keys[view]||'library';const v=view==='memoryPage'?(window.ALM_NOTEBOOK?.t('collectionNotebook')||'Mes souvenirs'):key==='Anime DNA'?key:D.t(key);crumb.replaceChildren();
      const home=document.createElement('button');home.type='button';home.dataset.appGo='library';home.innerHTML=D.icon('library');home.setAttribute('aria-label',D.t('library'));crumb.append(home);
      const sep=document.createElement('span');sep.textContent='/';sep.className='studio-crumb-sep';sep.setAttribute('aria-hidden','true');crumb.append(sep);
      const current=document.createElement('span');current.textContent=v;current.setAttribute('aria-current','page');crumb.append(current);
    }
    window.ALM_NOCTURNE?.viewChanged(view);window.ALM_NAV?.sync(view);
    if(view!=='aboutPage'){
      const a=$('donationKaraokeClip');if(a&&!a.paused)a.pause();
    }
    D.applyText();
  }
  function scheduleView() {if(!viewFrame)viewFrame=requestAnimationFrame(()=>{viewFrame=0;syncView();});}
  function makeLeaf(node,key) {if(!node)return;node.dataset.designText=key;node.setAttribute('data-no-i18n','');node.textContent=D.t(key);}
  function headers() {
    const specifications=[
      ['#lexiconPage .lexicon-hero h2','glossaryTitle'],['#lexiconPage .lexicon-hero p','glossaryIntro'],['#lexiconPage .lexicon-eyebrow','glossaryKicker'],
      ['#newsV2Page .news-v2-title h2','news'],['#newsV2Page .news-v2-title p','newsIntro'],
      ['#recoPage .reco-header p','recoIntro'],['#dnaPage .dna-header-copy p','dnaIntro'],
      ['#seasonNewsPage .season-news-title-row h2','seasons'],['#auditPage .audit-hero p','auditIntro']
    ];
    specifications.forEach(([sel,key])=>makeLeaf(document.querySelector(sel),key));
    document.querySelectorAll('.dna-header,.reco-header,.audit-hero,.lexicon-hero,.season-news-header,.news-v2-header').forEach(el=>el.classList.add('studio-page-heading'));
  }
  function navigation() {
    const entries=[['.nav-item[data-filter=""]','library'],['.nav-item[data-filter="Watching"]','play'],['.nav-item[data-filter="Plan to Watch"]','heart'],['#navMemories','memories'],['#navDiscovery','search'],['#navSeasonNews','season'],['#navRanking','star'],['#navNewsV2','news'],['#navReco','compass'],['#navDna','dna'],['#navLexicon','book'],['#navAudit','shield'],['#navSettings','settings'],['#navAbout','info']];
    for(const [sel,ico] of entries){const b=document.querySelector(sel);if(!b||b.dataset.visualReady)continue;
      const caption=b.textContent.trim().replace(/^[^\p{L}\p{N}]+/u,'');
      b.replaceChildren();b.insertAdjacentHTML('afterbegin',D.icon(ico));const label=document.createElement('span');label.className='studio-nav-label';label.textContent=caption;
      const captionKey={play:'watching',star:'ranking',search:'searchPage',library:'library',heart:'plan',season:'seasons',news:'news',compass:'reco',book:'dictionary',shield:'audit',settings:'settings',info:'about',music:'karaoke'}[ico];
      if(captionKey){makeLeaf(label,captionKey);b.dataset.designAria=captionKey;b.setAttribute('aria-label',D.t(captionKey));}else if(ico==='memories'){label.dataset.notebookText='collectionNotebook';label.textContent=window.ALM_NOTEBOOK_COPY?.t(D.language(),'collectionNotebook')||'Mes souvenirs';}else{label.textContent='Anime DNA';label.setAttribute('translate','no');}
      b.append(label);b.dataset.visualReady='1';
    }
    $('commProfileEntry')?.addEventListener('click',closeMenu);
    $('studioMenuButton')?.addEventListener('click',()=>{const open=document.body.classList.toggle('studio-nav-open');$('studioMenuButton').setAttribute('aria-expanded',String(open));});
    const scrim=document.createElement('button');scrim.className='studio-nav-scrim';scrim.type='button';scrim.setAttribute('aria-label',D.t('menu'));scrim.tabIndex=-1;scrim.addEventListener('click',closeMenu);document.body.append(scrim);
    document.querySelectorAll('.side-nav .nav-item').forEach(n=>n.addEventListener('click',()=>{closeMenu();scheduleView();}));
  }
  function toolbar() {
    const actions=document.querySelector('.header-actions');if(!actions)return;
    const more=document.createElement('details');more.className='studio-toolbar-more';more.id='studioTools';
    const summary=document.createElement('summary');summary.innerHTML=D.icon('settings')+`<span data-design-text="tools" data-no-i18n>${D.escape(D.t('tools'))}</span>`;summary.dataset.designAria='tools';more.append(summary);
    const body=document.createElement('div');body.className='studio-toolbar-menu';more.append(body);
    for(const id of ['bulkInfo','downloadAllImages','settingsBtn']){const node=$(id);if(node)body.append(node);}
    actions.insertBefore(more,$('openAdd'));
    more.addEventListener('click',e=>{if(e.target.closest('button'))more.open=false;});
    const lang=document.createElement('label');lang.className='studio-language';lang.setAttribute('data-no-i18n','');lang.innerHTML=D.icon('compass');
    const select=document.createElement('select');select.id='studioLanguage';select.setAttribute('aria-label',D.t('language'));
    (window.ALM_I18N?.supported?.()||[]).forEach(({code,label})=>select.add(new Option(label,code)));
    select.value=D.language();select.addEventListener('change',()=>window.ALM_I18N?.setLanguage(select.value));lang.append(select);actions.append(lang);
    document.addEventListener('click',event=>{if(more.open&&!more.contains(event.target))more.open=false;});
  }
  function preferences() {
    const host=document.querySelector('.settings-main');if(!host)return;
    const box=document.createElement('details');box.className='settings-section settings-disclosure studio-preferences';
    box.innerHTML=`<summary><span class="settings-summary-icon">${D.icon('moon')}</span><span><strong data-design-text="appearance" data-no-i18n></strong><small data-design-text="localPrefs" data-no-i18n></small></span><span class="settings-summary-chevron" aria-hidden="true">&#8964;</span></summary><div class="settings-disclosure-body"><p data-design-text="appearanceCopy" data-no-i18n></p><label><span data-design-text="motion" data-no-i18n></span><select id="studioMotion"><option value="system" data-design-text="motionSystem" data-no-i18n></option><option value="reduced" data-design-text="motionOff" data-no-i18n></option><option value="full" data-design-text="motionOn" data-no-i18n></option></select></label><label><span data-design-text="density" data-no-i18n></span><select id="studioDensity"><option value="comfortable" data-design-text="comfortable" data-no-i18n></option><option value="compact" data-design-text="compact" data-no-i18n></option></select></label></div>`;
    host.prepend(box);$('studioMotion').value=D.storage.get('alm.visual.motion','system');$('studioDensity').value=D.storage.get('alm.visual.density','comfortable');
    $('studioMotion').addEventListener('change',e=>{D.storage.set('alm.visual.motion',e.target.value);D.applyPreferences();});
    $('studioDensity').addEventListener('change',e=>{D.storage.set('alm.visual.density',e.target.value);D.applyPreferences();});
  }
  function decorateLibrary() {
    let empty=$('studioEmptyState');if(!empty){empty=document.createElement('section');empty.id='studioEmptyState';empty.className='studio-empty';empty.setAttribute('data-no-i18n','');$('animeGrid')?.after(empty);}
    const all=Array.isArray(window._almAnimes)?window._almAnimes:[];
    const shown=document.querySelectorAll('#animeGrid .card').length;
    document.body.classList.toggle('studio-library-sparse',shown>0&&shown<=6);
    window.ALM_NOCTURNE?.decorateLibrary();
    document.body.classList.toggle('studio-library-empty',all.length===0);
    if(!$('animeGrid')?.querySelector('.card')){empty.innerHTML=D.icon('book')+`<h2>${D.escape(D.t(all.length?'noMatch':'emptyTitle'))}</h2>${!all.length?`<p>${D.escape(D.t('emptyCopy'))}</p>`:''}<div class="studio-inline-actions">${all.length?`<button type="button" id="studioResetFilters">${D.escape(D.t('reset'))}</button>`:`<button type="button" data-app-go="import">${D.escape(D.t('import'))}</button><button type="button" data-app-go="add" class="primary">${D.escape(D.t('add'))}</button>`}</div>`;
      $('studioResetFilters')?.addEventListener('click',()=>$('resetFilters')?.click());}
    const byId=new Map();for(const a of all)if(!byId.has(String(a.id)))byId.set(String(a.id),a);
    document.querySelectorAll('#animeGrid .card').forEach(card=>{
      if(card.dataset.studioDecorated)return;card.dataset.studioDecorated='1';const anime=byId.get(card.dataset.animeId);if(!anime)return;
      const seen=Number(anime.episodesSeen),total=Number(anime.episodesTotal);if(Number.isFinite(seen)&&Number.isFinite(total)&&total>0){const track=document.createElement('div');track.className='studio-card-progress';track.setAttribute('data-no-i18n','');track.setAttribute('role','progressbar');track.setAttribute('aria-label',D.t('progress',{seen,total}));track.setAttribute('aria-valuenow',String(Math.max(0,Math.min(seen,total))));track.setAttribute('aria-valuemax',String(total));track.setAttribute('aria-valuemin','0');const bar=document.createElement('i');bar.style.width=`${Math.max(0,Math.min(100,seen/total*100))}%`;track.append(bar);card.querySelector('.poster')?.append(track);}
    });
    syncView();
  }
  function init() {
    navigation();toolbar();headers();preferences();
    D.applyText();decorateLibrary();
    document.addEventListener('click',event=>{const target=event.target.closest('[data-app-go]');if(target){event.preventDefault();go(target.dataset.appGo);}});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();if($('studioTools'))$('studioTools').open=false;}});
    const observer=new MutationObserver(scheduleView);
    for(const id of ['memoryPage','communityPage','aboutPage','dnaPage','newsV2Page','recoPage','seasonNewsPage','lexiconPage','auditPage','discoveryPage','rankingPage','calendarPage'])if($(id))observer.observe($(id),{attributes:true,attributeFilter:['class']});
    window.addEventListener('alm:library-rendered',decorateLibrary);
    window.addEventListener('alm:view-changed',scheduleView);
    window.addEventListener('alm:motion-changed',()=>{if(visiblePage()==='dnaPage'&&typeof window.renderDNA==='function')window.renderDNA();});
    window.addEventListener('alm:language-changed',()=>{if($('studioLanguage')){$('studioLanguage').value=D.language();$('studioLanguage').setAttribute('aria-label',D.t('language'));}D.applyText();decorateLibrary();syncView();});
    new MutationObserver(scheduleView).observe(document.querySelector('.side-nav'),{subtree:true,attributes:true,attributeFilter:['class']});
    // Old views all start asynchronous jobs; rendering is preserved, only page state is observed.
    window.ALM_DESIGN.go=go;window.ALM_DESIGN.syncView=syncView;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
