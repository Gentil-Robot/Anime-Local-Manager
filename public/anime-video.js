(() => {
 'use strict';
 const D=window.ALM_DESIGN,t=D.t;let dialog,frameHost,heading,external,help,returnFocus;
 function close(){if(dialog?.open)dialog.close();}
 function ensure(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='animeVideoDialog';dialog.className='anime-video-dialog';dialog.setAttribute('aria-labelledby','animeVideoTitle');dialog.setAttribute('data-no-i18n','');
  const header=document.createElement('header'),button=document.createElement('button');
  heading=document.createElement('h2');heading.id='animeVideoTitle';heading.setAttribute('translate','no');button.type='button';button.textContent='×';button.dataset.designAria='closeDetail';button.onclick=close;
  header.append(heading,button);frameHost=document.createElement('div');frameHost.className='anime-video-frame';
  const footer=document.createElement('footer');external=document.createElement('a');external.target='_blank';external.rel='noopener noreferrer';external.dataset.designText='videoExternal';help=document.createElement('p');help.className='muted';help.dataset.designText='videoEmbedHelp';footer.append(external,help);dialog.append(header,frameHost,footer);document.body.append(dialog);
  dialog.addEventListener('close',()=>{frameHost.replaceChildren();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});});
  window.addEventListener('alm:language-changed',()=>D.applyText(dialog));D.applyText(dialog);
 }
 function open(videoId,title,source){
  if(!/^[A-Za-z0-9_-]{11}$/.test(String(videoId||'')))return false;
  ensure();returnFocus=source||document.activeElement;heading.textContent=String(title||t('videoTitle'));external.href='https://www.youtube.com/watch?v='+videoId;
  const frame=document.createElement('iframe');frame.title=heading.textContent;frame.referrerPolicy='strict-origin-when-cross-origin';frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
  const url=new URL('https://www.youtube-nocookie.com/embed/'+videoId);url.searchParams.set('autoplay','1');url.searchParams.set('rel','0');url.searchParams.set('playsinline','1');
  frame.src=url.href;frameHost.replaceChildren(frame);if(!dialog.open)dialog.showModal();dialog.querySelector('button').focus();return true;
 }
 window.ALM_VIDEO={open,close};
})();

