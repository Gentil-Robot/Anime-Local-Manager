(()=>{
 'use strict';
 const languages=['fr','en','ja','es','de','pt-BR','zh-CN'];
 const entries={
  apiRetired:['Service public retiré','Public service retired','公開サービス終了','Servicio público retirado','Öffentlicher Dienst eingestellt','Serviço público encerrado','公共服务已停用'],
  rankingMAL:['MyAnimeList · API officielle','MyAnimeList · official API','MyAnimeList · 公式API','MyAnimeList · API oficial','MyAnimeList · offizielle API','MyAnimeList · API oficial','MyAnimeList · 官方API'],
  rankingCache:['Classement MyAnimeList enregistré · ancien cache Jikan','Saved MyAnimeList ranking · historical Jikan cache','保存済みMyAnimeListランキング · 旧Jikanキャッシュ','Clasificación MyAnimeList guardada · caché anterior de Jikan','Gespeicherte MyAnimeList-Rangliste · früherer Jikan-Cache','Ranking MyAnimeList salvo · cache antigo do Jikan','已保存的MyAnimeList排行 · 旧Jikan缓存'],
  malConnection:['Connexion MyAnimeList (optionnelle)','MyAnimeList connection (optional)','MyAnimeList接続（任意）','Conexión MyAnimeList (opcional)','MyAnimeList-Verbindung (optional)','Conexão MyAnimeList (opcional)','MyAnimeList连接（可选）'],
  malHelp:['Le catalogue local fonctionne sans identifiant. Un Client ID de votre propre application MyAnimeList permet d’actualiser les saisons et le Top 100. Aucun mot de passe MyAnimeList ni secret client n’est demandé.','The local catalogue works without credentials. A Client ID for your own MyAnimeList application enables season and Top 100 updates. No MyAnimeList password or client secret is required.','ローカルカタログは認証情報なしで使えます。自分のMyAnimeListアプリのClient IDでシーズンとTop 100を更新できます。パスワードやクライアントシークレットは不要です。','El catálogo local funciona sin credenciales. El Client ID de tu propia aplicación MyAnimeList permite actualizar temporadas y el Top 100. No se necesita contraseña ni secreto del cliente.','Der lokale Katalog funktioniert ohne Zugangsdaten. Mit der Client ID Ihrer eigenen MyAnimeList-App lassen sich Staffeln und Top 100 aktualisieren. Passwort und Client Secret sind nicht erforderlich.','O catálogo local funciona sem credenciais. O Client ID do seu próprio aplicativo MyAnimeList permite atualizar temporadas e o Top 100. Não é necessária senha nem segredo do cliente.','本地目录无需凭据。使用您自己注册的MyAnimeList应用的Client ID，可更新季度数据和Top 100。无需密码或客户端密钥。'],
  malSave:['Enregistrer / retirer','Save / remove','保存／削除','Guardar / eliminar','Speichern / entfernen','Salvar / remover','保存／移除'],
  malConfigured:['Connexion configurée','Connection configured','接続設定済み','Conexión configurada','Verbindung eingerichtet','Conexão configurada','连接已配置'],
  malLocal:['Catalogue local · connexion non configurée','Local catalogue · connection not configured','ローカルカタログ · 接続未設定','Catálogo local · conexión sin configurar','Lokaler Katalog · Verbindung nicht eingerichtet','Catálogo local · conexão não configurada','本地目录 · 尚未配置连接'],
  malFailed:['Enregistrement impossible. Vérifiez le Client ID.','Could not save. Check the Client ID.','保存できません。Client IDを確認してください。','No se pudo guardar. Revisa el Client ID.','Speichern fehlgeschlagen. Prüfen Sie die Client ID.','Não foi possível salvar. Confira o Client ID.','无法保存，请检查Client ID。'],
  providerLocalHelp:['Jikan public est désactivé. La base locale est conservée. Kitsu complète uniquement les fiches reliées par un identifiant MyAnimeList vérifié. Aucun téléchargement massif depuis AniList.','Public Jikan is disabled. The local database is retained. Kitsu supplements records only through verified MyAnimeList mappings. No mass download from AniList.','Jikanの公開APIは無効です。ローカルDBは保持されます。Kitsuは確認済みMyAnimeList IDのある作品のみ補完します。AniListから大量収集は行いません。','Jikan público está desactivado. Se conserva la base local. Kitsu solo completa fichas con un ID MyAnimeList verificado. Sin descarga masiva de AniList.','Die öffentliche Jikan-API ist deaktiviert. Die lokale Datenbank bleibt erhalten. Kitsu ergänzt nur Einträge mit bestätigter MyAnimeList-ID. Kein Massendownload von AniList.','O Jikan público está desativado. A base local é preservada. O Kitsu complementa apenas fichas com ID MyAnimeList verificado. Sem download em massa do AniList.','Jikan公共API已禁用，本地数据库保留。Kitsu仅补充已验证MyAnimeList ID对应的记录，不从AniList批量下载。']
 };
 for(const [key,values]of Object.entries(entries))languages.forEach((l,i)=>window.ALM_DESIGN_COPY[l][key]=values[i]);
 const D=window.ALM_DESIGN,$=id=>document.getElementById(id),t=D.t;
 function init(){
  const panel=$('settingsPanel-connections');if(!panel)return;
  const section=document.createElement('section');section.className='settings-section provider-settings';section.setAttribute('data-no-i18n','');
  section.innerHTML='<h3 data-design-text="malConnection"></h3><p class="muted" data-design-text="malHelp"></p><a href="https://myanimelist.net/apiconfig" target="_blank" rel="noopener noreferrer">MyAnimeList API</a><label for="malClientId">Client ID MyAnimeList</label><input id="malClientId" type="password" autocomplete="off" maxlength="128"><button type="button" id="malSave" class="primary" data-design-text="malSave"></button><p id="malStatus" role="status" aria-live="polite"></p><p class="muted" data-design-text="providerLocalHelp"></p>';
  panel.querySelector('h2').after(section);
  let configured=false;
  const paint=()=>{D.applyText();$('malStatus').textContent=t(configured?'malConfigured':'malLocal');$('malClientId').placeholder=configured?'••••••••':'';};
  fetch('/api/config/providers').then(r=>r.json()).then(data=>{configured=data.malConfigured;paint();}).catch(paint);
  $('malSave').onclick=async()=>{const button=$('malSave');button.disabled=true;try{const r=await fetch('/api/config/providers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({malClientId:$('malClientId').value.trim()})});if(!r.ok)throw Error();const data=await r.json();configured=data.malConfigured;$('malClientId').value='';paint();window.dispatchEvent(new Event('alm:providers-changed'));}catch{$('malStatus').textContent=t('malFailed');}finally{button.disabled=false;}};
  // Old generation quotas are retained in config for compatibility, but are no longer used.
  for(const id of ['metadataAutonomousTopPages','metadataAutonomousAniListPages']){$(id)?.closest('label')?.setAttribute('hidden','');if($(id))$(id).disabled=true;}
  const metadata=$('metadataSettingsStatus');if(metadata){const note=document.createElement('p');note.className='muted';note.dataset.designText='providerLocalHelp';metadata.after(note);}
  window.addEventListener('alm:language-changed',paint);paint();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
