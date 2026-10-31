/* Stored status values are stable; only their presentation follows the language. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.ALM_WATCH_STATUS=api;const refresh=()=>api.apply(root.document);root.addEventListener('alm:language-changed',refresh);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();}
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const values=Object.freeze(['Watching','Completed','On-Hold','Dropped','Plan to Watch']);
  const copy=Object.freeze({
    fr:['En cours','Terminé','En pause','Abandonné','À voir'],
    en:['Watching','Completed','On hold','Dropped','Plan to watch'],
    es:['En curso','Completado','En pausa','Abandonado','Por ver'],
    de:['Wird angesehen','Abgeschlossen','Pausiert','Abgebrochen','Merkliste'],
    ja:['視聴中','視聴完了','一時中断','視聴中止','視聴予定'],
    'pt-BR':['Assistindo','Concluído','Em pausa','Abandonado','Para assistir'],
    'zh-CN':['正在观看','已看完','暂停','已放弃','计划观看']
  });
  const normalize=value=>value==='On Hold'?'On-Hold':values.includes(value)?value:'';
  const language=()=>root.ALM_I18N?.getLanguage?.()||root.ALM_DESIGN?.language?.()||root.document?.documentElement?.lang||'fr';
  function label(value,lang=language()){const index=values.indexOf(normalize(value));return index<0?'':(copy[lang]||copy.en)[index];}
  function options(selected='',subset=values){return subset.filter(value=>normalize(value)).map(value=>`<option value="${normalize(value)}" data-watch-status="${normalize(value)}" data-no-i18n${normalize(value)===normalize(selected)?' selected':''}>${label(value)}</option>`).join('');}
  function apply(scope){for(const node of scope?.querySelectorAll?.('[data-watch-status]')||[]){const text=label(node.dataset.watchStatus);if(node.textContent!==text)node.textContent=text;}root.ALM_SELECTS?.refresh();}
  return {values,normalize,label,options,apply,copy};
});
