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
 const tr=i=>(copy[window.ALM_DESIGN?.language?.()]||copy.en)[i];
 const bridge=()=>window.animeManager;
 const valid=a=>Number.isSafeInteger(Number(a?.malId))&&Number(a.malId)>0&&Number(a.malId)<=100000000;
 const available=()=>typeof bridge()?.streamList==='function'&&typeof bridge()?.mediaSelectOne==='function';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const btn=(text,action,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=event=>{event.stopPropagation();action(b);};return b;};
 const labelled=(text,field)=>{const l=el('label',text);l.append(field);return l;};
 const number=(value)=>{const i=el('input');i.type='number';i.min='0';i.max='999';i.step='1';i.required=true;i.value=String(value);return i;};
 const epText=ep=>ep>0?tr(19)+' '+ep:tr(18);
 let dialog,current,body,heading,notice,serial=0,busy=false,returnFocus=null;
 const changed=()=>window.dispatchEvent(new CustomEvent('alm:sources-changed'));
 function ensure(){
  if(dialog)return;
  dialog=el('dialog',null,'alm-source-dialog calendar-dialog');dialog.id='almSourceDialog';dialog.setAttribute('data-no-i18n','');dialog.setAttribute('aria-labelledby','almSourceTitle');
  const header=el('header',null,'alm-source-header');heading=el('h2');heading.id='almSourceTitle';header.append(heading,btn(tr(15),()=>dialog.close(),'alm-source-close'));
  notice=el('p',null,'alm-v220-note');notice.setAttribute('role','status');body=el('div',null,'alm-source-body');dialog.append(header,notice,body);document.body.append(dialog);
  dialog.addEventListener('close',()=>{serial++;current=null;returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});});
 }
 async function run(action,{reload=true}={}){
  if(busy||!current)return;busy=true;const version=serial;notice.textContent='';
  const disabled=[...body.querySelectorAll('button,input')].map(n=>[n,n.disabled]);disabled.forEach(([n])=>n.disabled=true);
  try{const result=await action();if(result===false||result?.ok===false)throw Error('ALM_SOURCE_FAILED');if(reload&&!result?.canceled){changed();if(version===serial)await paint();}}
  catch{if(version===serial)notice.textContent=tr(14);}
  finally{busy=false;disabled.forEach(([n,was])=>n.disabled=was);}
 }
 async function paint(){
  const a=current;if(!a||!dialog.open)return;const version=serial,id=Number(a.malId),api=bridge();
  const [allLocal,streams]=await Promise.all([api.mediaSaved(),api.streamList(id)]);if(version!==serial||current!==a||!dialog.open)return;
  heading.textContent=tr(1);body.replaceChildren();
  const name=el('strong',window.ALM_TITLES?.title(a)||a.title||'');name.setAttribute('translate','no');body.append(name,el('p',tr(13),'alm-v220-note'));
  const local=el('section',null,'alm-source-section');local.append(el('h3',tr(2)));
  const rows=allLocal.filter(row=>Number(row.malId)===id),seen=Number(a.episodesSeen),total=Number(a.episodesTotal);
  const next=a.type==='Movie'?0:a.status==='Watching'&&Number.isSafeInteger(seen)&&seen>=0&&seen<999&&(!total||seen<total)?seen+1:1;
  const localEpisode=number(next),localForm=el('div',null,'alm-source-form');
  const choose=btn(tr(5),()=>{if(!localEpisode.reportValidity())return;const season=Number(a.manualSeasonNumber||a.betaseriesSeason||0);void run(()=>api.mediaSelectOne(id,Number(localEpisode.value),Number.isSafeInteger(season)&&season>=0&&season<=99?season:0));});
  localForm.append(labelled(tr(4),localEpisode),choose);local.append(localForm);
  if(!rows.length)local.append(el('p',tr(12),'alm-v220-note'));
  for(const row of rows){
   const line=el('div',null,'alm-source-row'),label=el('div');label.append(el('strong',row.filename),el('small',epText(row.episodeGuess)+(row.folder?' · '+row.folder:'')));
   const play=btn(tr(9),()=>void run(()=>api.mediaOpenKey(id,row.key),{reload:false}));if(row.legacy||(!row.wholeWork&&!row.episodeGuess))play.disabled=true;
   line.append(label,play,btn(tr(11),()=>{if(window.confirm(tr(16)))void run(()=>api.mediaRemoveKey(id,row.key));}));local.append(line);
  }
  const streaming=el('section',null,'alm-source-section');streaming.append(el('h3',tr(3)));
  const form=el('form',null,'alm-source-form');let editing;
  const label=el('input');label.maxLength=100;label.placeholder=tr(6);
  const url=el('input');url.type='url';url.required=true;url.maxLength=2048;url.placeholder='https://…';
  const episode=number(0);const save=el('button',tr(8));save.type='submit';const cancel=btn(tr(17),()=>reset());cancel.hidden=true;
  const reset=()=>{editing=undefined;label.value='';url.value='';episode.value='0';cancel.hidden=true;};
  form.append(labelled(tr(6),label),labelled(tr(7),url),labelled(tr(4),episode),save,cancel);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;void run(()=>api.streamPut({malId:id,episode:Number(episode.value),label:label.value,url:url.value.trim(),...(editing?{key:editing}:{})}));};
  const add=el('details',null,'alm-source-add');add.append(el('summary',tr(20)),form);streaming.append(add);
  if(!streams.length)streaming.append(el('p',tr(12),'alm-v220-note'));
  for(const row of streams){
   const line=el('div',null,'alm-source-row'),info=el('div');let host='';try{host=new URL(row.url).hostname;}catch{}
   info.append(el('strong',row.label),el('small',epText(row.episode)+' · '+host));
   const edit=btn(tr(10),()=>{editing=row.key;label.value=row.label;url.value=row.url;episode.value=String(row.episode);cancel.hidden=false;add.open=true;label.focus();});
   line.append(info,btn(tr(9),()=>void run(()=>api.streamOpen(id,row.key),{reload:false})),edit,btn(tr(11),()=>{if(window.confirm(tr(16)))void run(()=>api.streamRemove(id,row.key));}));streaming.append(line);
  }
  body.append(local,streaming);
 }
 function open(a,source){
  if(!available()||!valid(a)||busy)return;ensure();serial++;current=(window._almAnimes||[]).find(row=>Number(row.id)===Number(a.id))||a;returnFocus=source||document.activeElement;heading.textContent=tr(1);notice.textContent='';body.replaceChildren();
  if(!dialog.open)dialog.showModal();const version=serial;void paint().catch(()=>{if(version===serial)notice.textContent=tr(14);});
 }
 function createButton(a){
  if(!available()||!valid(a))return null;
  const b=btn(tr(0),source=>open(a,source),'alm-source-trigger');b.setAttribute('data-no-i18n','');b.title=tr(1);return b;
 }
 function decorate(){
  if(!available())return;const byId=new Map((window._almAnimes||[]).map(a=>[String(a.id),a]));
  for(const card of document.querySelectorAll('#animeGrid .card[data-anime-id]')){
   const actions=card.querySelector('.actions'),a=byId.get(card.dataset.animeId);if(!actions||!valid(a))continue;
   const old=actions.querySelector('.alm-source-trigger');if(old){old.textContent=tr(0);old.title=tr(1);continue;}
   const b=createButton(a);if(!b)continue;actions.insertBefore(b,actions.querySelector('[data-action="recommend"],[data-action="delete"]')||null);
  }
 }
 window.ALM_SOURCES={available,open,createButton};
 window.addEventListener('alm:library-rendered',decorate);
 window.addEventListener('alm:collection-changed',decorate);
 window.addEventListener('alm:language-changed',()=>{decorate();if(dialog?.open){dialog.querySelector('.alm-source-close').textContent=tr(15);if(!busy)void paint().catch(()=>{});}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});else decorate();
})();
