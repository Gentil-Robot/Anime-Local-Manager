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
let records=[],filter='all',thumb=null,initialized=false,observer=null,gallery=[];
const library=()=>Array.isArray(window._almAnimes)?window._almAnimes:[];
const title=a=>window.ALM_TITLES?.title?.(a)||a.title||'Anime';
const size=()=>{const w=$('dnaScorePosters')?.clientWidth||960;return Math.max(2,Math.min(8,Math.floor(w/95)));};
function localThumb(a){
 const span=el('span','🎌','dna-score-poster-ph'),id=Number(a.malId),raw=String(a.poster||a.imageUrl||'').replace(/^(images|assets)\//i,'/$1/');
 const url=/^\/(?:images|assets)\/[a-z0-9._%/-]+$/i.test(raw)?raw:Number.isSafeInteger(id)&&id>0?'/api/cover-cache/'+id:'';
 if(url){const img=el('img');img.src=url;img.alt='';img.loading='lazy';img.dataset.imageFallback='true';if(url.startsWith('/api/cover-cache/'))img.dataset.almManagedCover='1';span.append(img);}return span;
}
function metrics(){
 const host=$('dnaScorePosters'),page=size(),width=host.clientWidth||960;
 const step=(width+8)/page,max=Math.max(0,host.scrollWidth-host.clientWidth||Math.max(0,(gallery.length-page)*step));
 const first=Math.min(Math.max(0,gallery.length-page),Math.max(0,Math.round(host.scrollLeft/step)));
 return {host,page,step,max,first};
}
function sync(){
 const {host,page,max,first}=metrics(),prev=$('v220ScorePrev'),next=$('v220ScoreNext'),summary=$('v220ScoreSummary');
 prev.disabled=gallery.length<=page||host.scrollLeft<=1;
 next.disabled=gallery.length<=page||host.scrollLeft>=max-1;
 summary.textContent=(filter==='all'?'':(filter+'/10 · '))+(gallery.length?String(first+1)+'–'+Math.min(first+page,gallery.length)+' / '+gallery.length+' '+t(8):'0 '+t(8));
}
function slide(direction){
 const {host,step,max}=metrics(),left=Math.max(0,Math.min(max,host.scrollLeft+direction*step));
 const reduced=document.documentElement.dataset.motion==='reduced'||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 if(typeof host.scrollTo==='function')host.scrollTo({left,behavior:reduced?'auto':'smooth'});else{host.scrollLeft=left;sync();}
}
function draw(reset=false){
 const host=$('dnaScorePosters'),prev=$('v220ScorePrev'),next=$('v220ScoreNext'),summary=$('v220ScoreSummary');
 if(!host||!prev||!next||!summary)return;
 const old=reset?0:host.scrollLeft;
 const page=size();gallery=M.scoreGallery(records,filter);
 host.style.setProperty('--alm-score-columns',String(page));host.replaceChildren();
 for(const a of gallery){
  const button=el('button',null,'dna-score-poster');button.type='button';button.dataset.animeId=String(a.id);button.dataset.score=String(M.score(a.score)??'');
  button.title=title(a)+' — '+(M.score(a.score)===null?t(2):M.score(a.score)+'/10');button.setAttribute('aria-label',t(6)+': '+button.title);
  if(thumb){button.innerHTML=thumb(a);}else button.append(localThumb(a));
  if(M.score(a.score)!==null)button.append(el('span','⭐ '+a.score,'dna-score-badge'));
  button.append(el('span',title(a),'dna-score-poster-title'));
  button.addEventListener('click',()=>{if(window.ALM_CATALOG?.openRecords)window.ALM_CATALOG.openRecords(gallery,gallery.findIndex(r=>Number(r.id)===Number(a.id)),button);else window.openEdit?.(a);});
  host.append(button);
 }
 if(!gallery.length)host.append(el('p',t(3),'alm-v220-note'));
 host.scrollLeft=Math.min(old,Math.max(0,metrics().max));sync();
 for(const [b,i] of [[prev,4],[next,5]]){b.title=t(i);b.setAttribute('aria-label',t(i));}
 for(const b of $('dnaScoreDist')?.querySelectorAll('[data-dna-personal-score]')||[]){
  const value=b.dataset.dnaPersonalScore;b.setAttribute('aria-pressed',String(filter===value));b.classList.toggle('is-selected',filter===value);
  b.setAttribute('aria-label',t(7)+' '+value+'/10');
  b.onclick=()=>{filter=filter===value?'all':value;draw(true);};
 }
}
function init(){
 if(initialized||!$('v220ScoreBoard'))return;initialized=true;
 $('v220ScorePrev').addEventListener('click',()=>slide(-1));
 $('v220ScoreNext').addEventListener('click',()=>slide(1));
 $('dnaScorePosters').addEventListener('scroll',sync,{passive:true});
 $('dnaScorePosters').addEventListener('keydown',event=>{if(event.target!==$('dnaScorePosters')||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();slide(event.key==='ArrowLeft'?-1:1);});
 window.addEventListener('alm:language-changed',()=>draw());
 window.addEventListener('alm:collection-changed',()=>{records=library();draw();});
 $('navDna')?.addEventListener('click',()=>{records=library();draw();});
 if(typeof ResizeObserver==='function'){let previous=0;observer=new ResizeObserver(()=>{const current=size();if(current!==previous){previous=current;draw();}});observer.observe($('dnaScorePosters'));}
 records=library();draw();
}
window.ALM_V220_SCORE_GALLERY={render(list,renderThumb){init();records=Array.isArray(list)?list:[];thumb=typeof renderThumb==='function'?renderThumb:thumb;draw();}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
