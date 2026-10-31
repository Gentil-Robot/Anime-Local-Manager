(() => {
 'use strict';const languages=['fr','en','ja','es','de','pt-BR','zh-CN'],entries={
 imageCache:['Jaquettes en cache','Cached covers','キャッシュ済み画像','Portadas en caché','Gespeicherte Cover','Capas em cache','缓存封面'],
 catalogueRecords:['fiches catalogue','catalogue records','カタログ項目','fichas del catálogo','Katalogeinträge','fichas do catálogo','目录条目'],
 storageTitle:['Stockage et intégrité','Storage and integrity','ストレージと整合性','Almacenamiento e integridad','Speicher und Integrität','Armazenamento e integridade','存储与完整性'],
 storageHelp:['La collection, le catalogue et les caches sont séparés. Le nettoyage proposé ne supprime que les anciens installateurs téléchargés.','Collection, catalogue and caches are separate. Cleanup removes only old downloaded installers.','コレクション、カタログ、キャッシュは分離されています。削除対象は古いインストーラーのみです。','La colección, el catálogo y la caché están separados. Solo se eliminan instaladores antiguos.','Sammlung, Katalog und Cache sind getrennt. Nur alte Installationsdownloads werden entfernt.','Coleção, catálogo e cache são separados. A limpeza remove apenas instaladores antigos.','收藏、目录和缓存分别存储。清理仅删除旧安装包。'],
 storageCheck:['Vérifier les bases','Check databases','データベースを検証','Verificar bases','Datenbanken prüfen','Verificar bases','检查数据库'],
 storageClean:['Nettoyer les anciens installateurs','Clean old installers','古いインストーラーを削除','Limpiar instaladores antiguos','Alte Installationsdateien löschen','Limpar instaladores antigos','清理旧安装包'],
 storageHealthy:['Intégrité vérifiée','Integrity verified','整合性を確認しました','Integridad verificada','Integrität geprüft','Integridade verificada','完整性已验证'],
 storageMirror:['Copie de récupération en cours','Recovery copy pending','復旧コピーを保存中','Copia de recuperación pendiente','Wiederherstellungskopie ausstehend','Cópia de recuperação pendente','恢复副本正在保存'],
 videoMissing:['Aucune vidéo disponible dans les sources enregistrées.','No video available in the saved sources.','保存された情報に動画はありません。','No hay vídeos en las fuentes guardadas.','Keine Videos in den gespeicherten Quellen.','Nenhum vídeo nas fontes salvas.','已保存的来源中没有视频。'],
 videoTitle:['Vidéos','Videos','動画','Vídeos','Videos','Vídeos','视频'],
 videoWatch:['Voir la vidéo','Watch video','動画を見る','Ver vídeo','Video ansehen','Ver vídeo','观看视频'],
 volume:['Volume','Volume','音量','Volumen','Lautstärke','Volume','音量'],
 mute:['Couper ou rétablir le son','Mute or unmute','ミュート切り替え','Silenciar o activar sonido','Stumm schalten oder Ton aktivieren','Silenciar ou ativar som','静音或取消静音'],
 restartRestored:['Les états locaux restaurés seront pris en compte au prochain lancement.','Restored local states will apply on the next launch.','復元したローカル状態は次回起動時に反映されます。','Los estados restaurados se aplicarán al reiniciar.','Wiederhergestellte lokale Zustände gelten beim nächsten Start.','Os estados restaurados serão aplicados na próxima abertura.','恢复的本地状态将在下次启动时生效。'],
 sourceReview:['La fiche ne correspond pas au titre attendu ? Recherchez le bon titre avant de modifier son association.','Does this record differ from the expected title? Search for the right title before changing its match.','作品が違いますか？関連付けを変更する前に正しい作品を検索してください。','¿La ficha no corresponde? Busca el título correcto antes de cambiar la asociación.','Falscher Eintrag? Vor dem Ändern der Zuordnung den richtigen Titel suchen.','Ficha incorreta? Pesquise o título correto antes de alterar a associação.','条目不正确？更改关联前请搜索正确标题。']
 };
 for(const [key,values]of Object.entries(entries))languages.forEach((lang,i)=>window.ALM_DESIGN_COPY[lang][key]=values[i]);
 const D=window.ALM_DESIGN,$=id=>document.getElementById(id),t=key=>D.t(key);
 function init(){
  document.querySelectorAll('.site-footer .footer-version,.sidebar-version,[data-alm-edition]').forEach(footer=>footer.textContent=D.edition());
  // The cached library poster must NEVER fall through to a direct CDN URL.
  // The local server owns the bounded queue and provider-wide cooldowns.
  document.addEventListener('error',event=>{
   const image=event.target;if(image?.tagName!=='IMG')return;
   if(image.dataset.almManagedCover==='1'){
    image.dataset.coverRetryPending='1';image.hidden=true;
    image.parentElement?.classList.add('poster-missing','image-error','is-missing');
    return;
   }
   image.hidden=true;image.dataset.newsImageFailed='1';
   image.parentElement?.classList.add('poster-missing','image-error','is-missing');
   if(image.nextElementSibling)image.nextElementSibling.hidden=false;
  },true);
  document.addEventListener('load',event=>{
   const image=event.target;if(image?.tagName!=='IMG'||image.dataset.almManagedCover!=='1')return;
   image.hidden=false;delete image.dataset.coverRetryPending;
   image.parentElement?.classList.remove('poster-missing','image-error','is-missing');
  },true);
  const visibleFailedCover=image=>{
   if(!image.isConnected||image.dataset.almManagedCover!=='1'||image.dataset.coverRetryPending!=='1')return false;
   const card=image.closest('.card,.memory-card');if(!card)return false;
   const rect=card.getBoundingClientRect();
   return rect.width>0&&rect.height>0&&rect.bottom>=0&&rect.top<=window.innerHeight;
  };
  let reconnectCooldownUntil=0;
  window.addEventListener('online',async()=>{
   if(document.visibilityState==='hidden'||Date.now()<reconnectCooldownUntil)return;
   const pending=Array.from(document.querySelectorAll('img[data-alm-managed-cover="1"][data-cover-retry-pending="1"]'))
    .filter(visibleFailedCover).slice(0,12);
   if(!pending.length)return;
   reconnectCooldownUntil=Date.now()+60_000;
   try{
    const response=await fetch('/api/cover-cache/reconnect',{method:'POST',headers:{'X-ALM-Cover-Reconnect':'1'},credentials:'same-origin'});
    if(!response.ok)return;
   }catch{return;}
   // Stagger only currently visible failed posters. Every request goes back
   // through /api/cover-cache/:malId and its 3-worker queue; no CDN fallback.
   pending.forEach((image,index)=>setTimeout(()=>{
    if(!visibleFailedCover(image)||document.visibilityState==='hidden')return;
    const src=image.getAttribute('src')||'';
    let url;try{url=new URL(src,window.location.origin);}catch{return;}
    if(url.origin!==window.location.origin||!/^\/api\/cover-cache\/\d+$/.test(url.pathname))return;
    image.hidden=false;delete image.dataset.coverRetryPending;
    image.src=url.pathname+'?resume='+Date.now();
   },index*250));
  });
  document.addEventListener('click',event=>{const action=event.target.closest('[data-news-action]')?.dataset.newsAction;if(action==='refresh')window.loadNews?.(true);if(action==='reset')window.resetNewsFiltersV2?.();});
  window.notifyApp=(message,type='info')=>{let host=$('toastContainer');if(!host){host=document.createElement('div');host.id='toastContainer';document.body.append(host);}const toast=document.createElement('div'),copy=document.createElement('span'),close=document.createElement('button');toast.className='toast visible '+type;toast.setAttribute('role',type==='error'?'alert':'status');copy.textContent=String(message||'');close.type='button';close.textContent='×';close.setAttribute('aria-label',D.t('closeDetail'));toast.append(copy,close);host.append(toast);let clock;const dismiss=()=>{clock?.stop();toast.remove();};clock=window.ALM_COUNTDOWN.start(close,type==='error'?8000:5000,dismiss,toast);close.onclick=dismiss;};
  const media=$('donationKaraokeClip'),controls=document.querySelector('.donation-karaoke-controls');
  if(media&&controls){const box=document.createElement('div'),button=document.createElement('button'),range=document.createElement('input');box.className='karaoke-volume';button.id='karaokeMute';button.type='button';range.id='karaokeVolume';range.type='range';range.min='0';range.max='1';range.step='.01';range.value=D.storage.get('alm.media.volume')||'1';media.volume=Math.min(1,Math.max(0,Number(range.value)));media.muted=D.storage.get('alm.media.muted')==='true';
   const paint=()=>{button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="'+(media.muted||media.volume===0?'M17 9l5 6 M22 9l-5 6':'M17 8a6 6 0 0 1 0 8 M20 5a10 10 0 0 1 0 14')+'"/></svg>';button.title=t('mute');button.setAttribute('aria-label',t('mute'));button.setAttribute('aria-pressed',String(media.muted));range.setAttribute('aria-label',t('volume'));range.setAttribute('aria-valuetext',Math.round(media.volume*100)+'%');range.title=t('volume')+' · '+Math.round(media.volume*100)+'%';};
   range.oninput=()=>{media.volume=Number(range.value);media.muted=false;D.storage.set('alm.media.volume',range.value);D.storage.set('alm.media.muted','false');paint();};button.onclick=()=>{media.muted=!media.muted;D.storage.set('alm.media.muted',String(media.muted));paint();};media.addEventListener('volumechange',()=>{range.value=String(media.volume);paint();});box.append(button,range);const play=$('donationKaraokePlay');if(play?.parentElement===controls){const playback=document.createElement('div');playback.className='karaoke-playback';controls.insertBefore(playback,play);playback.append(play,box);}else controls.append(box);window.addEventListener('alm:language-changed',paint);paint();
  }
  let storageWarning='';const checkStorage=async()=>{try{const r=await fetch('/api/storage/status');if(!r.ok)return;const s=await r.json();if(s.error&&s.error!==storageWarning){storageWarning=s.error;window.notifyApp(t('storageTitle')+' · '+s.error,'error');}if(!s.error)storageWarning='';}catch{}};window.addEventListener('alm:collection-changed',()=>setTimeout(checkStorage,2300));checkStorage();
  const nav=$('settingsSections'),main=document.querySelector('#settingsDialog .settings-main');if(nav&&main){
   const button=document.createElement('button'),panel=document.createElement('section');button.id='settingsTab-storage';button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-controls','settingsPanel-storage');button.innerHTML=D.icon('shield')+'<span data-design-text="storageTitle"></span>';button.setAttribute('aria-selected','false');panel.id='settingsPanel-storage';panel.className='settings-tab-panel storage-section';panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
   panel.innerHTML='<h2 data-design-text="storageTitle"></h2><p data-design-text="storageHelp"></p><div id="storageFacts" class="storage-facts"></div><div class="storage-actions"><button id="storageCheck" type="button" data-design-text="storageCheck"></button><button id="storageClean" type="button" data-design-text="storageClean"></button><button type="button" data-alm-diagnostic></button></div><p id="storageState" role="status"></p>';
   nav.append(button);main.append(panel);const request=async(url,body)=>{const r=await fetch(url,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error(t('searchError'));return r.json();};
   const stateEngine=data=>data.database.engine;
   const refresh=async()=>{try{const data=await request('/api/storage');$('storageFacts').replaceChildren();for(const file of [...data.files,{name:t('imageCache'),bytes:data.images.bytes},{name:'RAM · '+stateEngine(data),bytes:data.memory.rss}]){const box=document.createElement('div'),name=document.createElement('strong');name.textContent=file.name;box.append(name,document.createTextNode((file.bytes/1048576).toFixed(1)+' MiB'));$('storageFacts').append(box);}for(const [label,value]of [[window.ALM_COMMUNITY_T('library'),data.collection.total],[t('catalogueRecords'),data.catalogue]]){const box=document.createElement('div'),name=document.createElement('strong');name.textContent=label;box.append(name,document.createTextNode(String(value)));$('storageFacts').append(box);}const state=data.database;$('storageState').textContent=[state.engine,state.error,state.mirrorPending?t('storageMirror'):'',data.catalogue+' '+t('catalogueRecords')].filter(Boolean).join(' · ');}catch(e){$('storageState').textContent=e.message;}};
   nav.addEventListener('click',event=>{const isStorage=event.target.closest('button')===button;panel.hidden=!isStorage;button.setAttribute('aria-selected',String(isStorage));if(isStorage){for(const p of main.querySelectorAll('.settings-tab-panel'))p.hidden=p!==panel;for(const b of nav.querySelectorAll('button')){b.setAttribute('aria-selected',String(b===button));b.tabIndex=b===button?0:-1;}main.scrollTop=0;refresh();}});
   $('storageCheck').onclick=async()=>{try{const result=await request('/api/storage/check',{});$('storageState').textContent=result.ok?t('storageHealthy'):t('searchError');window.ALM_SUPPORT?.record('storage',result.ok?null:'ALM_STORAGE_INTEGRITY');}catch(e){$('storageState').textContent=e.message;}};
   $('storageClean').onclick=async()=>{try{const preview=await request('/api/storage/cleanup/preview',{});if(!preview.files.length){$('storageState').textContent='0 MiB';return;}if(await window.showAppConfirm(t('storageClean')+' · '+(preview.bytes/1048576).toFixed(1)+' MiB')){const result=await request('/api/storage/cleanup',{token:preview.token});$('storageState').textContent=result.count+' · '+(result.bytes/1048576).toFixed(1)+' MiB';refresh();}}catch(e){$('storageState').textContent=e.message;}};
   window.addEventListener('alm:language-changed',()=>{D.applyText(panel);D.applyText(button);if(!panel.hidden)refresh();});D.applyText(panel);D.applyText(button);
  }
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
