(()=>{'use strict';
// V2.2.0: original, read-only score explorer and dated personal chronology.
// Keeps Anime DNA and Mes souvenirs intact; no inferred watch history, no network.
const $=id=>document.getElementById(id);
const M=window.ALM_V220_PERSONAL_INSIGHTS;
if(!M)return;
const L={
 fr:{score:'Explorer mes notes avec leurs affiches',scoreHint:'Tes notes personnelles de 1 à 10. Clique sur une affiche pour ouvrir la fiche. Aucun score n’est modifié ici.',show:'Afficher',all:'Toutes les notes',unrated:'Sans note',lane:'Note',works:'animés',rated:'notés',none:'Aucun animé dans cette catégorie.',more:'Seules les premières affiches sont montrées.',timeline:'Ma chronologie de visionnage',timelineHint:'Uniquement les dates de visionnage et de fin que tu as réellement enregistrées dans ALM.',year:'Année',axis:'Frise temporelle',history:'Historique',dated:'événements datés',completed:'animés terminés',episodes:'épisodes vus',empty:'Aucune date de visionnage enregistrée. Ajoute-en dans une fiche pour faire apparaître ta chronologie.',watched:'Visionnage',finished:'Terminé',event:'événement',events:'événements',day:'Jour',month:'Mois',open:'Ouvrir la fiche',display:'Afficher le détail',noData:'Pas de dates connues',overview:'Activité par mois',recent:'Les activités datées les plus récentes apparaissent à droite.'},
 en:{score:'Explore my scores and covers',scoreHint:'Your personal scores from 1 to 10. Select a cover to open its record. No ratings are changed.',show:'Show',all:'All scores',unrated:'Unrated',lane:'Score',works:'anime',rated:'rated',none:'No anime in this group.',more:'Only the first covers are shown.',timeline:'My viewing timeline',timelineHint:'Only viewing and completion dates that you actually recorded in ALM.',year:'Year',axis:'Timeline',history:'History',dated:'dated events',completed:'completed anime',episodes:'episodes watched',empty:'No dated watching activity yet. Add a date to an anime record to see it here.',watched:'Watched',finished:'Completed',event:'event',events:'events',day:'Day',month:'Month',open:'Open anime',display:'View details',noData:'No dates recorded',overview:'Activity by month',recent:'Latest dated activity is on the right.'},
 es:{score:'Explorar mis notas y portadas',scoreHint:'Notas personales de 1 a 10. Abre una ficha sin cambiar las notas.',show:'Mostrar',all:'Todas las notas',unrated:'Sin nota',lane:'Nota',works:'animes',rated:'puntuados',none:'No hay animes en esta categoría.',more:'Solo se muestran las primeras portadas.',timeline:'Mi cronología de visionado',timelineHint:'Solo fechas que hayas registrado en ALM.',year:'Año',axis:'Cronología',history:'Historial',dated:'eventos fechados',completed:'animes terminados',episodes:'episodios vistos',empty:'No hay fechas registradas. Añade fechas de visionado para ver la cronología.',watched:'Visto',finished:'Terminado',event:'evento',events:'eventos',day:'Día',month:'Mes',open:'Abrir ficha',display:'Ver detalles',noData:'Sin fechas conocidas',overview:'Actividad mensual',recent:'Los eventos más recientes aparecen a la derecha.'},
 de:{score:'Bewertungen und Cover erkunden',scoreHint:'Persönliche Bewertungen von 1 bis 10. Ein Cover öffnet den Eintrag, ohne Noten zu ändern.',show:'Anzeigen',all:'Alle Bewertungen',unrated:'Ohne Note',lane:'Note',works:'Anime',rated:'bewertet',none:'Keine Anime in dieser Gruppe.',more:'Nur die ersten Cover werden gezeigt.',timeline:'Meine Sehverlauf-Zeitleiste',timelineHint:'Nur selbst erfasste Seh- und Abschlussdaten aus ALM.',year:'Jahr',axis:'Zeitleiste',history:'Verlauf',dated:'datierte Ereignisse',completed:'abgeschlossene Anime',episodes:'gesehene Folgen',empty:'Noch keine Sehdaten erfasst. Füge ein Datum in einer Anime-Karte hinzu.',watched:'Angesehen',finished:'Abgeschlossen',event:'Ereignis',events:'Ereignisse',day:'Tag',month:'Monat',open:'Anime öffnen',display:'Details anzeigen',noData:'Keine Datumsangaben',overview:'Monatsaktivität',recent:'Neueste Aktivitäten stehen rechts.'},
 ja:{score:'評価とポスターを探す',scoreHint:'1〜10の個人評価を表示。ポスターを選ぶと作品が開き、評価は変わりません。',show:'表示',all:'すべての評価',unrated:'未評価',lane:'評価',works:'作品',rated:'評価済み',none:'作品はありません。',more:'最初のポスターのみ表示します。',timeline:'視聴履歴のタイムライン',timelineHint:'ALMに自分で登録した視聴日と完了日のみを使用します。',year:'年',axis:'タイムライン',history:'履歴',dated:'日付付きイベント',completed:'完了作品',episodes:'視聴話数',empty:'視聴日が記録されていません。作品に日付を追加してください。',watched:'視聴',finished:'完了',event:'イベント',events:'イベント',day:'日',month:'月',open:'作品を開く',display:'詳細を見る',noData:'日付なし',overview:'月別の活動',recent:'最近の活動は右側に表示されます。'},
 'pt-BR':{score:'Explorar notas e capas',scoreHint:'Suas notas de 1 a 10. Abrir uma capa não altera a nota.',show:'Mostrar',all:'Todas as notas',unrated:'Sem nota',lane:'Nota',works:'animes',rated:'avaliados',none:'Nenhum anime nesta categoria.',more:'Apenas as primeiras capas aparecem.',timeline:'Minha linha do tempo',timelineHint:'Somente datas de visualização e conclusão registradas no ALM.',year:'Ano',axis:'Linha do tempo',history:'Histórico',dated:'eventos datados',completed:'animes concluídos',episodes:'episódios vistos',empty:'Ainda não existem datas. Registre um dia de visualização.',watched:'Assistido',finished:'Concluído',event:'evento',events:'eventos',day:'Dia',month:'Mês',open:'Abrir anime',display:'Ver detalhes',noData:'Sem datas',overview:'Atividade mensal',recent:'Os eventos mais recentes ficam à direita.'},
 'zh-CN':{score:'浏览个人评分与海报',scoreHint:'查看1到10分的个人评分。点击海报打开作品，不会修改评分。',show:'显示',all:'所有评分',unrated:'未评分',lane:'评分',works:'部动漫',rated:'已评分',none:'该分组没有动漫。',more:'仅显示部分海报。',timeline:'我的观看时间轴',timelineHint:'仅使用你在ALM明确记录的观看与完成日期。',year:'年份',axis:'时间轴',history:'历史',dated:'条日期事件',completed:'部已完成',episodes:'集已观看',empty:'尚未记录观看日期。请在作品资料中添加日期。',watched:'观看',finished:'完成',event:'事件',events:'事件',day:'日',month:'月',open:'打开作品',display:'查看详情',noData:'没有日期记录',overview:'月度活动',recent:'最近的记录在右侧。'}
};
const lang=()=>window.ALM_I18N?.getLanguage?.()||window.ALM_DESIGN?.language?.()||document.documentElement.lang||'fr';
const t=k=>(L[lang()]||L.en)[k]||L.en[k]||k;
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(cls)node.className=cls;return node;};
const library=()=>Array.isArray(window._almAnimes)?window._almAnimes:[];
const title=a=>window.ALM_TITLES?.title?.(a)||a.title||'Anime';
const cover=a=>{
 const raw=String(a?.poster||a?.imageUrl||'').trim(),id=Number(a?.malId);
 if(!raw)return '';
 if(Number.isSafeInteger(id)&&id>0&&/^https:\/\/(?:cdn\.myanimelist\.net|s4\.anilist\.co|static\.tvmaze\.com|media\.kitsu\.io)\//i.test(raw))return '/api/cover-cache/'+id;
 if(/^\/images\/[a-z0-9._% -]+$/i.test(raw)||/^\/assets\/[a-z0-9._%/-]+$/i.test(raw))return raw;
 return '';
};
const openAnime=(a,trigger)=>{
 if(typeof window.openEdit==='function')window.openEdit(a);
 else window.ALM_CATALOG?.openRecords?.([a],0,trigger);
};
let pickedScore='all',year=0,mode='axis',selectedDay='';
const labelScore=score=>score===null?t('unrated'):score+'/10';
function drawScores(){
 const host=$('v220ScoreLanes'),filter=$('v220ScoreFilter'),board=$('v220ScoreBoard');
 if(!host||!filter||!board)return;
 $('v220ScoreBoardToggle').textContent=t('score');
 $('v220ScoreBoardHint').textContent=t('scoreHint');
 $('v220ScoreFilterLabel').textContent=t('show');
 const data=M.scoreLanes(library(),{maxPerLane:20});
 const old=filter.value||pickedScore;filter.replaceChildren();
 const opts=[{value:'all',label:t('all')},...data.lanes.filter(l=>l.count).map(l=>({value:l.score===null?'unrated':String(l.score),label:labelScore(l.score)+' · '+l.count}))];
 for(const item of opts){const option=el('option',item.label);option.value=item.value;filter.append(option);}
 filter.value=opts.some(o=>o.value===old)?old:'all';pickedScore=filter.value;
 $('v220ScoreSummary').textContent=data.rated+' '+t('rated')+' · '+data.unrated+' '+t('unrated');
 host.replaceChildren();
 if(!board.open)return;
 for(const lane of data.lanes){
  if(!lane.count||pickedScore!=='all'&&pickedScore!==(lane.score===null?'unrated':String(lane.score)))continue;
  const section=el('section',null,'alm-v220-score-lane');
  const heading=el('h3',labelScore(lane.score)+' · '+lane.count+' '+t('works'));
  const row=el('div',null,'alm-v220-score-posters');
  for(const item of lane.items){
   const button=el('button',null,'alm-v220-score-poster');button.type='button';
   button.setAttribute('aria-label',t('open')+': '+title(item.anime)+' ('+labelScore(lane.score)+')');
   const imageURL=cover(item.anime),art=el('span',null,'alm-v220-score-cover');
   if(imageURL){const image=el('img');image.alt='';image.src=imageURL;image.loading='lazy';
    image.addEventListener('error',()=>image.remove(),{once:true});art.append(image);}
   button.append(art,el('span',title(item.anime),'alm-v220-score-name'));
   button.addEventListener('click',()=>openAnime(item.anime,button));row.append(button);
  }
  section.append(heading,row);
  if(lane.count>lane.items.length)section.append(el('p',t('more'),'alm-v220-personal-hint'));
  host.append(section);
 }
 if(!host.childElementCount)host.append(el('p',t('none'),'alm-v220-personal-hint'));
}
const formatDate=date=>{
 try{return new Intl.DateTimeFormat(lang(),{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));}catch{return date;}
};
const monthName=(y,month)=>{
 try{return new Intl.DateTimeFormat(lang(),{month:'short',timeZone:'UTC'}).format(new Date(Date.UTC(y,month-1,1)));}catch{return String(month);}
};
const axisX=date=>{
 const y=Number(date.slice(0,4)),start=Date.UTC(y,0,1),end=Date.UTC(y+1,0,1);
 return 40+Math.round((Date.parse(date+'T12:00:00Z')-start)/(end-start)*2140);
};
function eventCard(event){
 const button=el('button',null,'alm-v220-timeline-entry');button.type='button';
 const label=event.kind==='completed'?t('finished'):t('watched')+' · '+event.episodes+' '+t('episodes');
 button.append(el('span',formatDate(event.date),'alm-v220-timeline-date'),el('strong',title(event.anime)),el('small',label));
 button.addEventListener('click',()=>openAnime(event.anime,button));return button;
}
function showDay(date,all){
 const host=$('v220TimelineDetails');if(!host)return;host.replaceChildren();
 const found=all.days.find(day=>day.date===date);
 if(!found)return;
 host.append(el('h3',formatDate(date)+' · '+found.items.length+' '+t('events')));
 const list=el('div',null,'alm-v220-timeline-details-grid');
 for(const event of found.items.slice(0,40))list.append(eventCard(event));
 host.append(list);
}
function renderTimeline(){
 const root=$('v220PersonalTimeline');if(!root)return;
 $('v220PersonalTimelineTitle').textContent=t('timeline');
 $('v220TimelineIntro').textContent=t('timelineHint');
 $('v220TimelineYearLabel').textContent=t('year');
 $('v220TimelineAxisMode').textContent=t('axis');
 $('v220TimelineHistoryMode').textContent=t('history');
 for(const button of root.querySelectorAll('[data-timeline-mode]'))button.setAttribute('aria-pressed',String(button.dataset.timelineMode===mode));
 const years=M.years(library());const select=$('v220TimelineYear');
 const old=year||Number(select.value);
 select.replaceChildren();
 if(!years.length){const opt=el('option',t('noData'));opt.value='';select.append(opt);select.disabled=true;year=0;}
 else{select.disabled=false;for(const y of years){const opt=el('option',y);opt.value=String(y);select.append(opt);}
  year=years.includes(old)?old:years[0];select.value=String(year);}
 const data=M.timeline(library(),year);
 $('v220TimelineSummary').textContent=years.length
   ?data.eventCount+' '+t('dated')+' · '+data.completed+' '+t('completed')+' · '+data.episodes+' '+t('episodes')
   :t('empty');
 const axisPanel=$('v220TimelineAxisPanel'),historyPanel=$('v220TimelineHistoryPanel');
 axisPanel.hidden=mode!=='axis'||!years.length;
 historyPanel.hidden=mode!=='history'||!years.length;
 $('v220TimelineDetails').replaceChildren();
 if(!years.length)return;
 const scene=$('v220TimelineAxisContent');scene.replaceChildren();scene.append(el('div',null,'alm-v220-timeline-line'));
 for(let index=1;index<=12;index++){
  const date=year+'-'+String(index).padStart(2,'0')+'-01',x=axisX(date),tick=el('span',monthName(year,index),'alm-v220-timeline-tick');
  tick.style.left=x+'px';scene.append(tick);
 }
 for(const [i,day] of data.days.entries()){
  const marker=el('button',day.items.length>1?String(day.items.length):'●','alm-v220-timeline-dot');
  marker.type='button';marker.style.left=axisX(day.date)+'px';
  marker.style.top=(i%3===0?46:i%3===1?90:135)+'px';
  marker.title=formatDate(day.date)+' · '+day.items.length+' '+t('events');
  marker.setAttribute('aria-label',t('display')+' · '+marker.title);
  marker.addEventListener('click',()=>{selectedDay=day.date;showDay(day.date,data);});
  scene.append(marker);
 }
 const overview=$('v220TimelineMonthOverview');overview.replaceChildren();
 const peak=Math.max(1,...data.month.map(m=>m.events));
 for(const item of data.month){
  const button=el('button',null,'alm-v220-timeline-month');button.type='button';
  const track=el('span',null,'alm-v220-timeline-bar');const fill=el('span');
  fill.style.height=(item.events?Math.max(5,Math.round(100*item.events/peak)):0)+'%';track.append(fill);
  button.append(track,el('small',monthName(year,item.month)),el('strong',item.events));
  button.title=monthName(year,item.month)+' · '+item.events+' '+t('events');
  button.addEventListener('click',()=>{
   const matching=data.days.filter(day=>Number(day.date.slice(5,7))===item.month);
   if(matching.length){selectedDay=matching.at(-1).date;showDay(selectedDay,data);}
  });overview.append(button);
 }
 const history=$('v220TimelineHistoryPanel');history.replaceChildren();
 for(const event of data.events.slice(-100).reverse())history.append(eventCard(event));
 if(selectedDay&&!data.days.some(d=>d.date===selectedDay))selectedDay='';
 selectedDay=selectedDay||data.days.at(-1)?.date||'';
 if(mode==='axis'&&selectedDay)showDay(selectedDay,data);
 const viewport=$('v220TimelineAxisScroll');
 if(mode==='axis'&&viewport&&data.days.length)viewport.scrollLeft=viewport.scrollWidth;
}
function init(){
 const board=$('v220ScoreBoard'),timeline=$('v220PersonalTimeline');if(!board||!timeline)return;
 $('v220ScoreFilter')?.addEventListener('change',event=>{pickedScore=event.target.value;drawScores();});
 board.addEventListener('toggle',drawScores);
 $('v220TimelineYear')?.addEventListener('change',event=>{year=Number(event.target.value)||0;selectedDay='';renderTimeline();});
 timeline.querySelectorAll('[data-timeline-mode]').forEach(button=>button.addEventListener('click',()=>{
  mode=button.dataset.timelineMode;renderTimeline();
 }));
 const refresh=()=>{
  if(!$('dnaPage')?.classList.contains('hidden'))drawScores();
  if(!$('memoryPage')?.classList.contains('hidden'))renderTimeline();
 };
 $('navDNA')?.addEventListener('click',drawScores);
 $('navMemories')?.addEventListener('click',renderTimeline);
 window.addEventListener('alm:collection-changed',refresh);
 window.addEventListener('alm:language-changed',refresh);
 drawScores();renderTimeline();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();