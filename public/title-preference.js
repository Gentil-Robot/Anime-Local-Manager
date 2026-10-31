(function(root){
 'use strict';
 function hint(item){
  const names=[item?.customTitle,item?.title].map(value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,'').replace(/\s+/g,' ').trim());
  return Number(item?.malId)!==51553&&names.some(name=>['latelier des sorciers','atelier des sorciers','witch hat atelier','tongari boushi no atelier'].includes(name))?51553:0;
 }
 function custom(item){
  if(!item)return '';
  if(typeof item.customTitle==='string'&&item.customTitle.trim())return item.customTitle.trim().slice(0,300);
  // Older versions saved renamed personal records without a separate override.
  const title=String(item.title||'').trim(),canonical=String(item.canonicalTitle||'').trim();
  if(item.id&&hint(item))return title;
  const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
  const known=[canonical,item.titleEn,item.titleJa,item.englishTitle,item.japaneseTitle,...Object.values(item.localizedTitles||{}),...(Array.isArray(item.synonyms)?item.synonyms:[])].filter(Boolean).map(normalized);
  return item.id&&canonical&&title&&!known.includes(normalized(title))?title:'';
 }
 const api={custom,hint};if(typeof module==='object'&&module.exports)module.exports=api;else root.ALM_TITLE_PREFERENCE=api;
})(typeof window==='object'?window:globalThis);
