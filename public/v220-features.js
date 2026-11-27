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
let scan=null,visible=40,sequelBusy=false,mediaBusy=false;
const catalogMatches=new Map(),mediaDrafts=new Map(),sequelDrafts=new Map();
let maintenanceStamp=null,maintenanceBusy=false,sequelSaving=0;
const mediaCopy={fr:['Œuvre complète / fichier sans numéro','Choisir un résultat','Choisis une fiche et confirme le numéro d’épisode ou le fichier complet.','Œuvre complète','Catalogue indisponible, réessaye.'],en:['Complete work / unnumbered file','Choose a result','Choose an anime and confirm the episode number or complete file.','Complete work','Catalog unavailable, try again.'],es:['Obra completa / archivo sin número','Elegir resultado','Elige un anime y confirma el episodio o el archivo completo.','Obra completa','Catálogo no disponible.'],de:['Ganzes Werk / Datei ohne Nummer','Ergebnis auswählen','Anime und Folge oder ganze Datei bestätigen.','Ganzes Werk','Katalog nicht verfügbar.'],ja:['作品全体・話数なし','候補を選択','作品と話数、または作品全体を確認してください。','作品全体','カタログを利用できません。'],'pt-BR':['Obra completa / arquivo sem número','Escolher resultado','Escolha um anime e confirme o episódio ou arquivo completo.','Obra completa','Catálogo indisponível.'],'zh-CN':['完整作品／无集数文件','选择结果','请选择作品并确认集数或完整文件。','完整作品','目录不可用，请重试。']};
const mc=i=>(mediaCopy[lang()]||mediaCopy.en)[i];
const mediaImportCopy={
 fr:['Statut d’import','Déjà dans ta bibliothèque · statut conservé','Double-clic pour ouvrir la fiche','Charger la jaquette','Fiche locale','Ajouter et associer ?','Jaquette indisponible'],
 en:['Import status','Already in your library · status preserved','Double-click to open anime','Load cover','Local details','Add and link?','Cover unavailable'],
 es:['Estado de importación','Ya en tu biblioteca · estado conservado','Doble clic para abrir ficha','Cargar portada','Ficha local','¿Añadir y vincular?','Portada no disponible'],
 de:['Importstatus','Bereits in deiner Bibliothek · Status bleibt','Doppelklick für Details','Cover laden','Lokale Details','Hinzufügen und zuordnen?','Cover nicht verfügbar'],
 ja:['インポート状態','ライブラリに登録済み・状態を維持','ダブルクリックで作品を開く','ポスターを取得','ローカル情報','追加して関連付けますか？','ポスターなし'],
 'pt-BR':['Status de importação','Já na biblioteca · status preservado','Clique duplo para abrir ficha','Carregar capa','Ficha local','Adicionar e associar?','Capa indisponível'],
 'zh-CN':['导入状态','已在收藏库中 · 保留状态','双击打开作品','加载海报','本地详情','添加并关联？','海报不可用']
};
const mi=i=>(mediaImportCopy[lang()]||mediaImportCopy.en)[i];
const coverAllCopy={fr:'Charger les jaquettes manquantes',en:'Load missing covers',es:'Cargar portadas que faltan',de:'Fehlende Cover laden',ja:'未取得のポスターを読み込む','pt-BR':'Carregar capas ausentes','zh-CN':'加载缺失的海报'};
function mediaCoverSrc(a,load=false,preferLocal=true){
 const local=String(a.poster||a.imageUrl||'').replace(/^images\//i,'/images/');
 if(preferLocal&&/^\/images\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp|gif|avif)$/i.test(local))return local;
 const id=Number(a.malId);return Number.isSafeInteger(id)&&id>0&&id<=100000000?'/api/v220/media-cover/'+id+(load&&navigator.onLine!==false?'?load=1':''):'';
}
function mediaRecord(a){
 const id=Number(a.malId),total=Number(a.episodesTotal||a.episodes)||0;
 return {...a,malId:id,episodesTotal:total?String(total):'',poster:mediaCoverSrc(a)};
}
const extraLabels={fr:['Associer mes fichiers','Saison','Épisode','Rechercher dans le catalogue local','Ajouter la fiche à À voir et associer ?','Ouvrir la fiche','Tes animés, tes prochaines diffusions et ta progression.'],en:['Link my files','Season','Episode','Search local catalog','Add to watchlist and link?','Open anime','Your anime, recent broadcasts and progress.'],es:['Vincular mis archivos','Temporada','Episodio','Buscar en el catálogo local','¿Añadir a pendientes y vincular?','Abrir ficha','Tus animes, emisiones y progreso.'],de:['Meine Dateien zuordnen','Staffel','Folge','Lokalen Katalog durchsuchen','Zur Merkliste hinzufügen und zuordnen?','Anime öffnen','Deine Anime, Ausstrahlungen und Fortschritte.'],ja:['動画を関連付ける','シーズン','話数','ローカルカタログを検索','視聴予定に追加して関連付けますか？','作品を開く','作品・放送・視聴進捗'], 'pt-BR':['Associar meus arquivos','Temporada','Episódio','Buscar no catálogo local','Adicionar à lista e associar?','Abrir anime','Seus animes, transmissões e progresso.'],'zh-CN':['关联本地文件','季','集','搜索本地目录','加入待看并关联？','打开作品','我的动漫、播出与观看进度。']};
const labels=i=>(extraLabels[lang()]||extraLabels.en)[i];
function openImport(){const dialog=$('importDialog');if(dialog&&!dialog.open)dialog.showModal?.();if(window.activateImportTab)window.activateImportTab('mediaImportPanel');else $('mediaImportPanel')?.classList.remove('hidden');translate();}
async function catalogFor(titles){const pending=[...new Set(titles.filter(x=>typeof x==='string'&&x.trim().length>=2).map(x=>x.trim().slice(0,160)))].filter(x=>!catalogMatches.has(x)).slice(0,40);if(!pending.length)return;try{const result=await fetch('/api/v220/media-candidates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({titles:pending})});if(!result.ok)throw Error('ALM_MEDIA_CATALOG_UNAVAILABLE');const data=await result.json();for(const q of pending)catalogMatches.set(q,Array.isArray(data.items?.[q])?data.items[q]:[]);while(catalogMatches.size>240)catalogMatches.delete(catalogMatches.keys().next().value);return true;}catch{return false;}}
function mergeCandidates(rows,metadata){
 const merged=new Map(rows.filter(a=>Number(a.malId)>0).map(a=>[Number(a.malId),a]));
 for(const meta of metadata||[]){
  const id=Number(meta.malId);if(!Number.isSafeInteger(id)||id<1)continue;
  const own=merged.get(id);
  if(!own){merged.set(id,meta);continue;}
  const alt=[own.title,own.customTitle,own.titleEn,own.titleRomaji,own.titleJa,meta.title,meta.titleEn,meta.titleRomaji,meta.titleJa,...(Array.isArray(own.synonyms)?own.synonyms:[]),...(Array.isArray(meta.synonyms)?meta.synonyms:[])].filter(Boolean);
  merged.set(id,{...meta,...own,titleEn:own.titleEn||meta.titleEn,titleRomaji:own.titleRomaji||meta.titleRomaji,titleJa:own.titleJa||meta.titleJa,imageUrl:own.imageUrl||meta.imageUrl,poster:own.poster||meta.poster||meta.imageUrl,synonyms:[...new Set(alt)].slice(0,60)});
 }
 return [...merged.values()];
}
function candidatesFor(file){return mergeCandidates(animeList(),catalogMatches.get(String(file.titleGuess||'').trim().slice(0,160))||[]);}
const summaries=new Map();
let savedRows=[],airingItems=[],airingCheckedAt='',checkingFiles=false;
const diskChecks=new Map();
const stateLabels={fr:['Diffusions confirmées et fichiers locaux','Diffusé','Vu','Non vu','Associé · à vérifier','Fichier présent','Non associé','Fichier inaccessible ou ambigu','Vérifier les fichiers locaux','Vérification en cours…','Aucune diffusion récente confirmée.','Épisode suivant','Associer une vidéo','Dernier contrôle','Contrôle local terminé'],en:['Confirmed broadcasts and local files','Aired','Watched','Unwatched','Linked · not verified','File present','Not linked','File unavailable or ambiguous','Check local files','Checking…','No recent confirmed broadcasts.','Next episode','Link a video','Last checked','Local check complete'],es:['Emisiones y archivos locales','Emitido','Visto','No visto','Vinculado · sin verificar','Archivo presente','Sin vincular','Archivo no disponible o ambiguo','Verificar archivos locales','Verificando…','Sin emisiones confirmadas recientes.','Próximo episodio','Vincular vídeo','Última comprobación','Comprobación local completada'],de:['Bestätigte Ausstrahlungen und lokale Dateien','Ausgestrahlt','Gesehen','Ungesehen','Zugeordnet · ungeprüft','Datei vorhanden','Nicht zugeordnet','Datei fehlt oder ist mehrdeutig','Lokale Dateien prüfen','Prüfung läuft…','Keine bestätigten aktuellen Ausstrahlungen.','Nächste Folge','Video zuordnen','Zuletzt geprüft','Lokale Prüfung abgeschlossen'],ja:['放送済み話数とローカル動画','放送済み','視聴済み','未視聴','関連付け済み・未確認','ファイルあり','未関連付け','ファイル不明・利用不可','ローカル動画を確認','確認中…','最近の確定放送はありません。','次の話','動画を関連付ける','最終確認','ローカル確認完了'],'pt-BR':['Exibições confirmadas e arquivos locais','Exibido','Visto','Não visto','Associado · não verificado','Arquivo presente','Não associado','Arquivo indisponível ou ambíguo','Verificar arquivos locais','Verificando…','Nenhuma exibição recente confirmada.','Próximo episódio','Associar vídeo','Última verificação','Verificação local concluída'],'zh-CN':['已确认播出与本地文件','已播出','已观看','未观看','已关联 · 未验证','文件存在','未关联','文件不可用或有歧义','检查本地文件','检查中…','没有近期已确认播出。','下一集','关联视频','上次检查','本地检查完成']};
const st=i=>(stateLabels[lang()]||stateLabels.en)[i];
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
  const parts=[item.filename,item.wholeWork?mc(3):item.episodeGuess?('E'+item.episodeGuess):t('unknownFile'),item.folder||''];
  desc.append(el('small',parts.filter(Boolean).join(' · ')));
  const button=el('button',t('openVideo'),'alm-v220-action');button.type='button';
  button.disabled=!!item.legacy||!(item.wholeWork||Number(item.episodeGuess)>0);
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
  button.addEventListener('click',openImport);
  card.append(info,button);host.append(card);
 }
}
function confirmedRows(){
 const now=Math.floor(Date.now()/1000),all=new Map(animeList().map(a=>[Number(a.id),a])),unique=new Map();
 for(const item of airingItems){
  const a=all.get(Number(item.animeId)),ep=Number(item.episode),at=Number(item.airingAt),mal=Number(a?.malId);
  if(!a||!Number.isSafeInteger(mal)||mal<1||!Number.isSafeInteger(ep)||ep<1||ep>999||item.estimated||!Number.isFinite(at)||at>now||at<now-7*86400)continue;
  unique.set(mal+':'+ep,{anime:a,malId:mal,episode:ep,airingAt:at});
 }
 return [...unique.values()].sort((a,b)=>b.airingAt-a.airingAt).slice(0,40);
}
function fileState(malId,episode){
 const link=summaries.get(malId),linked=Array.isArray(link?.episodes)&&link.episodes.includes(episode);
 if(!linked)return st(6);
 const checked=diskChecks.get(malId+':'+episode);
 return checked?checked.available?st(5):st(7):st(4);
}
function renderPossession(){
 const host=$('v220PossessionRows');if(!host)return;
 host.replaceChildren(el('h3',st(0)));
 const btn=$('v220CheckPossession');if(btn){btn.textContent=checkingFiles?st(9):st(8);btn.disabled=checkingFiles||!window.animeManager?.mediaCheckEpisodes;}
 const rows=confirmedRows();
 if(!rows.length){host.append(el('p',st(10),'alm-v220-note'));return;}
 for(const r of rows){
  const card=el('article',null,'alm-v220-possession-row'),body=el('div');
  body.append(el('strong',window.ALM_TITLES?.title?.(r.anime)||r.anime.title));
  const seen=Number(r.anime.episodesSeen)||0;
  body.append(el('small',labels(2)+' '+r.episode+' · '+st(1)+' · '+(seen>=r.episode?st(2):st(3))+' · '+fileState(r.malId,r.episode)));
  const action=el('button',t('seeFiles'),'alm-v220-action');action.type='button';action.addEventListener('click',openImport);
  card.append(body,action);host.append(card);
 }
 if(airingCheckedAt)host.append(el('p',st(13)+' : '+String(airingCheckedAt).slice(0,10),'alm-v220-note'));
}
async function refreshAiring(){
 try{const r=await fetch('/api/airing',{cache:'no-store'});if(!r.ok)return;const data=await r.json();airingItems=Array.isArray(data.items)?data.items:[];airingCheckedAt=data.checkedAt||'';}catch{}
 renderPossession();
}
async function checkPossession(){
 if(checkingFiles||!window.animeManager?.mediaCheckEpisodes)return;
 checkingFiles=true;renderPossession();
 try{
  await refreshAiring();
  const requests=confirmedRows().filter(r=>summaries.get(r.malId)?.episodes?.includes(r.episode)).map(({malId,episode})=>({malId,episode}));
  const result=await window.animeManager.mediaCheckEpisodes(requests);
  diskChecks.clear();for(const row of result||[])diskChecks.set(row.malId+':'+row.episode,row);
  if($('v220PossessionStatus'))$('v220PossessionStatus').textContent=st(14);
 }catch{}finally{checkingFiles=false;renderPossession();renderWatchingCards();}
}
function renderWatchingCards(){
 for(const card of document.querySelectorAll('#animeGrid .card[data-anime-id]')){
  const a=animeList().find(row=>Number(row.id)===Number(card.dataset.animeId));
  card.querySelector('.alm-v220-next-episode')?.remove();
  if(!a||card.dataset.status!=='Watching')continue;
  const seen=Number(a.episodesSeen),total=Number(a.episodesTotal);
  if(!Number.isSafeInteger(seen)||seen<0||seen>=999||total>0&&seen>=total)continue;
  const ep=seen+1,mal=Number(a.malId),linked=summaries.get(mal)?.episodes?.includes(ep);
  const wrap=el('div',null,'alm-v220-next-episode');
  wrap.append(el('small',st(11)+' : '+ep+' · '+fileState(mal,ep)));
  const btn=el('button',linked?t('openVideo'):st(12));btn.type='button';btn.className='alm-v220-action';
  btn.addEventListener('click',async event=>{event.stopPropagation();if(linked){btn.disabled=true;try{await openEpisode(mal,ep);}finally{btn.disabled=false;}}else openImport();});
  wrap.append(btn);card.querySelector('.card-body .meta')?.append(wrap);
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
  renderMissing();renderSaved();renderPossession();renderWatchingCards();
  window.dispatchEvent(new CustomEvent('alm:media-associations-changed',{detail:{summaries:data}}));
 }catch(error){console.warn('[v220 media] local summary unavailable',error?.code||error?.message);}
}
async function choose(){
 if(mediaBusy)return;
 const button=$('v220MediaChoose');if(!window.animeManager?.mediaSelectAndScan){showStatus(t('failed'));return;}
 button.disabled=true;showStatus(t('scanning'));
 try{
  const result=await window.animeManager.mediaSelectAndScan();
  if(result?.canceled){showStatus(scan?scan.files.length+' '+t('filesFound'):t('noScan'));return;}
  scan=result;visible=40;catalogMatches.clear();mediaDrafts.clear();const catalogOK=await catalogFor((scan.files||[]).slice(0,visible).map(f=>f.titleGuess));renderMedia();if(catalogOK===false)window.notifyApp?.(mc(4),'error');await refreshSummaries();
 }catch(error){showStatus(t('failed')+': '+(error?.message||'unknown'));}finally{button.disabled=false;}
}
function renderMedia(){
 const host=$('v220MediaRows');if(!host)return;host.replaceChildren();
 $('v220MediaChoose').textContent=t('choose');
 const loadAll=$('v220MediaLoadCovers');if(loadAll){loadAll.hidden=!scan?.files?.length;loadAll.textContent=coverAllCopy[lang()]||coverAllCopy.en;}
 if(!scan){showStatus(t('noScan'));return;}
 const root=$('v220MediaRoot');root.textContent=scan.root||'';
 const files=scan.files||[];showStatus(files.length+' '+t('filesFound')+(scan.summary?.truncated?' · '+t('truncated'):''));
 if(!files.length){host.append(el('p',t('empty')));return;}
 const idx=mapTitles();
 for(const file of files.slice(0,visible)){
  const card=el('article',null,'alm-v220-media-card'),head=el('div',null,'alm-v220-media-head'),body=el('div',null,'alm-v220-media-body'),art=el('div',null,'alm-v220-media-art');
  const title=el('strong',file.filename),meta=el('small',String(file.relativePath||'')+' · '+Math.max(0,Math.round((Number(file.sizeBytes)||0)/1048576))+' MB');
  const left=el('div');left.append(title,meta);head.append(left);
  const available=candidatesFor(file);
  const proposal=window.ALM_V220_MEDIA_MATCH?.rank(file,available)||null;
  const match=proposal?proposal.malId:bestMatch(file,idx);
  const current=Number(file.linkedMalId)||0;
  const row=available.find(a=>Number(a.malId)===(current||match));
  const confidence=current?t('linked'):match&&proposal?.confidence==='high'?t('exact'):match?t('review'):proposal?.candidates?.length?t('review'):t('unknown');
  const caption=el('p',
   current?t('linked')+': '+(row?.title||String(current)):
   match?t('proposed')+': '+(row?.title||String(match))+' · '+confidence:
   proposal?.candidates?.length?t('review')+': '+proposal.candidates.slice(0,3).map(a=>a.title).join(' / '):
   t('unknown'),'alm-v220-caption');
  const actions=el('div',null,'alm-v220-media-actions');
  const draft=mediaDrafts.get(file.index)||{selected:match,term:'',season:String(file.seasonGuess||0),episode:file.episodeGuess?String(file.episodeGuess):'',wholeWork:false,status:'Plan to Watch'};
  mediaDrafts.set(file.index,draft);
  let selected=current||draft.selected,displayedCandidates=available.filter(a=>Number(a.malId)===selected);
  const statuses=window.ALM_WATCH_STATUS;
  const statusLabel=el('label',null,'alm-v220-import-status'),statusText=el('span',mi(0)),statusSelect=el('select',null,'alm-v220-media-status');
  statusSelect.setAttribute('aria-label',mi(0));statusSelect.setAttribute('data-no-i18n','');
  if(statuses)statusSelect.innerHTML=statuses.options(draft.status||'Plan to Watch');
  statusSelect.value=draft.status||'Plan to Watch';statusLabel.append(statusText,statusSelect);
  const statusInfo=el('small',null,'alm-v220-import-status-info');
  const syncStatus=()=>{const own=animeList().find(a=>Number(a.malId)===selected);statusSelect.disabled=!!own||!selected||!statuses||!!current;statusSelect.value=own&&statuses?.normalize(own.status)?statuses.normalize(own.status):draft.status||'Plan to Watch';statusInfo.textContent=own?mi(1):'';};
  statusSelect.addEventListener('change',()=>{if(!statusSelect.disabled)draft.status=statusSelect.value;});
  const preview=el('div',null,'alm-v220-candidate-preview');
  function paintArt(candidates){
   displayedCandidates=candidates;
   const a=candidates.find(a=>Number(a.malId)===selected)||available.find(a=>Number(a.malId)===selected);
   art.replaceChildren();preview.replaceChildren();syncStatus();
   const cover=el('button',null,'alm-v220-media-cover');cover.type='button';cover.disabled=!a;cover.setAttribute('aria-label',a?mi(2)+': '+a.title:mi(6));
   const placeholder=el('span',null,'alm-v220-brand-placeholder');cover.append(placeholder);
   if(a){
    const image=el('img');image.src=mediaCoverSrc(a,true);image.alt='';image.loading='lazy';image.decoding='async';
    const load=el('button',mi(3),'alm-v220-load-cover');load.type='button';load.hidden=true;
    image.addEventListener('error',()=>{if(image.getAttribute('src')?.startsWith('/images/')){image.src=mediaCoverSrc(a,true,false);return;}image.hidden=true;load.hidden=false;});
    image.addEventListener('load',()=>{image.hidden=false;load.hidden=true;});
    load.addEventListener('click',()=>{load.hidden=true;const src=mediaCoverSrc(a,true,false);image.removeAttribute('src');image.src=src;});
    cover.append(image);art.append(cover,load);
    if(a.type)cover.append(el('span',a.type,'alm-v220-media-type'));
    const open=()=>{const choices=displayedCandidates.length?displayedCandidates:[a];const index=choices.findIndex(item=>Number(item.malId)===selected);if(index<0)return;window.ALM_CATALOG?.openRecords(choices.map(mediaRecord),index,cover,{readOnly:true,localOnly:true});};
    cover.addEventListener('dblclick',open);cover.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    const name=el('button',a.title,'alm-v220-media-detail-title');name.type='button';name.title=mi(2);name.addEventListener('dblclick',open);name.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    preview.append(name,el('span',[String(a.startDate||'').slice(0,4),a.type,(a.episodes||a.episodesTotal)?String(a.episodes||a.episodesTotal)+' '+labels(2):''].filter(Boolean).join(' · ')),el('small',mi(2),'alm-v220-media-detail-hint'));
   }else art.append(cover);
  }
  if(!current){
   const search=el('input');search.type='search';search.placeholder=labels(3);search.maxLength=120;search.value=draft.term;
   const suggestions=el('select');suggestions.setAttribute('aria-label',t('proposed'));
   const populate=(term,preserve=true,allowPrevious=true)=>{
    suggestions.replaceChildren();const choose=el('option',mc(1));choose.value='';suggestions.append(choose);
    let candidates=term
      ?mergeCandidates(available,catalogMatches.get(term.trim().slice(0,160))||[]).filter(a=>Number(a.malId)>0&&[a.title,a.titleEn,a.titleRomaji,a.customTitle,...(Array.isArray(a.synonyms)?a.synonyms.slice(0,25):[])].some(name=>normalize(name).includes(normalize(term)))).slice(0,24)
      :proposal?.candidates?.length
        ?proposal.candidates.map(c=>available.find(a=>Number(a.malId)===c.malId)).filter(Boolean)
        :available.filter(a=>Number(a.malId)===match).slice(0,5);
    const pool=mergeCandidates(available,catalogMatches.get(term.trim().slice(0,160))||[]);
    const previous=preserve&&pool.find(a=>Number(a.malId)===selected);
    if(allowPrevious&&previous&&!candidates.some(a=>Number(a.malId)===selected))candidates=[previous,...candidates];
    const updatePreview=()=>paintArt(candidates);
    for(const a of candidates){const known=Number(a.manualSeasonNumber||a.betaseriesSeason)||0;const option=el('option',[a.title,String(a.startDate||'').slice(0,4),a.type,known?'S'+known:'','#'+a.malId].filter(Boolean).join(' · '));option.value=String(a.malId);suggestions.append(option);}
    suggestions.value=preserve&&candidates.some(a=>Number(a.malId)===selected)?String(selected):'';
    selected=Number(suggestions.value)||0;draft.selected=selected;updatePreview();
    suggestions.onchange=()=>{selected=Number(suggestions.value)||0;draft.selected=selected;updatePreview();};
    window.ALM_SELECTS?.refresh?.();
   };
   let lookupTimer;
   populate(draft.term);search.addEventListener('input',()=>{draft.term=search.value;populate(search.value,true,false);clearTimeout(lookupTimer);const term=search.value.trim();if(term.length>=2)lookupTimer=setTimeout(async()=>{const ok=await catalogFor([term]);if(search.isConnected&&search.value.trim()===term){populate(term);suggestions.dispatchEvent(new Event('change',{bubbles:true}));if(ok===false)window.notifyApp?.(mc(4),'error');}},220);});
   window.ALM_SELECTS?.refresh?.();
   actions.append(search,suggestions,preview);
  }else{paintArt(displayedCandidates);actions.append(preview);}
  const season=el('input');season.type='number';season.min='0';season.max='99';season.step='1';season.value=draft.season;season.setAttribute('aria-label',labels(1));
  const episode=el('input');episode.type='number';episode.min='1';episode.max='999';episode.step='1';episode.value=draft.episode;episode.setAttribute('aria-label',labels(2));
  const whole=el('input');whole.type='checkbox';whole.checked=draft.wholeWork;episode.disabled=whole.checked;
  if(!current){const sl=el('label',labels(1)),ep=el('label',labels(2)),wl=el('label',null,'alm-v220-whole-work');wl.append(whole,el('span',mc(0)));sl.append(season);ep.append(episode);actions.append(sl,ep,wl,statusLabel,statusInfo);}
  whole.addEventListener('change',()=>{episode.disabled=whole.checked;draft.wholeWork=whole.checked;});
  season.addEventListener('input',()=>draft.season=season.value);episode.addEventListener('input',()=>draft.episode=episode.value);
  const validEpisode=()=> (whole.checked||Number.isSafeInteger(Number(episode.value))&&Number(episode.value)>0&&Number(episode.value)<=999)&&season.value!==''&&Number.isSafeInteger(Number(season.value))&&Number(season.value)>=0&&Number(season.value)<=99;
  const button=el('button',current?t('dissociate'):t('associate'),'alm-v220-action');
  button.type='button';const syncButton=()=>{button.disabled=mediaBusy||!current&&(!selected||!validEpisode());button.title=button.disabled?mc(2):'';};syncButton();
  actions.addEventListener('change',syncButton);actions.addEventListener('input',syncButton);
  button.addEventListener('click',async()=>{
   if(mediaBusy||button.disabled)return;
   const sourceScan=scan,chosenId=selected,chosenStatus=statuses?.normalize(statusSelect.value)||'Plan to Watch',chosenCorrection={season:Number(season.value),episode:whole.checked?0:Number(episode.value),wholeWork:whole.checked,scanId:sourceScan.scanId};
   mediaBusy=true;button.disabled=true;const chooser=$('v220MediaChoose'),moreButton=$('v220MediaMore');chooser.disabled=true;moreButton.disabled=true;
   let changed=false;
   try{
    if(current){await window.animeManager.mediaDissociate(file.index,sourceScan.scanId);file.linkedMalId=0;mediaDrafts.delete(file.index);changed=true;}
    else{
      if(!Number.isSafeInteger(chosenId)||chosenId<1||!validEpisode())return;
      if(!animeList().some(a=>Number(a.malId)===chosenId)){
        const candidate=[...available,...[...catalogMatches.values()].flat()] .find(a=>Number(a.malId)===chosenId);
        if(!candidate||!window.confirm(mi(5)+'\n'+candidate.title+' · '+(statuses?.label(chosenStatus)||chosenStatus)))return;
        const total=Number(candidate.episodesTotal||candidate.episodes)||0;
        const raw={title:candidate.title,malId:chosenId,status:chosenStatus,episodesSeen:chosenStatus==='Completed'?(total?String(total):''):'0',type:candidate.type||'TV',episodesTotal:total?String(total):'',poster:candidate.imageUrl||candidate.poster||'',autoInfo:false,catalogAdd:true};
        const payload=await window.ALM_BETA38.preparePayload(raw,null);if(!payload)return;
        const created=await fetch('/api/animes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const body=await created.json().catch(()=>({}));if(!created.ok||body.error)throw Error(body.error||'ALM_MEDIA_CATALOG_ADD_FAILED');
        await window.reloadAnimeLibrary?.();
      }
      const correction=chosenCorrection;
      if(scan!==sourceScan)throw Error('ALM_MEDIA_INDEX_INVALID');
      await window.animeManager.mediaAssociate(file.index,chosenId,correction);file.linkedMalId=chosenId;file.seasonGuess=correction.season;file.episodeGuess=correction.episode;file.wholeWork=correction.wholeWork;mediaDrafts.delete(file.index);changed=true;
    }
    diskChecks.clear();await refreshSummaries();
   }catch(e){window.notifyApp?.(String(e.message||e),'error');}
   finally{mediaBusy=false;chooser.disabled=false;moreButton.disabled=false;if(changed||!button.isConnected)renderMedia();else syncButton();}
  });
  actions.append(button);
  if(current&&(file.wholeWork||Number(file.episodeGuess)>0)&&window.animeManager?.mediaOpenEpisode){
    const open=el('button',t('openVideo'),'alm-v220-action');open.type='button';
    open.addEventListener('click',async()=>{
      open.disabled=true;await openEpisode(current,file.episodeGuess);open.disabled=false;
    });
    actions.append(open);
  }
  body.append(head,caption,actions);card.append(art,body);host.append(card);
 }
 window.ALM_SELECTS?.refresh?.();
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
   const card=el('article',null,'alm-v220-sequel');card.dataset.malId=String(item.malId);
   const main=el('div',null,'alm-v220-sequel-copy');
   const art=el('button',null,'alm-v220-sequel-art');art.type='button';art.title=labels(5)+': '+item.title;art.setAttribute('aria-label',art.title);
   const fallback=el('span',null,'alm-v220-brand-placeholder');fallback.setAttribute('aria-hidden','true');art.append(fallback);
   const raw=String(item.imageUrl||'');
   if(/^https:\/\/(?:cdn\.myanimelist\.net|s4\.anilist\.co|static\.tvmaze\.com|media\.kitsu\.io)\//i.test(raw)){
     const image=el('img');image.src=raw;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';image.dataset.imageFallback='true';art.append(image);
   }
   art.addEventListener('click',()=>{
    const items=(data.items||[]).filter(r=>!existing.has(Number(r.malId))).map(r=>({...r,poster:r.imageUrl||''}));
    window.ALM_CATALOG?.openRecords?.(items,Math.max(0,items.findIndex(r=>Number(r.malId)===Number(item.malId))),art,{readOnly:true});
   });
   main.append(el('strong',item.title),el('small',t('sequelFrom')+': '+item.sourceTitle));
   const statuses=window.ALM_WATCH_STATUS;
   if(!statuses)throw Error('ALM_WATCH_STATUS_UNAVAILABLE');
   const actions=el('div',null,'alm-v220-sequel-actions'),select=el('select',null,'alm-v220-sequel-status');
   select.setAttribute('aria-label',window.ALM_DESIGN?.t?.('searchAdd')||t('sequelAdd'));select.setAttribute('data-no-i18n','');
   select.innerHTML=statuses.options(sequelDrafts.get(Number(item.malId))||'Plan to Watch');
   const button=el('button',null,'alm-v220-sequel-add');button.type='button';
   const updateLabel=()=>{button.textContent=window.ALM_ADD_LABEL?.(select.value)||statuses.label(select.value);};
   select.addEventListener('change',()=>{sequelDrafts.set(Number(item.malId),select.value);updateLabel();});updateLabel();
   button.addEventListener('click',async()=>{
    if(button.disabled)return;
    const status=statuses.normalize(select.value);
    if(!status)return;
    const duplicate=window.ALM_COLLECTION?.find(item)||animeList().find(a=>Number(a.malId)===Number(item.malId));
    if(duplicate){await loadSequelsAfter();return;}
    if(!window.confirm((window.ALM_ADD_LABEL?.(status)||statuses.label(status))+'\n'+item.title))return;
    button.disabled=true;select.disabled=true;sequelSaving++;
    try{
     const total=Number(item.episodesTotal||item.episodes)||0;
     const payload=await window.ALM_BETA38.preparePayload({...item,title:item.title,malId:Number(item.malId),poster:item.imageUrl||'',episodesTotal:total?String(total):'',status,episodesSeen:status==='Completed'?(total?String(total):''):'0',autoInfo:false,catalogAdd:true},null);
     if(!payload)return;
     const result=await fetch('/api/animes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
     const data=await result.json().catch(()=>({}));if(!result.ok||data.error)throw Error(data.error||'HTTP '+result.status);
     sequelDrafts.delete(Number(item.malId));await window.reloadAnimeLibrary?.();
     window.notifyApp?.(item.title+' · '+statuses.label(status),'success');
     await loadSequelsAfter();
    }catch(e){window.notifyApp?.(String(e.message||e),'error');}
    finally{sequelSaving--;button.disabled=false;select.disabled=false;updateLabel();window.ALM_SELECTS?.refresh?.();}
   });
   actions.append(select,button);card.append(art,main,actions);host.append(card);

  }
  window.ALM_SELECTS?.refresh?.();
 }catch(error){host.replaceChildren(el('p',t('sequelError')+': '+error.message));}
 finally{sequelBusy=false;}
}
async function refreshScheduledCaches(){
 const cockpit=$('cockpitPage'),seasons=$('seasonNewsPage');
 const cockpitVisible=cockpit&&!cockpit.classList.contains('hidden'),seasonsVisible=seasons&&!seasons.classList.contains('hidden');
 if(document.hidden||maintenanceBusy||!cockpitVisible&&!seasonsVisible)return;
 if(cockpitVisible&&(sequelSaving||sequelBusy||$('v220SequelRows')?.contains(document.activeElement)||$('animePeekDialog')?.open))return;
 maintenanceBusy=true;
 try{
  const response=await fetch('/api/maintenance/status',{cache:'no-store'});if(!response.ok)return;
  const state=await response.json(),next=JSON.stringify(['seasons','catalog'].map(key=>state.tasks?.[key]?.lastSuccess||''));
  const changed=maintenanceStamp!==null&&maintenanceStamp!==next;
  maintenanceStamp=next;
  if(changed){if(cockpitVisible)await loadSequels();if(seasonsVisible)await refreshAiring();}
 }catch{}finally{maintenanceBusy=false;}
}
function loadSequelsAfter(){return new Promise(resolve=>setTimeout(()=>{loadSequels().finally(resolve);},0));}
function translate(){
 if($('v220MediaTab'))$('v220MediaTab').textContent=labels(0);
 if($('v220MediaTitle'))$('v220MediaTitle').textContent=labels(0);
 if($('v220CockpitIntro'))$('v220CockpitIntro').textContent=labels(6);
 if($('v220MediaIntro'))$('v220MediaIntro').textContent=t('intro');
 if($('v220SequelTitle'))$('v220SequelTitle').textContent=t('sequelTitle');
 if($('v220SequelIntro'))$('v220SequelIntro').textContent=t('sequelIntro');
 for(const card of document.querySelectorAll('.alm-v220-sequel')){const select=card.querySelector('.alm-v220-sequel-status'),button=card.querySelector('.alm-v220-sequel-add');if(select&&button&&!button.disabled){window.ALM_WATCH_STATUS?.apply?.(select);button.textContent=window.ALM_ADD_LABEL?.(select.value)||window.ALM_WATCH_STATUS?.label(select.value)||t('sequelAdd');}}
 if($('v220GoWatching'))$('v220GoWatching').textContent=t('goWatching');
 if($('v220GoSeasons'))$('v220GoSeasons').textContent=t('goSeasons');
 connectivity();renderMedia();renderSaved();renderMissing();renderPossession();refreshSummaries();
}
function init(){
 $('v220MediaTab')?.addEventListener('click',()=>{translate();});
 $('v220MediaClose')?.addEventListener('click',()=>$('importDialog')?.close());
 $('navCockpit')?.addEventListener('click',()=>{void loadSequels().then(refreshScheduledCaches);});
 const cockpit=$('cockpitPage');if(cockpit&&typeof MutationObserver==='function')new MutationObserver(()=>{if(!cockpit.classList.contains('hidden'))void loadSequels();}).observe(cockpit,{attributes:true,attributeFilter:['class']});
 $('v220MediaChoose')?.addEventListener('click',choose);
 $('v220MediaLoadCovers')?.addEventListener('click',()=>{for(const button of $('v220MediaRows').querySelectorAll('.alm-v220-load-cover:not([hidden])'))button.click();});
 $('v220MediaMore')?.addEventListener('click',async()=>{if(mediaBusy)return;const start=visible;visible+=40;await catalogFor((scan?.files||[]).slice(start,visible).map(f=>f.titleGuess));renderMedia();});
 $('navSeasonNews')?.addEventListener('click',()=>{renderMissing();void refreshAiring();});
 $('v220CheckPossession')?.addEventListener('click',checkPossession);
 const seasons=$('seasonNewsPage');if(seasons&&typeof MutationObserver==='function')new MutationObserver(()=>{if(!seasons.classList.contains('hidden'))void refreshAiring();}).observe(seasons,{attributes:true,attributeFilter:['class']});
 $('v220GoWatching')?.addEventListener('click',()=>document.querySelector('.nav-item[data-filter="Watching"]')?.click());
 $('v220GoSeasons')?.addEventListener('click',()=>$('navSeasonNews')?.click());
 window.addEventListener('alm:airing-cache-changed',event=>{airingItems=Array.isArray(event.detail?.items)?event.detail.items:[];airingCheckedAt=event.detail?.checkedAt||'';renderPossession();});
 window.addEventListener('alm:library-rendered',()=>{void refreshSummaries();});
 window.addEventListener('alm:collection-changed',()=>{void refreshSummaries();});
 window.addEventListener('alm:language-changed',translate);
 window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);
 const cachePoll=setInterval(()=>{if(!document.hidden&&seasons&&!seasons.classList.contains('hidden'))void refreshAiring();void refreshScheduledCaches();},120000);
 window.addEventListener('pagehide',()=>clearInterval(cachePoll),{once:true});
 translate();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();