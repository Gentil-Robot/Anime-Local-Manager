(()=>{'use strict';
// ALM 2.2 VM preview — two original, keyboard-accessible horizontal rails.
// These enrich "Animés" and "En cours"; no standalone dashboard or media playback.
const $=id=>document.getElementById(id);
const M=window.ALM_V220_WATCH_MODEL;
if(!M)return;
const copy={
 fr:{fresh:'Épisodes récemment diffusés',recentHint:'Diffusions confirmées ces 7 derniers jours · disponibilité selon les plateformes',resume:'Reprenez votre visionnage',resumeHint:'Retrouvez votre progression dans les animés en cours',noFresh:'Aucune diffusion récente confirmée pour vos animés en cours.',noResume:'Commencez un animé et indiquez les épisodes vus pour le retrouver ici.',episode:'Épisode',next:'À reprendre : épisode',of:'sur',newBadge:'NOUVEAU',anime:'ANIMÉ',unknown:'Total inconnu',go:'Ouvrir la fiche et la progression',prev:'Cartes précédentes',following:'Cartes suivantes',refresh:'Actualiser le suivi local',airingError:'Calendrier des diffusions indisponible',noSchedule:'Dernière vérification des diffusions indisponible'},
 en:{fresh:'Recently aired episodes',recentHint:'Confirmed broadcasts in the last 7 days · streaming availability varies',resume:'Resume your anime',resumeHint:'Continue tracking the anime you are watching',noFresh:'No recently confirmed broadcasts for your current anime.',noResume:'Start watching an anime and record progress to see it here.',episode:'Episode',next:'Resume at episode',of:'of',newBadge:'NEW',anime:'ANIME',unknown:'Total unknown',go:'Open anime details and progress',prev:'Previous cards',following:'Next cards',refresh:'Refresh local airing status',airingError:'Airing calendar unavailable',noSchedule:'Last airing check unavailable'},
 es:{fresh:'Episodios emitidos recientemente',recentHint:'Emisiones confirmadas en 7 días · disponibilidad variable',resume:'Retoma tus animes',resumeHint:'Continúa tus series en curso',noFresh:'No hay emisiones recientes confirmadas.',noResume:'Marca episodios vistos para verlos aquí.',episode:'Episodio',next:'Retomar en episodio',of:'de',newBadge:'NUEVO',anime:'ANIME',unknown:'Total desconocido',go:'Abrir ficha y progreso',prev:'Tarjetas anteriores',following:'Tarjetas siguientes',refresh:'Actualizar emisiones locales',airingError:'Calendario no disponible',noSchedule:'Última verificación no disponible'},
 de:{fresh:'Kürzlich ausgestrahlte Folgen',recentHint:'Bestätigte Ausstrahlungen der letzten 7 Tage · Verfügbarkeit kann abweichen',resume:'Weitersehen',resumeHint:'Fortschritt deiner laufenden Anime',noFresh:'Keine kürzlich bestätigten Folgen.',noResume:'Markiere gesehene Folgen, damit sie hier erscheinen.',episode:'Folge',next:'Weiter bei Folge',of:'von',newBadge:'NEU',anime:'ANIME',unknown:'Gesamtzahl unbekannt',go:'Anime und Fortschritt öffnen',prev:'Vorherige Karten',following:'Weitere Karten',refresh:'Lokalen Sendestatus laden',airingError:'Sendeplan nicht verfügbar',noSchedule:'Letzte Prüfung nicht verfügbar'},
 ja:{fresh:'最近放送されたエピソード',recentHint:'過去7日間の確認済み放送 · 配信状況は地域によって異なります',resume:'視聴の続きを管理',resumeHint:'視聴中のアニメの進捗を確認',noFresh:'最近確認された放送はありません。',noResume:'視聴済みエピソードを登録するとここに表示されます。',episode:'第',next:'次のエピソード',of:'全',newBadge:'新着',anime:'アニメ',unknown:'総話数不明',go:'作品と進捗を開く',prev:'前のカード',following:'次のカード',refresh:'放送情報を確認',airingError:'放送情報を取得できません',noSchedule:'確認履歴なし'},
 'pt-BR':{fresh:'Episódios exibidos recentemente',recentHint:'Exibições confirmadas nos últimos 7 dias · disponibilidade variável',resume:'Continue de onde parou',resumeHint:'Retome o acompanhamento dos seus animes',noFresh:'Nenhum episódio recente confirmado.',noResume:'Registre episódios vistos para aparecerem aqui.',episode:'Episódio',next:'Retomar no episódio',of:'de',newBadge:'NOVO',anime:'ANIME',unknown:'Total desconhecido',go:'Abrir detalhes e progresso',prev:'Cartões anteriores',following:'Próximos cartões',refresh:'Atualizar transmissões locais',airingError:'Calendário indisponível',noSchedule:'Última verificação indisponível'},
 'zh-CN':{fresh:'最近播出的剧集',recentHint:'最近7天已确认播出 · 各平台可用性不同',resume:'继续追番',resumeHint:'查看正在观看的动漫进度',noFresh:'没有最近确认播出的新剧集。',noResume:'记录观看进度后会在此显示。',episode:'第',next:'接着看第',of:'共',newBadge:'更新',anime:'动漫',unknown:'总集数未知',go:'打开作品和进度',prev:'上一组',following:'下一组',refresh:'刷新本地播出记录',airingError:'播出日历不可用',noSchedule:'没有最近的播出记录'}
};
const t=key=>{const language=window.ALM_DESIGN?.language?.()||document.documentElement.lang||'fr';return (copy[language]||copy.en)[key]||copy.en[key]||key;};
let lastView='all',schedule={items:[]},scheduleAt=0,loading=null,removed=false;
const validId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const apiPoster=anime=>{
 const raw=String(anime?.poster||anime?.imageUrl||'').trim();
 if(!raw)return '';
 const mal=validId(anime?.malId);
 // Same on-demand image cache used by existing ALM library cards.
 if(mal&&/^https:\/\/(?:cdn\.myanimelist\.net|s4\.anilist\.co|static\.tvmaze\.com|media\.kitsu\.io)\//i.test(raw))return '/api/cover-cache/'+mal;
 try{
  const url=new URL(raw,location.origin);
  if(url.origin===location.origin&&url.pathname.startsWith('/api/'))return url.pathname;
  if(url.protocol==='https:'&&/^(?:cdn\.myanimelist\.net|s4\.anilist\.co|static\.tvmaze\.com|media\.kitsu\.io)$/i.test(url.hostname))return url.href;
 }catch{}
 return '';
};
const watched=()=>Array.isArray(window._almAnimes)?window._almAnimes:[];
const subtitle=(row,newly=false)=>{
 const number=newly?row.highestEpisode:row.next;
 const season=validId(row.anime?.manualSeasonNumber||row.anime?.betaseriesSeason);
 const ep=t('episode')+' '+number;
 return season?'S'+season+' · '+ep:ep;
};
function card(row,{fresh=false}={}){
 const anime=row.anime;
 const button=document.createElement('button');button.type='button';button.className='alm-watch-card';
 button.dataset.animeId=String(row.id);
 button.setAttribute('aria-label',t('go')+': '+String(anime?.title||'')+' · '+subtitle(row,fresh));
 const art=document.createElement('span');art.className='alm-watch-art';
 const src=apiPoster(anime);
 if(src){
  const image=document.createElement('img');image.src=src;image.loading='lazy';image.decoding='async';image.alt='';
  image.addEventListener('error',()=>image.remove(),{once:true});art.append(image);
 }
 const tags=document.createElement('span');tags.className='alm-watch-tags';
 const type=document.createElement('span');type.className='alm-watch-kind';type.textContent=t('anime');
 tags.append(type);
 if(fresh){
  const badge=document.createElement('span');badge.className='alm-watch-new';
  badge.textContent=t('newBadge')+' +'+row.count;
  tags.append(badge);
 }
 const content=document.createElement('span');content.className='alm-watch-content';
 const name=document.createElement('strong');name.className='alm-watch-title';
 name.textContent=window.ALM_TITLES?.title?.(anime)||anime.title||t('anime');
 const info=document.createElement('span');info.className='alm-watch-episode';
 info.textContent=(fresh?'▶ ':'⏯ ')+subtitle(row,fresh);
 content.append(name,info);
 if(!fresh){
  const total=row.total;
  const details=document.createElement('span');details.className='alm-watch-small';
  details.textContent=total?row.seen+' '+t('of')+' '+total:row.seen+' · '+t('unknown');
  content.append(details);
  if(total){
   const track=document.createElement('span');track.className='alm-watch-progress';track.setAttribute('role','progressbar');
   track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(total));
   track.setAttribute('aria-valuenow',String(row.seen));track.setAttribute('aria-label',details.textContent);
   const fill=document.createElement('span');fill.style.width=String(Math.min(100,row.seen/total*100))+'%';
   track.append(fill);content.append(track);
  }
 }
 button.append(art,tags,content);
 button.addEventListener('click',()=>{
  // Opens ALM's existing editor, never starts a stream or marks an episode seen.
  if(typeof window.openEdit==='function')window.openEdit(anime);
  else window.showAnimesV1?.('Watching');
 });
 return button;
}
function rail(kind,rows){
 const host=$(kind==='fresh'?'v220RecentRows':'v220ResumeRows'),empty=$(kind==='fresh'?'v220RecentEmpty':'v220ResumeEmpty');
 if(!host||!empty)return;
 const frag=document.createDocumentFragment();
 for(const row of rows)frag.append(card(row,{fresh:kind==='fresh'}));
 host.replaceChildren(frag);
 empty.textContent=rows.length?'':t(kind==='fresh'?'noFresh':'noResume');empty.hidden=rows.length>0;
 host.hidden=rows.length===0;
 const parent=host.closest('.alm-watch-rail');
 if(parent){
  const previous=parent.querySelector('[data-watch-scroll="prev"]'),next=parent.querySelector('[data-watch-scroll="next"]');
  const canScroll=rows.length>3;previous.disabled=!canScroll;next.disabled=!canScroll;
 }
}
function visible(){
 const body=document.body,root=$('v220WatchRails');
 return !!root&&!root.hidden&&!body.classList.contains('alm-v2-active')&&!!$('aboutPage')?.classList.contains('hidden');
}
function draw(){
 const root=$('v220WatchRails');if(!root)return;
 const show=lastView==='all'||lastView==='Watching';
 const exist=M.watching(watched()).length>0;
 root.hidden=!show||!exist;
 if(!show||!exist)return;
 $('v220RecentTitle').textContent=t('fresh');$('v220RecentHint').textContent=t('recentHint');
 $('v220ResumeTitle').textContent=t('resume');$('v220ResumeHint').textContent=t('resumeHint');
 const newRows=M.newEpisodeRows(watched(),schedule);
 const resumeRows=M.resumeRows(watched());
 rail('fresh',newRows);rail('resume',resumeRows);
 const refresh=$('v220RecentRefresh');if(refresh)refresh.title=t('refresh');
 for(const button of root.querySelectorAll('[data-watch-scroll]')){
  button.setAttribute('aria-label',t(button.dataset.watchScroll==='prev'?'prev':'following'));
 }
}
async function checkSchedule(force=false){
 if(loading)return loading;
 if(!force&&Date.now()-scheduleAt<2*60000)return;
 if(!M.watching(watched()).length)return;
 loading=(async()=>{
  try{
   const response=await fetch('/api/airing',{cache:'no-store'});
   if(!response.ok)throw Error('ALM_AIRING_UNAVAILABLE');
   const data=await response.json();
   schedule={items:Array.isArray(data.items)?data.items:[]};
   scheduleAt=Date.now();draw();
  }catch{scheduleAt=Date.now();draw();}
 })().finally(()=>{loading=null;});
 return loading;
}
function onRendered(e){
 if(e?.detail?.view)lastView=e.detail.view;
 draw();
 if(visible())void checkSchedule();
}
function init(){
 const root=$('v220WatchRails');if(!root||removed)return;
 root.querySelectorAll('[data-watch-scroll]').forEach(button=>button.addEventListener('click',()=>{
  const host=$(button.closest('.alm-watch-rail')?.dataset.rail==='fresh'?'v220RecentRows':'v220ResumeRows');
  if(!host)return;
  const width=Math.max(260,host.clientWidth*.8);
  host.scrollBy?.({left:button.dataset.watchScroll==='prev'?-width:width,behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
 }));
 $('v220RecentRefresh')?.addEventListener('click',()=>{scheduleAt=0;void checkSchedule(true);});
 document.querySelectorAll('.nav-item[data-filter]').forEach(button=>button.addEventListener('click',()=>{lastView=button.dataset.filter==='Watching'?'Watching':button.dataset.filter==='Plan to Watch'?'Plan to Watch':'all';draw();}));
 document.querySelectorAll('.nav-item:not([data-filter])').forEach(button=>button.addEventListener('click',()=>{root.hidden=true;}));
 window.addEventListener('alm:library-rendered',onRendered);
 window.addEventListener('alm:collection-changed',()=>{draw();if(visible())void checkSchedule();});
 window.addEventListener('alm:language-changed',draw);
 window.addEventListener('alm:view-changed',e=>{if(e.detail?.page==='aboutPage')root.hidden=true;});
 draw();
 if(M.watching(watched()).length)void checkSchedule();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();