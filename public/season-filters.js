/* Filters apply to loaded proposals; source status comes from an exact local ID. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {
    const model=api.createModel({language:()=>root.ALM_DESIGN.language()}),D=root.ALM_DESIGN,t=(key,args)=>D.t(key,args),e=D.escape;
    let source=[],library=[];
    const input=(key,label)=>`<label><span>${e(t(label))}</span><select data-season-filter="${key}"></select></label>`;
    function mount(){
      const host=root.document.getElementById('seasonNewsFilters');if(!host)return;
      host.innerHTML=`<div class="season-filter-fields"><label><span>${e(t('search'))}</span><input type="search" data-season-filter="query" maxlength="300" placeholder="${e(t('librarySearch'))}"></label>${[['status','seasonSourceStatus'],['type','typeFilter'],['genre','genreFilter'],['studio','studioFilter'],['year','yearFilter'],['sort','sortFilter']].map(([key,label])=>input(key,label)).join('')}<button type="button" data-season-reset>${e(t('resetFilters'))}</button></div><p class="comm-help">${e(t('seasonFilterScope'))}</p><p id="seasonFilterCount" role="status" aria-live="polite"></p>`;
      const changed=event=>{
        const node=event.target.closest('[data-season-filter]');if(!node)return;
        if(node.tagName==='SELECT'&&event.type==='input')return;
        if(node.tagName==='INPUT'&&event.type==='change')return;
        model.set({[node.dataset.seasonFilter]:node.value});root.renderSeasonNewsPage?.({activate:false});
      };
      host.addEventListener('input',changed);host.addEventListener('change',changed);
      host.querySelector('[data-season-reset]').onclick=()=>{model.reset();prepare(source,library);root.renderSeasonNewsPage?.({activate:false});host.querySelector('input').focus();};
      prepare(source,library);
    }
    function fill(key,values,first){
      const node=root.document.querySelector(`#seasonNewsFilters [data-season-filter="${key}"]`);if(!node)return;
      const value=model.state()[key],entries=[...(first?[["",t(first)]]:[]),...values];
      if(value&&!entries.some(([v])=>v===value))entries.push([value,value]);
      const html=entries.map(([v,label])=>`<option value="${e(v)}"${value===v?' selected':''}>${e(label)}</option>`).join('');
      if(node.innerHTML!==html)node.innerHTML=html;node.value=value;
    }
    function prepare(rows,own){
      source=rows;library=own;
      const fields=model.values(rows,own),query=root.document.querySelector('#seasonNewsFilters [data-season-filter="query"]');
      if(query&&query.value!==model.state().query)query.value=model.state().query;
      fill('status',[...root.ALM_WATCH_STATUS.values.map(s=>[s,root.ALM_WATCH_STATUS.label(s)]),['unknown',t('seasonStatusUnknown')]],'allStatuses');
      for(const [key,label]of [['type','allTypes'],['genre','allGenres'],['studio','allStudios'],['year','allYears']])fill(key,fields[key].map(v=>[v,key==='genre'?(root.ALM_CONTENT_LANGUAGE?.genre(v)||v):v]),label);
      fill('sort',[['title','sortTitle'],['studio','sortStudio'],['startDateDesc','sortNewest'],['startDateAsc','sortOldest'],['publicScoreDesc','sortPublicScore'],['rankAsc','sortRank']].map(([v,k])=>[v,t(k)]));
      const count=root.document.getElementById('seasonFilterCount');if(count)count.textContent=t('seasonFilterCount',{shown:model.select(rows,own).length,total:rows.length});
      root.ALM_SELECTS?.refresh();
    }
    root.ALM_SEASON_FILTERS={...model,prepare};
    root.addEventListener('alm:language-changed',()=>{const host=root.document.getElementById('seasonNewsFilters');if(host){host.replaceChildren();const next=host.cloneNode(false);host.replaceWith(next);mount();}root.renderSeasonNewsPage?.({activate:false});});
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  }
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const text=v=>String(v??''),list=v=>(Array.isArray(v)?v:[v]).map(x=>text(x?.name||x).trim()).filter(Boolean);
  const defaults=()=>({query:'',status:'',type:'',genre:'',studio:'',year:'',sort:'title'});
  function createModel({language=()=>undefined}={}){
    let state=defaults();const choices=new WeakMap();
    function entries(rows,own){
      const byId=new Map(own.map(a=>[text(a.id),a])),byMal=new Map(own.filter(a=>Number(a.malId)>0).map(a=>[text(Number(a.malId)),a]));
      return rows.map((item,index)=>{
        const parent=byId.get(text(item.sourceAnimeId))||byMal.get(text(Number(item.sourceMalId)));
        const status=parent?.status==='On Hold'?'On-Hold':parent?.status||'unknown';
        return {item,index,status,title:text(item.title||item.sequelTitle),year:text(item.startDate).match(/^\d{4}/)?.[0]||'',genre:list(item.genres),studio:list(item.studios||item.studio)};
      });
    }
    function select(rows,own=[]){
      const q=state.query.toLocaleLowerCase();
      return entries(rows,own).filter(r=>(!q||[r.title,r.item.sourceTitle,...r.genre,...r.studio].join(' ').toLocaleLowerCase().includes(q))
        &&(!state.status||r.status===state.status)&&(!state.type||r.item.type===state.type)&&(!state.genre||r.genre.includes(state.genre))&&(!state.studio||r.studio.includes(state.studio))&&(!state.year||r.year===state.year))
        .sort((a,b)=>{
          const title=()=>a.title.localeCompare(b.title,language())||a.index-b.index;
          if(state.sort==='studio')return text(a.studio[0]||'\uffff').localeCompare(text(b.studio[0]||'\uffff'))||title();
          if(state.sort==='startDateDesc')return text(b.item.startDate).localeCompare(text(a.item.startDate))||title();
          if(state.sort==='startDateAsc')return text(a.item.startDate||'9999').localeCompare(text(b.item.startDate||'9999'))||title();
          if(state.sort==='publicScoreDesc')return (Number(b.item.publicScore)||0)-(Number(a.item.publicScore)||0)||title();
          if(state.sort==='rankAsc')return (Number(a.item.rank)||999999)-(Number(b.item.rank)||999999)||title();
          return title();
        });
    }
    return {select,set(patch){for(const key of Object.keys(state))if(typeof patch[key]==='string')state[key]=patch[key];},reset(){state=defaults();},state:()=>({...state}),checked:(item,fallback)=>choices.has(item)?choices.get(item):fallback,setChecked:(item,value)=>{if(item&&typeof item==='object')choices.set(item,!!value);},values(rows,own=[]){const all=entries(rows,own),out={};for(const key of ['type','genre','studio','year'])out[key]=[...new Set(all.flatMap(r=>key==='type'?list(r.item.type):list(r[key])))].sort((a,b)=>key==='year'?Number(b)-Number(a):a.localeCompare(b));return out;}};
  }
  return {createModel};
});
