/* ALM: personal viewing sources, external playback only. */
(()=>{
 'use strict';
 const copy={
 fr:['Sources','Sources de visionnage','Fichiers locaux','Liens de streaming','Épisode (0 = œuvre complète)','Choisir une vidéo','Nom de la source','Adresse HTTP(S)','Enregistrer','Ouvrir','Modifier','Dissocier','Aucune source enregistrée.','Uniquement sur cet appareil. La progression ne change pas.','Impossible de terminer cette action.','Fermer','Dissocier cette source ? La vidéo ne sera pas supprimée.','Annuler','Œuvre complète','Épisode','Ajouter un lien'],
 en:['Sources','Viewing sources','Local files','Streaming links','Episode (0 = whole title)','Choose a video','Source name','HTTP(S) address','Save','Open','Edit','Unlink','No saved sources.','Only on this device. Progress is unchanged.','Unable to complete this action.','Close','Unlink this source? The video will not be deleted.','Cancel','Whole title','Episode','Add a link'],
 es:['Fuentes','Fuentes de reproducción','Archivos locales','Enlaces de streaming','Episodio (0 = obra completa)','Elegir vídeo','Nombre de la fuente','Dirección HTTP(S)','Guardar','Abrir','Editar','Desvincular','No hay fuentes guardadas.','Solo en este equipo. El progreso no cambia.','No se pudo completar la acción.','Cerrar','¿Desvincular esta fuente? El vídeo no se borrará.','Cancelar','Obra completa','Episodio','Añadir enlace'],
 de:['Quellen','Wiedergabequellen','Lokale Dateien','Streaming-Links','Folge (0 = gesamtes Werk)','Video auswählen','Name der Quelle','HTTP(S)-Adresse','Speichern','Öffnen','Bearbeiten','Trennen','Keine Quellen gespeichert.','Nur auf diesem Gerät. Fortschritt bleibt unverändert.','Aktion konnte nicht abgeschlossen werden.','Schließen','Quelle trennen? Das Video wird nicht gelöscht.','Abbrechen','Gesamtes Werk','Folge','Link hinzufügen'],
 ja:['視聴元','視聴元の管理','ローカル動画','配信リンク','話数（0 = 作品全体）','動画を選択','視聴元の名前','HTTP(S) アドレス','保存','開く','編集','解除','保存された視聴元はありません。','この端末のみ。視聴進捗は変更されません。','操作を完了できませんでした。','閉じる','関連付けを解除しますか？動画は削除されません。','キャンセル','作品全体','話','リンクを追加'],
 'pt-BR':['Fontes','Fontes de reprodução','Arquivos locais','Links de streaming','Episódio (0 = obra completa)','Escolher vídeo','Nome da fonte','Endereço HTTP(S)','Salvar','Abrir','Editar','Desassociar','Nenhuma fonte salva.','Somente neste dispositivo. O progresso não muda.','Não foi possível concluir a ação.','Fechar','Desassociar esta fonte? O vídeo não será excluído.','Cancelar','Obra completa','Episódio','Adicionar link'],
 'zh-CN':['来源','观看来源','本地视频','流媒体链接','集数（0 = 整部作品）','选择视频','来源名称','HTTP(S) 地址','保存','打开','编辑','解除关联','没有已保存的来源。','仅保存在本机，不改变观看进度。','无法完成操作。','关闭','解除关联？视频不会被删除。','取消','整部作品','集','添加链接']
 };
 const extra={
 fr:['Mes sources','Source favorite','Définir comme favorite','Retirer des favoris','Affichage des sources','Sur toutes les cartes','Uniquement les cartes avec sources','Uniquement dans les fiches','Masquer les raccourcis','Rechercher un animé…','Afficher plus','Regarder','Choisir la saison','Chargement…','Fichier(s)','Lien(s)','Les sources restent accessibles dans Importer.','Saison','Importation de vidéos locales','Réglage enregistré'],
 en:['My sources','Favorite source','Set as favorite','Remove favorite','Source display','On all cards','Only cards with sources','Details only','Hide shortcuts','Search anime…','Show more','Watch','Choose season','Loading…','File(s)','Link(s)','Sources remain accessible in Import.','Season','Import local videos','Setting saved'],
 es:['Mis fuentes','Fuente favorita','Marcar como favorita','Quitar favorita','Mostrar fuentes','En todas las tarjetas','Solo tarjetas con fuentes','Solo en la ficha','Ocultar accesos','Buscar anime…','Mostrar más','Ver','Elegir temporada','Cargando…','Archivo(s)','Enlace(s)','Las fuentes siguen disponibles en Importar.','Temporada','Importar vídeos locales','Ajuste guardado'],
 de:['Meine Quellen','Bevorzugte Quelle','Als Favorit festlegen','Favorit entfernen','Quellenanzeige','Auf allen Karten','Nur Karten mit Quellen','Nur in Details','Verknüpfungen ausblenden','Anime suchen…','Mehr anzeigen','Ansehen','Staffel auswählen','Lädt…','Datei(en)','Link(s)','Quellen bleiben unter Import verfügbar.','Staffel','Lokale Videos importieren','Einstellung gespeichert'],
 ja:['視聴元一覧','お気に入りの視聴元','お気に入りにする','お気に入りを解除','視聴元の表示','すべてのカード','視聴元があるカードのみ','詳細のみ','ショートカットを非表示','作品を検索…','さらに表示','視聴する','シーズンを選択','読み込み中…','ファイル','リンク','インポートから視聴元を管理できます。','シーズン','ローカル動画をインポート','設定を保存しました'],
 'pt-BR':['Minhas fontes','Fonte favorita','Definir como favorita','Remover favorita','Exibição das fontes','Em todos os cartões','Apenas cartões com fontes','Apenas na ficha','Ocultar atalhos','Buscar anime…','Mostrar mais','Assistir','Escolher temporada','Carregando…','Arquivo(s)','Link(s)','As fontes continuam disponíveis em Importar.','Temporada','Importar vídeos locais','Configuração salva'],
 'zh-CN':['我的来源','首选来源','设为首选','取消首选','来源显示','所有卡片','仅有来源的卡片','仅详情页','隐藏快捷入口','搜索作品…','显示更多','观看','选择季度','加载中…','文件','链接','仍可在导入中管理来源。','季度','导入本地视频','设置已保存']
 };
 const locale=()=>window.ALM_DESIGN?.language?.()||'fr';
 const tr=i=>(copy[locale()]||copy.en)[i],tx=i=>(extra[locale()]||extra.en)[i];
 const bridge=()=>window.animeManager,byId=()=>new Map((window._almAnimes||[]).map(a=>[String(a.id),a]));
 const validId=id=>Number.isSafeInteger(Number(id))&&Number(id)>0&&Number(id)<=100000000;
 const valid=a=>validId(a?.malId);
 const available=()=>['sourceOverview','sourceDisplaySet','sourceFavoriteSet','streamList','mediaSavedFor','mediaSelectOne','mediaRelabelKey','mediaOpenKey','mediaRemoveKey','streamPut','streamRemove','streamOpen'].every(key=>typeof bridge()?.[key]==='function');
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const btn=(text,action,cls,key)=>{const b=el('button',text,cls);b.type='button';if(key)b.dataset.sourceAction=key;b.onclick=event=>{event.stopPropagation();action(b);};return b;};
 const labelled=(text,field)=>{const l=el('label',text);l.append(field);return l;};
 const number=(value,max=999)=>{const i=el('input');i.type='number';i.min='0';i.max=String(max);i.step='1';i.required=true;i.value=String(value);return i;};
 const epText=(ep,end=ep)=>ep>0?tr(19)+' '+ep+(end>ep?'–'+end:''):tr(18);
 const title=a=>window.ALM_TITLES?.title(a)||a.title||'';
 const notify=()=>window.notifyApp?.(tr(14),'error');
 const $=id=>document.getElementById(id);
 let dialog,current,body,heading,notice,serial=0,busy=false,returnFocus=null,initialized=false,localLimit=40,streamLimit=40,centralLimit=50;
 let display='always',groups=new Map(),overviewError=false,overviewFlight=null,overviewPending=false,settingsBusy=false;
 const changed=local=>window.dispatchEvent(new CustomEvent('alm:sources-changed',{detail:{local}}));
 const hasSources=id=>groups.has(Number(id));
 function visibleShortcut(a,surface='card',ids=[a?.malId]){
  if(display==='off')return false;
  if(surface==='detail')return true;
  if(display==='details')return false;
  return display!=='associated'||ids.some(hasSources);
 }
 function syncTrigger(b){
  const ids=(b.dataset.sourceIds||'').split(',').filter(validId);
  b.hidden=!visibleShortcut(null,b.dataset.sourceSurface,ids);
  b.textContent=tr(0);
  b.title=b.dataset.sourceGroup?tx(12):tr(1);
 }
 function syncTriggers(){document.querySelectorAll('.alm-source-trigger').forEach(syncTrigger);}
 function refreshOverview(){
  if(!available())return Promise.resolve(false);
  if(overviewFlight){overviewPending=true;return overviewFlight;}
  overviewFlight=(async()=>{let ok=true;do{
   overviewPending=false;
   try{
    const state=await bridge().sourceOverview();
    if(!['always','associated','details','off'].includes(state?.display)||!Array.isArray(state.groups))throw Error('ALM_SOURCE_PREFS_INVALID');
    display=state.display;groups=new Map(state.groups.filter(g=>validId(g.malId)).map(g=>[Number(g.malId),g]));overviewError=false;
   }catch{overviewError=true;ok=false;}
   decorate();syncSettings();renderCentral();window.dispatchEvent(new Event('alm:source-overview-changed'));
  }while(overviewPending);return ok;})().finally(()=>overviewFlight=null);
  return overviewFlight;
 }
 function ensure(){
  if(dialog)return;
  dialog=el('dialog',null,'alm-source-dialog calendar-dialog');dialog.id='almSourceDialog';dialog.setAttribute('data-no-i18n','');dialog.setAttribute('aria-labelledby','almSourceTitle');
  const header=el('header',null,'alm-source-header');heading=el('h2');heading.id='almSourceTitle';header.append(heading,btn(tr(15),()=>dialog.close(),'alm-source-close'));
  notice=el('p',null,'alm-v220-note');notice.setAttribute('role','status');body=el('div',null,'alm-source-body');dialog.append(header,notice,body);document.body.append(dialog);
  dialog.addEventListener('close',()=>{serial++;current=null;if(returnFocus?.isConnected&&!returnFocus.hidden)returnFocus.focus({preventScroll:true});});
 }
 async function run(action,{reload=true,local=false}={}){
  if(busy||!current)return;busy=true;const version=serial;notice.textContent='';
  const disabled=[...body.querySelectorAll('button,input')].map(n=>[n,n.disabled]);disabled.forEach(([n])=>n.disabled=true);
  try{
   const result=await action();if(result===false||result?.ok===false)throw Error('ALM_SOURCE_FAILED');
   if(reload&&!result?.canceled){changed(local);await refreshOverview();if(version===serial)await paint();}
  }catch{if(version===serial)notice.textContent=tr(14);}
  finally{busy=false;disabled.forEach(([n,was])=>n.disabled=was);}
 }
 function favoriteButton(id,kind,key){
  const f=groups.get(id)?.favorite,active=f?.kind===kind&&f.key===key;
  const b=btn(active?'★':'☆',()=>void run(()=>bridge().sourceFavoriteSet(id,active?null:kind,active?null:key)), 'alm-source-favorite','favorite');
  b.title=tx(active?3:2);b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(active));return b;
 }
 function addMore(section,rows,limit,extend){
  if(rows.length>limit)section.append(btn(tx(10)+' · '+(rows.length-limit),()=>{extend();void paint().catch(notify);},'alm-source-more','more'));
 }
 async function paint(){
  const a=current;if(!a||!dialog.open)return;const version=serial,id=Number(a.malId),api=bridge();
  const [rows,streams]=await Promise.all([api.mediaSavedFor(id),api.streamList(id)]);
  if(version!==serial||current!==a||!dialog.open)return;
  heading.textContent=tr(1);body.replaceChildren();
  const name=el('strong',title(a)||'MAL #'+id);name.setAttribute('translate','no');body.append(name,el('p',tr(13),'alm-v220-note'));
  const f=groups.get(id)?.favorite;
  if(f){
   const favorite=f.kind==='local'?rows.find(row=>row.key===f.key):streams.find(row=>row.key===f.key);
   if(favorite){const line=el('div',null,'alm-source-row alm-source-preferred'),info=el('div');info.append(el('strong',tx(1)),el('small',(favorite.filename||favorite.label)+' · '+epText(f.episode,f.end)));
    line.append(info,btn(tx(11),()=>void run(()=>f.kind==='local'?api.mediaOpenKey(id,f.key):api.streamOpen(id,f.key),{reload:false}),null,'open-favorite'));body.append(line);}
  }
  const local=el('section',null,'alm-source-section');local.append(el('h3',tr(2)));
  const seen=Number(a.episodesSeen),total=Number(a.episodesTotal),next=a.type==='Movie'?0:a.status==='Watching'&&Number.isSafeInteger(seen)&&seen>=0&&seen<999&&(!total||seen<total)?seen+1:1;
  const originalSeason=Number(a.manualSeasonNumber||a.betaseriesSeason||0),seasonDefault=Number.isSafeInteger(originalSeason)&&originalSeason>=0&&originalSeason<=99?originalSeason:0;
  const localEpisode=number(next),season=number(seasonDefault,99),localForm=el('div',null,'alm-source-form');let localEditing=null;
  const choose=btn(tr(5),()=>{
   if(!localEpisode.reportValidity()||!season.reportValidity())return;
   void run(()=>localEditing?api.mediaRelabelKey(id,localEditing,Number(localEpisode.value),Number(season.value)):api.mediaSelectOne(id,Number(localEpisode.value),Number(season.value)),{local:true});
  },null,'choose-local');
  const cancelLocal=btn(tr(17),()=>{localEditing=null;localEpisode.value=String(next);season.value=String(seasonDefault);choose.textContent=tr(5);cancelLocal.hidden=true;});cancelLocal.hidden=true;
  localForm.append(labelled(tr(4),localEpisode),labelled(tx(17),season),choose,cancelLocal);local.append(localForm);
  if(!rows.length)local.append(el('p',tr(12),'alm-v220-note'));
  const localSorted=[...rows].sort((a,b)=>Number(b.key===f?.key)-Number(a.key===f?.key)||(a.episodeGuess||0)-(b.episodeGuess||0));
  for(const row of localSorted.slice(0,localLimit)){
   const line=el('div',null,'alm-source-row'),label=el('div');line.dataset.sourceKey=row.key;
   label.append(el('strong',row.filename),el('small',(row.seasonGuess?tx(17)+' '+row.seasonGuess+' · ':'')+epText(row.episodeGuess,row.episodeEndGuess)+(row.folder?' · '+row.folder:'')));
   const play=btn(tr(9),()=>void run(()=>api.mediaOpenKey(id,row.key),{reload:false}),null,'open-local');if(row.legacy||(!row.wholeWork&&!row.episodeGuess))play.disabled=true;
   const edit=btn(tr(10),()=>{localEditing=row.key;localEpisode.value=String(row.episodeGuess||0);season.value=String(row.seasonGuess||0);choose.textContent=tr(8);cancelLocal.hidden=false;localEpisode.focus();},null,'edit-local');edit.disabled=!!row.legacy;
   const fav=favoriteButton(id,'local',row.key);fav.disabled=play.disabled;
   line.append(label,play,fav,edit,btn(tr(11),()=>{if(window.confirm(tr(16)))void run(()=>api.mediaRemoveKey(id,row.key),{local:true});},null,'remove-local'));local.append(line);
  }
  addMore(local,localSorted,localLimit,()=>localLimit+=40);
  const streaming=el('section',null,'alm-source-section');streaming.append(el('h3',tr(3)));
  const form=el('form',null,'alm-source-form');let editing;
  const label=el('input');label.maxLength=100;label.placeholder=tr(6);
  const url=el('input');url.type='url';url.required=true;url.maxLength=2048;url.placeholder='https://…';
  const episode=number(0),save=el('button',tr(8));save.type='submit';save.dataset.sourceAction='save-stream';const cancel=btn(tr(17),()=>reset());cancel.hidden=true;
  const reset=()=>{editing=undefined;label.value='';url.value='';episode.value='0';cancel.hidden=true;};
  form.append(labelled(tr(6),label),labelled(tr(7),url),labelled(tr(4),episode),save,cancel);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;void run(()=>api.streamPut({malId:id,episode:Number(episode.value),label:label.value,url:url.value.trim(),...(editing?{key:editing}:{})}));};
  const add=el('details',null,'alm-source-add');add.append(el('summary',tr(20)),form);streaming.append(add);
  if(!streams.length)streaming.append(el('p',tr(12),'alm-v220-note'));
  const streamSorted=[...streams].sort((a,b)=>Number(b.key===f?.key)-Number(a.key===f?.key)||a.episode-b.episode);
  for(const row of streamSorted.slice(0,streamLimit)){
   const line=el('div',null,'alm-source-row'),info=el('div');line.dataset.sourceKey=row.key;
   let host='';try{host=new URL(row.url).hostname;}catch{}
   info.append(el('strong',row.label),el('small',epText(row.episode)+' · '+host));
   const edit=btn(tr(10),()=>{editing=row.key;label.value=row.label;url.value=row.url;episode.value=String(row.episode);cancel.hidden=false;add.open=true;label.focus();},null,'edit-stream');
   line.append(info,btn(tr(9),()=>void run(()=>api.streamOpen(id,row.key),{reload:false}),null,'open-stream'),favoriteButton(id,'stream',row.key),edit,btn(tr(11),()=>{if(window.confirm(tr(16)))void run(()=>api.streamRemove(id,row.key));},null,'remove-stream'));streaming.append(line);
  }
  addMore(streaming,streamSorted,streamLimit,()=>streamLimit+=40);body.append(local,streaming);
 }
 function open(a,source){
  if(!available()||!valid(a)||busy)return;ensure();serial++;
  const fresh=byId().get(String(a.id));current=fresh&&Number(fresh.malId)===Number(a.malId)?fresh:a;
  returnFocus=source||document.activeElement;localLimit=streamLimit=40;heading.textContent=tr(1);notice.textContent='';body.replaceChildren(el('p',tx(13),'alm-v220-note'));
  if(!dialog.open)dialog.showModal();const version=serial;void paint().catch(()=>{if(version===serial){body.replaceChildren();notice.textContent=tr(14);}});
 }
 function createButton(a,{surface='detail',groupKey='',ids=[a?.malId]}={}){
  const malIds=ids.filter(validId);
  if(!available()||(!valid(a)&&!groupKey)||!malIds.length)return null;
  const b=btn(tr(0),source=>groupKey?window.ALM_SERIES_UI?.open(groupKey,source):open(a,source),'alm-source-trigger','manage');
  b.setAttribute('data-no-i18n','');b.dataset.sourceSurface=surface;b.dataset.sourceIds=malIds.join(',');if(groupKey)b.dataset.sourceGroup=groupKey;syncTrigger(b);return b;
 }
 function createFavoriteButton(a,next){
  if(!available()||!valid(a)||!visibleShortcut(a,'cockpit'))return null;
  const id=Number(a.malId),f=groups.get(id)?.favorite,ep=a.type==='Movie'?0:next;
  if(!f||!Number.isSafeInteger(ep)||ep<0||f.kind==='stream'&&f.episode!==0&&f.episode!==ep||f.kind==='local'&&!(f.wholeWork&&ep===0||!f.wholeWork&&ep>=f.episode&&ep<=f.end))return null;
  const b=btn('▶ '+tx(11),async button=>{button.disabled=true;try{const result=await (f.kind==='local'?bridge().mediaOpenKey(id,f.key):bridge().streamOpen(id,f.key));if(!result?.ok)notify();}catch{notify();}finally{button.disabled=false;}},'alm-watch-local-open','quick-favorite');b.title=tx(1);return b;
 }
 function decorate(){
  if(!available())return;const lookup=byId();
  for(const card of document.querySelectorAll('#animeGrid .card[data-anime-id]')){
   const actions=card.querySelector('.actions'),a=lookup.get(card.dataset.animeId);if(!actions||!a)continue;
   const old=actions.querySelector('.alm-source-trigger');
   const groupKey=card.dataset.seriesKey||'',ids=groupKey?(card.dataset.sourceMalIds||'').split(','):[a.malId];
   if(old){old.remove();}
   const b=createButton(a,{surface:'card',groupKey,ids});if(b)actions.insertBefore(b,actions.querySelector('[data-action="recommend"],[data-action="delete"]')||null);
  }
  syncTriggers();
 }
 function renderCentral(){
  const panel=$('v220SourcesPanel'),host=$('v220SourcesList');if(!panel||!host||panel.hidden||!$('importDialog')?.open)return;
  const search=$('v220SourcesSearch'),query=(search?.value||'').trim().toLocaleLowerCase();
  const animeByMal=new Map((window._almAnimes||[]).filter(valid).map(a=>[Number(a.malId),a]));
  const rows=[...groups.values()].map(g=>({...g,anime:animeByMal.get(g.malId)||{malId:g.malId,title:'MAL #'+g.malId}})).filter(g=>!query||title(g.anime).toLocaleLowerCase().includes(query)||String(g.malId).includes(query)).sort((a,b)=>title(a.anime).localeCompare(title(b.anime),locale()));
  host.replaceChildren();$('v220SourcesStatus').textContent=overviewError?tr(14):'';
  if(!rows.length&&!overviewError)host.append(el('p',tr(12),'alm-v220-note'));
  for(const g of rows.slice(0,centralLimit)){
   const line=el('article',null,'alm-source-row'),info=el('div');line.dataset.malId=String(g.malId);
   info.append(el('strong',title(g.anime)),el('small',g.localCount+' '+tx(14)+' · '+g.streamCount+' '+tx(15)+(g.favorite?' · ★ '+tx(1):'')));
   line.append(info,btn(tr(0),source=>open(g.anime,source),null,'manage-central'));host.append(line);
  }
  const more=$('v220SourcesMore');more.hidden=rows.length<=centralLimit;more.textContent=tx(10)+' · '+Math.max(0,rows.length-centralLimit);
 }
 function syncSettings(){
  const panel=$('almSourceSettings');if(!panel)return;
  panel.querySelector('legend').textContent=tx(4);panel.querySelector('[data-source-settings-help]').textContent=tx(16);
  panel.querySelectorAll('input[data-source-display]').forEach((input,i)=>{input.checked=input.value===display;input.disabled=settingsBusy;input.nextElementSibling.textContent=tx(5+i);});
 }
 function init(){
  if(initialized)return;initialized=true;
  const tab=$('v220SourcesTab');if(!available()){if(tab)tab.hidden=true;return;}
  const host=$('settingsPanel-library')||document.querySelector('#settingsDialog .settings-main');
  if(host){
   const field=el('fieldset',null,'alm-source-settings');field.id='almSourceSettings';field.setAttribute('data-no-i18n','');field.append(el('legend',tx(4)));
   for(const [i,mode] of ['always','associated','details','off'].entries()){
    const input=el('input');input.type='radio';input.name='almSourceDisplay';input.value=mode;input.dataset.sourceDisplay=mode;
    const label=el('label',null,'check');label.append(input,el('span',tx(5+i)));field.append(label);
    input.onchange=async()=>{if(!input.checked||settingsBusy)return;settingsBusy=true;syncSettings();const status=field.querySelector('[role="status"]');try{if(!await bridge().sourceDisplaySet(mode))throw Error();await refreshOverview();status.textContent=overviewError?tr(14):tx(19);}catch{status.textContent=tr(14);}finally{settingsBusy=false;syncSettings();}};
   }
   const help=el('p',tx(16),'alm-v220-note');help.dataset.sourceSettingsHelp='';const status=el('p',null,'alm-v220-note');status.setAttribute('role','status');field.append(help,status);host.append(field);syncSettings();
  }
  $('v220SourcesSearch')?.addEventListener('input',()=>{centralLimit=50;renderCentral();});
  $('v220SourcesMore')?.addEventListener('click',()=>{centralLimit+=50;renderCentral();});
  $('v220SourcesClose')?.addEventListener('click',()=>$('importDialog')?.close());
  window.addEventListener('alm:import-tab-changed',e=>{if(e.detail?.panel==='v220SourcesPanel'){centralLimit=50;void refreshOverview();}});
  window.addEventListener('alm:source-links-changed',()=>void refreshOverview());
  translate();decorate();void refreshOverview();
 }
 function translate(){
  const tab=$('v220SourcesTab');if(tab)tab.textContent=tx(0);
  const title=$('v220SourcesTitle');if(title)title.textContent=tx(0);
  const intro=$('v220SourcesIntro');if(intro)intro.textContent=tr(13);
  const search=$('v220SourcesSearch');if(search){search.placeholder=tx(9);search.setAttribute('aria-label',tx(9));}
  const close=$('v220SourcesClose');if(close)close.textContent=tr(15);
  syncSettings();syncTriggers();renderCentral();
  if(dialog?.open){dialog.querySelector('.alm-source-close').textContent=tr(15);if(!busy)void paint().catch(notify);}
 }
 window.ALM_SOURCES={available,open,createButton,createFavoriteButton,showShortcut:a=>visibleShortcut(a,'cockpit'),refresh:refreshOverview};
 window.addEventListener('alm:library-rendered',decorate);
 window.addEventListener('alm:collection-changed',()=>{decorate();renderCentral();});
 window.addEventListener('alm:language-changed',translate);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
