(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const formatTime = value => {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  function flattenSong(song) {
    const lines = [];
    for (const section of song.sections || []) {
      for (const line of section.lines || []) {
        lines.push({ ...line, section });
      }
    }
    return lines;
  }

  function findLineIndex(lines, time) {
    if (!lines.length) return -1;
    // Fast enough for 56 lines, and deterministic after seeks in both directions.
    for (let i = 0; i < lines.length; i += 1) {
      if (time >= lines[i].start && time < lines[i].end) return i;
      if (time < lines[i].start) return i; // waiting for the next sung line
    }
    return lines.length - 1;
  }

  async function initKaraoke() {
    const root = document.querySelector(".donation-karaoke");
    const media = byId("donationKaraokeClip");
    const play = byId("donationKaraokePlay");
    const restart = byId("donationKaraokeRestart");
    const seek = byId("donationKaraokeSeek");
    const timeLabel = byId("donationKaraokeTime");
    const sectionLabel = byId("donationKaraokeSection");
    const originalLine = byId("donationKaraokeOriginalLine");
    const jaLine = byId("donationKaraokeJaLine");
    const jaWrap = byId("donationKaraokeJaWrap");
    const frLine = byId("donationKaraokeFrLine");
    const ball = byId("donationKaraokeBall");
    const previous = byId("donationKaraokePrevious");
    const next = byId("donationKaraokeNext");
    const mode = byId("donationKaraokeMode");
    const loading = byId("donationKaraokeLoading");
    const devPanel = byId("donationKaraokeDev");
    if (!root || !media || !play || !seek || !jaLine || !frLine || !ball) return;

    let song;
    try {
      const response = await fetch("/karaoke/song.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      song = await response.json();
    } catch (error) {
      if (loading) loading.textContent = window.ALM_I18N?.t?.("Impossible de charger les données du karaoké.") || "Impossible de charger les données du karaoké.";
      console.error("[Karaoke] song.json", error);
      return;
    }

    const lines = flattenSong(song);
    const baseOffset = Number(song.globalOffsetMs || 0) / 1000;
    // Les réglages de synchronisation ne sont plus exposés à l'utilisateur final.
    // Un ancien ajustement local (Beta 13) ne doit surtout pas continuer à décaler
    // silencieusement les paroles. Il reste utilisable uniquement en mode développeur.
    const devEnabled = new URLSearchParams(location.search).get("karaokeDev") === "1";
    if (!devEnabled) localStorage.removeItem("alm.karaoke.offsetMs");
    let userOffset = devEnabled ? Number(localStorage.getItem("alm.karaoke.offsetMs") || 0) / 1000 : 0;
    let activeLineIndex = -1;
    let activeJaIndex = -1;
    let metrics = [];
    let romanNodes=[],originalNodes=[];
    let raf = 0;
    let destroyed = false;
    let seeking=false;
    let resizeTimer = 0;
    let lastDisplayTime = -1;
    let ballWidth=12,lowerCache=null,lowerLine=null,lowerLang=null;
    function cachedLowerUnits(line){const lang=uiLanguage();if(lowerLine!==line||lowerLang!==lang){lowerCache=translatedUnits(line,lang);lowerLine=line;lowerLang=lang;}return lowerCache;}
    let devLineIndex = 0;
    let devUnitIndex = 0;
    const clock = window.ALM_KARAOKE_CLOCK;
    const clip = byId("donationKaraokeClip");
    const clipToggle = byId("donationKaraokeClipToggle");
    const stage = root.querySelector(".donation-karaoke-stage");
    let clipShown = true;
    function syncClip(){
      if(document.hidden||(document.body.dataset.studioView&&document.body.dataset.studioView!=="aboutPage"))media.pause();
    }
    clipToggle?.addEventListener("click",()=>{
      clipShown=!clipShown;stage?.classList.toggle("has-clip",clipShown);
      clipToggle.setAttribute("aria-pressed",String(clipShown));
      const caption=clipToggle.querySelector("[data-design-text]");if(caption){caption.dataset.designText=clipShown?"clipOff":"clipOn";window.ALM_DESIGN?.applyText();}
      scheduleMeasureUnits();
    });
    media.addEventListener("error",()=>{play.disabled=true;play.textContent=window.ALM_DESIGN?.t('clipUnavailable')||'Video unavailable';});
    document.addEventListener('visibilitychange',syncClip);
    media.src = song.media || "/assets/alm-clip-complet-1080p.mp4";
    media.loop=false;media.muted=false;
    media.preload = "metadata";
    media.defaultPlaybackRate = 1;
    media.playbackRate = 1;
    if ("preservesPitch" in media) media.preservesPitch = true;
    seek.max = String(song.duration || 210);
    if (loading) loading.remove();

    const adjustedTime = () => Number(media.currentTime || 0) + baseOffset + userOffset;
    const uiLanguage = () => window.ALM_I18N?.getLanguage?.() || document.documentElement.dataset.almLanguage || "fr";
    const kt = source => window.ALM_I18N?.t?.(source) || source;
    const translatedText = (line, lang = uiLanguage()) => {
      if (!line) return "";
      if (lang === "ja") return line.ja || "";
      return line.translations?.[lang] || line[lang] || (lang === "pt-BR" ? line.ptBR : "") || line.fr || "";
    };
    const translatedUnits = (line, lang = uiLanguage()) => {
      if (!line) return [];
      if (lang === "ja") return Array.isArray(line.jaUnits) ? line.jaUnits : [];
      const units = line.translationUnits?.[lang]
        || (lang === "pt-BR" ? line.ptBRUnits : line[`${lang}Units`])
        || line.frUnits;
      return Array.isArray(units) ? units : [];
    };
    const translatedSection = (section, lang = uiLanguage()) => {
      if (!section) return "";
      if (lang === "ja") return section.labels?.ja || section.labelJa || "";
      const local = section.labels?.[lang] || section.labels?.fr || section.labelFr || "";
      const ja = section.labelJa || section.labels?.ja || "";
      return ja && local ? `${ja} — ${local}` : (local || ja);
    };

    const setTextLine = (node, line) => {
      if (!node) return;
      if (!line) {
        node.textContent = "";
        return;
      }
      node.innerHTML = `<span lang="ja">${escapeHtml(line.ja)}</span><small>${escapeHtml(translatedText(line))}</small>`;
    };

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function displayUnits(units,text){
      let cursor=0;return units.map((unit,index)=>{
        const start=cursor;
        for(const char of unit.text.replace(/[\s\p{P}]/gu,'')){
          while(cursor<text.length&&/[\s\p{P}]/u.test(text[cursor]))cursor++;
          if(text[cursor]!==char)return unit;
          cursor+=char.length;
        }
        while(cursor<text.length&&/[\s\p{P}]/u.test(text[cursor]))cursor++;
        return {...unit,text:text.slice(start,cursor)};
      });
    }
    function renderActiveLine(index) {
      const line = lines[index];
      if (!line) return;
      activeLineIndex = index;
      root.classList.toggle("karaoke-brand-line",String(line.ja||"").trim().toLowerCase()==="anime local manager");
      activeJaIndex = -1;
      devLineIndex = index;
      devUnitIndex = 0;

      root.classList.toggle("karaoke-line-uncertain", Boolean(line.review));
      sectionLabel.textContent = translatedSection(line.section) + (line.review ? " · [?]" : "");
      sectionLabel.dataset.type = line.section.type || "section";

      if (originalLine) originalLine.replaceChildren(...displayUnits(line.jaUnits || [],line.ja).map((unit,index) => {
        const node=document.createElement("span");node.className="karaoke-original-unit";node.dataset.unit=String(index);node.textContent=unit.text;return node;
      }));
      const singUnits = Array.isArray(line.romajiUnits) && line.romajiUnits.length ? line.romajiUnits : line.jaUnits;
      jaLine.replaceChildren(...singUnits.map((unit, unitIndex) => {
        const span = document.createElement("span");
        span.className = "karaoke-romaji-unit";
        span.dataset.unit = String(unitIndex);
        span.textContent = unit.text;
        return span;
      }));
      const lowerUnits = cachedLowerUnits(line);
      frLine.lang=uiLanguage();
      const lowerDisplay=["ja","zh-CN"].includes(uiLanguage())?displayUnits(lowerUnits,translatedText(line)):lowerUnits;
      frLine.replaceChildren(...lowerDisplay.map((unit, unitIndex) => {
        const span = document.createElement("span");
        span.className = "karaoke-fr-unit";
        span.dataset.unit = String(unitIndex);
        span.textContent = unit.text;
        return span;
      }));

      romanNodes=Array.from(jaLine.children);originalNodes=originalLine?Array.from(originalLine.children):[];
      setTextLine(previous, lines[index - 1]);
      setTextLine(next, lines[index + 1]);
      root.dataset.section = line.section.type || "section";
      root.classList.add("karaoke-line-change");
      requestAnimationFrame(() => root.classList.remove("karaoke-line-change"));
      requestAnimationFrame(measureUnits);
    }

    function measureUnits() {
      // Cache real glyph widths outside the animation loop. Equal character
      // percentages would advance too far across narrow romaji letters.
      for(const node of [...romanNodes,...originalNodes]){
        const text=node.firstChild;if(!text||text.nodeType!==Node.TEXT_NODE)continue;
        const total=node.getBoundingClientRect().width;if(total<=.5){node._glyphProgress=null;continue;}
        const positions=[0];let offset=0;
        for(const char of text.textContent){
          offset+=char.length;if(/[\s\p{P}]/u.test(char))continue;
          const range=document.createRange();range.setStart(text,0);range.setEnd(text,offset);
          positions.push(clamp(range.getBoundingClientRect().width/total));
        }
        if(positions.length>1)positions[positions.length-1]=1;
        node._glyphProgress=positions;
      }
      ballWidth=ball.getBoundingClientRect().width||12;
      const wrapRect = jaWrap.getBoundingClientRect();
      metrics = Array.from(originalLine.querySelectorAll(".karaoke-original-unit")).map(span => {
        const range=document.createRange();range.selectNodeContents(span);
        const rects=Array.from(range.getClientRects()).filter(r=>r.width>.5&&r.height>.5);
        const raw=rects.length?rects:[span.getBoundingClientRect()];
        const parts=raw.map(r=>({x:r.left-wrapRect.left,top:r.top-wrapRect.top,width:r.width}));
        const rect=span.getBoundingClientRect();
        return {x:rect.left-wrapRect.left+rect.width/2,top:rect.top-wrapRect.top,width:rect.width,parts};
      });
    }

    function metricsAreUsable() {
      return metrics.length > 0 && metrics.every(item =>
        Number.isFinite(item.x) && Number.isFinite(item.top) && Number(item.width) > 0.5
      );
    }

    let measureScheduled = false;
    function scheduleMeasureUnits() {
      if (measureScheduled || destroyed) return;
      measureScheduled = true;
      // Le karaoké est initialisé alors que la page Dons peut encore être cachée.
      // Dans ce cas Chromium renvoie des rectangles à 0 px et la première balle
      // n'a aucune position valide. Reprendre les mesures après affichage/lecture.
      requestAnimationFrame(() => {
        measureUnits();
        requestAnimationFrame(() => {
          measureUnits();
          update();
        });
      });
      setTimeout(() => {
        measureScheduled = false;
        if (!destroyed && root.getClientRects().length) {
          measureUnits();
          update();
        }
      }, 90);
    }

    function updateUnitClasses(nodes, currentIndex, progress, prefix, pastCount = Math.max(0,currentIndex)) {
      nodes.forEach((node,index)=>{
        const phase=index<pastCount?'past':index===currentIndex?'active':'future';if(node.dataset.phase!==phase){node.classList.remove(`${prefix}-past`,`${prefix}-active`,`${prefix}-future`);node.classList.add(`${prefix}-${phase}`);node.dataset.phase=phase;}
        if(['original','romaji'].includes(prefix)){
          let fraction=index<pastCount?1:index===currentIndex?clamp(progress):0;
          const positions=node._glyphProgress;
          if(index===currentIndex&&positions?.length>1){const at=fraction*(positions.length-1),low=Math.min(positions.length-2,Math.floor(at));fraction=positions[low]+(positions[low+1]-positions[low])*(at-low);}
          const value=`${(clamp(fraction)*100).toFixed(1)}%`;if(node._progress!==value){node.style.setProperty('--karaoke-progress',value);node._progress=value;}
        }

      });
    }

    function activeUnit(units, t) {
      let pastCount=0;
      for(let i=0;i<(units||[]).length;i++){
        const unit=units[i];
        if(t>=unit.end){pastCount=i+1;continue;}
        if(t<unit.start)return {index:-1,progress:0,pastCount};
        return {index:i,progress:clamp((t-unit.start)/Math.max(.001,unit.end-unit.start)),pastCount};
      }
      return {index:-1,progress:0,pastCount};
    }

    function updateBall(line, unitIndex, progress, singing) {
      if(!singing||unitIndex<0){ball.classList.add("hidden");return;}
      if(!metricsAreUsable()||!metrics[unitIndex]){ball.classList.add("hidden");scheduleMeasureUnits();return;}
      const here=metrics[unitIndex],parts=here.parts||[{x:here.x-here.width/2,top:here.top,width:here.width}];
      let distance=clamp(progress)*parts.reduce((sum,p)=>sum+p.width,0),part=parts[parts.length-1];
      for(const segment of parts){part=segment;if(distance<=segment.width)break;distance-=segment.width;}
      const inset=Math.min(7,part.width/2),x=part.x+inset+Math.max(0,Math.min(part.width-2*inset,distance));
      const firstTop=metrics[0]?.parts?.[0]?.top ?? metrics[0]?.top ?? 0;
      const reduced=document.documentElement.dataset.motion==="reduced"||window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const bounce=reduced?0:-Math.sin(Math.PI*progress)*12;
      ball.classList.remove("hidden");
      ball.style.transform=`translate3d(${(x-ballWidth/2).toFixed(2)}px,${(part.top-firstTop+bounce).toFixed(2)}px,0)`;
      ball.dataset.group=String(unitIndex);
    }

    function update(now = adjustedTime()) {
      if (destroyed || !lines.length) return;
      const t = now;
      root.classList.toggle("karaoke-intro", Number(media.currentTime || 0) < Number(lines[0]?.start || 0));
      const lineIndex = findLineIndex(lines, t);
      if (lineIndex !== activeLineIndex) renderActiveLine(lineIndex);
      const line = lines[lineIndex];
      const singing = t >= line.start && t < line.end;
      root.classList.toggle("karaoke-waiting", !singing);

      const singUnits = Array.isArray(line.romajiUnits) && line.romajiUnits.length ? line.romajiUnits : line.jaUnits;
      const ja = clock ? clock.unitState(line.jaUnits, t) : activeUnit(line.jaUnits, t);
      // Pendant un silence instrumental, la ligne suivante peut rester visible
      // comme repère, mais aucun mot ne doit être marqué comme déjà actif.
      // C'est important avec la nouvelle timeline ancrée sur l'media : la balle
      // et la coloration attendent réellement le début chanté.
      const jaVisual = singing ? ja : { index: -1, progress: 0 };
      if (jaVisual.index !== activeJaIndex || singing) {
        const roman = clock ? clock.unitState(line.romajiUnits, t) : activeUnit(line.romajiUnits, t);
        updateUnitClasses(romanNodes, singing?roman.index:-1, roman.progress, "romaji", singing?roman.pastCount:0);
        if(originalLine)updateUnitClasses(originalNodes,jaVisual.index,jaVisual.progress,"original",singing ? ja.pastCount : 0);
        activeJaIndex = jaVisual.index;
      }
      // Translated spans stay neutral until the next line is rendered.
      ball.classList.add("hidden");

      const raw = Number(media.currentTime || 0);
      const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : Number(song.duration || 210);
      seek.max=String(duration);
      if (!seeking) seek.value = String(clamp(raw, 0, duration));
      root.classList.toggle("karaoke-outro",media.ended||raw>=lines[lines.length-1].end);
      if (Math.floor(raw) !== Math.floor(lastDisplayTime) || media.paused) {
        timeLabel.textContent = `${formatTime(raw)} / ${formatTime(duration)}`;
        lastDisplayTime = raw;
      }
      syncClip();
      updateDevReadout(line, ja.index);
    }

    function loop() {
      cancelAnimationFrame(raf);
      const frame = () => {
        update();
        if (!media.paused && !media.ended && !destroyed) raf = requestAnimationFrame(frame);
      };
      if (!media.paused && !media.ended) raf = requestAnimationFrame(frame);
    }

    const playbackOverlay = document.createElement('span');
    playbackOverlay.className = 'alm-playback-overlay';
    playbackOverlay.setAttribute('aria-hidden', 'true');
    stage?.append(playbackOverlay);
    let overlayTimer;
    function showPlaybackOverlay() {
      clearTimeout(overlayTimer);
      playbackOverlay.textContent = media.paused || media.ended ? '▶' : 'Ⅱ';
      playbackOverlay.classList.add('visible');
      if (!media.paused && !media.ended) overlayTimer = setTimeout(() => playbackOverlay.classList.remove('visible'), 850);
    }
    showPlaybackOverlay();
    stage?.addEventListener('pointerenter', showPlaybackOverlay);
    stage?.addEventListener('pointerleave', () => { if (!media.paused) playbackOverlay.classList.remove('visible'); });
    function syncPlayState() {
      showPlaybackOverlay();
      const playing = !media.paused && !media.ended;
      play.textContent = kt(playing ? "⏸ Pause" : "▶ Lecture");
      root.classList.toggle("is-playing", playing);
      if (playing && !metricsAreUsable()) scheduleMeasureUnits();
      update();
      loop();
    }

    play.addEventListener("click", async () => {
      try {
        if (media.paused || media.ended) {
          scheduleMeasureUnits();
          await media.play();
        }
        else media.pause();
      } catch (error) {
        console.warn("[Karaoke] lecture refusée", error);
      }
      syncPlayState();
    });

    restart.addEventListener("click", async () => {
      media.currentTime = 0;
      update();
      try { await media.play(); } catch {}
      syncPlayState();
    });

    seek.addEventListener("pointerdown",()=>{seeking=true;});
    window.addEventListener("pointerup",()=>{if(seeking){seeking=false;update();}});
    seek.addEventListener("change",()=>{seeking=false;update();});
    window.addEventListener("pointercancel",()=>{seeking=false;update();});
    window.addEventListener("blur",()=>{seeking=false;});
    seek.addEventListener("input", () => {
      const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : Number(song.duration || 210);
      media.currentTime = clamp(Number(seek.value || 0), 0, duration);
      update();
    });

    for (const event of ["play", "pause", "ended", "loadedmetadata", "seeked"]) {
      media.addEventListener(event, syncPlayState);
    }
    media.addEventListener("loadedmetadata", scheduleMeasureUnits);
    document.fonts?.ready?.then(scheduleMeasureUnits);
    const unitObserver=typeof ResizeObserver==="function"?new ResizeObserver(()=>scheduleMeasureUnits()):null;
    unitObserver?.observe(jaLine);
    media.addEventListener("ratechange", () => {
      // ALM n'expose pas de vitesse variable. Certains environnements virtualisés
      // peuvent modifier temporairement l'horloge média : on refuse toute
      // playbackRate applicative différente de 1x. Les décrochages de la carte
      // son de la VM restent du ressort de l'hyperviseur, pas du karaoké.
      if (Math.abs(Number(media.playbackRate || 1) - 1) > 0.001) media.playbackRate = 1;
      syncPlayState();
    });
    media.addEventListener("timeupdate", () => { if (media.paused) update(); });

    let fullscreenRequested = false;let homeAnchor=null;
    const windowActions=document.createElement('div');windowActions.className='karaoke-window-actions';windowActions.setAttribute('data-no-i18n','');
    const minimize=document.createElement('button'),close=document.createElement('button');minimize.type=close.type='button';close.id="karaokeClose";windowActions.append(minimize,close);root.append(windowActions);
    const updateModeLabel = () => {
      const expanded = root.classList.contains("karaoke-focus-mode");
      minimize.textContent=window.ALM_DESIGN?.t('videoReduce')||'Minimize';
      close.textContent=window.ALM_DESIGN?.t('videoClose')||'Close';
      mode?.setAttribute("aria-expanded", String(expanded));
      const label = window.ALM_DESIGN?.t(expanded ? "shrinkVideo" : "expandVideo") || "Full screen";
      if(mode){ mode.innerHTML = expanded ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>'; mode.setAttribute("aria-label", label); mode.title = label; }
    };
    const closeExpanded = () => {
      root.classList.remove("karaoke-focus-mode"); document.body.classList.remove("nocturne-cinema");
      if(homeAnchor){homeAnchor.replaceWith(root);homeAnchor=null;}
      root.removeAttribute('role');root.removeAttribute('aria-modal');fullscreenRequested=false; updateModeLabel(); scheduleMeasureUnits(); mode?.focus({preventScroll:true});
    };
    const minimizeExpanded=async()=>{if(document.fullscreenElement===root)await document.exitFullscreen().catch(()=>{});closeExpanded();};
    minimize.addEventListener('click',minimizeExpanded);
    close.addEventListener('click',async()=>{media.pause();await minimizeExpanded();});
    mode?.addEventListener("click", async () => {
      if(root.classList.contains("karaoke-focus-mode")){
        if(document.fullscreenElement===root) await document.exitFullscreen().catch(()=>{});
        closeExpanded(); return;
      }
      homeAnchor=document.createComment('ALM player home');root.before(homeAnchor);document.body.append(root);root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
      root.classList.add("karaoke-focus-mode"); document.body.classList.add("nocturne-cinema");
      updateModeLabel(); scheduleMeasureUnits();close.focus({preventScroll:true});
      if(root.requestFullscreen) try { await root.requestFullscreen(); fullscreenRequested=true; } catch {}
      setTimeout(measureUnits,80);
    });
    let stageWasPaused=true;
    const stageControl=event=>event.target.closest('button,input,select,a,textarea');
    stage?.addEventListener('click',async event=>{if(stageControl(event))return;if(event.detail===1){stageWasPaused=media.paused||media.ended;play.click();}else if(event.detail===2){if(stageWasPaused)media.pause();else try{await media.play();}catch{}syncPlayState();}});
    stage?.addEventListener('dblclick',event=>{if(!stageControl(event))mode?.click();});
    if(stage){stage.tabIndex=0;stage.addEventListener('keydown',event=>{if(event.target!==stage||![' ','Enter'].includes(event.key))return;event.preventDefault();play.click();});}
    document.addEventListener("fullscreenchange",()=>{if(!document.fullscreenElement&&fullscreenRequested)closeExpanded();});
    document.addEventListener("keydown",event=>{
      if(!root.classList.contains('karaoke-focus-mode'))return;
      if(event.key==='Escape'&&!document.fullscreenElement)closeExpanded();
      if(event.key==='Tab'){const controls=[...root.querySelectorAll('button,input')].filter(b=>!b.disabled&&b.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first?.focus();}}
    });
    updateModeLabel();

    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measureUnits, 80);
    }, { passive: true });

    window.addEventListener("alm:language-changed", () => {
      if (activeLineIndex >= 0) renderActiveLine(activeLineIndex);
      syncPlayState();
      updateModeLabel();
      update();
    });

    // Pause immediately when the user leaves the Dons page.
    const donationsPage = byId("donationsPage");
    const pageObserver = donationsPage ? new MutationObserver(() => {
      if (donationsPage.classList.contains("hidden") || byId("aboutPage")?.classList.contains("hidden")) {
        media.pause();
        cancelAnimationFrame(raf);
        if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
      } else {
        // Reprendre les mesures une fois la page réellement visible : cela corrige
        // notamment la balle absente sur la toute première phrase chantée.
        scheduleMeasureUnits();
      }
    }) : null;
    if (donationsPage && pageObserver) pageObserver.observe(donationsPage, { attributes: true, attributeFilter: ["class"] });

    if (byId("aboutPage") && pageObserver) pageObserver.observe(byId("aboutPage"), {attributes:true,attributeFilter:["class"]});

    // Development-only calibration. Add ?karaokeDev=1 to the local URL.
    if (devEnabled && devPanel) {
      devPanel.hidden = false;
      root.classList.add("karaoke-dev-enabled");
      devPanel.addEventListener("click", event => {
        const button = event.target.closest("button[data-karaoke-action]");
        if (!button) return;
        const action = button.dataset.karaokeAction;
        const line = lines[devLineIndex] || lines[activeLineIndex];
        const timingUnits = line?.romajiUnits?.length ? line.romajiUnits : line?.jaUnits;
        const unit = timingUnits?.[devUnitIndex];
        if (action === "offset-minus") userOffset -= 0.1;
        if (action === "offset-plus") userOffset += 0.1;
        if (action === "line-prev") devLineIndex = Math.max(0, devLineIndex - 1);
        if (action === "line-next") devLineIndex = Math.min(lines.length - 1, devLineIndex + 1);
        if (action === "word-prev") devUnitIndex = Math.max(0, devUnitIndex - 1);
        if (action === "word-next") devUnitIndex = Math.min((timingUnits?.length || 1) - 1, devUnitIndex + 1);
        if (unit && action === "start-minus") unit.start = Math.max(line.start, unit.start - 0.02);
        if (unit && action === "start-plus") unit.start = Math.min(unit.end - 0.04, unit.start + 0.02);
        if (unit && action === "end-minus") unit.end = Math.max(unit.start + 0.04, unit.end - 0.02);
        if (unit && action === "end-plus") unit.end = Math.min(line.end, unit.end + 0.02);
        if (action.startsWith("offset-")) localStorage.setItem("alm.karaoke.offsetMs", String(Math.round(userOffset * 1000)));
        if (action === "jump-line") {
          media.currentTime = Math.max(0, (lines[devLineIndex]?.start || 0) - baseOffset - userOffset);
        }
        if (action === "export") {
          navigator.clipboard?.writeText(JSON.stringify(song, null, 2)).catch(() => {});
        }
        update();
      });
    }

    function updateDevReadout(line, unitIndex) {
      if (!devEnabled || !devPanel) return;
      const readout = byId("donationKaraokeDevReadout");
      if (!readout) return;
      const selectedLine = lines[devLineIndex] || line;
      const selectedUnits = selectedLine?.romajiUnits?.length ? selectedLine.romajiUnits : selectedLine?.jaUnits;
      const selectedUnit = selectedUnits?.[devUnitIndex] || selectedUnits?.[unitIndex];
      readout.textContent = `Offset ${Math.round((baseOffset + userOffset) * 1000)} ms · ligne ${devLineIndex + 1}/${lines.length} · mot ${devUnitIndex + 1}/${selectedUnits?.length || 0} · ${selectedUnit ? `${selectedUnit.start.toFixed(3)} → ${selectedUnit.end.toFixed(3)} s` : "—"}`;
    }

    renderActiveLine(findLineIndex(lines, adjustedTime()));
    update();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initKaraoke, { once: true });
  else initKaraoke();
})();
