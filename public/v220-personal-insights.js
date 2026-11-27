(()=>{'use strict';
// One score gallery in the existing DNA card; all reads are local and immutable.
const $=id=>document.getElementById(id),M=window.ALM_V220_PERSONAL_INSIGHTS;
if(!M)return;
const copy={
 fr:['Afficher','Toutes les notes','Sans note','Aucun animé pour cette sélection.','Jaquettes précédentes','Jaquettes suivantes','Ouvrir la fiche','Filtrer les jaquettes notées','animés'],
 en:['Show','All scores','Unrated','No anime in this selection.','Previous covers','Next covers','Open anime','Filter covers rated','anime'],
 es:['Mostrar','Todas las notas','Sin nota','No hay animes en esta selección.','Portadas anteriores','Portadas siguientes','Abrir ficha','Filtrar portadas con nota','animes'],
 de:['Anzeigen','Alle Bewertungen','Ohne Note','Keine Anime in dieser Auswahl.','Vorherige Cover','Nächste Cover','Anime öffnen','Cover mit Note filtern','Anime'],
 ja:['表示','すべての評価','未評価','該当する作品はありません。','前のポスター','次のポスター','作品を開く','評価でポスターを絞る','作品'],
 'pt-BR':['Mostrar','Todas as notas','Sem nota','Nenhum anime nesta seleção.','Capas anteriores','Próximas capas','Abrir anime','Filtrar capas com nota','animes'],
 'zh-CN':['显示','所有评分','未评分','没有符合条件的动漫。','上一组海报','下一组海报','打开作品','按评分筛选海报','部动漫']
};
const lang=()=>window.ALM_I18N?.getLanguage?.()||window.ALM_DESIGN?.language?.()||document.documentElement.lang||'fr';
const t=i=>(copy[lang()]||copy.en)[i];
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
let records=[],filter='all',offset=0,thumb=null,initialized=false,observer=null;
const library=()=>Array.isArray(window._almAnimes)?window._almAnimes:[];
const title=a=>window.ALM_TITLES?.title?.(a)||a.title||'Anime';
const size=()=>{const w=$('dnaScorePosters')?.clientWidth||960;return Math.max(2,Math.min(8,Math.floor(w/95)));};
function localThumb(a){
 const span=el('span','🎌','dna-score-poster-ph'),id=Number(a.malId),raw=String(a.poster||a.imageUrl||'').replace(/^(images|assets)\//i,'/$1/');
 const url=/^\/(?:images|assets)\/[a-z0-9._%/-]+$/i.test(raw)?raw:Number.isSafeInteger(id)&&id>0?'/api/cover-cache/'+id:'';
 if(url){const img=el('img');img.src=url;img.alt='';img.loading='lazy';img.dataset.imageFallback='true';if(url.startsWith('/api/cover-cache/'))img.dataset.almManagedCover='1';span.append(img);}return span;
}
function draw(){
 const host=$('dnaScorePosters'),select=$('v220ScoreFilter'),prev=$('v220ScorePrev'),next=$('v220ScoreNext'),summary=$('v220ScoreSummary');
 if(!host||!select||!prev||!next)return;
 const data=M.scoreLanes(records),opts=[['all',t(1)],...data.lanes.filter(l=>l.count).map(l=>[l.score===null?'unrated':String(l.score),(l.score===null?t(2):l.score+'/10')+' · '+l.count])];
 if(!opts.some(o=>o[0]===filter)){filter='all';offset=0;}
 select.replaceChildren(...opts.map(([v,label])=>{const o=el('option',label);o.value=v;return o;}));select.value=filter;
 $('v220ScoreFilterLabel').textContent=t(0);
 const gallery=M.scoreGallery(records,filter),page=size();
 offset=Math.min(Math.max(0,offset),Math.max(0,Math.floor((gallery.length-1)/page)*page));
 host.style.setProperty('--alm-score-columns',String(page));host.replaceChildren();
 for(const a of gallery.slice(offset,offset+page)){
  const button=el('button',null,'dna-score-poster');button.type='button';button.dataset.animeId=String(a.id);button.dataset.score=String(M.score(a.score)??'');
  button.title=title(a)+' — '+(M.score(a.score)===null?t(2):M.score(a.score)+'/10');button.setAttribute('aria-label',t(6)+': '+button.title);
  if(thumb){button.innerHTML=thumb(a);}else button.append(localThumb(a));
  if(M.score(a.score)!==null)button.append(el('span','⭐ '+a.score,'dna-score-badge'));
  button.append(el('span',title(a),'dna-score-poster-title'));
  button.addEventListener('click',()=>{if(window.ALM_CATALOG?.openRecords)window.ALM_CATALOG.openRecords(gallery,gallery.findIndex(r=>Number(r.id)===Number(a.id)),button);else window.openEdit?.(a);});
  host.append(button);
 }
 if(!gallery.length)host.append(el('p',t(3),'alm-v220-note'));
 prev.disabled=offset===0;next.disabled=offset+page>=gallery.length;
 for(const [b,i] of [[prev,4],[next,5]]){b.title=t(i);b.setAttribute('aria-label',t(i));}
 summary.textContent=gallery.length?String(offset+1)+'–'+Math.min(offset+page,gallery.length)+' / '+gallery.length+' '+t(8):'0 '+t(8);
 for(const b of $('dnaScoreDist')?.querySelectorAll('[data-dna-personal-score]')||[]){
  const value=b.dataset.dnaPersonalScore;b.setAttribute('aria-pressed',String(filter===value));b.classList.toggle('is-selected',filter===value);
  b.setAttribute('aria-label',t(7)+' '+value+'/10');
  b.onclick=()=>{filter=filter===value?'all':value;offset=0;draw();};
 }
 window.ALM_SELECTS?.refresh?.();
}
function init(){
 if(initialized||!$('v220ScoreBoard'))return;initialized=true;
 $('v220ScoreFilter').addEventListener('change',event=>{filter=event.target.value;offset=0;draw();});
 $('v220ScorePrev').addEventListener('click',()=>{offset=Math.max(0,offset-size());draw();});
 $('v220ScoreNext').addEventListener('click',()=>{offset+=size();draw();});
 window.addEventListener('alm:language-changed',draw);
 window.addEventListener('alm:collection-changed',()=>{records=library();draw();});
 $('navDna')?.addEventListener('click',()=>{records=library();draw();});
 if(typeof ResizeObserver==='function'){let previous=0;observer=new ResizeObserver(()=>{const current=size();if(current!==previous){previous=current;offset=Math.floor(offset/current)*current;draw();}});observer.observe($('dnaScorePosters'));}
 records=library();draw();
}
window.ALM_V220_SCORE_GALLERY={render(list,renderThumb){init();records=Array.isArray(list)?list:[];thumb=typeof renderThumb==='function'?renderThumb:thumb;draw();}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
