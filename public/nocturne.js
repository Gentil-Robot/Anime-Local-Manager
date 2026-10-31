/* Beta 32. Decorative composition only; existing controllers own data and actions. */
(() => {
  'use strict';
  const D=window.ALM_DESIGN, $=id=>document.getElementById(id);
  if(!D)return;
  function decorateLibrary(){
    const grid=$('animeGrid');if(!grid)return;
    document.querySelector('.main-area')?.style.setProperty('--panel-art-opacity',String({soft:.09,balanced:.15,bright:.22}[D.storage.get('alm.visual.scene','balanced')]||.15));
    document.querySelector('.main-area')?.style.setProperty('--panel-detail-opacity',String({soft:.13,balanced:.2,bright:.28}[D.storage.get('alm.visual.scene','balanced')]||.2));
    const count=grid.querySelectorAll('.card').length;
    document.querySelector('.main-area')?.style.setProperty('--collection-art-opacity',String({soft:.16,balanced:.25,bright:.34}[D.storage.get('alm.visual.scene','balanced')]||.25));
  }
  function viewChanged(view){
    document.body.classList.toggle('nocturne-library-view',view==='library'||view==='watching'||view==='plan');
    document.body.classList.toggle('nocturne-season-view',view==='seasonNewsPage');
  }
  function balanceRecommendationGrids(){
    document.querySelectorAll('#recoContainer .reco-grid').forEach(grid=>{
      document.querySelector('.main-area')?.style.setProperty('--panel-art-opacity',String({soft:.09,balanced:.15,bright:.22}[D.storage.get('alm.visual.scene','balanced')]||.15));
    document.querySelector('.main-area')?.style.setProperty('--panel-detail-opacity',String({soft:.13,balanced:.2,bright:.28}[D.storage.get('alm.visual.scene','balanced')]||.2));
    const count=grid.querySelectorAll('.reco-card').length,width=grid.getBoundingClientRect().width;if(!width||!count)return;
      const capacity=Math.max(1,Math.floor((width+10)/165));let columns=capacity,holes=Infinity;
      if(count>=Math.ceil(capacity*.6))for(let n=Math.min(count,capacity);n>=Math.max(1,Math.ceil(capacity*.65));n--){const missing=(n-count%n)%n;if(missing<holes){holes=missing;columns=n;}}
      grid.style.setProperty('grid-template-columns',`repeat(${columns},minmax(0,1fr))`,'important');
    });
  }
  function organizeRecommendations(){
    const container=$('recoContainer');if(!container||container.querySelector('.nocturne-reco-explorer'))return;
    const panels=['recoAnimePicker','recoCreatorPicker','recoSeiyuuPicker'].map(id=>$(id)?.closest('.reco-block'));
    if(panels.some(p=>!p))return;
    const shell=document.createElement('section');shell.className='nocturne-reco-explorer';
    const tabs=document.createElement('div');tabs.className='nocturne-reco-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',D.t('recoModes'));
    const keys=['recoSimilarTab','recoCreatorTab','recoVoiceTab'];
    const activate=index=>panels.forEach((panel,i)=>{panel.hidden=i!==index;const b=tabs.children[i];b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;if(i===index)requestAnimationFrame(balanceRecommendationGrids);});
    panels.forEach((panel,i)=>{
      panel.id='nocturne-reco-panel-'+i;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','nocturne-reco-tab-'+i);
      const button=document.createElement('button');button.type='button';button.id='nocturne-reco-tab-'+i;button.dataset.designText=keys[i];button.setAttribute('data-no-i18n','');button.textContent=D.t(keys[i]);button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);
      button.onclick=()=>activate(i);
      button.onkeydown=event=>{const j=event.key==='ArrowRight'?(i+1)%3:event.key==='ArrowLeft'?(i+2)%3:event.key==='Home'?0:event.key==='End'?2:null;if(j!==null){event.preventDefault();activate(j);tabs.children[j].focus();}};
      tabs.append(button);
    });
    container.insertBefore(shell,panels[0]);shell.append(tabs,...panels);activate(0);
    if(!container._nocturneResizeObserver){
      const observer=new MutationObserver(()=>requestAnimationFrame(balanceRecommendationGrids));observer.observe(container,{childList:true,subtree:true});container._nocturneResizeObserver=observer;
      tabs.addEventListener('click',()=>requestAnimationFrame(balanceRecommendationGrids));
    }
    balanceRecommendationGrids();
  }
  function init(){
    // Functional links remain real buttons; decorations contain no translated lettering.
    document.querySelectorAll('.feature-links [data-app-go]').forEach(button=>{
      const icons={library:'book',seasons:'season',news:'news',reco:'compass',dictionary:'book',dna:'dna'};
      button.insertAdjacentHTML('afterbegin',D.icon(icons[button.dataset.appGo]||'star'));
    });
    const header=document.querySelector('#lexiconPage .lexicon-hero>div:nth-child(2)');
    if(header){const actions=document.createElement('div');actions.className='nocturne-guide-shortcuts';actions.innerHTML=`<button type="button" data-glossary-focus>${D.icon('search')}<span data-design-text="quickSearch" data-no-i18n></span></button><button type="button" data-glossary-alphabet>A–Z</button><span class="studio-tag" data-design-text="offlineGuide" data-no-i18n></span>`;header.append(actions);
      actions.querySelector('[data-glossary-focus]').onclick=()=>{$('lexiconSearch')?.focus();$('lexiconSearch')?.scrollIntoView({block:'center'});};
      actions.querySelector('[data-glossary-alphabet]').onclick=()=>{$('lexiconAlphabet')?.scrollIntoView({block:'center'});$('lexiconAlphabet')?.querySelector('button')?.focus({preventScroll:true});};
    }
    document.querySelectorAll('dialog').forEach(dialog=>dialog.classList.add('nocturne-dialog'));
    document.querySelectorAll('dialog .nocturne-dialog-hero').forEach(header=>{
      const button=document.createElement('button');button.type='button';button.className='nocturne-dialog-close';
      button.innerHTML='<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
      const label=()=>button.setAttribute('aria-label',window.ALM_I18N?.t('Fermer')||'Fermer');label();window.addEventListener('alm:language-changed',label);
      button.onclick=()=>{const dialog=header.closest('dialog');const event=new Event('cancel',{cancelable:true});if(dialog?.dispatchEvent(event))dialog.close();};header.append(button);
    });
    const notice=document.querySelector('.karaoke-review-notice');
    if(notice?.tagName==='DETAILS')notice.classList.add('nocturne-lyrics-review');
    else if(notice){const details=document.createElement('details');details.className='nocturne-lyrics-review';const summary=document.createElement('summary');summary.dataset.designText='reviewLyrics';summary.setAttribute('data-no-i18n','');details.append(summary);notice.replaceWith(details);details.append(notice);}
    const button=$('donationKaraokeClipToggle');
    if(button)document.querySelector('.nocturne-lyrics-review')?.append(button);
    const controls=document.querySelector('.donation-karaoke-controls');
    if(controls){controls.setAttribute('aria-label',D.t('videoControls'));}
    const localHeader=document.querySelector('.about-local-summary h3');if(localHeader){localHeader.dataset.designText='localData';localHeader.setAttribute('data-no-i18n','');}
    const iconMap={'💾':'import','🔑':'shield','🧠':'library','🛠️':'settings','🌐':'compass','⚙️':'settings'};
    document.querySelectorAll('.settings-summary-icon').forEach(node=>{const icon=iconMap[node.textContent.trim()];if(icon)node.innerHTML=D.icon(icon);});
    document.querySelectorAll('.lexicon-hero-icon').forEach(node=>node.innerHTML=D.icon('book'));
    document.querySelectorAll('.audit-hero-icon').forEach(node=>node.innerHTML=D.icon('shield'));
    document.querySelectorAll('#dnaPage .v2-hero-icon').forEach(node=>node.innerHTML=D.icon('dna'));
    const insights=$('dnaInsights'),main=document.querySelector('.dna-main-col');if(insights&&main)main.append(insights);
    const host=document.querySelector('.studio-preferences .settings-disclosure-body');if(host){const label=document.createElement('label');label.innerHTML='<span data-design-text="sceneIntensity" data-no-i18n></span><select id="studioScene"><option value="soft" data-design-text="sceneSoft" data-no-i18n></option><option value="balanced" data-design-text="sceneBalanced" data-no-i18n></option><option value="bright" data-design-text="sceneBright" data-no-i18n></option></select>';host.append(label);$('studioScene').value=D.storage.get('alm.visual.scene','balanced');$('studioScene').onchange=ev=>{D.storage.set('alm.visual.scene',ev.target.value);decorateLibrary();};}
    const updateBanner=()=>{const banner=$('almRetroBanner');if(banner)banner.src=document.documentElement.dataset.motion==='reduced'?'/assets/design/alm-retro-banner.png':'/assets/design/alm-retro-banner.gif';};
    window.addEventListener('alm:motion-changed',updateBanner);updateBanner();
    D.applyText();decorateLibrary(true);
    window.addEventListener('alm:library-rendered',()=>decorateLibrary(true));
    window.addEventListener('alm:language-changed',()=>{decorateLibrary(true);D.applyText();});
    let resize;window.addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(()=>{decorateLibrary(true);balanceRecommendationGrids();},120);},{passive:true});
  }
  window.ALM_NOCTURNE={decorateLibrary,viewChanged,organizeRecommendations};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
