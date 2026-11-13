(() => {
 'use strict';
 const C=()=>window.ALM_COMMUNITY,t=key=>window.ALM_COMMUNITY_T(key),e=value=>window.ALM_DESIGN.escape(String(value??''));
 let sequence=0;
 const errorText=error=>window.ALM_COMMUNITY_ERROR(error);
 const owner=()=>C()?.snapshot()?.user?.id||null;
 const sameOwner=id=>owner()===id;
 const closeSettings=()=>{const dialog=document.getElementById('settingsDialog');if(dialog?.open)dialog.close();};
 async function modal(html) {
  closeSettings();
  const previous=document.getElementById('commDialog');
  if(previous?.open)previous.close();
  previous?.remove();
  // A native close event is asynchronous. Reusing the same dialog could run
  // the previous screen's cleanup on a newly-opened password/QR form.
  const dialog=document.createElement('dialog');dialog.id='commDialog';
  dialog.className='comm-dialog comm-mfa-dialog';dialog.setAttribute('data-no-i18n','');
  dialog.innerHTML='<div class="comm-dialog-scroll">'+html+'</div>';
  document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('form .comm-actions')?.classList.add('comm-dialog-footer');
  dialog.showModal();window.ALM_SCROLL_PROGRESS?.mount();
  return dialog;
 }
 async function refresh() {
  await C().refresh({cached:false});C().paint();
  await window.ALM_COMMUNITY_WORKSPACE?.renderAccount?.();
 }
 function factorFields(mfa) {
  return `<label>${e(t('mfaFactor'))}<select name="factorId" required>${(mfa.factors||[]).map(f=>`<option value="${e(f.id)}">${e(f.name)}</option>`).join('')}</select></label><label>${e(t('mfaCode'))}<input class="comm-mfa-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label>`;
 }
 function pendingMarkup(state) {
  return `<section class="comm-security-card"><h3>${e(t('securityTitle'))}</h3><p role="status">${e(t(state?.mfa?.locked?'mfaLocked':'mfaPending'))}</p><div class="comm-actions">${state?.mfa?.locked?'':`<button type="button" data-comm-security="challenge">${e(t('mfaVerify'))}</button>`}<button type="button" data-comm-security="logout">${e(t('logout'))}</button></div></section>`;
 }
 function card(state) {
  if(!state?.connected)return state?.mfaRequired?pendingMarkup(state):'';
  const enabled=state.mfa?.enabled===true;
  return `<section class="comm-security-card" aria-label="${e(t('securityTitle'))}"><h3>${e(t('securityTitle'))}</h3><p class="comm-security-state" data-enabled="${enabled}">${e(t(enabled?'mfaOn':'mfaOff'))}</p><p class="comm-help">${e(t(enabled?(state.mfa.backupReady?'mfaBackupReady':'mfaBackupMissing'):'mfaIntro'))}</p><div class="comm-actions"><button type="button" data-comm-security="settings">${e(t(enabled?'mfaManage':'mfaEnable'))}</button></div></section>`;
 }
 function authOptions(signup) {
  return signup?`<p class="comm-help">${e(t('mfaAfterConfirm'))}</p>`:`<p class="comm-help">${e(t('mfaLoginNote'))}</p><label class="comm-check comm-mfa-option"><input type="checkbox" name="enable_mfa"><span>${e(t('mfaAfterLogin'))}</span></label>`;
 }
 async function challenge(provided) {
  await C().refresh({cached:false});
  const id=owner(),mfa=provided?.attemptId?provided:await C().api('mfa');
  if(!sameOwner(id))return false;
  if(!mfa.required)return true;
  if(mfa.locked){await settings();return false;}
  const generation=++sequence;
  const dialog=await modal(`<form><h2>${e(t('mfaLoginTitle'))}</h2><p class="comm-help">${e(t('mfaLoginHelp'))}</p>${factorFields(mfa)}<p role="status" aria-live="polite"></p><div class="comm-actions"><button type="submit">${e(t('mfaVerify'))}</button><button type="button" data-close>${e(t('close'))}</button></div></form>`);
  const form=dialog.querySelector('form'),status=form.querySelector('[role=status]'),submit=form.querySelector('[type=submit]');
  let completed=false,submitting=false,resolve;
  const result=new Promise(r=>resolve=r);
  const active=()=>dialog.open&&form.isConnected&&generation===sequence&&sameOwner(id);
  dialog.addEventListener('close',()=>{
   form.reset();
   if(!completed)C().api('mfa/cancel','POST',{attemptId:mfa.attemptId}).then(refresh).catch(()=>{});
   resolve(completed);
  },{once:true});
  form.onsubmit=async event=>{
   event.preventDefault();if(submitting||!active()||!form.reportValidity())return;
   submitting=true;submit.disabled=true;status.textContent=t('running');
   try {
    const fields=Object.fromEntries(new FormData(form));
    await C().api('mfa/verify','POST',{attemptId:mfa.attemptId,factorId:fields.factorId,code:fields.code});
    if(!active())return;
    completed=true;dialog.close();await refresh();
   } catch(error) {if(active())status.textContent=errorText(error);}
   finally {form.elements.code.value='';submitting=false;if(active())submit.disabled=false;}
  };
  form.elements.code.focus();return result;
 }
 async function credentials({title,action,target=null,name=false,onSubmit,onAbandoned}) {
  const id=owner(),mfa=await C().api('mfa');if(!sameOwner(id))return null;
  if(mfa.required){if(!await challenge(mfa))return null;return credentials({title,action,target,name,onSubmit,onAbandoned});}
  const generation=++sequence,deleting=action==='delete';
  const dialog=await modal(`<form><h2>${e(title)}</h2><p class="comm-help">${e(t(deleting?'deleteHint':'reauthRequired'))}</p>${name?`<label>${e(t('mfaName'))}<input name="name" maxlength="80" value="${e(t(mfa.enabled?'mfaAddBackup':'mfaFactor'))}" autocomplete="off" required></label>`:''}<label>${e(t('password'))}<input name="password" type="password" required maxlength="128" autocomplete="current-password"></label>${mfa.enabled?factorFields(mfa):''}${deleting?`<label>${e(t('typeDelete'))} ${e(t('deleteWord'))}<input name="confirmation" required autocomplete="off"></label>`:''}<div class="alm-captcha"></div><p role="status" aria-live="polite"></p><div class="comm-actions"><button type="submit" disabled>${e(t(deleting?'deleteAccount':'reauth'))}</button><button type="button" data-close>${e(t('close'))}</button></div></form>`);
  const form=dialog.querySelector('form'),status=form.querySelector('[role=status]'),submit=form.querySelector('[type=submit]');
  let captcha,completed=false,submitting=false,resolve;
  const result=new Promise(r=>resolve=r),active=()=>dialog.open&&form.isConnected&&generation===sequence&&sameOwner(id);
  dialog.addEventListener('close',()=>{captcha?.destroy();form.reset();if(!completed)resolve(null);},{once:true});
  try {
   const config=await window.ALM_CAPTCHA.config();if(!active())return null;
   captcha=await window.ALM_CAPTCHA.mount(form.querySelector('.alm-captcha'),config.captchaSiteKey);
   if(!active()){captcha?.destroy();return null;}submit.disabled=false;
  } catch(error) {if(active())status.textContent=errorText(error);}
  form.onsubmit=async event=>{
   event.preventDefault();if(submitting||!active()||!form.reportValidity())return;
   submitting=true;submit.disabled=true;status.textContent=t('running');
   try {
    const data=Object.fromEntries(new FormData(form));
    if(deleting&&data.confirmation!==t('deleteWord'))throw Error('INVALID_INPUT');
    const value=await onSubmit({...data,captchaToken:captcha.token(),target});
    if(!active()){await onAbandoned?.(value);return;}
    completed=true;dialog.close();resolve(value);
   } catch(error) {if(active())status.textContent=errorText(error);}
   finally {form.elements.password.value='';if(form.elements.code)form.elements.code.value='';captcha?.reset();submitting=false;if(active())submit.disabled=false;}
  };
  form.elements.password.focus();return result;
 }
 async function enrollment(setup) {
  const id=owner(),generation=++sequence;
  const dialog=await modal(`<form><h2>${e(t('mfaEnable'))}</h2><p class="comm-help">${e(t('mfaScanHelp'))}</p><div class="comm-mfa-qr"><canvas aria-label="${e(t('mfaEnable'))}" role="img"></canvas></div><label>${e(t('mfaSecret'))}<input class="comm-mfa-secret" name="secret" value="${e(setup.secret)}" readonly autocomplete="off" spellcheck="false"></label><label>${e(t('mfaCode'))}<input class="comm-mfa-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><p role="status" aria-live="polite"></p><div class="comm-actions"><button type="submit">${e(t('mfaVerify'))}</button><button type="button" data-close>${e(t('close'))}</button></div></form>`);
  const form=dialog.querySelector('form'),status=form.querySelector('[role=status]'),submit=form.querySelector('[type=submit]'),close=form.querySelector('[data-close]'),factorId=setup.id;
  let completed=false,submitting=false;
  const active=()=>dialog.open&&form.isConnected&&generation===sequence&&sameOwner(id);
  const cancel=event=>{if(submitting)event.preventDefault();};dialog.addEventListener('cancel',cancel);
  dialog.addEventListener('close',()=>{
   dialog.removeEventListener('cancel',cancel);form.reset();
   form.elements.secret.value='';form.elements.secret.removeAttribute('value');
   const canvas=form.querySelector('canvas');canvas.getContext?.('2d')?.clearRect(0,0,canvas.width,canvas.height);
   setup.secret='';setup.uri='';
   if(!completed)C().api('mfa/enroll/cancel','POST',{factorId}).then(refresh).catch(()=>{});
  },{once:true});
  try{await window.ALM_QR.toCanvas(form.querySelector('canvas'),setup.uri,{width:220,margin:2,errorCorrectionLevel:'M'});}catch{status.textContent=t('mfaSecret');}
  form.onsubmit=async event=>{
   event.preventDefault();if(submitting||!active()||!form.reportValidity())return;
   submitting=true;submit.disabled=true;close.disabled=true;status.textContent=t('running');
   try {
    await C().api('mfa/enroll/verify','POST',{factorId,code:form.elements.code.value});
    completed=true;if(active())dialog.close();
    if(sameOwner(id)){await refresh();C().toast(t('mfaSaved'));}
   }catch(error){if(active())status.textContent=errorText(error);}
   finally{form.elements.code.value='';submitting=false;if(active()){submit.disabled=false;close.disabled=false;}}
  };
  form.elements.code.focus();
 }
 async function settings() {
  await C().refresh({cached:false});const id=owner(),mfa=await C().api('mfa');if(!sameOwner(id))return;
  if(mfa.required&&!mfa.locked){await challenge(mfa);return;}
  const dialog=await modal(`<h2>${e(t('securityTitle'))}</h2><p class="comm-security-state" data-enabled="${mfa.enabled}">${e(t(mfa.enabled?'mfaOn':'mfaOff'))}</p><p class="comm-help">${e(t(mfa.locked?'mfaLocked':'mfaIntro'))}</p>${mfa.locked?`<p><a href="https://animelocalmanager.com/" target="_blank" rel="noopener noreferrer">${e(t('contact'))}</a></p>`:`<ul class="comm-mfa-factors">${mfa.factors.map(f=>`<li><span>${e(f.name)}</span>${mfa.factors.length>1?`<button type="button" data-remove-factor="${e(f.id)}">${e(t('mfaRemove'))}</button>`:''}</li>`).join('')}</ul><p class="comm-help">${e(t(mfa.backupReady?'mfaBackupReady':'mfaBackupMissing'))}</p><div class="comm-actions"><button type="button" data-add-factor>${e(t(mfa.enabled?'mfaAddBackup':'mfaEnable'))}</button>${mfa.enabled?`<button type="button" data-disable-mfa>${e(t('mfaDisable'))}</button>`:''}</div>`}<p class="comm-help">${e(t('mfaBackupHelp'))}</p><p class="comm-help">${e(t('mfaSecurityNotice'))}</p><button type="button" data-close>${e(t('close'))}</button>`);
  dialog.querySelector('[data-add-factor]')?.addEventListener('click',async event=>{
   event.currentTarget.disabled=true;
   try {
    const setup=await credentials({title:t(mfa.enabled?'mfaAddBackup':'mfaEnable'),action:'mfa-enroll',name:true,
     onSubmit:input=>C().api('mfa/enroll','POST',input),
     onAbandoned:value=>C().api('mfa/enroll/cancel','POST',{factorId:value.id})});
    if(setup&&sameOwner(id))await enrollment(setup);
   }catch(error){C().toast(errorText(error),true);}
  });
  const change=async(action,target)=>{
   try {
    const result=await credentials({title:t(action==='disable'?'mfaDisable':'mfaRemove'),action:action==='disable'?'mfa-disable':'mfa-remove',target,
     onSubmit:input=>C().api('mfa/change','POST',{...input,action})});
    if(result&&sameOwner(id)){await refresh();if(result.mfa?.required)await challenge(result.mfa);else await settings();}
   }catch(error){C().toast(errorText(error),true);}
  };
  dialog.querySelector('[data-disable-mfa]')?.addEventListener('click',()=>change('disable',null));
  for(const button of dialog.querySelectorAll('[data-remove-factor]'))button.addEventListener('click',()=>change('remove',button.dataset.removeFactor));
 }
 async function sensitive(action,{target=null}={}) {
  const id=owner(),result=await credentials({title:t(action==='delete'?'deleteAccount':action==='revoke-session'?'disconnectSession':'revokeOthers'),action,target,
   onSubmit:input=>C().api('sensitive','POST',{...input,action,target})});
  if(result&&(sameOwner(id)||!owner())){
   await C().open();if(action==='delete')C().toast(t('deleted'));else await C().setTab('sessions');
  }
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-comm-security]');if(!button)return;
  button.disabled=true;
  try{if(button.dataset.commSecurity==='settings')await settings();
   if(button.dataset.commSecurity==='challenge'){if(await challenge())await refresh();}
   if(button.dataset.commSecurity==='logout'){await C().api('logout','POST',{});await C().open();}
  }catch(error){C().toast(errorText(error),true);}finally{if(button.isConnected)button.disabled=false;}
 });
 window.addEventListener('alm:community-session',()=>sequence++);
 window.ALM_COMMUNITY_MFA={card,pendingMarkup,authOptions,challenge,settings,sensitive};
})();
