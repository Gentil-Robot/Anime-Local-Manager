(()=>{'use strict';
// 2.2.0 VM preview: extend Saisons and En cours; add only genuinely new Mes fichiers.
const D={
 fr:{files:'Mes fichiers',intro:'Retrouve tes vidéos sur PC, disque externe ou NAS. Le scan est en lecture seule.',choose:'Choisir un dossier',scanning:'Analyse des fichiers…',noScan:'Aucun dossier analysé. Choisis un dossier pour commencer.',empty:'Aucune vidéo reconnue dans ce dossier.',filesFound:'vidéos détectées',truncated:'Résultats limités pour protéger les performances.',file:'Fichier',proposed:'Fiche ALM proposée',associate:'Associer',dissociate:'Dissocier',linked:'Associé',unknown:'Aucune correspondance sûre',search:'Rechercher une fiche dans ma bibliothèque…',next:'Afficher les fichiers suivants',readOnly:'Lecture seule : aucun fichier déplacé ou partagé. Les associations restent sur ce PC.',failed:'Impossible de lire ce dossier',sequelTitle:'Suites absentes de ma bibliothèque',sequelIntro:'Suggestions fondées sur les relations de saisons vérifiées, sans appels réseau.',sequelNone:'Aucune suite vérifiée manquante trouvée pour les animés analysés.',sequelAdd:'Ajouter à « À voir »',sequelAdded:'Ajouté à « À voir »',sequelFrom:'Après',sequelLoading:'Recherche dans le catalogue local…',sequelError:'Recherche des suites indisponible',confirm:'Ajouter cette suite à « À voir » ?',localBadge:'Fichier local associé',more:'autres fichiers'},
 en:{files:'My files',intro:'Find videos on your PC, external drive or NAS. Scanning is read-only.',choose:'Choose folder',scanning:'Scanning files…',noScan:'No folder scanned. Choose one to begin.',empty:'No supported videos in this folder.',filesFound:'videos found',truncated:'Results capped to keep ALM responsive.',file:'File',proposed:'Suggested ALM entry',associate:'Link',dissociate:'Unlink',linked:'Linked',unknown:'No confident match',search:'Search my library…',next:'Show more files',readOnly:'Read-only: no files moved or shared. Links stay on this PC.',failed:'Unable to scan this folder',sequelTitle:'Missing sequels',sequelIntro:'Verified local season links, without network requests.',sequelNone:'No verified missing sequels for scanned anime.',sequelAdd:'Add to watchlist',sequelAdded:'Added to watchlist',sequelFrom:'After',sequelLoading:'Checking local catalog…',sequelError:'Sequels unavailable',confirm:'Add this sequel to watchlist?',localBadge:'Local video linked',more:'more files'},
 es:{files:'Mis archivos',intro:'Encuentra tus vídeos en el PC, disco externo o NAS. Solo lectura.',choose:'Elegir carpeta',scanning:'Analizando archivos…',noScan:'Elige una carpeta para comenzar.',empty:'No hay vídeos compatibles.',filesFound:'vídeos encontrados',truncated:'Resultados limitados para preservar el rendimiento.',file:'Archivo',proposed:'Ficha ALM sugerida',associate:'Vincular',dissociate:'Desvincular',linked:'Vinculado',unknown:'Sin coincidencia segura',search:'Buscar en mi biblioteca…',next:'Mostrar más',readOnly:'Solo lectura: no se mueven ni comparten archivos. Enlaces locales.',failed:'Error al analizar carpeta',sequelTitle:'Continuaciones pendientes',sequelIntro:'Relaciones verificadas del catálogo local.',sequelNone:'No se encontraron continuaciones pendientes.',sequelAdd:'Añadir a pendientes',sequelAdded:'Añadido',sequelFrom:'Después de',sequelLoading:'Buscando en el catálogo…',sequelError:'Continuaciones no disponibles',confirm:'¿Añadir a pendientes?',localBadge:'Vídeo local vinculado',more:'archivos más'},
 de:{files:'Meine Dateien',intro:'Videos auf PC, externem Laufwerk oder NAS finden. Nur lesen.',choose:'Ordner auswählen',scanning:'Dateien werden geprüft…',noScan:'Bitte einen Ordner auswählen.',empty:'Keine unterstützten Videos.',filesFound:'Videos gefunden',truncated:'Ergebnisse aus Leistungsgründen begrenzt.',file:'Datei',proposed:'Vorgeschlagener ALM-Eintrag',associate:'Zuordnen',dissociate:'Trennen',linked:'Zugeordnet',unknown:'Keine eindeutige Zuordnung',search:'In meiner Bibliothek suchen…',next:'Weitere Dateien',readOnly:'Nur lesen: keine Dateien verschoben oder geteilt. Zuordnungen bleiben lokal.',failed:'Ordner konnte nicht gelesen werden',sequelTitle:'Fehlende Fortsetzungen',sequelIntro:'Verifizierte Beziehungen aus dem lokalen Katalog.',sequelNone:'Keine verifizierten Fortsetzungen gefunden.',sequelAdd:'Auf Merkliste',sequelAdded:'Hinzugefügt',sequelFrom:'Nach',sequelLoading:'Prüfe lokalen Katalog…',sequelError:'Fortsetzungen nicht verfügbar',confirm:'Zur Merkliste hinzufügen?',localBadge:'Lokales Video zugeordnet',more:'weitere Dateien'},
 ja:{files:'ローカル動画',intro:'PC、外付けディスク、NAS の動画を読み取り専用で検索します。',choose:'フォルダーを選択',scanning:'ファイルを確認中…',noScan:'フォルダーを選択してください。',empty:'対応動画がありません。',filesFound:'動画が見つかりました',truncated:'動作を守るため結果を制限しました。',file:'ファイル',proposed:'候補の作品',associate:'関連付け',dissociate:'解除',linked:'関連付け済み',unknown:'一致を確認できません',search:'ライブラリを検索…',next:'さらに表示',readOnly:'読み取り専用。動画は移動・共有されず、関連付けはこのPCに保存されます。',failed:'フォルダーを読み込めません',sequelTitle:'見逃した続編',sequelIntro:'ローカルの確認済みシーズン関係を使用します。',sequelNone:'確認済みの続編はありません。',sequelAdd:'視聴予定に追加',sequelAdded:'追加済み',sequelFrom:'前作',sequelLoading:'ローカルデータを確認中…',sequelError:'続編を取得できません',confirm:'視聴予定に追加しますか？',localBadge:'ローカル動画あり',more:'その他のファイル'},
 'pt-BR':{files:'Meus arquivos',intro:'Encontre vídeos no PC, disco externo ou NAS, sem alterações.',choose:'Escolher pasta',scanning:'Analisando arquivos…',noScan:'Escolha uma pasta para começar.',empty:'Nenhum vídeo compatível.',filesFound:'vídeos encontrados',truncated:'Resultados limitados para manter o desempenho.',file:'Arquivo',proposed:'Anime sugerido',associate:'Associar',dissociate:'Desassociar',linked:'Associado',unknown:'Sem correspondência segura',search:'Buscar na biblioteca…',next:'Mostrar mais',readOnly:'Somente leitura: nenhum arquivo movido ou compartilhado. Associações locais.',failed:'Não foi possível analisar a pasta',sequelTitle:'Continuações faltando',sequelIntro:'Relações verificadas do catálogo local.',sequelNone:'Nenhuma continuação verificada foi encontrada.',sequelAdd:'Adicionar a assistir',sequelAdded:'Adicionado',sequelFrom:'Depois de',sequelLoading:'Verificando catálogo…',sequelError:'Continuações indisponíveis',confirm:'Adicionar à lista?',localBadge:'Vídeo local associado',more:'outros arquivos'},
 'zh-CN':{files:'我的文件',intro:'只读扫描电脑、移动硬盘或 NAS 上的视频。',choose:'选择文件夹',scanning:'正在扫描…',noScan:'请选择文件夹开始。',empty:'未找到支持的视频。',filesFound:'个视频',truncated:'为保证性能限制了结果数量。',file:'文件',proposed:'建议关联作品',associate:'关联',dissociate:'取消关联',linked:'已关联',unknown:'没有可靠匹配',search:'搜索我的资料库…',next:'显示更多',readOnly:'只读扫描：不会移动或共享文件，关联信息仅保存在本机。',failed:'无法读取文件夹',sequelTitle:'错过的续作',sequelIntro:'仅使用本地已验证的季度关系。',sequelNone:'没有找到已验证的缺失续作。',sequelAdd:'加入待看',sequelAdded:'已加入',sequelFrom:'前作',sequelLoading:'正在查询本地目录…',sequelError:'续作暂不可用',confirm:'加入待看列表？',localBadge:'已关联本地视频',more:'其他文件'}
};
const EXTRA={
 fr:{saved:'Mes associations locales',savedInfo:'Conservées sur ce PC, même hors connexion.',noSaved:'Aucune vidéo associée pour le moment.',openVideo:'Ouvrir le fichier',unavailable:'Ce fichier est actuellement indisponible. Vérifie le disque ou le NAS.',online:'Connexion détectée',offline:'Hors connexion · données locales',exact:'Titre identifié',review:'À confirmer',noEpisode:'Numéro d’épisode incertain',missing:'Épisodes sans association locale',missingInfo:'Numéros absents entre deux épisodes associés. Cela ne prouve pas que les vidéos sont absentes du disque.',noneMissing:'Aucun écart détecté parmi les épisodes associés.',seeFiles:'Voir mes fichiers',missingNumber:'Non associés',goWatching:'En cours',goSeasons:'Saisons',folder:'Dossier',unknownFile:'Épisode inconnu'},
 en:{saved:'My local links',savedInfo:'Saved on this device, even when offline.',noSaved:'No videos linked yet.',openVideo:'Open file',unavailable:'This file is currently unavailable. Check your disk or NAS.',online:'Connection detected',offline:'Offline · local data',exact:'Title matched',review:'Needs confirmation',noEpisode:'Episode number uncertain',missing:'Unlinked episode numbers',missingInfo:'Gaps between two linked episodes. This does not mean videos are absent from your disk.',noneMissing:'No gaps detected in linked episodes.',seeFiles:'See my files',missingNumber:'Not linked',goWatching:'Watching',goSeasons:'Seasons',folder:'Folder',unknownFile:'Unknown episode'},
 es:{saved:'Mis asociaciones locales',savedInfo:'Guardadas en este equipo, incluso sin conexión.',noSaved:'Todavía no hay vídeos asociados.',openVideo:'Abrir archivo',unavailable:'El archivo no está disponible. Comprueba el disco o NAS.',online:'Conexión detectada',offline:'Sin conexión · datos locales',exact:'Título identificado',review:'Requiere confirmación',noEpisode:'Episodio incierto',missing:'Episodios sin asociar',missingInfo:'Huecos entre episodios asociados; pueden existir en otros lugares.',noneMissing:'Sin huecos entre episodios asociados.',seeFiles:'Ver mis archivos',missingNumber:'Sin asociar',goWatching:'En curso',goSeasons:'Temporadas',folder:'Carpeta',unknownFile:'Episodio desconocido'},
 de:{saved:'Meine lokalen Zuordnungen',savedInfo:'Auf diesem Gerät gespeichert, auch offline.',noSaved:'Noch keine Videos zugeordnet.',openVideo:'Datei öffnen',unavailable:'Datei nicht erreichbar. Laufwerk oder NAS prüfen.',online:'Verbindung erkannt',offline:'Offline · lokale Daten',exact:'Titel erkannt',review:'Bitte bestätigen',noEpisode:'Folgennummer unsicher',missing:'Nicht zugeordnete Folgen',missingInfo:'Lücken zwischen zugeordneten Folgen. Dateien können anderswo vorhanden sein.',noneMissing:'Keine Lücken in zugeordneten Folgen.',seeFiles:'Meine Dateien anzeigen',missingNumber:'Nicht zugeordnet',goWatching:'Laufend',goSeasons:'Staffeln',folder:'Ordner',unknownFile:'Unbekannte Folge'},
 ja:{saved:'ローカルの関連付け',savedInfo:'オフラインでもこの端末に保存されます。',noSaved:'関連付けされた動画はありません。',openVideo:'ファイルを開く',unavailable:'ファイルを開けません。ディスクまたはNASを確認してください。',online:'ネットワーク接続あり',offline:'オフライン · ローカルデータ',exact:'作品名を特定',review:'確認が必要',noEpisode:'話数が不明',missing:'未関連付けの話数',missingInfo:'関連付け済み話数の間の欠番です。実ファイルの欠落を意味しません。',noneMissing:'関連付け内に欠番はありません。',seeFiles:'ファイルを見る',missingNumber:'未関連付け',goWatching:'視聴中',goSeasons:'シーズン',folder:'フォルダー',unknownFile:'話数不明'},
 'pt-BR':{saved:'Associações locais',savedInfo:'Salvas neste dispositivo, mesmo offline.',noSaved:'Nenhum vídeo associado ainda.',openVideo:'Abrir arquivo',unavailable:'Arquivo indisponível. Verifique o disco ou NAS.',online:'Conexão detectada',offline:'Offline · dados locais',exact:'Título reconhecido',review:'Confirmar',noEpisode:'Episódio incerto',missing:'Episódios não associados',missingInfo:'Lacunas entre episódios associados; não prova ausência de arquivos.',noneMissing:'Nenhuma lacuna nas associações.',seeFiles:'Ver meus arquivos',missingNumber:'Não associado',goWatching:'Em andamento',goSeasons:'Temporadas',folder:'Pasta',unknownFile:'Episódio desconhecido'},
 'zh-CN':{saved:'本地关联',savedInfo:'保存在本机，离线也可访问。',noSaved:'尚未关联视频。',openVideo:'打开文件',unavailable:'文件暂不可用，请检查磁盘或NAS。',online:'检测到网络',offline:'离线 · 本地数据',exact:'标题已匹配',review:'需要确认',noEpisode:'集数不确定',missing:'未关联的集数',missingInfo:'两集已关联视频之间的缺号，不代表视频不在其他位置。',noneMissing:'已关联集数之间没有缺号。',seeFiles:'查看我的文件',missingNumber:'未关联',goWatching:'观看中',goSeasons:'季度',folder:'文件夹',unknownFile:'未知集数'}
};
const lang=()=>window.ALM_DESIGN?.language?.()||'fr';
const t=key=>(EXTRA[lang()]||EXTRA.en)[key]||(D[lang()]||D.en)[key]||D.en[key]||key;
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined&&text!==null)node.textContent=String(text);if(cls)node.className=cls;return node;};
const normalize=s=>String(s||'').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const animeList=()=>Array.isArray(window._almAnimes)?window._almAnimes:[];
let scan=null,visible=40,sequelBusy=false;
const summaries=new Map();
let savedRows=[];
const connectivity=()=>{const node=$('v220Connectivity');if(node){node.textContent=navigator.onLine===false?t('offline'):t('online');node.dataset.offline=String(navigator.onLine===false);}};
function mapTitles(){
 const map=new Map();for(const row of animeList()){if(!Number.isSafeInteger(Number(row.malId))||Number(row.malId)<1)continue;
 for(const name of [row.title,row.titleEn,row.titleRomaji,...(Array.isArray(row.synonyms)?row.synonyms.slice(0,12):[])]){
  const n=normalize(name);if(n.length<4)continue;
  const set=map.get(n)||new Set();set.add(Number(row.malId));map.set(n,set);
 }}return map;
}
function bestMatch(file,index){
 const matches=index.get(normalize(file.titleGuess));return matches?.size===1?[...matches][0]:0;
}
function showStatus(text){$('v220MediaStatus').textContent=text;}
async function openEpisode(malId,episode){
 if(!window.animeManager?.mediaOpenEpisode)return {ok:false,code:'ALM_MEDIA_UNAVAILABLE'};
 try{
  const result=await window.animeManager.mediaOpenEpisode(Number(malId),Number(episode));
  if(!result?.ok)window.notifyApp?.(t('unavailable')+(result?.code?' ('+result.code+')':''),'error');
  return result;
 }catch(error){window.notifyApp?.(t('unavailable'),'error');return {ok:false,code:String(error?.message||'ALM_MEDIA_ERROR')};}
}
function renderSaved(){
 const host=$('v220SavedRows');if(!host)return;
 host.replaceChildren();
 if($('v220SavedTitle'))$('v220SavedTitle').textContent=t('saved');
 if($('v220SavedIntro'))$('v220SavedIntro').textContent=t('savedInfo');
 if(!savedRows.length){host.append(el('p',t('noSaved'),'alm-v220-note'));return;}
 for(const item of savedRows.slice(-35).reverse()){
  const anime=animeList().find(a=>Number(a.malId)===Number(item.malId));
  const row=el('article',null,'alm-v220-saved'),desc=el('div');
  desc.append(el('strong',anime?.title||item.filename));
  const parts=[item.filename,item.episodeGuess?('E'+item.episodeGuess):t('unknownFile'),item.folder||''];
  desc.append(el('small',parts.filter(Boolean).join(' · ')));
  const button=el('button',t('openVideo'),'alm-v220-action');button.type='button';
  button.disabled=!!item.legacy||!(Number(item.episodeGuess)>0);
  button.addEventListener('click',async()=>{
   button.disabled=true;await openEpisode(item.malId,item.episodeGuess);button.disabled=false;
  });
  row.append(desc,button);host.append(row);
 }
 if(savedRows.length>35)host.append(el('p','+'+(savedRows.length-35)+' '+t('more'),'alm-v220-note'));
}
function renderMissing(){
 const host=$('v220MissingRows');if(!host)return;
 if($('v220MissingTitle'))$('v220MissingTitle').textContent=t('missing');
 if($('v220MissingIntro'))$('v220MissingIntro').textContent=t('missingInfo');
 const gaps=window.ALM_V220_EPISODE_GAPS?.find(animeList(),[...summaries.values()])||[];
 host.replaceChildren();
 if(!gaps.length){host.append(el('p',t('noneMissing'),'alm-v220-note'));return;}
 for(const gap of gaps){
  const card=el('article',null,'alm-v220-missing-row');
  const info=el('div');
  info.append(el('strong',gap.title));
  info.append(el('small',t('missingNumber')+': '+gap.missing.join(', ')+(gap.truncated?' …':'')+' · '+gap.from+'–'+gap.to));
  const button=el('button',t('seeFiles'),'alm-v220-action');button.type='button';
  button.addEventListener('click',()=>$('navLocalMedia')?.click());
  card.append(info,button);host.append(card);
 }
}
async function refreshSummaries(){
 if(!window.animeManager?.mediaSummary)return;
 try{
  const data=await window.animeManager.mediaSummary()||[];
  summaries.clear();for(const item of data)summaries.set(Number(item.malId),item);
  savedRows=typeof window.animeManager.mediaSaved==='function'?await window.animeManager.mediaSaved()||[]:[];
  document.querySelectorAll('.card[data-anime-id]').forEach(card=>{
   const id=Number(card.dataset.animeId),anime=animeList().find(a=>Number(a.id)===id);
   const have=anime&&summaries.get(Number(anime.malId)),old=card.querySelector('.alm-v220-local-badge');
   if(!have||card.dataset.status!=='Watching'){old?.remove();return;}
   if(old){old.textContent=t('localBadge')+' ('+have.count+')';return;}
   const badge=el('span',t('localBadge')+' ('+have.count+')','alm-v220-local-badge');
   card.querySelector('.card-body .meta')?.appendChild(badge);
  });
  renderMissing();renderSaved();
  window.dispatchEvent(new CustomEvent('alm:media-associations-changed',{detail:{summaries:data}}));
 }catch(error){console.warn('[v220 media] local summary unavailable',error?.code||error?.message);}
}
async function choose(){
 const button=$('v220MediaChoose');if(!window.animeManager?.mediaSelectAndScan){showStatus(t('failed'));return;}
 button.disabled=true;showStatus(t('scanning'));
 try{
  const result=await window.animeManager.mediaSelectAndScan();
  if(result?.canceled){showStatus(scan?scan.files.length+' '+t('filesFound'):t('noScan'));return;}
  scan=result;visible=40;renderMedia();await refreshSummaries();
 }catch(error){showStatus(t('failed')+': '+(error?.message||'unknown'));}finally{button.disabled=false;}
}
function renderMedia(){
 const host=$('v220MediaRows');if(!host)return;host.replaceChildren();
 $('v220MediaChoose').textContent=t('choose');
 if(!scan){showStatus(t('noScan'));return;}
 const root=$('v220MediaRoot');root.textContent=scan.root||'';
 const files=scan.files||[];showStatus(files.length+' '+t('filesFound')+(scan.summary?.truncated?' · '+t('truncated'):''));
 if(!files.length){host.append(el('p',t('empty')));return;}
 const idx=mapTitles();
 for(const file of files.slice(0,visible)){
  const card=el('article',null,'alm-v220-media-card'),head=el('div',null,'alm-v220-media-head');
  const title=el('strong',file.filename),meta=el('small',String(file.relativePath||'')+' · '+Math.max(0,Math.round((Number(file.sizeBytes)||0)/1048576))+' MB');
  const left=el('div');left.append(title,meta);head.append(left);
  const proposal=window.ALM_V220_MEDIA_MATCH?.rank(file,animeList())||null;
  const match=proposal?proposal.confidence==='high'?proposal.malId:0:bestMatch(file,idx);
  const current=Number(file.linkedMalId)||0;
  const row=animeList().find(a=>Number(a.malId)===(current||match));
  const confidence=current?t('linked'):match?t('exact'):proposal?.candidates?.length?t('review'):t('unknown');
  const caption=el('p',
   current?t('linked')+': '+(row?.title||String(current)):
   match?t('proposed')+': '+(row?.title||String(match))+' · '+confidence:
   proposal?.candidates?.length?t('review')+': '+proposal.candidates.slice(0,3).map(a=>a.title).join(' / '):
   t('unknown'),'alm-v220-caption');
  const actions=el('div',null,'alm-v220-media-actions');
  let selected=match;
  if(!current){
   const search=el('input');search.type='search';search.placeholder=t('search');search.maxLength=120;
   const suggestions=el('select');suggestions.setAttribute('aria-label',t('proposed'));
   const populate=term=>{
    suggestions.replaceChildren();const choose=el('option',t('review'));choose.value='';suggestions.append(choose);
    const candidates=term
      ?animeList().filter(a=>Number(a.malId)>0&&[a.title,a.titleEn,a.titleRomaji,...(Array.isArray(a.synonyms)?a.synonyms.slice(0,10):[])].some(name=>normalize(name).includes(normalize(term)))).slice(0,20)
      :proposal?.candidates?.length
        ?proposal.candidates.map(c=>animeList().find(a=>Number(a.malId)===c.malId)).filter(Boolean)
        :animeList().filter(a=>Number(a.malId)===match).slice(0,5);
    for(const a of candidates){const option=el('option',a.title);option.value=String(a.malId);suggestions.append(option);}
    suggestions.value=!term&&match&&candidates.some(a=>Number(a.malId)===match)?String(match):'';
    selected=Number(suggestions.value)||0;
   };
   populate('');search.addEventListener('input',()=>populate(search.value));suggestions.addEventListener('change',()=>{selected=Number(suggestions.value)||0;});
   if(match)search.hidden=true;
   actions.append(search,suggestions);
  }
  const button=el('button',current?t('dissociate'):t('associate'),'alm-v220-action');
  button.type='button';button.disabled=!current&&!selected;
  actions.querySelector('select')?.addEventListener('change',()=>{button.disabled=!selected;});
  actions.querySelector('input')?.addEventListener('input',()=>{button.disabled=!selected;});
  button.addEventListener('click',async()=>{
   button.disabled=true;
   try{
    if(current){await window.animeManager.mediaDissociate(file.index);file.linkedMalId=0;}
    else{if(!Number.isSafeInteger(selected)||selected<1)return;await window.animeManager.mediaAssociate(file.index,selected);file.linkedMalId=selected;}
    renderMedia();await refreshSummaries();
   }catch(e){window.notifyApp?.(String(e.message||e),'error');button.disabled=false;}
  });
  actions.append(button);
  if(current&&Number(file.episodeGuess)>0&&window.animeManager?.mediaOpenEpisode){
    const open=el('button',t('openVideo'),'alm-v220-action');open.type='button';
    open.addEventListener('click',async()=>{
      open.disabled=true;await openEpisode(current,file.episodeGuess);open.disabled=false;
    });
    actions.append(open);
  }
  card.append(head,caption,actions);host.append(card);
 }
 const more=$('v220MediaMore');more.hidden=files.length<=visible;
 more.textContent=t('next')+' ('+(files.length-visible)+' '+t('more')+')';
 $('v220MediaPrivacy').textContent=t('readOnly');
}
async function loadSequels(){
 const host=$('v220SequelRows');if(!host||sequelBusy)return;sequelBusy=true;
 host.replaceChildren(el('p',t('sequelLoading')));$('v220SequelTitle').textContent=t('sequelTitle');
 $('v220SequelIntro').textContent=t('sequelIntro');
 try{
  const response=await fetch('/api/v220/sequels',{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();host.replaceChildren();
  if(!data.items?.length){host.append(el('p',t('sequelNone')));return;}
  const existing=new Set(animeList().map(a=>Number(a.malId)));
  for(const item of data.items){
   if(existing.has(Number(item.malId)))continue;
   const card=el('article',null,'alm-v220-sequel');
   const main=el('div');main.append(el('strong',item.title),el('small',t('sequelFrom')+': '+item.sourceTitle));
   const button=el('button',t('sequelAdd'));button.type='button';
   button.addEventListener('click',async()=>{
    if(!window.confirm(t('confirm')+'\n'+item.title))return;
    button.disabled=true;
    try{
     const payload={title:item.title,malId:Number(item.malId),status:'Plan to Watch',episodesSeen:'0',autoInfo:false,catalogAdd:true};
     const result=await fetch('/api/animes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
     const data=await result.json().catch(()=>({}));if(!result.ok||data.error)throw Error(data.error||'HTTP '+result.status);
     await window.reloadAnimeLibrary?.();button.textContent=t('sequelAdded');await loadSequelsAfter();
    }catch(e){window.notifyApp?.(String(e.message||e),'error');button.disabled=false;}
   });
   card.append(main,button);host.append(card);
  }
 }catch(error){host.replaceChildren(el('p',t('sequelError')+': '+error.message));}
 finally{sequelBusy=false;}
}
function loadSequelsAfter(){return new Promise(resolve=>setTimeout(()=>{loadSequels().finally(resolve);},0));}
function translate(){
 const nav=$('navLocalMedia');if(nav)nav.textContent='📂 '+t('files');
 if($('v220MediaTitle'))$('v220MediaTitle').textContent=t('files');
 if($('v220MediaIntro'))$('v220MediaIntro').textContent=t('intro');
 if($('v220SequelTitle'))$('v220SequelTitle').textContent=t('sequelTitle');
 if($('v220SequelIntro'))$('v220SequelIntro').textContent=t('sequelIntro');
 if($('v220GoWatching'))$('v220GoWatching').textContent=t('goWatching');
 if($('v220GoSeasons'))$('v220GoSeasons').textContent=t('goSeasons');
 connectivity();renderMedia();renderSaved();renderMissing();refreshSummaries();
}
function init(){
 const nav=$('navLocalMedia');
 nav?.addEventListener('click',()=>{if(typeof window.showV2Page==='function')window.showV2Page('localMediaPage','navLocalMedia');translate();});
 $('v220MediaChoose')?.addEventListener('click',choose);
 $('v220MediaMore')?.addEventListener('click',()=>{visible+=40;renderMedia();});
 $('navSeasonNews')?.addEventListener('click',()=>{void loadSequels();renderMissing();});
 $('v220GoWatching')?.addEventListener('click',()=>document.querySelector('.nav-item[data-filter="Watching"]')?.click());
 $('v220GoSeasons')?.addEventListener('click',()=>$('navSeasonNews')?.click());
 window.addEventListener('alm:library-rendered',()=>{void refreshSummaries();});
 window.addEventListener('alm:collection-changed',()=>{void refreshSummaries();});
 window.addEventListener('alm:language-changed',translate);
 window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);
 translate();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();