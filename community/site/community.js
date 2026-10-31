(() => {
 'use strict';const $=id=>document.getElementById(id),M=window.ALM_COMMUNITY_MODEL,D=window.ALM_DESIGN,t=window.ALM_COMMUNITY_T,e=D.escape,S=window.ALM_COMMUNITY_SECURITY;
 const transport=window.ALM_COMMUNITY_API||(async(url,method='GET',body)=>{const r=await fetch('/api/community/'+url,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error||'ALM_COMMUNITY_REQUEST');return data;});
 const api=window.ALM_COMMUNITY_REQUESTS.create(transport);
 let refreshPending=null,refreshSerial=0;
 let uiOwner=null,state=null,view=null,friendId='',tab='summary',friends=null,inbox=null,busy=false,epoch=0,refreshEpoch=0,committedRefresh=0;
 let friendQuery='',friendSort='recent',sessionEpoch=0,collectionRefresh=null,collectionDirty=false;
 function paintIdentity(){
  const profile=state?.own?.profile,identity=state?.identity||profile,name=String(identity?.display_name||profile?.display_name||'').trim();
  const title=state?.connected&&name?name:t('back');
  const detail=state?.connected?S.tag(identity):t('local'),entry=$('commProfileEntry');
  const heading=$('commProfileName');if(heading)heading.textContent=title;
  const caption=$('commProfileState');if(caption)caption.textContent=detail;
  const portrait=entry?.querySelector('img');if(portrait)portrait.src=profile?avatar(profile):'/assets/design/aster-portrait.webp';
  entry?.setAttribute('aria-label',[title,detail].filter(Boolean).join(' · '));entry?.setAttribute('title',[title,detail].filter(Boolean).join(' · '));
 }
 const avatar=p=>M.avatarImage(p.avatar_image)||'/assets/design/aster-portrait.webp';
 const action=(name,label,attrs='')=>{const status=name==='add-status'?{plan:'Plan to Watch',watching:'Watching',completed:'Completed',onhold:'On-Hold',dropped:'Dropped'}[label]:'';return `<button type="button" data-comm-action="${e(name)}" ${status?`data-watch-status="${status}" data-no-i18n`:''} ${attrs}>${e(status?window.ALM_WATCH_STATUS.label(status):t(label))}</button>`;};
 const toast=(message,error=false)=>{const target=$('commStatus');if(target){target.textContent=message;target.dataset.error=String(error);}};
 const run=async(fn)=>{if(busy)return;busy=true;try{await fn();}catch(error){window.ALM_COMMUNITY_PLUS?.report(error);toast(window.ALM_COMMUNITY_ERROR(error),true);}finally{busy=false;}};
 function refresh({cached=false}={}){if(cached&&refreshPending)return refreshPending;if(!cached)api.clear();const serial=++refreshSerial,pending=loadState().catch(error=>{if(serial!==refreshSerial&&error.message==='SESSION_EXPIRED')return;throw error;}).finally(()=>{if(refreshPending===pending)refreshPending=null;});refreshPending=pending;return pending;}
 // A render/filter/pagination does not change account data. A real collection
 // update waits for the current status/friends read before invalidating its cache.
 // Bursts coalesce; a further change during that read needs only one follow-up.
 function refreshAfterCollectionChange(){
  collectionDirty=true;if(collectionRefresh)return;
  const session=sessionEpoch;
  const pending=Promise.resolve().then(async()=>{
   while(collectionDirty&&session===sessionEpoch){
    while(refreshPending&&session===sessionEpoch){try{await refreshPending;}catch{}}
    if(session!==sessionEpoch)return;
    collectionDirty=false;await refresh();
   }
  }).catch(error=>{if(session===sessionEpoch)window.ALM_COMMUNITY_WORKSPACE?.showAccountRefreshError?.(error);}).finally(()=>{
   if(collectionRefresh!==pending)return;collectionRefresh=null;
   if(collectionDirty&&session===sessionEpoch)refreshAfterCollectionChange();
  });
  collectionRefresh=pending;
 }
 async function loadState(){
  const session=sessionEpoch;
  const version=++refreshEpoch,next=await api('status');
  if(session!==sessionEpoch)return;
  // Account identity becomes available as soon as /status succeeds. A slow friends call
  // must not leave Settings on a false 'not ready' screen for 20 seconds.
  if(version>=committedRefresh && !state){state=next;
    paintIdentity();
    window.dispatchEvent(new CustomEvent('alm:community-changed'));
  }
  const result=next.connected?await api('friends').then(value=>({value}),error=>({error})):{value:null};
  if(session!==sessionEpoch||version<committedRefresh)return;
  if(next.connected&&result.error)throw result.error;const nextFriends=result.value;
  committedRefresh=version;state=next;
  if(uiOwner!==state.user?.id){inbox=null;friendQuery='';friendSort='recent';if(window.ALM_COMMUNITY_PLUS)window.ALM_COMMUNITY_PLUS.sessionRows=[];uiOwner=state.user?.id;window.ALM_COMMUNITY_WORKSPACE?.reset();}
  friends=state.connected?nextFriends:null;if(!friendId)view=state.own;
  paintSharingStatus();window.dispatchEvent(new CustomEvent('alm:community-changed'));
  paintIdentity();
 }

 async function open(id='',initialTab='summary',navId='commProfileEntry'){const version=++epoch;friendId=id;tab=initialTab;window.showV2Page?.('communityPage',navId);$('communityPage').classList.remove('hidden');$('communityPage').setAttribute('aria-busy','true');$('communityPage').innerHTML='<p id="commStatus" class="comm-loading" role="status">'+e(t('running'))+'</p>';try{await refresh({cached:true});if(version!==epoch||!state)return;const next=id?await api('profiles/'+encodeURIComponent(id)):state.own;if(version!==epoch)return;view=next;if(id)window.ALM_COMMUNITY_WORKSPACE?.visit(id);if(state.connected&&initialTab==='inbox')inbox=await api('recommendations');if(state.connected&&initialTab==='sessions')window.ALM_COMMUNITY_PLUS.sessionRows=await api('sessions');if(version!==epoch)return;paint();}catch(error){if(version!==epoch)return;window.ALM_COMMUNITY_WORKSPACE?.showAccountRefreshError?.(error);$('communityPage').innerHTML='<p id="commStatus" role="status"></p>'+action('home','back');window.ALM_COMMUNITY_PLUS?.report(error);toast(window.ALM_COMMUNITY_ERROR(error),true);}finally{if(version===epoch)$('communityPage').removeAttribute('aria-busy');}}
 function animePreview(i,compact=false){
  const image=M.poster(i.image_url),facts=[i.type,i.year||String(i.start_date||'').slice(0,4)].filter(Boolean).join(' · ');
  return `<button type="button" class="comm-anime-open ${compact?'comm-rank-open':''}" data-comm-action="anime-detail" data-mal-id="${Number(i.mal_id)}" aria-label="${e(t('openAnimeDetails')+' · '+i.title)}">${image?`<img class="comm-poster" src="${e(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:D.icon('image')}<span class="comm-anime-copy"><strong translate="no">${e(i.title)}</strong>${facts?`<small>${e(facts)}</small>`:''}${Number(i.public_score)>0?`<b>★ ${e(i.public_score)} / 10</b>`:''}</span></button>`;
 }
 function cards(items,foreign=!!friendId||tab==='friend-library',bare=false){
  if(!items.length)return `<p class="comm-help">${e(t('empty'))}</p>`;
  return `${bare?'':`<div class="comm-grid ${foreign?'comm-ranking-grid':''}">`}${items.map(i=>{const exists=state.own.items.find(a=>a.mal_id===i.mal_id);return `<article data-comm-anime="${Number(i.mal_id)}" class="comm-card ${foreign?'comm-ranking-card':''}">${animePreview(i,foreign)}<div class="comm-card-body"><small><span data-watch-status="${e(i.status)}" data-no-i18n>${e(window.ALM_WATCH_STATUS.label(i.status))}</span> · ${e(i.episodes_seen||0)}/${e(i.episodes_total||'?')} · ${e(i.score||0)}/10</small><small>${e((i.genres||[]).join(' · '))}</small>${foreign?window.ALM_COMMUNITY_WEB?`<p class="comm-help">${e(t('planInApp'))}</p>`:`<div class="comm-card-actions">${[['Plan to Watch','plan'],['Watching','watching'],['Completed','completed'],['On-Hold','onhold'],['Dropped','dropped']].map(([status,key])=>action('add-status',key,`data-mal-id="${i.mal_id}" data-status="${status}" aria-pressed="${exists?.status===status}"`)).join('')}</div>`:window.ALM_COMMUNITY_WEB?'':`<button type="button" data-comm-action="favorite" data-mal-id="${i.mal_id}" aria-pressed="${i.favorite}">${i.favorite?'♥':'♡'} ${e(t('favorites'))}</button>`}</div></article>`;}).join('')}${bare?'':'</div>'}`;
 }

 // The owner's library stays client-side; the friend's rows were already filtered by Supabase RLS.
 // Match only stable MAL IDs, never titles, and do not introduce another remote request.
 function mutualRows(){return friendId&&state?.connected&&Array.isArray(state?.own?.items)&&Array.isArray(view?.items)?M.commonItems(state.own.items,view.items):[];}
 function commonProfilePreview(){
  const rows=mutualRows(),count=window.ALM_COMMUNITY_WORKSPACE.commonCount?.(rows)??rows.length;
  return `<section class="comm-profile-common" aria-label="${e(t('common'))}"><div class="comm-profile-common-heading"><h2><button type="button" class="comm-common-open" data-comm-action="show-common" aria-controls="commPanel" ${count?'':'disabled'}><span>${e(t('common'))}</span> <span class="comm-common-count">${count}</span><span class="comm-common-arrow" aria-hidden="true">→</span></button></h2></div><p class="comm-help">${e(t('sample'))}</p>${count?cards(rows.slice(0,6),true):`<p class="comm-help">${e(t('noCommon'))}</p>`}</section>`;
 }
 function genres(rows){const max=Math.max(1,...rows.map(x=>x.count));return `<div class="comm-genres">${rows.map(g=>`<div><span>${e(g.genre)}</span><progress max="${max}" value="${Number(g.count)||0}" aria-label="${e(g.genre)}"></progress><span>${e(g.count)}</span></div>`).join('')}</div>`;}
 function activity(days){const end=new Date(),start=new Date(end);start.setUTCDate(start.getUTCDate()-363);const counts=new Map(days.map(d=>[d.date,d.episodes]));const boxes=[];for(let n=0;n<364;n++){const d=new Date(start);d.setUTCDate(start.getUTCDate()+n);const date=d.toISOString().slice(0,10),value=counts.get(date)||0;boxes.push(`<span class="comm-day" data-level="${value>=5?3:value>=2?2:value?1:0}" title="${e(date+' · '+value)}" role="img" aria-label="${e(date+' · '+value)}"></span>`);}return `<div class="comm-heatmap" aria-label="${e(t('activity'))}">${boxes.join('')}</div>`;}
 function privacy(){return `<p class="comm-help"><a href="/community-notice.html?lang=${e(D.language())}" target="_blank" rel="noopener noreferrer">${e(t('privacyLink'))}</a></p>`;}
 function sharingStatus(){if(state.own.profile.visibility!=='friends')return 'sharingPrivate';if(state.sync?.error)return 'syncFailed';return state.sync?.dirty||!state.sync?.publishedAt?'syncLocal':'syncCurrent';}
 function sharingMarkup(){const label=e(t(sharingStatus()));return state.connected?`<button type="button" class="comm-sharing-link" data-comm-account-shortcut title="${e(t('accountShortcutHint'))}" aria-label="${e(t('myAccount')+' · '+t(sharingStatus())+' · '+t('accountShortcutHint'))}"><strong>${e(S.tag(state.identity||state.own.profile))}</strong> · ${label}</button>`:label;}
 function paintSharingStatus(){if(!state)return;for(const node of document.querySelectorAll('#communityPage .comm-sharing-status')){node.dataset.sharingState=sharingStatus();const markup=sharingMarkup();if(node.innerHTML!==markup)node.innerHTML=markup;}}
 function account(){
  if(friendId)return '';
  const common=action('account','myAccount')+action('edit','edit')+`<button type="button" data-comm-plus="copy" ${!state.connected?'disabled':''}>${e(t('copyId'))}</button><button type="button" data-comm-plus="preview">${e(t('preview'))}</button>`;
  return `<section class="comm-account comm-account-compact"><div class="comm-actions comm-profile-toolbar" role="group" aria-label="${e(t('myAccount'))}">${common}${state.connected?action('add-friend','addFriend')+`<button type="button" class="comm-toolbar-notifications" data-comm-plus="notifications">${e(t('notifications'))} <span class="comm-badge">${Number(state.notifications?.count)||0}</span></button>`:state.configured?action('login','login')+action('signup','signup'):''}</div><p class="comm-sharing-status" role="status" data-sharing-state="${sharingStatus()}">${sharingMarkup()}</p>${!state.configured?`<p class="comm-help">${e(t('notReady'))}</p>`:''}</section>`;
 }


 function content(){if(tab==='friend-library')return state.connected?window.ALM_COMMUNITY_WORKSPACE.friendLibrary():`<p>${e(t('login'))}</p>`;if(tab==='common')return friendId&&state.connected?`<h2>${e(t('common'))}</h2><p class="comm-help">${e(t('sample'))}</p>${window.ALM_COMMUNITY_WORKSPACE.library({items:mutualRows()},'common:'+friendId,'library')}`:`<p>${e(t('empty'))}</p>`;const rows=view.items||[],s=view.summary||M.summary(rows);if(tab==='summary')return `${friendId?`<div class="comm-stats">${[['library',s.total],['completed',s.completed],['onhold',s.onhold],['watching',s.watching],['plan',s.planned]].map(([label,n])=>`<div class="comm-stat"><strong>${e(n)}</strong><span>${e(t(label))}</span></div>`).join('')}</div>`:''}${view.omitted?`<p class="comm-help">${e(t('localOnly'))} (${view.omitted})</p>`:''}${view.comparison?`<p>${view.comparison.compatibility===null?'—':view.comparison.compatibility+' %'} ${e(t('compatibility'))}</p><p class="comm-help">${e(t('sample'))} ${e(view.comparison.genres.join(' · '))}</p>${friendId?commonProfilePreview():''}<h2>${e(t('discoveries'))}</h2>${cards(view.comparison.discoveries.slice(0,6))}`:''}<h2>${e(t('showcase'))}</h2>${cards(rows.filter(i=>view.profile.featured.includes(i.mal_id)).slice(0,5))}<h2>${e(t('watching'))}</h2>${cards(rows.filter(i=>i.status==='Watching').slice(0,6))}<div class="comm-dna"><section><h2>Anime DNA</h2>${genres(view.dna||[])}</section><section><h2>${e(t('activity'))}</h2>${activity(view.activity||[])}</section></div>`;
 if(['library','favorites','watching'].includes(tab))return window.ALM_COMMUNITY_WORKSPACE.library(view,(friendId||'own')+':'+tab,tab);
 if(tab==='dna')return `<h2>Anime DNA</h2>${genres(view.dna||[])}${view.comparison?`<p>${e(view.comparison.genres.join(' · '))}</p><p class="comm-help">${e(t('sample'))}</p>`:''}`;
 if(tab==='friends'){if(!state.connected)return `<p>${e(t('login'))}</p>`;return `<form id="commFriendForm"><label for="commFriendHandle">${e(t('handle'))}</label><div class="comm-actions"><input id="commFriendHandle" placeholder="GentilRobot#0001" minlength="1" maxlength="90" required><button type="submit">${e(t('addFriend'))}</button></div></form>${friendFilters()}<div id="commFriendRows">${friendRows()}</div>`;}
 if(tab==='inbox')return inboxRows();if(tab==='notifications'&&!state.connected)return '<p>'+e(t('login'))+'</p>';if(tab==='notifications')return '<h2>'+e(t('friends'))+'</h2>'+friendRows(true)+'<h2>'+e(t('inbox'))+'</h2>'+inboxRows(true);if(tab==='sessions')return state.connected?window.ALM_COMMUNITY_PLUS?.sessionsContent()||'':'<p>'+e(t('login'))+'</p>';return '';
 }
 function friendFilters(){return `<div class="comm-friend-filters"><label for="commFriendSearch">${e(t('searchFriends'))}<input type="search" id="commFriendSearch" value="${e(friendQuery)}" maxlength="90" autocomplete="off" aria-controls="commFriendRows"></label><label for="commFriendSort">${e(t('sortFriends'))}<select id="commFriendSort" aria-controls="commFriendRows">${[['az','friendAZ'],['za','friendZA'],['recent','friendNewest'],['oldest','friendOldest']].map(([value,key])=>`<option value="${value}" ${friendSort===value?'selected':''}>${e(t(key))}</option>`).join('')}</select></label></div>`;}
 const searchName=value=>String(value||'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase();
 function friendRows(onlyPending=false){
  if(!friends)return `<p>${e(t('running'))}</p>`;
  const person=r=>friends.cards.find(c=>c.id===(r.requester===friends.userId?r.recipient:r.requester))||{};
  const name=r=>person(r).display_name||person(r).handle||'ALM';
  const added=r=>Date.parse(r.accepted_at||(r.status==='accepted'&&r.updated_at)||r.created_at)||0;
  const collator=new Intl.Collator(D.language(),{sensitivity:'base',numeric:true});
  const rows=friends.relationships.filter(r=>onlyPending?r.status==='pending'&&r.recipient===friends.userId:searchName(name(r)+' '+S.tag(person(r))).includes(searchName(friendQuery.trim())));
  rows.sort((a,b)=>{const names=collator.compare(name(a),name(b));return (onlyPending?added(b)-added(a):friendSort==='az'?names:friendSort==='za'?-names:friendSort==='oldest'?added(a)-added(b):added(b)-added(a))||names||String(a.id).localeCompare(String(b.id));});
  if(!rows.length)return `<p class="comm-help">${e(t(!onlyPending&&friendQuery.trim()?'noFriendsFound':'empty'))}</p>`;
  return rows.map(r=>{const id=r.requester===friends.userId?r.recipient:r.requester,p=person(r),identity=`<img class="comm-avatar" src="${e(avatar(p))}" alt=""><span><strong>${e(name(r))}</strong><small>${e(S.tag(p))} · ${e(t(r.status))}</small></span>`;
   return `<article class="comm-friend" data-friend-id="${e(id)}">${r.status==='accepted'?`<button type="button" class="comm-friend-profile" data-comm-action="visit" data-profile-id="${e(id)}" aria-label="${e(t('open')+' · '+S.tag(p))}">${identity}</button>`:`<div class="comm-friend-profile">${identity}</div>`}${r.status==='accepted'?action('visit','open',`data-profile-id="${e(id)}"`):''}${r.status==='pending'&&r.recipient===friends.userId?action('friendship','accept',`data-id="${e(r.id)}" data-action="accept"`)+action('friendship','decline',`data-id="${e(r.id)}" data-action="decline"`):''}${r.status!=='blocked'?action('friendship','remove',`data-id="${e(r.id)}" data-action="remove"`)+action('friendship','block',`data-id="${e(r.id)}" data-action="block"`):r.blocked_by===friends.userId?action('friendship','unblock',`data-id="${e(r.id)}" data-action="unblock"`):''}</article>`;
  }).join('');
 }

 function inboxRows(onlyUnread=false){if(!state.connected)return `<p>${e(t('login'))}</p>`;if(!inbox)return `<p>${e(t('running'))}</p>`;if(!inbox.items.some(r=>!r.read_at))return `<p>${e(t('empty'))}</p>`;return inbox.items.filter(r=>!r.read_at).map(r=>`<article data-comm-anime="${Number(r.anime.mal_id)}" class="comm-card comm-recommendation">${animePreview(r.anime,true)}<p>${e(r.message)}</p>${!r.read_at?action('mark-read','markRead',`data-id="${e(r.id)}"`):''}${window.ALM_COMMUNITY_WEB?`<p class="comm-help">${e(t('planInApp'))}</p>`:`<div class="comm-card-actions">${[['Plan to Watch','plan'],['Watching','watching'],['Completed','completed'],['On-Hold','onhold'],['Dropped','dropped']].map(([status,label])=>action('add-status',label,`data-mal-id="${Number(r.anime.mal_id)}" data-id="${r.id}" data-status="${status}"`)).join('')}</div>`}</article>`).join('');}
 function paint(){if(!view)return;const p=view.profile;const tabs=[['summary','summary'],['library','library'],['favorites','favorites'],['watching','watching'],['dna','Anime DNA'],...(friendId?[['common','common']]:[]),...(!friendId?[['friends','friends'],['friend-library','friendsLibrary'],['inbox','receivedRecommendations'],['notifications','notifications']]:[])];$('communityPage').innerHTML=`<section class="comm-banner" data-banner="${e(p.banner)}" data-accent="${e(p.accent)}"><img class="comm-avatar" src="${avatar(p)}" alt=""><div><h1>${e(p.display_name)}</h1><p>${S.tag(p)?e(S.tag(p)):e(t('local'))}</p><p>${e(p.bio)}</p></div></section>${friendId?`<div class="comm-actions">${action('home','back')+action('recommend','recommend')}</div>`:''}<p id="commStatus" class="comm-status" role="status" aria-live="polite"></p>${account()}${!friendId&&state.connected&&['summary','friends','library'].includes(tab)?window.ALM_COMMUNITY_WORKSPACE.stats():''}<nav class="comm-tabs" role="tablist">${tabs.map(([key,label])=>`<button type="button" role="tab" id="comm-tab-${key}" data-comm-tab="${key}" aria-controls="commPanel" aria-selected="${tab===key}" tabindex="${tab===key?0:-1}">${e(label==='Anime DNA'?label:t(label))}</button>`).join('')}</nav><section id="commPanel" role="tabpanel" aria-label="${e(t(tab==='sessions'?'sessions':'communityTitle'))}" class="comm-panel">${content()}</section>`;bindPanel();window.ALM_COMMUNITY_WORKSPACE?.hydratePosters($('commPanel'));window.ALM_COMMUNITY_PLUS?.decorate(state,view,friendId);}
 function bindPanel(){window.ALM_COMMUNITY_WORKSPACE?.bindLibrary();$('commFriendSearch')?.addEventListener('input',ev=>{friendQuery=ev.target.value;$('commFriendRows').innerHTML=friendRows();});$('commFriendSort')?.addEventListener('change',ev=>{friendSort=ev.target.value;$('commFriendRows').innerHTML=friendRows();});$('commSearch')?.addEventListener('input',ev=>{const q=ev.target.value.toLocaleLowerCase();$('commResults').innerHTML=cards(view.items.filter(i=>(tab==='library'||tab==='favorites'&&i.favorite||tab==='watching'&&i.status==='Watching')&&i.title.toLocaleLowerCase().includes(q)));});$('commFriendForm')?.addEventListener('submit',ev=>{ev.preventDefault();run(async()=>{await api('friends','POST',{handle:$('commFriendHandle').value.trim()});friends=await api('friends');paint();toast(t('sent'));});});}
 function modal(html){let dialog=$('commDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='commDialog';dialog.className='comm-dialog';dialog.setAttribute('data-no-i18n','');document.body.append(dialog);}dialog.onclose=null;dialog.innerHTML='<div class="comm-dialog-scroll">'+html+'</div>';dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('form .comm-actions')?.classList.add('comm-dialog-footer');dialog.showModal();window.ALM_SCROLL_PROGRESS?.mount();return dialog;}
 function edit(){const p=state.own.profile,A=window.ALM_COMMUNITY_AGE,owner=state.user?.id||'',session=sessionEpoch,age={...state.own.age,available:state.connected===true&&state.own.age?.available===true};let initialExclusion=!A?.canChoose?.(age)||age.excludeAdult!==false;const dialog=modal(`<form id="commEditForm"><h2>${e(t('edit'))}</h2>${[['display_name','name',60],['bio','bio',240]].map(([name,label,max])=>`<label>${e(t(label))}<input name="${name}" value="${e(p[name])}" maxlength="${max}" ${name==='handle'?'pattern="[a-z0-9_]{3,24}"':name==='display_name'?'required':''}></label>`).join('')}<p class="comm-help">${e(t('tagHelp'))}</p><p>${e(S.tag(state.identity||p))}</p><label>${e(t('avatarUpload'))}<input type="file" name="avatar_file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"></label><p class="comm-help">${e(t('avatarHint'))}</p><img id="commAvatarPreview" class="comm-avatar" src="${e(avatar(p))}" alt=""><label>${e(t('banner'))}<select name="banner">${['garden','library','path'].map(v=>`<option value="${v}" ${p.banner===v?'selected':''}>${e(v==='aster'?'Aster':t(v))}</option>`).join('')}</select></label><label>${e(t('visibility'))}<select name="visibility"><option value="private" ${p.visibility==='private'?'selected':''}>${e(t('private'))}</option><option value="friends" ${p.visibility==='friends'?'selected':''}>${e(t('friendScope'))}</option></select></label><label class="comm-check"><input type="checkbox" name="allow_requests" ${p.allow_requests?'checked':''}><span>${e(t('requests'))}</span></label><fieldset id="commShareChoices"><legend>${e(t('sharing'))}</legend>${A?.exclusion?.(D.language(),age,'commProfileAdultShare')||`<label class="comm-check"><input type="checkbox" id="commProfileAdultShare" checked disabled aria-describedby="commProfileAdultShareHint"><span>${e(t('excludeAdultSharing'))}</span></label><p class="comm-help" id="commProfileAdultShareHint">${e(t('ageUnavailable'))}</p><p class="comm-help">${e(t('adultSharingHelp'))}</p>`}${['library','favorites','watching','dna','activity'].map(k=>`<label class="comm-check"><input type="checkbox" name="share_${k}" ${p['share_'+k]?'checked':''}><span>${e(k==='dna'?'Anime DNA':t(k))}</span></label>`).join('')}</fieldset><label>${e(t('color'))}<select name="accent">${['violet','blue','green'].map(v=>`<option value="${v}" ${p.accent===v?'selected':''}>${e(t(v))}</option>`).join('')}</select></label><label>${e(t('showcase'))}<select name="featured" multiple size="5">${state.own.items.filter(i=>M.shareAllowed(i,state.own.age)).map(i=>`<option value="${i.mal_id}" ${p.featured.includes(i.mal_id)?'selected':''}>${e(i.title)}</option>`).join('')}</select></label><p class="comm-help">${e(t('publicationNotice'))}</p><p class="comm-status" id="commFormStatus" role="status"></p><div class="comm-actions"><button type="submit">${e(t('save'))}</button><button type="button" data-close>${e(t('close'))}</button></div></form>`);
 let avatarImage=p.avatar_image||'';const avatarInput=dialog.querySelector('[name=avatar_file]'),avatarPreview=dialog.querySelector('#commAvatarPreview'),visibility=dialog.querySelector('[name=visibility]'),sharing=dialog.querySelector('#commShareChoices');
 const showSharing=()=>{sharing.hidden=visibility.value!=='friends';dialog.querySelector('[name=featured]').closest('label').hidden=sharing.hidden;};visibility.addEventListener('change',showSharing);showSharing();
 avatarInput.onchange=async()=>{const file=avatarInput.files?.[0];if(!file)return;const save=dialog.querySelector('[type=submit]');save.disabled=true;try{avatarImage=await window.ALM_COMMUNITY_WORKSPACE.readAvatar(file);avatarPreview.src=avatarImage;}catch{dialog.querySelector('#commFormStatus').textContent=t('avatarError');}finally{save.disabled=false;avatarInput.value='';}};
 const form=dialog.querySelector('#commEditForm'),save=form.querySelector('[type=submit]'),ageControl=form.querySelector('#commProfileAdultShare'),status=form.querySelector('#commFormStatus');let saving=false;
 A?.applyExclusion?.(ageControl,D.language(),age);
 const sameOwner=()=>session===sessionEpoch&&owner===(state?.user?.id||'');
 const currentForm=()=>sameOwner()&&dialog.open&&form.isConnected&&dialog.querySelector('#commEditForm')===form;
 form.onsubmit=async ev=>{
  ev.preventDefault();if(saving||!currentForm())return;
  const data=new FormData(form),next={...p,...Object.fromEntries(data),featured:data.getAll('featured').map(Number).slice(0,5)};
  next.avatar='aster';next.avatar_image=avatarImage;delete next.avatar_file;
  for(const k of ['allow_requests','share_library','share_favorites','share_watching','share_dna','share_activity'])next[k]=data.has(k);
  const requestedExclusion=ageControl.checked,changed=requestedExclusion!==initialExclusion;let ageAttempted=false,ageWritten=false;
  saving=true;save.disabled=true;ageControl.disabled=true;form.setAttribute('aria-busy','true');status.textContent=t('running');
  try{
   // This is the account preference, not a local profile flag. Save only an
   // explicit change by an eligible adult through the same RPC as My account.
   if(changed&&A?.canChoose?.(age)&&A.canChoose(state.own.age)&&state.connected===true){
    ageAttempted=true;const savedAge={...await api('age','POST',{excludeAdult:requestedExclusion}),available:true};ageWritten=true;
    if(!sameOwner())return;
    state.own.age=savedAge;if(!friendId&&view)view.age=savedAge;
    initialExclusion=!A.canChoose(savedAge)||savedAge.excludeAdult!==false;
    ageControl.checked=initialExclusion;
    window.dispatchEvent(new CustomEvent('alm:community-changed'));
    // A write already sent may have succeeded after Close or a session change.
    // Do not queue a profile write or paint another dialog in that case.
    if(!currentForm())return;
   }
   const savedOwn=await api('profile','PUT',next);if(!sameOwner())return;
   state.own=savedOwn;if(!friendId)view=savedOwn;
   const showResult=currentForm();if(showResult)dialog.close();
   await refresh();if(!sameOwner())return;
   if(showResult&&dialog.querySelector('#commEditForm')===form&&!dialog.open){paint();toast(t('saved'));}
  }catch(error){
   if(!sameOwner())return;
   const uncertainWrite=ageAttempted&&!ageWritten;
   if(uncertainWrite){
    // A rejected/expired response does not prove the write was rejected. Read
    // the current server state; never retry or compensate a write automatically.
    let reconciled;
    try{const fresh=await api('status');if(!sameOwner())return;if(fresh.user?.id===owner&&fresh.own?.age?.available===true)reconciled=fresh.own.age;}catch{}
    if(!sameOwner())return;
    state.own.age=reconciled||{...state.own.age,available:false,saveUnconfirmed:true};if(!friendId&&view)view.age=state.own.age;
    window.dispatchEvent(new CustomEvent('alm:community-changed'));
   }
   if(currentForm()){
    status.textContent=uncertainWrite?A.t(D.language(),'saveUnconfirmed'):window.ALM_COMMUNITY_ERROR(error);
    // A successful age save remains authoritative if the following profile save fails.
    A?.applyExclusion?.(ageControl,D.language(),state.own.age);
    initialExclusion=ageControl.checked;window.ALM_COMMUNITY_PLUS?.report(error);
   }
  }finally{
   saving=false;if(currentForm()){save.disabled=false;A?.applyExclusion?.(ageControl,D.language(),state.own.age);form.removeAttribute('aria-busy');}
  }
 };}
 async function auth(mode){const signup=mode==='signup';const dialog=modal(`<form><h2>${e(t(mode))}</h2>${signup?`${window.ALM_COMMUNITY_CHARTER.fields(D.language())}<p class="comm-help">${e(t('accountNotice'))}</p>${privacy()}`:''}<label>${e(t('email'))}<input type="email" name="email" required autocomplete="email" maxlength="254"></label><label>${e(t('password'))}<input type="password" name="password" required minlength="${signup?12:1}" maxlength="128" autocomplete="${signup?'new-password':'current-password'}"></label>${signup?`<label>${e(t('confirmPassword'))}<input type="password" name="confirm_password" required minlength="12" maxlength="128" autocomplete="new-password"></label><p class="comm-help">${e(t('passwordHint'))}</p>`:''}${signup?window.ALM_COMMUNITY_AGE?.fields(D.language())||'':''}<button type="button" id="commShowPassword">${e(t('showPassword'))}</button><div class="alm-captcha"></div><p class="comm-status" id="commFormStatus" role="status"></p><div class="comm-actions"><button type="submit" disabled>${e(t(mode))}</button>${signup?`<button type="button" id="commResend" disabled>${e(t('resend'))}</button>`:''}<button type="button" id="commRecovery">${e(t('recovery'))}</button><button type="button" data-close>${e(t('close'))}</button></div></form>`);const form=dialog.querySelector('form'),button=form.querySelector('[type=submit]'),status=$('commFormStatus');let captcha,cooldown=0,timer;
 $('commShowPassword').onclick=()=>{for(const input of form.querySelectorAll('input[name=password],input[name=confirm_password]'))input.type=input.type==='password'?'text':'password';};
 dialog.onclose=()=>{captcha?.destroy();clearInterval(timer);form.reset();};
 try{const config=await window.ALM_CAPTCHA.config();captcha=await window.ALM_CAPTCHA.mount(form.querySelector('.alm-captcha'),config.captchaSiteKey);button.disabled=false;}catch(error){status.textContent=window.ALM_COMMUNITY_ERROR(error);}
 const resend=$('commResend');function waitToResend(){cooldown=60;clearInterval(timer);resend.disabled=true;timer=setInterval(()=>{cooldown--;resend.textContent=cooldown>0?t('cooldown')+' '+cooldown+' '+t('seconds'):t('resend');resend.disabled=cooldown>0;if(!cooldown)clearInterval(timer);},1000);}
 form.onsubmit=async ev=>{ev.preventDefault();button.disabled=true;try{const data=Object.fromEntries(new FormData(form));if(signup&&!form.reportValidity())return;if(signup&&data.password!==data.confirm_password)throw Error('ALM_PASSWORD_MISMATCH');if(signup&&!S.password(data.password))throw Error('ALM_PASSWORD_WEAK');const r=await api('auth','POST',{email:data.email,password:data.password,mode,...(signup?{charterAccepted:data.charterAccepted==='on',charterVersion:window.ALM_COMMUNITY_CHARTER.version}:{}),...(signup?window.ALM_COMMUNITY_AGE.declaration({birthDate:data.birthDate,ageAttested:data.ageAttested==='on'}):{}),captchaToken:captcha.token()});if(r.confirmationRequired){status.textContent=t('confirm');if(resend)waitToResend();}else{dialog.close();await open();}}catch(error){status.textContent=window.ALM_COMMUNITY_ERROR(error);window.ALM_COMMUNITY_PLUS?.report(error);}finally{for(const input of form.querySelectorAll('input[name=password],input[name=confirm_password]'))input.value='';captcha?.reset();button.disabled=false;}};
 if(resend)resend.onclick=async()=>{if(cooldown)return;try{const email=form.elements.email.value;if(!S.email(email))throw Error('INVALID_INPUT');await api('resend','POST',{email,captchaToken:captcha.token()});status.textContent=t('confirm');waitToResend();}catch(error){status.textContent=window.ALM_COMMUNITY_ERROR(error);}finally{captcha?.reset();}};
 $('commRecovery').onclick=async()=>{try{const email=form.elements.email.value;if(!S.email(email))throw Error('INVALID_INPUT');await api('recovery','POST',{email,captchaToken:captcha.token()});status.textContent=t('confirm');}catch(error){status.textContent=window.ALM_COMMUNITY_ERROR(error);}finally{captcha?.reset();}};
 }
 function recommend(){const dialog=modal(`<form><h2>${e(t('recommend'))}</h2><label>${e(t('select'))}<select name="malId" required>${state.own.items.filter(i=>M.shareAllowed(i,state.own.age)).map(i=>`<option value="${i.mal_id}">${e(i.title)}</option>`).join('')}</select></label><label>${e(t('message'))}<textarea name="message" maxlength="500" rows="3"></textarea></label><p class="comm-status" id="commFormStatus" role="status"></p><div class="comm-actions"><button type="submit">${e(t('send'))}</button><button type="button" data-close>${e(t('close'))}</button></div></form>`);dialog.querySelector('form').onsubmit=async ev=>{ev.preventDefault();try{await api('recommendations','POST',{recipient:friendId,...Object.fromEntries(new FormData(ev.target))});dialog.close();toast(t('sent'));}catch(error){$('commFormStatus').textContent=window.ALM_COMMUNITY_ERROR(error);window.ALM_COMMUNITY_PLUS?.report(error);}};}
 async function addPlan(id){const item=[...(view.items||[]),...(inbox?.items||[]).map(r=>r.anime)].find(i=>Number(i.mal_id)===Number(id));if(!item)return;if(state.own.items.some(i=>i.mal_id===Number(id)))return;const r=await fetch('/api/animes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:item.title,malId:Number(id),status:'Plan to Watch',episodesSeen:'0',score:'0',autoInfo:false,catalogAdd:true})});if(!r.ok)throw Error();window.markAnimeLibraryStale?.();await window.ensureAnimeLibraryFresh?.();await refresh();paint();toast(t('saved'));}
 async function click(button){const a=button.dataset.commAction;if(a==='anime-detail')return window.ALM_COMMUNITY_WORKSPACE.openAnime(Number(button.dataset.malId),button);if(a==='account')return window.ALM_COMMUNITY_WORKSPACE.openAccount();if(a==='add-status'){await window.ALM_COMMUNITY_WORKSPACE.addAnime(Number(button.dataset.malId),button.dataset.status);if(button.dataset.id){await api('recommendations/'+button.dataset.id+'/read','POST',{});inbox=await api('recommendations');}paint();toast(t('saved'));return;}if(a==='add-friend'){await setTab('friends');$('commFriendHandle')?.focus();return;}if(a==='mark-read'){await api('recommendations/'+button.dataset.id+'/read','POST',{});await refresh();await setTab(tab);return;}if(a==='show-common'){await setTab('common');$('comm-tab-common')?.focus({preventScroll:true});return;}if(a==='home')return open();if(a==='edit')return edit();if(a==='login'||a==='signup')return auth(a);if(a==='recommend')return recommend();if(a==='visit')return open(button.dataset.profileId);
 if(a==='publish'){await api('publish','POST',{});toast(t('published'));}if(a==='withdraw'){await api('withdraw','POST',{});toast(t('saved'));}if(a==='logout'){await api('logout','POST',{});await open();}if(a==='favorite'){view=await api('favorite','PUT',{malId:Number(button.dataset.malId),value:!state.own.items.find(i=>i.mal_id===Number(button.dataset.malId))?.favorite});state.own=view;paint();}if(a==='friendship'){await api('friends/'+button.dataset.id,'POST',{action:button.dataset.action});friends=await api('friends');paint();}if(a==='plan'||a==='inbox-plan'){if(window.ALM_COMMUNITY_ADD_PLAN)await window.ALM_COMMUNITY_ADD_PLAN(Number(button.dataset.malId));else await addPlan(button.dataset.malId);if(a==='inbox-plan')await api('recommendations/'+button.dataset.id+'/read','POST',{});}if(['publish','withdraw','friendship','favorite'].includes(a)){await refresh();paint();}}
 async function setTab(key){
  const version=++epoch,owner=state?.user?.id;tab=key;paint();const panel=$('commPanel');panel?.setAttribute('aria-busy','true');toast(t('running'));
  try{
   const result={};
   if(state.connected){
    if(key==='friends')result.friends=await api('friends');
    if(key==='inbox')result.inbox=await api('recommendations');
    if(key==='notifications')[result.friends,result.inbox]=await Promise.all([api('friends'),api('recommendations')]);
    if(key==='sessions')result.sessions=await api('sessions');
   }
   if(version!==epoch||owner!==state?.user?.id)return;
   if(result.friends)friends=result.friends;if(result.inbox)inbox=result.inbox;if(result.sessions&&window.ALM_COMMUNITY_PLUS)window.ALM_COMMUNITY_PLUS.sessionRows=result.sessions;
   paint();toast('');
  }finally{if(version===epoch)$('commPanel')?.removeAttribute('aria-busy');}
 }
 function init(){const root=$('communityPage');if(!root)return;root.setAttribute('data-no-i18n','');$('navCommunity')?.addEventListener('click',()=>open());$('commProfileEntry')?.addEventListener('click',()=>open());root.addEventListener('click',ev=>{const button=ev.target.closest('[data-comm-action]')||(!ev.target.closest('button,a,input,select,textarea,label')&&ev.target.closest('[data-comm-anime]')?.querySelector('[data-comm-action=anime-detail]'));if(button)run(()=>click(button));const choice=ev.target.closest('[data-comm-tab]');if(choice){setTab(choice.dataset.commTab).catch(error=>toast(window.ALM_COMMUNITY_ERROR(error),true));}});root.addEventListener('keydown',ev=>{const current=ev.target.closest('[data-comm-tab]');if(!current||!['ArrowRight','ArrowLeft','Home','End'].includes(ev.key))return;ev.preventDefault();const all=[...root.querySelectorAll('[data-comm-tab]')],n=all.indexOf(current),next=ev.key==='Home'?0:ev.key==='End'?all.length-1:(n+(ev.key==='ArrowRight'?1:-1)+all.length)%all.length;all[next].click();});window.addEventListener('alm:collection-changed',refreshAfterCollectionChange);window.addEventListener('alm:community-session',()=>{sessionEpoch++;collectionDirty=false;collectionRefresh=null;api.clear();refreshPending=null;epoch++;state=null;view=null;friends=null;inbox=null;uiOwner=null;if(window.ALM_COMMUNITY_PLUS)window.ALM_COMMUNITY_PLUS.sessionRows=[];paintIdentity();window.ALM_COMMUNITY_WORKSPACE?.reset();const account=$('commAccountSettings');if(account){account.replaceChildren();account.dataset.ageOwner='';}Promise.resolve(window.ALM_COMMUNITY_WORKSPACE?.renderAccount?.()).catch(()=>{});$('commDialog')?.close();if(!$('communityPage').classList.contains('hidden'))open();else refresh().catch(error=>window.ALM_COMMUNITY_WORKSPACE?.showAccountRefreshError?.(error));});refresh().catch(()=>{});window.addEventListener('alm:language-changed',()=>{paintIdentity();if(view)paint();});}
 window.ALM_COMMUNITY={open,refresh,api,modal,paint,setTab,avatar,cards,edit,auth,context:()=>({state,view,friendId,tab,friends,inbox}),snapshot:()=>state,sharingStatus,toast};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
