(() => {
 'use strict';const active=new Set(),owners=new WeakMap();let frame=0;
 function tick(now){frame=0;for(const job of active){if(!job.button.isConnected){job.stop();continue;}const remaining=job.paused?job.remaining:Math.max(0,job.deadline-now);job.button.style.setProperty('--dismiss-left',String(remaining/job.duration*100));if(!remaining&&!job.paused){job.stop();job.expire();}}if(active.size)frame=requestAnimationFrame(tick);}
 function start(button,duration,expire,host=button.parentElement){
  owners.get(button)?.stop();duration=Math.max(1,Number(duration)||1);button.classList.add('timed-dismiss');button.querySelector('.dismiss-ring')?.remove();
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),rect=document.createElementNS(ns,'rect');svg.classList.add('dismiss-ring');svg.setAttribute('aria-hidden','true');rect.setAttribute('pathLength','100');svg.append(rect);button.prepend(svg);
  function fit(){const w=button.offsetWidth+6,h=button.offsetHeight+6;svg.setAttribute('viewBox','0 0 '+w+' '+h);rect.setAttribute('x','1.5');rect.setAttribute('y','1.5');rect.setAttribute('width',String(w-3));rect.setAttribute('height',String(h-3));rect.setAttribute('rx',String(Math.min((parseFloat(getComputedStyle(button).borderTopLeftRadius)||8)+1,(h-3)/2)));}
  fit();const observer=new ResizeObserver(fit);observer.observe(button);
  const job={button,duration,remaining:duration,deadline:performance.now()+duration,expire,paused:false};
  const pause=()=>{if(!job.paused){job.remaining=Math.max(0,job.deadline-performance.now());job.paused=true;}};
  const resume=()=>{if(host.matches(':hover')||host.contains(document.activeElement))return;job.deadline=performance.now()+job.remaining;job.paused=false;};
  const focusResume=()=>queueMicrotask(resume);
  host.addEventListener('pointerenter',pause);host.addEventListener('pointerleave',resume);host.addEventListener('focusin',pause);host.addEventListener('focusout',focusResume);
  const controls={pause,resume,stop(){active.delete(job);observer.disconnect();host.removeEventListener('pointerenter',pause);host.removeEventListener('pointerleave',resume);host.removeEventListener('focusin',pause);host.removeEventListener('focusout',focusResume);if(owners.get(button)===controls)owners.delete(button);},restart(){job.remaining=duration;job.deadline=performance.now()+duration;job.paused=false;if(host.matches(':hover')||host.contains(document.activeElement))pause();}};if(host.matches(':hover')||host.contains(document.activeElement))pause();job.stop=controls.stop;owners.set(button,controls);active.add(job);if(!frame)frame=requestAnimationFrame(tick);return controls;
 }
 window.ALM_COUNTDOWN={start};
})();
