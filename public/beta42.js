(()=>{
 'use strict';const D=window.ALM_DESIGN,$=id=>document.getElementById(id),t=D.t;let previewToken=null,previewBusy=false;
 async function request(url,options){const r=await fetch(url,options),data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{code:data.code});return data;}
 const stamp=v=>{if(!v)return t('searchMissing');const d=new Date(v);return Number.isNaN(d.valueOf())?t('searchMissing'):new Intl.DateTimeFormat(D.language(),{dateStyle:'medium',timeStyle:'short'}).format(d);};
 async function refreshBackup(){try{const s=await request('/api/backup/encrypted/status');$('backupOverview').replaceChildren();for(const text of [s.lastSuccess?t('lastBackup',{date:stamp(s.lastSuccess)}):t('backupNever'),t('backupDestination',{path:s.directory||t('searchMissing')}),s.enabled&&s.nextAt?t('nextBackup',{date:stamp(s.nextAt)}):t('notScheduled')]){const p=document.createElement('p');p.textContent=text;$('backupOverview').append(p);}}catch{}}
 async function preview(file,isEncrypted){
  if(previewBusy)return;
  if(!file){window.notifyApp?.(t('backupSelectFile'),'error');return;}
  const button=$('restoreBackup');previewBusy=true;button.disabled=true;let password='',previewOpened=false;
  try{
   if(typeof isEncrypted!=='boolean'){
    const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer()),magic=[65,76,77,66,75,48,49,10];
    isEncrypted=bytes.length===magic.length&&magic.every((value,index)=>bytes[index]===value);
   }
   if(isEncrypted){password=await window.ALM_BACKUP_UI.promptRestore(file.name);if(password===null)return;}
   const form=new FormData();form.append('file',file);if(password)form.append('password',password);password='';
   const data=await request('/api/backup/preview',{method:'POST',body:form});form.delete('password');previewToken=data.token;
   const dialog=$('restorePreviewDialog'),host=$('restorePreviewContents');host.replaceChildren();
   for(const text of [file.name,t('backupDate',{date:stamp(data.createdAt)}),t('itemsCount',{count:data.count}),t('notesCount',{count:data.notes}),t('progressCount',{count:data.progress}),data.settings?t('settingsReplaced'):'',t('restoreWarning')].filter(Boolean)){const p=document.createElement('p');p.textContent=text;host.append(p);}
   $('restorePreviewCommit').disabled=false;dialog.showModal();previewOpened=true;$('restorePreviewCancel').focus();
  }catch(error){window.notifyApp?.(t(error.code==='ALM_BACKUP_INVALID_PASSWORD_OR_FILE'?'backupInvalid':'backupError'),'error');}
  finally{password='';previewBusy=false;button.disabled=false;if(!previewOpened)button.focus();}
 }
 async function cancelPreview(){const token=previewToken;previewToken=null;if(token)request('/api/backup/preview/'+token+'/cancel',{method:'POST'}).catch(()=>{});$('restorePreviewDialog').close();}
 async function commitPreview(){const token=previewToken;if(!token)return;const button=$('restorePreviewCommit');button.disabled=true;$('restorePreviewCancel').disabled=true;
  try{const data=await request('/api/backup/preview/'+token+'/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});previewToken=null;$('restorePreviewDialog').close();$('restoreBackupFile').value='';$('encryptedBackupFile').value='';await window.load();const status=$('restorationStatus');status.textContent=t('restorationDone')+' '+t('recoveryCopy',{file:data.recovery.file})+(data.requiresRestart?' '+t('restartRestored'):'');await refreshBackup();}
  catch(error){const key=['ALM_BACKUP_COLLECTION_CHANGED','ALM_BACKUP_PREVIEW_EXPIRED'].includes(error.code)?'previewExpired':error.code==='ALM_BACKUP_LOCKED'?'backupLocked':'backupError';window.notifyApp?.(t(key),'error');button.disabled=false;}
  finally{$('restorePreviewCancel').disabled=false;}
 }
 async function displaySettings(){
  let s={mode:'maximized',resolution:'auto',size:D.storage.get('alm.interface.size','normal')};
  try{if(window.animeManager?.getDisplayPreferences)s=await window.animeManager.getDisplayPreferences();}catch{}
  $('displayMode').value=s.mode;$('displayResolution').value=s.resolution;$('displaySize').value=s.size;
  const native=!!window.animeManager?.setDisplayPreferences;$('displayMode').disabled=!native;$('displayResolution').disabled=!native;$('displayHint').textContent=t(native?'displayHint':'displayDesktopOnly');
  if(!native)document.documentElement.style.zoom=s.size==='large'?'1.15':'1';
 }
 function init(){
  const restore=$('settingsPanel-restoration');const intro=document.createElement('p');intro.dataset.designText='restorationIntro';intro.setAttribute('data-no-i18n','');restore.append(intro);
  const input=$('restoreBackupFile');input.accept='.json,.alm-backup,.almbackup,.alm,application/json';const label=input.closest('label');const labelText=[...label.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());if(labelText){const caption=document.createElement('span');caption.dataset.designText='restoreFileKinds';caption.setAttribute('data-no-i18n','');labelText.replaceWith(caption);}restore.append(input.closest('label'));$('encryptedBackupFile').closest('label').hidden=true;restore.append($('encryptedBackupFile').closest('label'));
  for(const id of ['restoreBackup','encryptedBackupRestore']){const button=$(id);button.dataset.designText='previewBackup';button.setAttribute('data-no-i18n','');restore.append(button);if(id==='encryptedBackupRestore')button.hidden=true;}
  const status=document.createElement('p');status.id='restorationStatus';status.setAttribute('role','status');status.setAttribute('data-no-i18n','');restore.append(status);
  $('restoreBackup').onclick=()=>preview($('restoreBackupFile').files[0]);
  $('encryptedBackupRestore').onclick=()=>preview($('encryptedBackupFile').files[0],true);
  const dialog=document.createElement('dialog');dialog.id='restorePreviewDialog';dialog.className='backup-preview-dialog';dialog.setAttribute('data-no-i18n','');dialog.setAttribute('aria-labelledby','restorePreviewTitle');dialog.innerHTML='<h2 id="restorePreviewTitle" data-design-text="restorePreview"></h2><div id="restorePreviewContents"></div><menu><button type="button" id="restorePreviewCancel" data-design-text="chooseCancel"></button><button type="button" id="restorePreviewCommit" class="primary" data-design-text="restorePreviewApply"></button></menu>';document.body.append(dialog);$('restorePreviewCancel').onclick=cancelPreview;$('restorePreviewCommit').onclick=commitPreview;dialog.addEventListener('cancel',ev=>{ev.preventDefault();if(!$('restorePreviewCommit').disabled)cancelPreview();});
  const overview=document.createElement('section');overview.id='backupOverview';overview.className='backup-overview';overview.setAttribute('data-no-i18n','');$('settingsPanel-backup').querySelector('h2').after(overview);
  $('settingsTab-backup').addEventListener('click',refreshBackup);$('navSettings').addEventListener('click',refreshBackup);
  for(const id of ['encryptedBackupRun','encryptedBackupSave']){const button=$(id);if(button){const previous=button.onclick;button.onclick=async ev=>{await previous?.call(button,ev);await refreshBackup();};}}
  const display=document.createElement('section');display.className='display-preferences';display.setAttribute('data-no-i18n','');display.innerHTML='<h3 data-design-text="displayMode"></h3><div class="display-preference-fields"><label><span data-design-text="displayMode"></span><select id="displayMode"><option value="maximized" data-design-text="maximized"></option><option value="windowed" data-design-text="windowed"></option><option value="fullscreen" data-design-text="fullscreen"></option></select></label><label><span data-design-text="windowSize"></span><select id="displayResolution"><option value="auto" data-design-text="autoFit"></option><option value="FHD">FHD · 1920 × 1080</option><option value="QHD">QHD · 2560 × 1440</option><option value="4K">4K · 3840 × 2160</option></select></label><label><span data-design-text="interfaceSize"></span><select id="displaySize"><option value="normal" data-design-text="sizeNormal"></option><option value="large" data-design-text="sizeLarge"></option></select></label></div><p id="displayHint"></p><button type="button" id="displayApply" class="primary" data-design-text="displaySave"></button><p id="displayStatus" role="status"></p>';$('settingsPanel-appearance').append(display);
  $('displayApply').onclick=async()=>{const b=$('displayApply');b.disabled=true;try{const preference={mode:$('displayMode').value,resolution:$('displayResolution').value,size:$('displaySize').value};if(window.animeManager?.setDisplayPreferences)await window.animeManager.setDisplayPreferences(preference);else document.documentElement.style.zoom=preference.size==='large'?'1.15':'1';D.storage.set('alm.interface.size',preference.size);$('displayStatus').textContent=t('displaySaved');}catch{$('displayStatus').textContent=t('searchError');}finally{b.disabled=false;}};
  $('settingsTab-appearance').addEventListener('click',displaySettings);displaySettings();refreshBackup();
  const partner=document.createElement('section');partner.className='alm-partner-banner';partner.setAttribute('data-no-i18n','');partner.innerHTML='<div><h3 data-design-text="newsletter"></h3><p data-design-text="newsletterHint"></p></div><button type="button" data-alm-form="newsletter" data-design-text="subscribe"></button>';if(!document.querySelector('[data-alm-form=newsletter]'))document.querySelector('#aboutPage .alm-retro-banner')?.after(partner);
  window.addEventListener('alm:language-changed',()=>{D.applyText(display);D.applyText(dialog);D.applyText(partner);refreshBackup();$('displayHint').textContent=t(window.animeManager?.setDisplayPreferences?'displayHint':'displayDesktopOnly');});D.applyText();
 }
 window.ALM_RESTORE={preview};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
