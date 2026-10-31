(() => {
 'use strict';
 let last=-Infinity;
 function restore(){
  if(!window.animeManager?.restoreInputFocus||document.hidden||performance.now()-last<80)return;
  last=performance.now();Promise.resolve(window.animeManager.restoreInputFocus()).catch(()=>{});
 }
 document.addEventListener('focusin',event=>{const field=event.target;if(field.matches?.('input:not([disabled]):not([readonly]),textarea:not([disabled]):not([readonly]),[contenteditable=true]'))restore();});
 document.addEventListener('pointerdown',event=>{const field=event.target.closest?.('input,textarea,[contenteditable=true]');if(field&&!field.disabled&&!field.readOnly)restore();},true);
 document.addEventListener('close',event=>{if(event.target.matches?.('dialog'))restore();},true);
 window.addEventListener('focus',restore);
})();
