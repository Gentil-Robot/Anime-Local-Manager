(function(root){
 'use strict';
 const id=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
 const key=v=>String(v||'').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
 const titles=a=>[a.title,a.titleEn,a.titleJa,a.titleRomaji,a.officialTitle,a.englishTitle,a.japaneseTitle,a.romajiTitle,...(Array.isArray(a.synonyms)?a.synonyms:[])].map(key).filter(Boolean);
 function same(a,b){if(!a||!b)return false;if(a.catalogueId||b.catalogueId)return !!a.catalogueId&&a.catalogueId===b.catalogueId;if(id(a.malId)&&id(b.malId))return id(a.malId)===id(b.malId);if(id(a.anilistId)&&id(b.anilistId))return id(a.anilistId)===id(b.anilistId);const known=new Set(titles(a));return titles(b).some(v=>known.has(v));}
 function find(item,list){return (list||root._almAnimes||[]).find(a=>same(a,item))||null;}
 function label(item){const k={Watching:'collectionWatching',Completed:'collectionCompleted','Plan to Watch':'collectionPlan','On-Hold':'collectionOnHold',Dropped:'collectionDropped'}[item?.status]||'collectionPresent';return root.ALM_DESIGN?.t(k)||'Déjà dans ta collection';}
 const api={same,find,label};if(typeof module==='object'&&module.exports)module.exports=api;else root.ALM_COLLECTION=api;
})(typeof window==='object'?window:globalThis);
