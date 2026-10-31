/* Desktop controls use the actual native window state and trusted IPC. */
(()=>{
 'use strict';
 const labels={fr:['Réduire','Agrandir','Restaurer la fenêtre','Quitter ALM'],en:['Minimize','Maximize','Restore window','Quit ALM'],ja:['最小化','最大化','元に戻す','ALM を終了'],es:['Minimizar','Maximizar','Restaurar ventana','Salir de ALM'],de:['Minimieren','Maximieren','Fenster wiederherstellen','ALM beenden'],'pt-BR':['Minimizar','Maximizar','Restaurar janela','Sair do ALM'],'zh-CN':['最小化','最大化','还原窗口','退出 ALM']};
 const icon=path=>'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="'+path+'"/></svg>';
 function init(){
  const api=window.animeManager,host=document.querySelector('.header-actions');if(!api?.closeWindow||!host)return;
  const group=document.createElement('div');group.className='window-actions';group.setAttribute('role','group');
  const minimize=document.createElement('button'),restore=document.createElement('button'),close=document.createElement('button');
  minimize.id='appMinimize';restore.id='appExitFullscreen';close.id='appQuit';
  for(const button of [minimize,restore,close]){button.type='button';button.className='window-action';group.append(button);}
  host.append(group);let state={fullscreen:true,maximized:false,minimized:false};
  const paint=()=>{const text=labels[window.ALM_DESIGN?.language()]||labels.fr,expanded=state.fullscreen||state.maximized;
   minimize.innerHTML=icon('M3 11h10');restore.innerHTML=icon(expanded?'M6 3h7v7H6z M3 6h7v7H3z':'M3 3h10v10H3z');close.innerHTML=icon('M3 3l10 10 M13 3L3 13');
   for(const [button,label] of [[minimize,text[0]],[restore,text[expanded?2:1]],[close,text[3]]]){button.title=label;button.setAttribute('aria-label',label);}
   restore.setAttribute('aria-pressed',String(expanded));
  };
  const run=async(button,action)=>{if(button.disabled)return;button.disabled=true;try{const next=await action();if(next&&typeof next.fullscreen==='boolean')state=next;paint();}catch{window.notifyApp?.(window.ALM_DESIGN.t('searchError'),'error');}finally{button.disabled=false;}};
  minimize.onclick=()=>run(minimize,()=>api.minimizeWindow());
  restore.onclick=()=>run(restore,async()=>{if(document.fullscreenElement)await document.exitFullscreen();return api.toggleMaximize();});
  close.onclick=()=>run(close,()=>api.closeWindow());
  api.onWindowState?.(next=>{state=next;paint();});api.getWindowState?.().then(next=>{state=next;paint();}).catch(()=>{});
  window.addEventListener('alm:language-changed',paint);paint();
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open],.karaoke-focus-mode')&&!document.fullscreenElement&&state.fullscreen)restore.click();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
