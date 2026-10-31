"use strict";
/**
 * alm-v2.js — ALM V2 : DNA · Actualités · Recommandations
 */

function getAnimes() { return window._almAnimes || []; }
function normalizeAnimeFeatureTagV2(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function isAnimeFeatureEligibleV2(anime) {
  if (!anime || typeof anime !== "object") return false;
  const kind = String(anime.mediaKind || "").toLowerCase();
  if (["manual", "non_anime"].includes(kind) || anime.manualLibraryChoice === true || anime.nonAnimeFallback === true) return false;
  const tags = (Array.isArray(anime.tags) ? anime.tags : []).map(normalizeAnimeFeatureTagV2);
  return !tags.some(tag => ["hors anime probable", "hors anime confirme", "choix manuel source", "conserve manuellement"].includes(tag));
}
function getAnimeFeatureAnimesV2() { return getAnimes().filter(isAnimeFeatureEligibleV2); }
function escapeHtmlV2(value) {
  return String(value ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[s]));
}
function decodeHtmlTextV2(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (match, code) => {
      const point = Number(code);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : match;
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;|&#039;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
function safeUrlV2(value) {
  let raw=String(value || "").trim();
  if (!raw || /[\x00-\x1f\x7f]/.test(raw)) return "#";
  if (/^(images|assets)\//i.test(raw)) raw="/"+raw;
  // Raster data URIs are useful for JSON backups; HTML/SVG/file URLs are not.
  if (/^data:/i.test(raw) && !/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(raw)) return "#";
  if (!/^(https?:\/\/|\/|data:image\/|blob:)/i.test(raw)) return "#";
  try {
    const base = (window.location?.origin && window.location.origin !== "null") ? window.location.origin : "http://127.0.0.1:3123";
    const parsed = new URL(raw, base);
    if (parsed.username || parsed.password || !["http:","https:","data:","blob:"].includes(parsed.protocol)) return "#";
    const safe = parsed.href.replace(/["'<>`]/g, c => "%"+c.charCodeAt(0).toString(16));
    return raw.startsWith("/") && !raw.startsWith("//") && parsed.origin === base ? safe.slice(parsed.origin.length) : safe;
  } catch { return "#"; }
}

function openLibraryWithGenreV2(rawGenre) {
  const genre = String(rawGenre || "").trim();
  if (!genre) return false;

  // Un clic DNA/Dictionnaire est une navigation explicite vers la vue « Animés ».
  // On ouvre d’abord cette vue afin de ne pas écraser le genre avec la restauration
  // de ses filtres, puis on repart d’un filtre propre centré uniquement sur le genre.
  if (typeof showAnimesV1 === "function") showAnimesV1("");
  else if (typeof hideAllV2Pages === "function") hideAllV2Pages();

  ["search", "typeFilter", "yearFilter"].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.value = "";
  });
  const statusFilter = document.getElementById("statusFilter");
  if (statusFilter) {
    statusFilter.disabled = false;
    statusFilter.value = "";
  }

  const genreFilter = document.getElementById("genreFilter");
  if (genreFilter) {
    const wanted = normalizeRecoGenreKeyV2(genre);
    const matchingOption = [...genreFilter.options].find(option => normalizeRecoGenreKeyV2(option.value) === wanted);
    const targetValue = matchingOption?.value || genre;
    if (!matchingOption) genreFilter.add(new Option(genre, genre));
    genreFilter.value = targetValue;
  }

  genreFilter?.dispatchEvent(new Event("input", { bubbles: true }));
  genreFilter?.dispatchEvent(new Event("change", { bubbles: true }));
  if (typeof window.__almSaveLibraryFilterState === "function") window.__almSaveLibraryFilterState();
  if (typeof render === "function") render();

  const wantedGenre = normalizeRecoGenreKeyV2(genreFilter?.value || genre);
  const count = getAnimes().filter(anime => (anime?.genres || []).some(item => normalizeRecoGenreKeyV2(item) === wantedGenre)).length;
  window.notifyApp?.(`${count} animé${count > 1 ? "s" : ""} affiché${count > 1 ? "s" : ""} pour « ${genre} ».`, count ? "success" : "info");
  setTimeout(() => {
    (document.querySelector(".filters") || document.getElementById("animeGrid"))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 60);
  return true;
}

window.openLibraryWithGenreV2 = openLibraryWithGenreV2;

// ─── Navigation ────────────────────────────────────────────
const ALL_V2_PAGES = ["communityPage","memoryPage","dnaPage","newsV2Page","recoPage","seasonNewsPage","lexiconPage","auditPage","discoveryPage","rankingPage","calendarPage"];

function resetTopLevelScrollV2(pageId = "") {
  const reset = () => {
    try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch { window.scrollTo(0, 0); }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const page = pageId ? document.getElementById(pageId) : null;
    if (page) {
      page.scrollTop = 0;
      page.scrollLeft = 0;
      page.querySelectorAll(".news-reader-side, .audit-grid, .lexicon-results, .reco-results").forEach(node => {
        node.scrollTop = 0;
        node.scrollLeft = 0;
      });
    }
  };
  reset();
  // Certains panneaux se redimensionnent juste après leur affichage. Un second
  // reset au prochain frame évite que le navigateur restaure l'ancienne position.
  requestAnimationFrame(reset);
}
window.resetTopLevelScrollV2 = resetTopLevelScrollV2;

function hideAllV2Pages(options = {}) {
  const keepSeasonNews = Boolean(options && options.keepSeasonNews);
  if (typeof setV2BodyView === "function") setV2BodyView("");
  ALL_V2_PAGES.forEach(id => document.getElementById(id)?.classList.add("hidden"));
  ["animeGrid","stats"].forEach(id => document.getElementById(id)?.classList.remove("hidden"));
  document.querySelector(".hero")?.classList.remove("hidden");
  document.querySelector(".filters")?.classList.remove("hidden");
  // Ne jamais réafficher la bannière simplement parce qu'on quitte une page V2.
  // Son affichage dépend du diagnostic/snooze géré par app.js.
  document.getElementById("completionBanner")?.classList.add("hidden");
  if (window._dnaAnimFrame) { cancelAnimationFrame(window._dnaAnimFrame); window._dnaAnimFrame = null; }
  if (window._dnaSignatureFrame) { cancelAnimationFrame(window._dnaSignatureFrame); window._dnaSignatureFrame = null; }
  document.querySelectorAll(".nav-item, .studio-account-shortcut").forEach(x => x.classList.remove("active"));
}

function showV2Page(pageId, navId) {
  if (typeof setV2BodyView === "function") setV2BodyView(pageId);
  document.getElementById("aboutPage")?.classList.add("hidden");
  document.getElementById("donationsPage")?.classList.add("hidden");
  document.querySelector(".hero")?.classList.add("hidden");
  document.querySelector(".filters")?.classList.add("hidden");
  document.getElementById("animeGrid")?.classList.add("hidden");
  document.getElementById("stats")?.classList.add("hidden");
  document.getElementById("completionBanner")?.classList.add("hidden");
  ALL_V2_PAGES.forEach(id => document.getElementById(id)?.classList.add("hidden"));
  document.getElementById(pageId)?.classList.remove("hidden");
  document.querySelectorAll(".nav-item, .studio-account-shortcut").forEach(x => x.classList.remove("active"));
  if (navId) document.getElementById(navId)?.classList.add("active");
  resetTopLevelScrollV2(pageId);
}

// ─── DNA ───────────────────────────────────────────────────
function scoreColor(avg) {
  if (!avg) return "rgba(100,110,140,1)";
  if (avg>=9) return "rgba(168,85,247,1)"; if (avg>=8) return "rgba(56,189,248,1)";
  if (avg>=7) return "rgba(52,211,153,1)"; if (avg>=6) return "rgba(251,191,36,1)";
  if (avg>=5) return "rgba(249,115,22,1)"; return "rgba(239,68,68,1)";
}

function renderDNA() {
  const canvas = document.getElementById("dnaCanvas");
  if (!canvas) return;
  const animes = getAnimeFeatureAnimesV2();
  const wrap = canvas.parentElement;
  const cssWidth = Math.max(1, Math.round(wrap?.clientWidth || 900));
  const cssHeight = Math.max(1, Math.round(wrap?.clientHeight || 440));
  const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const W = cssWidth;
  const H = cssHeight;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!animes.length) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(174,184,209,.9)";
    ctx.font = "600 14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Importe quelques animés pour générer ton Anime DNA.", W / 2, H / 2);
    const meta = document.getElementById("dnaBubbleMeta");
    if (meta) meta.textContent = "Aucune donnée de genre disponible";
    return;
  }

  const map = Object.create(null);

  for (const anime of animes) {
    const score = Number(anime.score) || 0;
    for (const rawGenre of (anime.genres || [])) {
      const genre = String(rawGenre || "").trim();
      if (!genre) continue;
      if (!map[genre]) map[genre] = { count: 0, sum: 0, scored: 0, titles: [] };
      map[genre].count++;
      map[genre].titles.push(anime.title);
      if (score > 0) {
        map[genre].sum += score;
        map[genre].scored++;
      }
    }
  }

  const allEntries = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  if (!allEntries.length) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(174,184,209,.9)";
    ctx.font = "600 14px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Ajoute des genres à tes fiches pour construire la carte.", W / 2, H / 2);
    const meta = document.getElementById("dnaBubbleMeta");
    if (meta) meta.textContent = "Aucun genre renseigné";
    renderDnaInsights(animes, map);
    renderDnaDashboard(animes, allEntries);
    renderDnaSignatureV2(animes, allEntries);
    return;
  }

  const maxVisible = W >= 1200 ? 22 : W >= 820 ? 18 : 14;
  const visibleEntries = allEntries.slice(0, maxVisible);
  const hiddenEntries = allEntries.slice(maxVisible);
  const bubbleMeta = document.getElementById("dnaBubbleMeta");
  if (bubbleMeta) {
    if (!allEntries.length) {
      bubbleMeta.textContent = "Ajoute des genres à tes fiches pour construire la carte";
    } else if (hiddenEntries.length) {
      bubbleMeta.textContent = `${visibleEntries.length} genres principaux · ${hiddenEntries.length} regroupés`;
    } else {
      bubbleMeta.textContent = `${visibleEntries.length} genre${visibleEntries.length > 1 ? "s" : ""} affiché${visibleEntries.length > 1 ? "s" : ""}`;
    }
  }
  if (hiddenEntries.length) {
    visibleEntries.push(["Autres genres", {
      count: hiddenEntries.reduce((sum, [, data]) => sum + Number(data.count || 0), 0),
      sum: hiddenEntries.reduce((sum, [, data]) => sum + Number(data.sum || 0), 0),
      scored: hiddenEntries.reduce((sum, [, data]) => sum + Number(data.scored || 0), 0),
      titles: hiddenEntries.flatMap(([, data]) => data.titles || []).slice(0, 10),
      aggregate: true,
      genreCount: hiddenEntries.length
    }]);
  }

  const realCounts = allEntries.map(([, data]) => Number(data.count || 0));
  const maxCount = Math.max(...realCounts, 1);
  const minDimension = Math.min(W, H);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  const bubbles = visibleEntries.map(([genre, data], index) => {
    const avg = data.scored ? data.sum / data.scored : 0;
    const aggregate = data.aggregate === true;
    const radius = aggregate
      ? Math.max(30, Math.min(42, minDimension * .085))
      : Math.max(22, Math.min(W < 700 ? 56 : 78, 20 + Math.sqrt(data.count / maxCount) * minDimension * .125));
    const normalized = visibleEntries.length > 1 ? Math.sqrt(index / (visibleEntries.length - 1)) : 0;
    const distance = index === 0 ? 0 : normalized * minDimension * .35;
    const angle = index * goldenAngle - Math.PI / 2;
    return {
      genre,
      count: data.count,
      avg: Math.round(avg * 10) / 10,
      r: radius,
      x: W / 2 + Math.cos(angle) * distance,
      y: H / 2 + Math.sin(angle) * distance,
      titles: data.titles,
      color: scoreColor(avg),
      aggregate,
      genreCount: Number(data.genreCount || 0)
    };
  });

  for (let iteration = 0; iteration < 155; iteration++) {
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i];
        const b = bubbles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || .01;
        const minimum = a.r + b.r + 7;
        if (distance < minimum) {
          const push = (minimum - distance) / distance * .48;
          const aWeight = b.r / (a.r + b.r);
          const bWeight = a.r / (a.r + b.r);
          a.x -= dx * push * aWeight;
          a.y -= dy * push * aWeight;
          b.x += dx * push * bWeight;
          b.y += dy * push * bWeight;
        }
      }
    }

    bubbles.forEach((bubble, index) => {
      const pull = index === 0 ? .035 : .004;
      bubble.x += (W / 2 - bubble.x) * pull;
      bubble.y += (H / 2 - bubble.y) * pull;
      bubble.x = Math.max(bubble.r + 7, Math.min(W - bubble.r - 7, bubble.x));
      bubble.y = Math.max(bubble.r + 7, Math.min(H - bubble.r - 7, bubble.y));
    });
  }

  window._dnaBubbles = bubbles;
  if (window._dnaAnimFrame) cancelAnimationFrame(window._dnaAnimFrame);
  window._dnaAnimFrame = null;
  let hovered = null;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const bubble of bubbles) {
      const isHovered = hovered === bubble;
      const radius = bubble.r * (isHovered ? 1.055 : 1);
      const color = bubble.aggregate ? "rgba(100,116,139,1)" : bubble.color;

      if (isHovered) {
        const glow = ctx.createRadialGradient(bubble.x, bubble.y, radius * .5, bubble.x, bubble.y, radius * 1.75);
        glow.addColorStop(0, color.replace("1)", "0.2)"));
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, radius * 1.75, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      const gradient = ctx.createRadialGradient(
        bubble.x - radius * .32,
        bubble.y - radius * .32,
        radius * .08,
        bubble.x,
        bubble.y,
        radius
      );
      gradient.addColorStop(0, color);
      gradient.addColorStop(.72, color.replace("1)", "0.58)"));
      gradient.addColorStop(1, color.replace("1)", "0.14)"));
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = color.replace("1)", isHovered ? "1)" : "0.48)");
      ctx.lineWidth = isHovered ? 2.5 : 1.25;
      ctx.stroke();

      const shine = ctx.createRadialGradient(
        bubble.x - radius * .35,
        bubble.y - radius * .35,
        0,
        bubble.x - radius * .2,
        bubble.y - radius * .2,
        radius * .58
      );
      shine.addColorStop(0, "rgba(255,255,255,.25)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = shine;
      ctx.fill();

      const fontSize = Math.max(9, Math.min(14, radius * .29));
      ctx.fillStyle = "rgba(255,255,255,.96)";
      ctx.font = `700 ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let label = bubble.aggregate ? window.ALM_RETOUCHES.t("otherGenres") : (window.ALM_CONTENT_LANGUAGE?.genre(bubble.genre) || bubble.genre);
      if (ctx.measureText(label).width > radius * 1.65) {
        while (label.length > 3 && ctx.measureText(label + "…").width > radius * 1.65) label = label.slice(0, -1);
        label += "…";
      }
      ctx.fillText(label, bubble.x, bubble.y - (radius > 29 ? 6 : 0));

      if (radius > 27) {
        ctx.font = `600 ${Math.max(8, fontSize * .76)}px Inter, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,.68)";
        const detail = bubble.aggregate
          ? `${bubble.genreCount} ${window.ALM_RETOUCHES.t("genres")}`
          : bubble.avg > 0 ? `★${bubble.avg} · ${bubble.count}` : `${bubble.count} ${window.ALM_RETOUCHES.t("animeCount")}`;
        ctx.fillText(detail, bubble.x, bubble.y + fontSize * .9);
      }
    }
  }

  draw();

  canvas.onmousemove = event => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) * (W / rect.width);
    const mouseY = (event.clientY - rect.top) * (H / rect.height);
    const nextHovered = bubbles.find(bubble => {
      const dx = bubble.x - mouseX;
      const dy = bubble.y - mouseY;
      return Math.sqrt(dx * dx + dy * dy) <= bubble.r * 1.08;
    }) || null;
    if (nextHovered !== hovered) {
      hovered = nextHovered;
      draw();
      updateDnaNexusFocusV2(hovered && !hovered.aggregate ? hovered.genre : "");
    }

    canvas.style.cursor = hovered && !hovered.aggregate ? "pointer" : hovered ? "help" : "default";
    const tooltip = document.getElementById("dnaTooltip");
    if (!tooltip) return;
    if (!hovered) {
      tooltip.classList.add("hidden");
      return;
    }

    tooltip.classList.remove("hidden");
    tooltip.innerHTML = hovered.aggregate
      ? `<strong>Genres secondaires</strong><div>🧭 ${hovered.genreCount} genres regroupés</div><div style="margin-top:5px;font-size:11px;color:var(--muted)">Les genres les moins représentés restent disponibles dans le filtre de la bibliothèque.</div>`
      : `<strong>${escapeHtmlV2(window.ALM_CONTENT_LANGUAGE?.genre(hovered.genre)||hovered.genre)}</strong><div>📺 ${hovered.count} animé${hovered.count > 1 ? "s" : ""}</div>${hovered.avg > 0 ? `<div>⭐ ${hovered.avg}/10</div>` : "<div>Non noté</div>"}<div style="margin-top:5px;font-size:11px;color:var(--muted)">${escapeHtmlV2(hovered.titles.slice(0, 3).join(", "))}${hovered.titles.length > 3 ? "…" : ""}</div>`;

    const frame = tooltip.offsetParent?.getBoundingClientRect() || rect;
    const tw = tooltip.offsetWidth || 220, th = tooltip.offsetHeight || 130;
    let left = event.clientX - frame.left + 14;
    let top = event.clientY - frame.top - 10;
    if(left + tw + 8 > frame.width) left = event.clientX - frame.left - tw - 14;
    left = Math.max(8, Math.min(frame.width - tw - 8, left));
    top = Math.max(8, Math.min(frame.height - th - 8, top));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  canvas.onmouseleave = () => {
    hovered = null;
    draw();
    updateDnaNexusFocusV2("");
    document.getElementById("dnaTooltip")?.classList.add("hidden");
  };

  canvas.onclick = event => {
    // Ne pas dépendre du dernier mousemove : un clic rapide, un écran tactile ou
    // un canvas redimensionné pouvait laisser `hovered` à null.
    const rect = canvas.getBoundingClientRect();
    const clickX = (event.clientX - rect.left) * (W / rect.width);
    const clickY = (event.clientY - rect.top) * (H / rect.height);
    const clicked = bubbles.find(bubble => {
      const dx = bubble.x - clickX;
      const dy = bubble.y - clickY;
      return Math.sqrt(dx * dx + dy * dy) <= bubble.r * 1.1;
    });
    if (!clicked || clicked.aggregate) return;
    openLibraryWithGenreV2(clicked.genre);
  };
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Carte interactive des genres. Clique une bulle pour filtrer la bibliothèque.");

  renderDnaInsights(animes, map);
  renderDnaDashboard(animes, allEntries);
  renderDnaSignatureV2(animes, allEntries);
  renderDnaCanvasRailsV2(animes, allEntries);
  setTimeout(() => renderDnaExtras(animes), 0);

  const legend = document.getElementById("dnaLegend");
  if (legend) {
    legend.innerHTML = [
      { l: "Chef-d’œuvre (9-10)", c: scoreColor(9.5) },
      { l: "Excellent (8-9)", c: scoreColor(8.5) },
      { l: "Bien (7-8)", c: scoreColor(7.5) },
      { l: "Moyen (6-7)", c: scoreColor(6.5) },
      { l: "Passable (<6)", c: scoreColor(5) },
      { l: "Non noté", c: scoreColor(0) }
    ].map(item => `<div class="dna-legend-item"><div class="dna-legend-dot" style="background:${item.c}"></div>${item.l}</div>`).join("");
  }

  fetch("/api/v2/stats").then(response => response.json()).then(stats => {
    const host = document.getElementById("dnaStats");
    if (!host) return;
    host.innerHTML = [
      { n: stats.totalAnimes, l: "Animés" },
      { n: stats.totalEpisodes, l: "Épisodes" },
      { n: `${stats.totalDays}j ${stats.totalHours % 24}h`, l: "Temps total" },
      { n: stats.averageScore ? `${stats.averageScore}/10` : "—", l: "Note moyenne" },
      { n: stats.favoriteGenre || "—", l: "Genre dominant" },
      { n: stats.favoriteYear || "—", l: "Année dominante" }
    ].map(item => `<div class="dna-stat-card"><div class="n">${escapeHtmlV2(item.n)}</div><div class="l">${escapeHtmlV2(item.l)}</div></div>`).join("");
  }).catch(() => {});

  if (!window._dnaResizeBound) {
    window._dnaResizeBound = true;
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const page = document.getElementById("dnaPage");
        if (page && !page.classList.contains("hidden")) renderDNA();
      }, 180);
    });
  }
}



function renderDnaSignatureV2(animes, allEntries) {
  const canvas = document.getElementById("dnaSignatureCanvas");
  const titleEl = document.getElementById("dnaSignatureName");
  const descEl = document.getElementById("dnaSignatureDesc");
  const genresEl = document.getElementById("dnaSignatureGenres");
  const memoriesEl = document.getElementById("dnaSignatureMemories");
  if (!canvas) return;
  if (window._dnaSignatureFrame) cancelAnimationFrame(window._dnaSignatureFrame);
  window._dnaSignatureFrame = null;

  const top = (Array.isArray(allEntries) ? allEntries : []).slice(0, 5).map(([genre, data]) => ({ genre, count: Number(data?.count || 0) }));
  const total = Math.max(1, Array.isArray(animes) ? animes.length : 0);
  const first = top[0]?.genre || "Anime";
  const second = top[1]?.genre || "Aventure";
  const third = top[2]?.genre || "Découverte";
  if (titleEl) titleEl.textContent = top.length ? `${first} × ${second}` : "Profil en construction";
  if (descEl) descEl.textContent = top.length
    ? `Une empreinte animée unique : ${first} domine ton ADN, avec une forte trace de ${second}${third ? ` et ${third}` : ""}.`
    : "Ajoute des genres à tes fiches pour faire évoluer cette empreinte.";
  if (genresEl) genresEl.innerHTML = top.map((item, index) => `<span style="--dna-chip:${index}">${escapeHtmlV2(item.genre)} · ${Math.round(item.count / total * 100)}%</span>`).join("");

  // Trois fragments réels de la bibliothèque donnent un côté « manga vivant »
  // à l'empreinte sans ajouter d'image distribuée avec l'application. On choisit
  // une œuvre représentative de chacun des trois genres dominants, en privilégiant
  // les fiches notées ou bien renseignées, et sans répéter la même œuvre.
  if (memoriesEl) {
    const used = new Set();
    const memories = [];
    for (const item of top.slice(0, 3)) {
      const candidates = (Array.isArray(animes) ? animes : [])
        .filter(anime => Array.isArray(anime?.genres) && anime.genres.some(genre => String(genre || "").toLowerCase() === String(item.genre || "").toLowerCase()))
        .filter(anime => !used.has(Number(anime?.id || 0)))
        .sort((a, b) => {
          const scoreA = Number(a?.score || 0) * 100 + Number(a?.publicScore || 0);
          const scoreB = Number(b?.score || 0) * 100 + Number(b?.publicScore || 0);
          const posterA = safeUrlV2(a?.poster || a?.imageUrl) !== "#" ? 1 : 0;
          const posterB = safeUrlV2(b?.poster || b?.imageUrl) !== "#" ? 1 : 0;
          return posterB - posterA || scoreB - scoreA || String(a?.title || "").localeCompare(String(b?.title || ""), "fr");
        });
      const chosen = candidates[0];
      if (!chosen) continue;
      used.add(Number(chosen?.id || 0));
      memories.push({ genre: item.genre, anime: chosen });
    }
    memoriesEl.innerHTML = memories.map((memory, index) => {
      const poster = safeUrlV2(memory.anime?.poster || memory.anime?.imageUrl);
      const title = String(memory.anime?.title || memory.genre || "Anime");
      const tilt = [-6, 4, -2][index] || 0;
      return `<div class="dna-signature-memory" style="--memory-tilt:${tilt}deg" data-genre="${escapeHtmlV2(memory.genre)}" title="${escapeHtmlV2(title)}">${poster !== "#" ? `<img src="${escapeHtmlV2(poster)}" alt="${escapeHtmlV2(title)}" loading="lazy" decoding="async" data-image-fallback="true">` : `<span class="dna-signature-memory-placeholder" aria-hidden="true">✦</span>`}</div>`;
    }).join("");
  }

  const stage = canvas.parentElement;
  const width = Math.max(320, Math.round(stage?.clientWidth || 900));
  const height = Math.max(210, Math.round(stage?.clientHeight || 250));
  const dpr = Math.max(1, Math.min(2, Number(devicePixelRatio) || 1));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  const palette = [
    [139, 92, 246], [56, 189, 248], [45, 212, 191], [244, 114, 182], [250, 204, 21]
  ];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let last = 0;
  function draw(time) {
    const page = document.getElementById("dnaPage");
    if (!page || page.classList.contains("hidden")) { window._dnaSignatureFrame = null; return; }
    if (time - last < 28) { window._dnaSignatureFrame = requestAnimationFrame(draw); return; }
    last = time;
    const t = reducedMotion ? 0 : time / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "rgba(76,29,149,.10)");
    bg.addColorStop(.45, "rgba(14,116,144,.08)");
    bg.addColorStop(1, "rgba(15,23,42,.02)");
    ctx.fillStyle = bg; ctx.fillRect(0,0,width,height);

    // Pages de manga abstraites, originales : elles évoquent les cases sans
    // embarquer d'image ou de personnage protégé.
    for (let i=0;i<7;i++) {
      const px = (width * (.08 + i*.145) + Math.sin(t*.35+i)*18) % (width+80) - 30;
      const py = height * (.18 + (i%3)*.25) + Math.cos(t*.45+i*1.7)*10;
      ctx.save(); ctx.translate(px,py); ctx.rotate(Math.sin(t*.25+i)*.035);
      ctx.fillStyle = `rgba(${palette[i%palette.length].join(",")},.045)`;
      ctx.strokeStyle = `rgba(${palette[i%palette.length].join(",")},.16)`;
      ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-34,-22,68,44,8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(226,232,240,.09)";
      ctx.beginPath(); ctx.moveTo(-23,-10);ctx.lineTo(20,-10);ctx.moveTo(-23,0);ctx.lineTo(10,0);ctx.moveTo(-23,10);ctx.lineTo(25,10);ctx.stroke();
      ctx.restore();
    }

    const left = Math.max(32, width*.16), right = width*.76;
    const centerY = height*.52, amp = Math.min(54,height*.23);
    const points = 26;
    for (let i=0;i<points;i++) {
      const q = i/(points-1);
      const x = left + (right-left)*q;
      const phase = q*Math.PI*4.2 - t*1.35;
      const y1 = centerY + Math.sin(phase)*amp;
      const y2 = centerY + Math.sin(phase+Math.PI)*amp;
      const depth = (Math.cos(phase)+1)/2;
      const color = palette[i%Math.max(1,Math.min(top.length||3,palette.length))];
      ctx.strokeStyle = `rgba(${color.join(",")},${.10+.24*depth})`;
      ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x,y1);ctx.lineTo(x,y2);ctx.stroke();
      for (const [y,other] of [[y1,y2],[y2,y1]]) {
        ctx.beginPath(); ctx.arc(x,y,2.4+2.2*depth,0,Math.PI*2);
        ctx.fillStyle = `rgba(${color.join(",")},${.45+.45*depth})`; ctx.fill();
        ctx.shadowBlur = 10;ctx.shadowColor=`rgba(${color.join(",")},.45)`;ctx.fill();ctx.shadowBlur=0;
      }
    }
    // Trait lumineux central qui donne un mouvement de lecture gauche -> droite.
    const sweep = ((t*.13)%1);
    const sx = left + (right-left)*sweep;
    const glow = ctx.createRadialGradient(sx,centerY,0,sx,centerY,60);
    glow.addColorStop(0,"rgba(125,211,252,.16)");glow.addColorStop(1,"rgba(125,211,252,0)");
    ctx.fillStyle=glow;ctx.fillRect(sx-60,centerY-60,120,120);
    if (!reducedMotion) window._dnaSignatureFrame = requestAnimationFrame(draw);
  }
  window._dnaSignatureFrame = requestAnimationFrame(draw);
}


function dnaTV2(source) { return window.ALM_I18N?.t?.(String(source ?? "")) || String(source ?? ""); }

function buildDnaArchetypeV2(genres) {
  const list = (Array.isArray(genres) ? genres : []).filter(Boolean);
  const normalized = list.map(genre => normalizeRecoGenreKeyV2(genre));
  const has = genre => normalized.includes(normalizeRecoGenreKeyV2(genre));
  const combos = [
    {
      match: ["Action", "Fantasy", "Adventure"],
      title: "Explorateur fantastique",
      description: "Ton ADN cherche les quêtes, la montée en puissance et les mondes où l’évasion devient un terrain de jeu permanent."
    },
    {
      match: ["Mystery", "Fantasy"],
      title: "Alchimiste de l’inconnu",
      description: "Tu sembles attiré par les univers qui cachent quelque chose : secrets, pouvoirs, zones d’ombre et révélations lentes."
    },
    {
      match: ["Romance", "Drama"],
      title: "Chroniqueur du cœur",
      description: "Tu privilégies les liens, les émotions qui montent doucement et les récits qui laissent une trace sensible."
    },
    {
      match: ["Sci-Fi", "Action"],
      title: "Pilote des futurs instables",
      description: "Ton profil aime l’élan, les idées de science-fiction et les mondes qui avancent à pleine vitesse."
    },
    {
      match: ["Comedy", "Slice of Life"],
      title: "Collectionneur de douceur",
      description: "Tu sembles aimer les respirations chaleureuses, l’humour et les petites scènes qui rendent un monde habitable."
    }
  ];
  const combo = combos.find(entry => entry.match.every(genre => has(genre)));
  if (combo) return combo;
  const first = normalized[0] || "";
  const map = {
    action: ["Éveilleur de tempêtes", "Tu penches vers l’intensité, les combats marquants et les récits qui ne restent jamais immobiles."],
    fantasy: ["Explorateur fantastique", "Tu sembles aimer les ailleurs, les systèmes de magie et les horizons où l’imaginaire ouvre toutes les portes."],
    adventure: ["Cartographe d’aventures", "Ton profil aime les départs, les trajets, les découvertes et la sensation d’un monde plus grand que soi."],
    mystery: ["Détective des mondes", "Tu apprécies les indices, les secrets et les récits qui donnent envie de regarder derrière le décor."],
    drama: ["Tisseur d’émotions", "Tu cherches des histoires qui prennent le temps d’installer une présence émotionnelle forte."],
    comedy: ["Artificier du sourire", "Ton ADN aime la légèreté, les ruptures de ton bien senties et les moments qui respirent."],
    romance: ["Gardien des sentiments", "Tu sembles aimer les dynamiques de personnages, la tension douce et les histoires de liens."],
    "slice of life": ["Gardien du quotidien", "Tu apprécies les atmosphères vivantes, les gestes simples et les mondes dans lesquels on aurait envie de rester."],
    "sci fi": ["Architecte du futur", "Tu es attiré par les mondes technologiques, les questions d’avenir et les esthétiques prospectives."],
    horror: ["Veilleur des ombres", "Tu sembles aimer les tensions, l’étrangeté et les mondes où une menace flotte en permanence."]
  };
  const picked = map[first] || ["Voyageur des mondes animés", "Ton profil mélange plusieurs sensibilités et construit une signature personnelle à partir de genres variés."];
  return { title: picked[0], description: picked[1] };
}

function selectDnaPortalEntriesV2(animes, allEntries, rawFocusGenre = "") {
  const all = Array.isArray(animes) ? animes : [];
  const focusKey = normalizeRecoGenreKeyV2(rawFocusGenre);
  const priorityGenres = [];
  const usedGenres = new Set();
  const pushGenre = genre => {
    const value = String(genre || "").trim();
    if (!value) return;
    const key = normalizeRecoGenreKeyV2(value);
    if (!key || usedGenres.has(key)) return;
    usedGenres.add(key);
    priorityGenres.push(value);
  };
  if (focusKey) {
    const matchedEntry = (Array.isArray(allEntries) ? allEntries : []).find(([genre]) => normalizeRecoGenreKeyV2(genre) === focusKey);
    pushGenre(matchedEntry?.[0] || rawFocusGenre);
  }
  (Array.isArray(allEntries) ? allEntries : []).slice(0, 6).forEach(([genre]) => pushGenre(genre));

  // Unexpected legacy scores (NaN/Infinity) make the historical sort
  // comparator non-transitive. Keep its exact behavior for such records.
  if (all.some(anime => !Number.isFinite(Number(anime?.score || 0)) || !Number.isFinite(Number(anime?.publicScore || 0)))) {
    const picks = [], usedIds = new Set();
    const rank = anime => (safeUrlV2(anime?.poster || anime?.imageUrl) !== "#" ? 10000 : 0)
      + Number(anime?.score || 0) * 100 + Number(anime?.publicScore || 0);
    for (const genre of priorityGenres) {
      const key = normalizeRecoGenreKeyV2(genre);
      const candidate = all.filter(anime => !usedIds.has(Number(anime?.id || 0)))
        .filter(anime => Array.isArray(anime?.genres) && anime.genres.some(item => normalizeRecoGenreKeyV2(item) === key))
        .sort((a,b) => rank(b) - rank(a) || String(a?.title || "").localeCompare(String(b?.title || ""), "fr"))[0];
      if (!candidate) continue;
      usedIds.add(Number(candidate?.id || 0));picks.push({anime:candidate,genre});
      if (picks.length >= 5) break;
    }
    if (picks.length < 5) all.filter(anime => !usedIds.has(Number(anime?.id || 0)))
      .sort((a,b) => rank(b) - rank(a) || String(a?.title || "").localeCompare(String(b?.title || ""), "fr"))
      .slice(0, 5 - picks.length).forEach(anime => {
        usedIds.add(Number(anime?.id || 0));
        const firstGenre = Array.isArray(anime?.genres) ? anime.genres.find(Boolean) : "";
        picks.push({anime,genre:String(firstGenre || "Bibliothèque")});
      });
    return picks.slice(0,5);
  }

  const picks = [];
  const usedIds = new Set();
  // Parsing/validating an image URL inside a full-array sort comparator can run
  // tens of thousands of times. Cache each rank for this selection only.
  const ranks = new Map();
  const genreKeys = new Map();
  const rank = anime => {
    if (ranks.has(anime)) return ranks.get(anime);
    const own = Number(anime?.score || 0);
    const pub = Number(anime?.publicScore || 0);
    const poster = safeUrlV2(anime?.poster || anime?.imageUrl) !== "#" ? 1 : 0;
    const value = poster * 10000 + own * 100 + pub;
    ranks.set(anime, value);
    return value;
  };
  const hasGenre = (anime, key) => {
    if (!genreKeys.has(anime)) genreKeys.set(anime,
      new Set(Array.isArray(anime?.genres) ? anime.genres.map(normalizeRecoGenreKeyV2) : []));
    return genreKeys.get(anime).has(key);
  };
  // Preserve the exact rank/title order and stable ties, but scan instead of
  // sorting every candidate for each of at most five posters.
  const better = (a, b) => rank(a) > rank(b) ||
    (rank(a) === rank(b) && String(a?.title || "").localeCompare(String(b?.title || ""), "fr") < 0);
  const available = anime => !usedIds.has(Number(anime?.id || 0));
  for (const genre of priorityGenres) {
    const key = normalizeRecoGenreKeyV2(genre);
    let candidate = null;
    for (const anime of all) {
      if (!available(anime) || !hasGenre(anime, key)) continue;
      if (!candidate || better(anime, candidate)) candidate = anime;
    }
    if (!candidate) continue;
    usedIds.add(Number(candidate?.id || 0));
    picks.push({ anime: candidate, genre });
    if (picks.length >= 5) break;
  }
  while (picks.length < 5) {
    let candidate = null;
    for (const anime of all) {
      if (available(anime) && (!candidate || better(anime, candidate))) candidate = anime;
    }
    if (!candidate) break;
    usedIds.add(Number(candidate?.id || 0));
    const firstGenre = Array.isArray(candidate?.genres) ? candidate.genres.find(Boolean) : "";
    picks.push({ anime: candidate, genre: String(firstGenre || "Bibliothèque") });
  }
  return picks;
}

function buildDnaPortalPostersHtmlV2(items, rawFocusGenre = "") {
  const focusKey = normalizeRecoGenreKeyV2(rawFocusGenre);
  return (Array.isArray(items) ? items : []).map(item => {
    const anime = item?.anime || {};
    const title = String(anime?.title || "Anime");
    const genre = String(item?.genre || "Bibliothèque");
    const poster = safeUrlV2(anime?.poster || anime?.imageUrl);
    const own = Number(anime?.score || 0);
    const pub = Number(anime?.publicScore || 0);
    const active = focusKey && normalizeRecoGenreKeyV2(genre) === focusKey;
    const subtitle = own > 0 ? `${dnaTV2("Note perso")} ${own}/10` : pub > 0 ? `${dnaTV2("Score public")} ${pub}` : dnaTV2("Sans note perso");
    return `<button type="button" class="dna-portal-poster${active ? " is-active" : ""}" data-genre="${escapeHtmlV2(genre)}" title="${escapeHtmlV2(dnaTV2("Afficher le genre"))} ${escapeHtmlV2(genre)} ${escapeHtmlV2(dnaTV2("dans la bibliothèque"))}">
      <div class="dna-portal-poster-frame">${poster !== "#" ? `<img src="${escapeHtmlV2(poster)}" alt="${escapeHtmlV2(title)}" loading="lazy" decoding="async">` : `<span class="dna-portal-poster-fallback" aria-hidden="true">✦</span>`}</div>
      <span class="dna-portal-poster-copy"><strong>${escapeHtmlV2(title)}</strong><em>${escapeHtmlV2(genre)} · ${escapeHtmlV2(subtitle)}</em></span>
    </button>`;
  }).join("");
}

function attachDnaNexusInteractionsV2() {
  document.querySelectorAll(".dna-focus-chip").forEach(button => {
    const genre = String(button.dataset.focusGenre || "");
    button.onmouseenter = () => updateDnaNexusFocusV2(genre);
    button.onclick = () => openLibraryWithGenreV2(genre);
  });
  ["dnaBubbleLeftRail", "dnaBubbleRightRail"].forEach(id => {
    const rail = document.getElementById(id);
    if (!rail) return;
    rail.onmouseleave = () => updateDnaNexusFocusV2("");
  });
}

function updateDnaNexusFocusV2(rawGenre = "") {
  const state = window._dnaNexusState;
  if (!state) return;
  const entries = Array.isArray(state.allEntries) ? state.allEntries : [];
  const topGenres = Array.isArray(state.topGenres) ? state.topGenres : [];
  const focusKey = normalizeRecoGenreKeyV2(rawGenre);
  const matched = entries.find(([genre]) => normalizeRecoGenreKeyV2(genre) === focusKey);
  const focusGenre = matched?.[0] || (rawGenre && !focusKey ? "" : String(rawGenre || "").trim());
  const focusGenreKey = normalizeRecoGenreKeyV2(focusGenre);
  const genreOrder = (focusGenre ? [focusGenre] : []).concat(topGenres.filter(genre => normalizeRecoGenreKeyV2(genre) !== focusGenreKey));
  const archetype = buildDnaArchetypeV2(genreOrder);
  const displayedGenres = genreOrder.slice(0, 3);

  const nameEl = document.getElementById("dnaArchetypeName");
  const genreEl = document.getElementById("dnaArchetypeGenres");
  const descEl = document.getElementById("dnaArchetypeDesc");
  const focusEl = document.getElementById("dnaNexusFocusLabel");
  if (nameEl) nameEl.textContent = dnaTV2(archetype.title);
  if (genreEl) genreEl.textContent = displayedGenres.join(" × ") || dnaTV2("Profil en construction");
  if (descEl) descEl.textContent = focusGenre
    ? `${dnaTV2(archetype.description)} ${dnaTV2("Focus actuel :")} ${focusGenre}.`
    : dnaTV2(archetype.description);
  if (focusEl) focusEl.textContent = focusGenre ? `${dnaTV2("Focus actuel :")} ${focusGenre}` : dnaTV2("Focus actuel : profil global");

  document.querySelectorAll(".dna-focus-chip").forEach(button => {
    const active = focusGenreKey && normalizeRecoGenreKeyV2(button.dataset.focusGenre || "") === focusGenreKey;
    button.classList.toggle("is-active", active);
  });

  const postersHost = document.getElementById("dnaPortalPosters");
  if (postersHost) {
    const posters = selectDnaPortalEntriesV2(state.animes, entries, focusGenre);
    postersHost.innerHTML = buildDnaPortalPostersHtmlV2(posters, focusGenre);
    postersHost.querySelectorAll(".dna-portal-poster").forEach(button => {
      const genre = String(button.dataset.genre || "");
      button.onclick = () => openLibraryWithGenreV2(genre);
    });
  }
  const captionEl = document.getElementById("dnaPortalCaption");
  if (captionEl) captionEl.textContent = focusGenre
    ? `${dnaTV2("Le portail s’aligne sur")} ${focusGenre}${dnaTV2(". Clique une carte pour ouvrir la bibliothèque sur ce genre.")}`
    : dnaTV2("Le portail reflète tes mondes dominants. Survole une bulle ou un sceau pour changer la focale.");

  const leftRail = document.getElementById("dnaBubbleLeftRail");
  const rightRail = document.getElementById("dnaBubbleRightRail");
  leftRail?.setAttribute("data-focus-genre", focusGenreKey || "global");
  rightRail?.setAttribute("data-focus-genre", focusGenreKey || "global");
}

function renderDnaCanvasRailsV2(animes, allEntries) {
  const leftRail = document.getElementById("dnaBubbleLeftRail");
  const rightRail = document.getElementById("dnaBubbleRightRail");
  if (!leftRail || !rightRail) return;

  // Les deux visuels sont issus de la meme illustration Yin/Yang. Le centre
  // reste reserve aux bulles Anime DNA : si l'on rapproche les deux panneaux,
  // les courbes lumineuses et la composition se reconnectent visuellement.
  leftRail.innerHTML = `
    <div class="dna-yinyang-cat-card dna-yinyang-cat-card-left" aria-hidden="true">
      <img src="/assets/dna/yin-cat-white-left.png" alt="" loading="lazy" decoding="async">
      <span class="dna-yinyang-orb orb-a"></span>
      <span class="dna-yinyang-orb orb-b"></span>
    </div>`;

  rightRail.innerHTML = `
    <div class="dna-yinyang-cat-card dna-yinyang-cat-card-right" aria-hidden="true">
      <img src="/assets/dna/yang-cat-black-right.png" alt="" loading="lazy" decoding="async">
      <span class="dna-yinyang-orb orb-a"></span>
      <span class="dna-yinyang-orb orb-b"></span>
    </div>`;

  window._dnaNexusState = null;
}


function dnaPercent(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function buildDnaRadarAxesV2(animes) {
  // Le module dédié utilise une échelle absolue et compte chaque anime une
  // seule fois par famille. Surtout, les axes Action/Fantasy/Aventure suivent
  // exactement les mêmes genres que les bulles et le Top genres : 116 fiches
  // Adventure donnent donc 116 sur l’axe Aventure, sans addition cachée.
  if (window.ALM_DNA_RADAR?.buildAxes) return window.ALM_DNA_RADAR.buildAxes(animes);

  const total = Array.isArray(animes) ? animes.length : 0;
  const families = [
    ["Action", "Action"], ["Fantasy", "Fantasy"], ["Aventure", "Adventure"],
    ["Émotion", "Drama"], ["Mystère", "Mystery"], ["Humour", "Comedy"]
  ];
  return families.map(([label, genre]) => {
    const count = (animes || []).filter(anime => (anime?.genres || []).some(item => normalizeRecoGenreKeyV2(item) === normalizeRecoGenreKeyV2(genre))).length;
    const percent = total ? Math.round((count / total) * 100) : 0;
    return { label, primaryGenre: genre, count, percent, value: percent, total, description: `Animés possédant le genre ${genre}.` };
  });
}

function drawDnaRadar(canvas, axes) {
  if (!canvas || !axes?.length) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width = canvas.clientWidth ? Math.floor(canvas.clientWidth * devicePixelRatio) : 360;
  const H = canvas.height = canvas.clientHeight ? Math.floor(canvas.clientHeight * devicePixelRatio) : 260;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const w = W / devicePixelRatio, h = H / devicePixelRatio;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 5, R = Math.min(w, h) * 0.30;

  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++) {
    const r = R * ring / 4;
    ctx.beginPath();
    axes.forEach((_, i) => {
      const a = -Math.PI / 2 + (Math.PI * 2 * i / axes.length);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(148,163,184,.18)";
    ctx.stroke();

    ctx.fillStyle = "rgba(148,163,184,.48)";
    ctx.font = "600 8px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${ring * 25}%`, cx + 4, cy - r + 1);
  }

  axes.forEach((axis, i) => {
    const a = -Math.PI / 2 + (Math.PI * 2 * i / axes.length);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.strokeStyle = "rgba(148,163,184,.16)";
    ctx.stroke();

    ctx.fillStyle = "rgba(226,232,240,.94)";
    ctx.font = "700 11px Inter, sans-serif";
    ctx.textAlign = Math.cos(a) > .3 ? "left" : Math.cos(a) < -.3 ? "right" : "center";
    ctx.textBaseline = Math.sin(a) > .3 ? "top" : Math.sin(a) < -.3 ? "bottom" : "middle";
    ctx.fillText(axis.label, cx + Math.cos(a) * (R + 20), cy + Math.sin(a) * (R + 20));
  });

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  grad.addColorStop(0, "rgba(139,92,246,.62)");
  grad.addColorStop(1, "rgba(56,189,248,.22)");
  ctx.beginPath();
  axes.forEach((axis, i) => {
    const a = -Math.PI / 2 + (Math.PI * 2 * i / axes.length);
    const r = R * Math.max(0, Math.min(100, axis.value)) / 100;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(125,211,252,.9)";
  ctx.lineWidth = 2;
  ctx.stroke();

  axes.forEach((axis, i) => {
    const a = -Math.PI / 2 + (Math.PI * 2 * i / axes.length);
    const r = R * Math.max(0, Math.min(100, axis.value)) / 100;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.fill();
  });
}

function renderDnaDashboard(animes, entries) {
  const side = document.getElementById("dnaSideStats");
  const radar = document.getElementById("dnaRadarCanvas");
  if (!side || !radar) return;

  const total = animes.length || 1;
  const maxGenre = Math.max(...entries.map(([, data]) => data.count || 0), 1);
  const completed = animes.filter(anime => anime.status === "Completed").length;
  const watching = animes.filter(anime => anime.status === "Watching").length;
  const scored = animes.map(anime => Number(anime.score || 0)).filter(Boolean);
  const avgScore = scored.length ? Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length * 10) / 10 : 0;
  const episodeTotal = animes.reduce((sum, anime) => sum + (Number(anime.episodesSeen || 0) || 0), 0);
  const profileScore = Math.max(0, Math.min(100, Math.round((completed / total) * 100)));

  const years = {};
  for (const anime of animes) {
    const match = String(anime.startDate || anime.year || "").match(/(?:^|\D)(19\d{2}|20\d{2}|21\d{2})(?:\D|$)/);
    const year = match?.[1] || "";
    if (year) years[year] = (years[year] || 0) + 1;
  }
  const peakYear = Object.entries(years).sort((a, b) => b[1] - a[1])[0];

  const studios = Object.create(null);
  for (const anime of animes) {
    const values = (Array.isArray(anime.studios) ? anime.studios : [anime.studio]).filter(Boolean);
    for (const studio of values) studios[studio] = (studios[studio] || 0) + 1;
  }
  const topStudio = Object.entries(studios).sort((a, b) => b[1] - a[1])[0];

  const axes = buildDnaRadarAxesV2(animes);
  drawDnaRadar(radar, axes);
  radar.setAttribute("aria-label", `Radar Anime DNA. ${axes.map(axis => `${axis.label} : ${axis.count} animés, ${axis.percent}% de la bibliothèque`).join(". ")}.`);

  const radarLegend = document.getElementById("dnaRadarLegend");
  if (radarLegend) {
    radarLegend.innerHTML = axes.map(axis => {
      const percent = Number(axis.percent ?? axis.value ?? 0);
      const axisTotal = Number(axis.total || total);
      return `<div class="dna-radar-legend-item" style="--dna-radar-percent:${Math.max(0, Math.min(100, percent))}%" title="${escapeHtmlV2(axis.description || "")} ${escapeHtmlV2(axis.count)} animé${axis.count > 1 ? "s" : ""} sur ${escapeHtmlV2(axisTotal)}.">
        <span>${escapeHtmlV2(axis.label)}</span>
        <strong>${escapeHtmlV2(axis.count)} / ${escapeHtmlV2(axisTotal)} animés</strong>
        <em>${escapeHtmlV2(percent)}%</em><i aria-hidden="true"></i>
      </div>`;
    }).join("");
  }
  const radarHelp = document.getElementById("dnaRadarHelp");
  if (radarHelp) radarHelp.textContent = "Échelle absolue : chaque anime compte une seule fois par axe. Action, Fantasy et Aventure reprennent exactement les compteurs de genres de la bibliothèque.";

  const topGenres = entries.slice(0, 6).map(([genre, data]) => `
    <button type="button" class="dna-mini-bar" data-dna-genre="${escapeHtmlV2(genre)}" title="Afficher ${escapeHtmlV2(genre)} dans la bibliothèque">
      <span>${escapeHtmlV2(genre)}</span>
      <strong>${data.count}</strong>
      <i style="width:${dnaPercent(data.count, maxGenre)}%"></i>
    </button>`).join("");

  side.innerHTML = `
    <div class="dna-side-card primary">
      <div class="dna-profile-score-wrap">
        <div class="dna-profile-score-copy">
          <span>Bibliothèque terminée</span>
          <strong>${profileScore}%</strong>
          <em>${completed}/${total} terminés · ${watching} en cours</em>
        </div>
        <div class="dna-profile-ring" style="--dna-score:${profileScore}" aria-label="${profileScore}% de la bibliothèque terminée"><span>${profileScore}</span></div>
      </div>
    </div>
    <div class="dna-side-grid">
      <div><span>Épisodes vus</span><strong>${episodeTotal}</strong></div>
      <div><span>Note moyenne</span><strong>${avgScore ? avgScore + "/10" : "—"}</strong></div>
      <div><span>Année pic</span><strong>${peakYear ? peakYear[0] : "—"}</strong></div>
      <div><span>Studio fréquent</span><strong title="${topStudio ? escapeHtmlV2(topStudio[0]) : ""}">${topStudio ? escapeHtmlV2(topStudio[0]) : "—"}</strong></div>
    </div>
    <div class="dna-side-card dna-top-genres-card"><span>Top genres</span>${topGenres || "<em>Pas assez de données</em>"}</div>
  `;
  side.querySelectorAll("[data-dna-genre]").forEach(button => {
    button.addEventListener("click", () => openLibraryWithGenreV2(button.dataset.dnaGenre));
  });
}

function renderDnaInsights(animes, genreMap) {
  const el = document.getElementById("dnaInsights");
  if (!el) return;

  const entries = Object.entries(genreMap || {}).map(([genre, data]) => {
    const avg = data.scored ? data.sum / data.scored : 0;
    return {
      genre,
      count: data.count || 0,
      avg: Math.round(avg * 10) / 10,
      scored: data.scored || 0,
      titles: data.titles || []
    };
  });
  const scored = animes.map(anime => ({ ...anime, n: Number(anime.score || 0) })).filter(anime => anime.n > 0);
  const dominant = entries.slice().sort((a, b) => b.count - a.count)[0];
  const strongest = entries.filter(item => item.scored >= 2).sort((a, b) => b.avg - a.avg)[0];
  const hiddenGemGenre = entries
    .filter(item => item.count <= Math.max(3, (dominant?.count || 0) * .35) && item.avg >= 7.5)
    .sort((a, b) => b.avg - a.avg)[0];
  const topAnime = scored.slice().sort((a, b) => b.n - a.n)[0];
  const missingScores = animes.filter(anime => !Number(anime.score || 0)).length;

  const cards = [
    {
      icon: "🧬",
      title: "Profil dominant",
      text: dominant ? `${dominant.genre} — ${dominant.count} animé(s)` : "Pas assez de genres",
      help: "Le genre le plus présent dans ta bibliothèque.",
      genre: dominant?.genre || ""
    },
    {
      icon: "💎",
      title: "Zone forte",
      text: strongest ? `${strongest.genre} — moyenne personnelle ${strongest.avg}/10` : "Ajoute au moins deux notes dans un même genre pour l’identifier",
      help: "Le genre ayant ta meilleure moyenne personnelle, avec au moins deux animés notés.",
      genre: strongest?.genre || ""
    },
    {
      icon: "🧭",
      title: "À explorer",
      text: hiddenGemGenre ? `${hiddenGemGenre.genre} te plaît mais reste peu présent` : "Pas encore assez de notes pour proposer une piste fiable",
      help: "Un genre peu présent mais auquel tu attribues de bonnes notes.",
      genre: hiddenGemGenre?.genre || ""
    },
    {
      icon: "🧪",
      title: "À affiner",
      text: missingScores ? `${missingScores} animé(s) sans note : le profil gagnera en précision` : "Toutes les notes utiles sont renseignées",
      help: "Les notes manquantes qui empêchent Anime DNA de mesurer précisément tes goûts."
    },
    {
      icon: "🏆",
      title: "Référence perso",
      text: topAnime ? `${topAnime.title} — ${topAnime.n}/10` : "Aucune note personnelle",
      help: "Ton animé le mieux noté dans ta bibliothèque."
    },
    {
      icon: "👆",
      title: "Astuce",
      text: "Clique une bulle pour ouvrir la bibliothèque avec ce genre déjà filtré",
      help: "Les bulles secondaires regroupées restent disponibles dans le filtre Genre."
    }
  ];

  el.innerHTML = cards.map(card => `
    <${card.genre ? "button" : "div"} ${card.genre ? `type="button" data-dna-genre="${escapeHtmlV2(card.genre)}"` : ""} class="dna-insight-card${card.genre ? " is-clickable" : ""}" title="${escapeHtmlV2(card.help)}">
      <div class="dna-insight-icon">${card.icon}</div>
      <div>
        <strong>${escapeHtmlV2(card.title)} <span class="dna-help-dot" aria-hidden="true">?</span></strong>
        <span>${escapeHtmlV2(card.text)}</span>
        <small>${escapeHtmlV2(card.help)}</small>
      </div>
    </${card.genre ? "button" : "div"}>
  `).join("");
  el.querySelectorAll("[data-dna-genre]").forEach(button => {
    button.addEventListener("click", () => openLibraryWithGenreV2(button.dataset.dnaGenre));
  });
}

// ─── ACTUALITÉS ────────────────────────────────────────────
let _newsCache = null;
let _newsCatFilter = "all";
const NEWS_LANG_STORAGE_KEY_V2 = "alm-news-language";
const NEWS_LANG_META_V2 = Object.freeze({
  fr:{flag:"🇫🇷",label:"Français"}, en:{flag:"🇬🇧",label:"English"}, ja:{flag:"🇯🇵",label:"日本語"},
  es:{flag:"🇪🇸",label:"Español"}, de:{flag:"🇩🇪",label:"Deutsch"}, "pt-BR":{flag:"🇧🇷",label:"Português (Brasil)"},
  "zh-CN":{flag:"🇨🇳",label:"中文（简体）"}
});
function normalizeNewsLanguageV2(value){
  const raw=String(value||"").trim(); const low=raw.toLowerCase();
  if(low==="pt"||low==="pt-br") return "pt-BR";
  if(low==="zh"||low==="zh-cn"||low==="zh-hans") return "zh-CN";
  return ["fr","en","ja","es","de"].includes(low)?low:"all";
}
function interfaceNewsLanguageV2(){return normalizeNewsLanguageV2(window.ALM_DESIGN?.language?.()||document.documentElement?.lang||'fr');}
function readNewsLanguageV2(){try{const lang=interfaceNewsLanguageV2();if(localStorage.getItem('alm-news-interface-language')!==lang){localStorage.setItem('alm-news-interface-language',lang);localStorage.setItem(NEWS_LANG_STORAGE_KEY_V2,lang);return lang;}return normalizeNewsLanguageV2(localStorage.getItem(NEWS_LANG_STORAGE_KEY_V2)||lang);}catch{return interfaceNewsLanguageV2();}}
window.addEventListener('alm:language-changed',()=>{_newsLang=interfaceNewsLanguageV2();writeNewsLanguageV2(_newsLang);try{localStorage.setItem('alm-news-interface-language',_newsLang);}catch{}document.querySelectorAll('.news-lang-btn').forEach(b=>b.classList.toggle('active',normalizeNewsLanguageV2(b.dataset.lang)===_newsLang));if(!document.getElementById('newsV2Page')?.classList.contains('hidden'))loadNews();});
function writeNewsLanguageV2(value){ try{localStorage.setItem(NEWS_LANG_STORAGE_KEY_V2,normalizeNewsLanguageV2(value));}catch{} }
function newsLanguageMetaV2(value){ return NEWS_LANG_META_V2[normalizeNewsLanguageV2(value)]||{flag:"🌍",label:(window.ALM_I18N?.t?.("Toutes les langues")||"Toutes les langues")}; }
function isDeprecatedNewsAggregatorV2(item){
  const source=String(item?.source||"");
  return /^(?:Google News|Google Noticias|Google Notícias|Metadata locale$)/i.test(source);
}
function newsDisplayImageV2(item){
  if(!item||isDeprecatedNewsAggregatorV2(item)) return "";
  const url=String(item.imageUrl||"").trim();
  if(!url) return "";
  if(/news\.google\.com|googleusercontent\.com/i.test(url) && /google/i.test(String(item.source||""))) return "";
  return item.newsKey && /^https?:\/\//i.test(url) ? "/api/v2/news/image?key=" + encodeURIComponent(item.newsKey) : url;
}
let _newsLang = readNewsLanguageV2();
let _newsSelectedKey = "";
let _newsLastRenderedItems = [];
let _newsDateFrom = "";
let _newsDateTo = "";
let _newsMeta = {};
let _newsDisplayLimit = 31;
let _newsLoadController = null;
let _newsRequestSerial = 0;
const _newsImageAttempted = new Map();
let _newsImageHydrationRunning = false;
let _newsImageHydrationQueued=null;

const NEWS_V2_COLORS = {
  nouveaux: "#34d399",
  saisons: "#38bdf8",
  films: "#a855f7",
  "licences-fr": "#fbbf24",
  manga: "#f97316",
  jeux: "#ef4444",
  divers: "#aeb8d1"
};
const NEWS_V2_LABELS = {
  nouveaux: "🆕 Nouveau",
  saisons: "📺 Suite",
  films: "🎬 Film",
  "licences-fr": "🇫🇷 Licence",
  manga: "📖 Manga",
  jeux: "🎮 Jeu",
  divers: "📰 Actu"
};

function newsKeyV2(item, index = 0) {
  return String(item?.newsKey || item?.id || item?.articleUrl || item?.title || index);
}
function newsDateV2(value, options = { day: "2-digit", month: "long", year: "numeric" }) {
  const raw = String(value || "");
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw;
  const t = Date.parse(normalized);
  if (!Number.isFinite(t)) return "";
  try { return new Date(t).toLocaleDateString(document.documentElement.lang || "fr-FR", options); }
  catch { return ""; }
}
function newsDateLabelV2(item, options = { day: "2-digit", month: "long", year: "numeric" }) {
  return newsDateV2(item?.date || item?.publishedAt || "", options) || "Date inconnue";
}
function newsRetentionLabelV2(days) {
  const value = Number(days);
  if (value === 0) return "tout l’historique";
  if (value === 365) return "1 an";
  if (value === 730) return "2 ans";
  if (value === 180) return "6 mois";
  return `${value || 365} jours`;
}
function validateNewsDateRangeV2() {
  const fromInput = document.getElementById("newsDateFrom");
  const toInput = document.getElementById("newsDateTo");
  const from = fromInput?.value || "";
  const to = toInput?.value || "";
  const invalid = Boolean(from && to && from > to);
  const message = invalid ? "La date de début doit précéder la date de fin." : "";
  fromInput?.setCustomValidity(message);
  toInput?.setCustomValidity(message);
  if (invalid) {
    (toInput || fromInput)?.reportValidity?.();
    return false;
  }
  return true;
}
function newsLocalIsoDayV2(date = new Date()) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function buildNewsQueryParamsV2(force = false, offset = 0, limit = 1000) {
  const params = new URLSearchParams();
  if (force) params.set("refresh", "1");
  // La page charge un historique maître non filtré puis applique catégorie,
  // langue et calendrier localement. Les filtres répondent ainsi immédiatement
  // et ne peuvent plus être désynchronisés par une requête réseau précédente.
  params.set("limit", String(limit));
  if (offset > 0) params.set("offset", String(offset));
  return params;
}
function setNewsQuickRangeV2(value) {
  const preset = String(value || "all");
  const fromInput = document.getElementById("newsDateFrom");
  const toInput = document.getElementById("newsDateTo");
  if (preset === "all" || preset === "custom") {
    if (preset === "all") {
      _newsDateFrom = "";
      _newsDateTo = "";
      if (fromInput) fromInput.value = "";
      if (toInput) toInput.value = "";
    }
    return;
  }
  const days = Number(preset);
  if (!Number.isFinite(days) || days < 1) return;
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - Math.max(0, Math.floor(days) - 1));
  _newsDateFrom = newsLocalIsoDayV2(fromDate);
  _newsDateTo = newsLocalIsoDayV2(toDate);
  if (fromInput) fromInput.value = _newsDateFrom;
  if (toInput) toInput.value = _newsDateTo;
}
function syncNewsHistoryMetaV2(data = {}) {
  _newsMeta = { ..._newsMeta, ...data };
  const retention = Number(data.retentionDays ?? _newsMeta.retentionDays ?? 365);
  const select = document.getElementById("newsHistoryRetention");
  if (select && [...select.options].some(option => Number(option.value) === retention)) select.value = String(retention);

  const fromInput = document.getElementById("newsDateFrom");
  const toInput = document.getElementById("newsDateTo");
  const today = newsLocalIsoDayV2();
  if (fromInput) {
    fromInput.max = today;
    fromInput.dataset.availableFrom = data.availableFrom || _newsMeta.availableFrom || "";
  }
  if (toInput) {
    toInput.max = today;
    toInput.dataset.availableFrom = data.availableFrom || _newsMeta.availableFrom || "";
  }

  const status = document.getElementById("newsHistoryStatus");
  if (!status) return;
  const total = Number(data.historyTotal ?? data.total ?? _newsMeta.historyTotal ?? 0);
  const resultTotal = Number(data.total ?? _newsMeta.total ?? total);
  const from = data.availableFrom || _newsMeta.availableFrom || "";
  const to = data.availableTo || _newsMeta.availableTo || "";
  const undated = Number(data.undatedTotal ?? _newsMeta.undatedTotal ?? 0);
  const range = from && to ? ` · disponibles du ${newsDateV2(from)} au ${newsDateV2(to)}` : "";
  const unknown = undated ? ` · ${undated} sans date fiable` : "";
  const localFilteredTotal = Array.isArray(_newsCache) ? filteredNewsV2().length : resultTotal;
  const periodResult = (_newsDateFrom || _newsDateTo)
    ? ` · ${localFilteredTotal} résultat${localFilteredTotal > 1 ? "s" : ""} sur la période`
    : "";
  const loadedCount = Array.isArray(_newsCache) ? _newsCache.length : (Array.isArray(data.items) ? data.items.length : 0);
  const truncated = _newsMeta.truncated ? ` · ${loadedCount}/${resultTotal} chargées` : "";
  status.textContent = `${total} actualité${total > 1 ? "s" : ""} conservée${total > 1 ? "s" : ""} · ${newsRetentionLabelV2(retention)}${range}${unknown}${periodResult}${truncated}`;
}
function newsTruncateV2(value, size) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > size ? text.slice(0, Math.max(0, size - 1)).trimEnd() + "…" : text;
}
function newsArticleUrlV2(item) {
  const url = String(item?.articleUrl || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}
async function hydrateVisibleNewsImagesV2(items, force = false) {
  if(!Array.isArray(_newsCache))return;
  if(_newsImageHydrationRunning){_newsImageHydrationQueued={items,force};return;}
  const visibleItems = Array.isArray(items) ? items : [];
  const batchSize = 4;
  const maxBatches = 9;
  const processedKeys = new Set();
  let changed = false;

  _newsImageHydrationRunning = true;
  try {
    for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
      const targets = visibleItems
        .filter(item => !item?.imageUrl && newsArticleUrlV2(item))
        .filter(item => !processedKeys.has(newsKeyV2(item)))
        .filter(item => force || !_newsImageAttempted.has(newsKeyV2(item)) || Date.now()-_newsImageAttempted.get(newsKeyV2(item))>60000)
        .slice(0, batchSize);
      if (!targets.length) break;

      targets.forEach(item => {
        const key = newsKeyV2(item);
        processedKeys.add(key);
        _newsImageAttempted.set(key,Date.now());
      });
      let response;
      try {
        response = await fetch("/api/v2/news/images/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            force,
            items: targets.map(item => ({
              newsKey: item.newsKey || "",
              id: item.id || "",
              title: item.title || "",
              articleUrl: item.articleUrl || "",
              source: item.source || "",
              lang: item.lang || "",
              category: item.category || "divers",
              date: item.date || item.publishedAt || "",
              discoveredAt: item.discoveredAt || "",
              failedImageUrl:item._failedImageUrl||""
            }))
          })
        });
      } catch (error) {
        targets.forEach(item => _newsImageAttempted.delete(newsKeyV2(item)));
        throw error;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.error) {
        targets.forEach(item => _newsImageAttempted.delete(newsKeyV2(item)));
        throw new Error(data?.error || `Erreur HTTP ${response.status}`);
      }

      const resolved = new Map();
      for (const item of Array.isArray(data.items) ? data.items : []) {
        const key = String(item.newsKey || item.articleUrl || "");
        if (key && item.imageUrl) resolved.set(key, item.imageUrl);
        if (item.articleUrl && item.imageUrl) resolved.set(String(item.articleUrl), item.imageUrl);
      }
      let batchChanged = false;
      for (const item of _newsCache) {
        if (item.imageUrl) continue;
        const imageUrl = resolved.get(newsKeyV2(item)) || resolved.get(String(item.articleUrl || ""));
        if (!imageUrl) continue;
        item.imageUrl = imageUrl;
        batchChanged = true;
        changed = true;
      }
      if (batchChanged && !document.getElementById("newsV2Page")?.classList.contains("hidden")) {
        requestAnimationFrame(() => renderNewsV2());
      }
    }
  } catch (error) {
    console.warn("Vignettes d’actualités non récupérées :", error.message || error);
  } finally {
    _newsImageHydrationRunning = false;
    if(_newsImageHydrationQueued){const q=_newsImageHydrationQueued;_newsImageHydrationQueued=null;setTimeout(()=>hydrateVisibleNewsImagesV2(q.items,q.force),0);}
    if (changed && !document.getElementById("newsV2Page")?.classList.contains("hidden")) {
      requestAnimationFrame(() => renderNewsV2());
    }
  }
}

function filteredNewsV2() {
  // Beta 25: anciens résultats Google News de la Beta 24 restent parfois dans
  // l'historique SQLite. On les masque au profit des nouveaux flux directs afin
  // d'éviter les énormes logos Google et les redirections sans article lisible.
  let items = Array.isArray(_newsCache) ? [..._newsCache].filter(n => !isDeprecatedNewsAggregatorV2(n)) : [];
  if (_newsCatFilter === "france" || _newsCatFilter === "licences-fr") {
    items = items.filter(n => n.lang === "fr" || n.category === "licences-fr");
  } else if (_newsCatFilter !== "all") {
    items = items.filter(n => n.category === _newsCatFilter);
  }
  if (_newsLang !== "all") items = items.filter(n => n.lang === _newsLang);
  if (_newsDateFrom || _newsDateTo) {
    items = items.filter(n => {
      const day = String(n.date || n.publishedAt || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
      if (_newsDateFrom && day < _newsDateFrom) return false;
      if (_newsDateTo && day > _newsDateTo) return false;
      return true;
    });
  }
  return items.filter(n => n && String(n.title || "").trim());
}
function selectedNewsIndexV2(items) {
  if (!items.length) return -1;
  const found = items.findIndex((n, i) => newsKeyV2(n, i) === _newsSelectedKey);
  if (found >= 0) return found;
  _newsSelectedKey = newsKeyV2(items[0], 0);
  return 0;
}
function ensureNewsArticleModalV2() {
  let modal = document.getElementById("newsArticleModalV2");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "newsArticleModalV2";
  modal.className = "news-reader-modal hidden";
  modal.innerHTML = `
    <div class="news-reader-backdrop" data-news-modal-close></div>
    <section class="news-reader-modal-box" role="dialog" aria-modal="true" aria-labelledby="newsReaderModalTitle">
      <header class="news-reader-modal-head">
        <div>
          <p id="newsReaderModalSource" class="news-reader-modal-source"></p>
          <h2 id="newsReaderModalTitle"></h2>
        </div>
        <button type="button" class="news-reader-modal-close" data-news-modal-close>Fermer</button>
      </header>
      <div id="newsReaderModalBody" class="news-reader-modal-body"></div>
    </section>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", event => {
    if (event.target?.hasAttribute("data-news-modal-close")) modal.classList.add("hidden");
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") document.getElementById("newsArticleModalV2")?.classList.add("hidden");
  });
  return modal;
}
function cleanNewsArticleBodyV2(text, item = null, limit = 5200) {
  let clean = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  // Plusieurs flux préfixent le texte par toute la navigation du site.
  // Si le titre réapparaît dans les 1200 premiers caractères, on coupe le
  // chrome du site et on démarre juste après le titre de l'article.
  const title = String(item?.title || "").replace(/\s+/g, " ").trim();
  if (title) {
    const haystack = clean.slice(0, 1200).toLocaleLowerCase("fr");
    const needle = title.toLocaleLowerCase("fr");
    const titleAt = haystack.indexOf(needle);
    if (titleAt >= 0) clean = clean.slice(titleAt + title.length).trim();
  }

  clean = clean
    .replace(/^(?:World\s*[•·]\s*){1,2}(?:USA\s*&\s*Canada|Australia\s*&\s*New-Zealand|India|Southeast Asia|Français|Views|New Anime Encyclopedia|Forum|My ANN|About|Login or Register|News)(?:\s*[•·]?\s*)*/i, "")
    .replace(/^(?:My ANN\s+About\s+Login or Register\s+News\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return newsTruncateV2(clean, limit);
}
function newsArticleTextMarkupV2(text, limit = 3200, item = null) {
  const clean = cleanNewsArticleBodyV2(text, item, limit);
  if (!clean) return `<p>Aucun texte disponible.</p>`;

  // Le fetch texte brut efface souvent la mise en page de l'éditeur. On
  // reconstruit des paragraphes courts à partir des phrases sans modifier ni
  // résumer leur contenu. Une ou deux phrases, ~340 caractères maximum par bloc.
  const sentences = clean
    .split(/(?<=[.!?…])\s+/u)
    .map(value => value.trim())
    .filter(Boolean)
    .flatMap(value => {
      if (value.length <= 460) return [value];
      const chunks = value.match(/.{1,330}(?:\s+|$)/g);
      return Array.isArray(chunks) && chunks.length ? chunks.map(chunk => chunk.trim()).filter(Boolean) : [value];
    });
  const paragraphs = [];
  let current = [];
  let currentLength = 0;
  for (const sentence of sentences.length ? sentences : [clean]) {
    const nextLength = currentLength + (current.length ? 1 : 0) + sentence.length;
    if (current.length && (current.length >= 2 || nextLength > 340)) {
      paragraphs.push(current.join(" "));
      current = [];
      currentLength = 0;
    }
    current.push(sentence);
    currentLength += sentence.length + 1;
  }
  if (current.length) paragraphs.push(current.join(" "));

  return paragraphs.map((part, index) => {
    const bullets = part.split(/\s+[•·]\s+/).map(value => value.trim()).filter(Boolean);
    if (bullets.length >= 3) {
      const intro = bullets.shift();
      return `${intro ? `<p${index === 0 ? ' class="news-reader-lead"' : ""}>${escapeHtmlV2(intro)}</p>` : ""}<ul class="news-reader-bullets">${bullets.map(value => `<li>${escapeHtmlV2(value)}</li>`).join("")}</ul>`;
    }
    const creditLike = /^(?:image|photo|illustration|source|via|©|copyright)\b/i.test(part);
    const cls = creditLike ? "news-reader-credit" : (index === 0 ? "news-reader-lead" : "");
    return `<p${cls ? ` class="${cls}"` : ""}>${escapeHtmlV2(part)}</p>`;
  }).join("");
}

function renderNewsSideV2(item, index) {
  if (!item) {
    return `<div class="news-preview-empty">Sélectionne une actualité pour l'afficher ici.</div>`;
  }
  const cat = item.category || "divers";
  const color = NEWS_V2_COLORS[cat] || NEWS_V2_COLORS.divers;
  const date = newsDateLabelV2(item);
  const url = newsArticleUrlV2(item);
  const summary = newsTruncateV2(item.summary || "", 1400) || "Aucun résumé disponible pour cette source.";
  return `
    <article class="news-preview-card">
      ${newsDisplayImageV2(item) ? `<div class="news-preview-img"><img src="${safeUrlV2(newsDisplayImageV2(item))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-image-fallback="true"></div>` : ""}
      <div class="news-preview-meta">
        <span class="news-card-v3-cat" style="background:${color}22;color:${color};border:1px solid ${color}44">${NEWS_V2_LABELS[cat] || "📰 Actu"}</span>
        <span>${escapeHtmlV2(`${newsLanguageMetaV2(item.lang).flag} ${newsLanguageMetaV2(item.lang).label}`)}</span>
        <span>${escapeHtmlV2(date)}</span>
      </div>
      <h3>${escapeHtmlV2(item.title || "Actualité")}</h3>
      <p class="news-preview-source">${escapeHtmlV2(item.source || "Source inconnue")}</p>
      <div class="news-preview-summary">${newsArticleTextMarkupV2(summary, 1400, item)}</div>
      ${newsArticleUrlV2(item) ? `<div id="newsReaderFullText" class="news-preview-fulltext" data-news-key="${escapeHtmlV2(newsKeyV2(item, index))}"><span>Chargement du texte de l'article…</span></div>` : ""}
      <div class="news-preview-actions">
        <button type="button" class="news-preview-btn" data-news-modal-index="${index}">Agrandir l'article</button>
        ${url ? `<a class="news-preview-btn secondary" href="${safeUrlV2(url)}" target="_blank" rel="noopener">Ouvrir la source ↗</a>` : ""}
      </div>
      <p class="news-preview-note">L'affichage intégré utilise les informations RSS disponibles. Le bouton source ouvre l'article complet chez l'éditeur.</p>
    </article>`;
}
async function loadNewsArticleTextV2(item, index) {
  const url = newsArticleUrlV2(item);
  const key = newsKeyV2(item, index);
  const target = document.getElementById("newsReaderFullText");
  if (!url || !target) return;
  if (item.fullText) {
    target.innerHTML = newsArticleTextMarkupV2(item.fullText, 2600, item);
    return;
  }
  try {
    const response = await fetch(`/api/v2/news/article?url=${encodeURIComponent(url)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.text) throw new Error(data.error || "Article indisponible");
    item.fullText = data.text;
    let imageDiscovered = false;
    if (data.imageUrl && !item.imageUrl) {
      item.imageUrl = data.imageUrl;
      _newsImageAttempted.set(key,Date.now());
      const cacheIndex = Array.isArray(_newsCache) ? _newsCache.findIndex((n, i) => newsKeyV2(n, i) === key) : -1;
      if (cacheIndex >= 0) _newsCache[cacheIndex].imageUrl = data.imageUrl;
      imageDiscovered = true;
    }
    if (_newsSelectedKey === key && document.getElementById("newsReaderFullText") === target) {
      target.innerHTML = newsArticleTextMarkupV2(data.text, 2600, item);
    }
    if (imageDiscovered && !document.getElementById("newsV2Page")?.classList.contains("hidden")) {
      requestAnimationFrame(() => renderNewsV2());
    }
  } catch (error) {
    if (_newsSelectedKey === key && document.getElementById("newsReaderFullText") === target) {
      target.innerHTML = `<span>Résumé RSS affiché. Texte complet non récupéré : ${escapeHtmlV2(error.message || "source protégée")}</span>`;
    }
  }
}
function openNewsArticleModalV2(item) {
  if (!item) return;
  const modal = ensureNewsArticleModalV2();
  const title = modal.querySelector("#newsReaderModalTitle");
  const source = modal.querySelector("#newsReaderModalSource");
  const body = modal.querySelector("#newsReaderModalBody");
  const url = newsArticleUrlV2(item);
  const cat = item.category || "divers";
  const color = NEWS_V2_COLORS[cat] || NEWS_V2_COLORS.divers;
  if (title) title.textContent = item.title || "Actualité";
  if (source) source.textContent = `${item.source || "Source"} · ${newsDateLabelV2(item)}`;
  if (body) {
    body.innerHTML = `
      <div class="news-reader-modal-summary news-reader-modal-summary-wide">
        ${newsDisplayImageV2(item) ? `<img src="${safeUrlV2(newsDisplayImageV2(item))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-image-fallback="true">` : ""}
        <span class="news-card-v3-cat" style="background:${color}22;color:${color};border:1px solid ${color}44">${NEWS_V2_LABELS[cat] || "📰 Actu"}</span>
        <div class="news-reader-text">${newsArticleTextMarkupV2(item.fullText || item.summary || "Aucun résumé disponible.", 7000, item)}</div>
        <div class="news-preview-actions">
          ${url ? `<a class="news-preview-btn secondary" href="${safeUrlV2(url)}" target="_blank" rel="noopener">Ouvrir la source originale ↗</a>` : ""}
        </div>
        <small>Fenêtre de lecture interne : l'app affiche le texte récupéré/RSS. Le bouton source ouvre l'article complet chez l'éditeur.</small>
      </div>`;
  }
  modal.classList.remove("hidden");
  const box = modal.querySelector(".news-reader-modal-box");
  const modalBody = modal.querySelector(".news-reader-modal-body");
  if (box && typeof box.scrollTo === "function") box.scrollTo({ top: 0, behavior: "auto" });
  if (modalBody && typeof modalBody.scrollTo === "function") modalBody.scrollTo({ top: 0, behavior: "auto" });
  modal.scrollTop = 0;
}

async function loadNews(force=false) {
  const container = document.getElementById("newsV2Container");
  if (!container || !validateNewsDateRangeV2()) return;
  const serial = ++_newsRequestSerial;
  _newsLoadController?.abort();
  const controller = _newsLoadController = new AbortController();
  const current = () => serial === _newsRequestSerial && !controller.signal.aborted;
  let progress = document.getElementById("newsRefreshProgress");
  if (!progress) { progress = document.createElement("p"); progress.id="newsRefreshProgress"; progress.className="news-refresh-progress";progress.setAttribute("role","status");container.before(progress); }
  const loading = () => { container.innerHTML = '<div class="news-loading"><div class="news-spinner"></div><p data-design-text="newsUpdating" data-no-i18n></p></div>';window.ALM_DESIGN?.applyText(); };
  if (Array.isArray(_newsCache) && _newsCache.length) renderNewsV2(); else loading();
  const request = async ({quick=false,refresh=false}={}) => {
    const params = buildNewsQueryParamsV2(refresh, 0, Math.max(1000, _newsCache?.length || 0));
    params.set("preferredLang",interfaceNewsLanguageV2());
    if (quick) params.set("quick", "1"); else params.set("background", "1");
    const response = await fetch(`/api/v2/news?${params}`, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
    return data;
  };
  let renderedItems = null;
  const accept = data => {
    if (!current()) return;
    const previous=new Map((_newsCache||[]).map(item=>[newsKeyV2(item),item]));
    _newsCache = (Array.isArray(data.items) ? data.items : []).map(item=>{const old=previous.get(newsKeyV2(item));return old?{...item,imageUrl:item.imageUrl||old.imageUrl,_forcedImageRetry:old._forcedImageRetry,_failedImageUrl:old._failedImageUrl}:item;});
    syncNewsHistoryMetaV2(data);
    const fingerprint=JSON.stringify(_newsCache);
    if (!_newsCache.length && data.refresh?.pending) loading();
    else if(fingerprint!==renderedItems){renderNewsV2();renderedItems=fingerprint;}
    progress.hidden=!data.refresh?.pending;
    progress.textContent=(window.ALM_DESIGN?.t('newsUpdating') || 'Mise à jour des sources…') + (data.refresh?.totalSources ? ` ${data.refresh.completedSources || 0}/${data.refresh.totalSources}` : '');
    container.setAttribute("aria-busy",String(!!data.refresh?.pending));
  };
  try {
    _newsDisplayLimit = Math.max(31,_newsDisplayLimit || 31);
    if (force) { _newsSelectedKey=""; _newsImageAttempted.clear(); }
    let data = await request({quick:!force,refresh:force});
    if (!current()) return;
    accept(data);
    if (!force && data.refreshDue && !data.refresh?.pending) {
      data = await request({refresh:true});
      if (!current()) return;
      accept(data);
    }
    while (data.refresh?.pending && current()) {
      // Only the visible reader polls; the shared server refresh still completes and saves.
      if (document.getElementById("newsV2Page")?.classList.contains("hidden")) break;
      await new Promise(resolve => {
        const done = () => {clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();};
        const timer=setTimeout(done,650);controller.signal.addEventListener('abort',done,{once:true});
      });
      if (!current()) return;
      data = await request({quick:true});
      if (!current()) return;
      accept(data);
    }
  } catch (error) {
    if (!current() || error?.name === "AbortError") return;
    console.error("Actualités V2 impossibles:",error);
    if (_newsCache?.length) renderNewsV2();
    else container.innerHTML=`<div class="news-error"><p>Impossible de charger les actualités.<br><small>${escapeHtmlV2(error.message || "Erreur réseau")}</small><br><button data-news-action="refresh" class="primary">Réessayer</button></p></div>`;
  } finally {
    if (current()) { container.removeAttribute("aria-busy");progress.hidden=true; }
  }
}

async function loadMoreNewsFromServerV2() {
  if (!_newsMeta.truncated || !Array.isArray(_newsCache)) return;
  const button = document.getElementById("newsLoadMoreBtn");
  if (button) {
    button.disabled = true;
    button.textContent = "Chargement de la suite de l’historique…";
  }
  try {
    const offset = _newsCache.length;
    const params = buildNewsQueryParamsV2(false, offset, 1000);
    params.set("quick", "1");
    const response = await fetch(`/api/v2/news?${params.toString()}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Suite de l’historique indisponible");
    const existing = new Set(_newsCache.map((item, index) => newsKeyV2(item, index)));
    const additions = (Array.isArray(data.items) ? data.items : []).filter((item, index) => {
      const key = newsKeyV2(item, offset + index);
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    _newsCache.push(...additions);
    _newsDisplayLimit += 30;
    syncNewsHistoryMetaV2(data);
    renderNewsV2();
  } catch (error) {
    window.notifyApp?.(`Historique : ${error.message || "chargement impossible"}`, "error");
    if (button) {
      button.disabled = false;
      button.textContent = "Réessayer de charger la suite";
    }
  }
}

async function updateNewsRetentionV2(value) {
  const select = document.getElementById("newsHistoryRetention");
  const status = document.getElementById("newsHistoryStatus");
  const retentionDays = Number(value);
  const currentDays = Number(_newsMeta.retentionDays ?? 365);
  const shortensHistory = retentionDays > 0 && (currentDays === 0 || retentionDays < currentDays);
  if (shortensHistory) {
    const accepted = typeof window.showAppConfirm === "function"
      ? await window.showAppConfirm(
          `Réduire l’historique à ${newsRetentionLabelV2(retentionDays)} supprimera les actualités locales plus anciennes.`,
          { title: "Réduire l’historique ?", okText: "Réduire", cancelText: "Conserver" }
        )
      : false;
    if (!accepted) {
      if (select) select.value = String(currentDays);
      return;
    }
  }
  if (select) select.disabled = true;
  if (status) status.textContent = "Mise à jour de la durée de conservation…";
  try {
    const response = await fetch("/api/v2/news/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionDays })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Réglage impossible");
    syncNewsHistoryMetaV2(data);
    _newsSelectedKey = "";
    await loadNews(false);
  } catch (error) {
    if (status) status.textContent = `Erreur : ${error.message || "réglage impossible"}`;
    if (select && _newsMeta.retentionDays != null) select.value = String(_newsMeta.retentionDays);
  } finally {
    if (select) select.disabled = false;
  }
}

window.loadNews = loadNews;
window.resetNewsFiltersV2 = function() {
  _newsCatFilter="all";
  _newsLang=readNewsLanguageV2();
  _newsSelectedKey="";
  _newsDateFrom="";
  _newsDateTo="";
  _newsDisplayLimit=31;
  const from=document.getElementById("newsDateFrom"), to=document.getElementById("newsDateTo");
  if(from) from.value="";
  if(to) to.value="";
  const preset=document.getElementById("newsRangePreset");
  if(preset) preset.value="all";
  document.querySelectorAll(".news-v2-filter").forEach(b=>b.classList.toggle("active", b.dataset.filter==="all"));
  document.querySelectorAll(".news-lang-btn").forEach(b=>b.classList.toggle("active", normalizeNewsLanguageV2(b.dataset.lang)===_newsLang));
  _newsImageAttempted.clear();
  if (Array.isArray(_newsCache)) {
    renderNewsV2();
    syncNewsHistoryMetaV2(_newsMeta);
  } else {
    loadNews(false);
  }
};

function focusNewsReaderV2() {
  requestAnimationFrame(() => {
    const side = document.getElementById("newsReaderSide");
    if (!side) return;
    if (typeof side.scrollTo === "function") side.scrollTo({ top: 0, behavior: "smooth" });
    // Sur une fenêtre étroite, le lecteur peut se retrouver sous la grille :
    // le bouton « Lire » doit donc produire une action visible, pas seulement
    // remplacer silencieusement son contenu.
    side.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "nearest" });
    const card = side.querySelector(".news-preview-card");
    card?.classList.remove("reader-focus-pulse");
    // Forcer un reflow pour rejouer l'animation même si on reclique sur le même article.
    void card?.offsetWidth;
    card?.classList.add("reader-focus-pulse");
    setTimeout(() => card?.classList.remove("reader-focus-pulse"), 900);
  });
}

function renderNewsV2() {
  const container=document.getElementById("newsV2Container");
  if(!container||!_newsCache)return;
  const items = filteredNewsV2();
  _newsLastRenderedItems = items;
  const relevantSources=(_newsMeta.sourceStats||[]).filter(source=>_newsLang==='all'||source.lang===_newsLang);
  let notice=document.getElementById('newsSourceNotice');if(!notice){notice=document.createElement('p');notice.id='newsSourceNotice';notice.className='news-source-notice';notice.setAttribute('role','status');notice.setAttribute('data-no-i18n','');container.before(notice);}
  const failed=relevantSources.filter(source=>!source.ok).length;
  notice.textContent=relevantSources.length ? window.ALM_RETOUCHES.t('newsSources')+': '+(relevantSources.length-failed)+' / '+relevantSources.length+(failed?' · '+window.ALM_RETOUCHES.t('newsRetry'):'') : '';
  if(_newsLang==='zh-CN')notice.textContent+=' · '+window.ALM_RETOUCHES.t('newsTraditional');


  if(!items.length){
    const period = (_newsDateFrom || _newsDateTo) ? " pour cette période" : " avec ces filtres";
    const filtersActive = _newsCatFilter !== "all" || _newsLang !== "all" || Boolean(_newsDateFrom || _newsDateTo);
    container.innerHTML=`<div class="news-empty"><p style="padding:40px;text-align:center;color:var(--muted)">Aucune actualité enregistrée${period}.<br><small>${filtersActive ? "Aucun article ne correspond aux filtres actuels." : "Les sources n’ont renvoyé aucune actualité pour le moment."}</small><br>${filtersActive ? `<button data-news-action="reset" class="primary" style="margin-top:12px">Effacer les filtres</button>` : `<button data-news-action="refresh" class="primary" style="margin-top:12px">Actualiser les sources</button>`}</p></div>`;
    return;
  }

  const selectedIndex = selectedNewsIndexV2(items);
  const selected = items[selectedIndex] || items[0];
  const heroIndex = Math.max(0, items.findIndex(n => newsDisplayImageV2(n)));
  const hero = items[heroIndex] || items[0];
  const heroCat = hero.category || "divers";
  const heroColor = NEWS_V2_COLORS[heroCat] || NEWS_V2_COLORS.divers;
  const heroDate = newsDateLabelV2(hero);
  const heroIsSelected = newsKeyV2(hero, heroIndex) === newsKeyV2(selected, selectedIndex);
  const visibleGridCount = Math.max(0, _newsDisplayLimit - 1);
  const hasMoreLocal = items.length > _newsDisplayLimit;
  const hasMoreServer = Boolean(_newsMeta.truncated);
  const totalMatching = Number(_newsMeta.total || items.length);

  const dateLabel = (_newsDateFrom || _newsDateTo)
    ? `<div class="news-date-active">Période : ${escapeHtmlV2(_newsDateFrom || "début")} → ${escapeHtmlV2(_newsDateTo || "aujourd'hui")}</div>`
    : "";

  container.innerHTML=`
    ${dateLabel}
    <div class="news-reader-layout">
      <div class="news-reader-main">
        <article class="news-hero ${selectedIndex === heroIndex ? "active" : ""}">
          ${newsDisplayImageV2(hero)?`<button type="button" class="news-hero-img" data-news-index="${heroIndex}" title="Afficher à droite"><img src="${safeUrlV2(newsDisplayImageV2(hero))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-image-fallback="true"></button>`:`<div class="news-hero-img news-image-resolving" aria-label="Recherche de la vignette"><span data-no-i18n>${escapeHtmlV2(window.ALM_DESIGN?.t("newsNoImage")||"Image unavailable")}</span></div>`}
          <div class="news-hero-body">
            <div class="news-hero-top">
              <span class="news-card-v3-cat" style="background:${heroColor}22;color:${heroColor};border:1px solid ${heroColor}44">${NEWS_V2_LABELS[heroCat]||"📰 Actu"}</span>
              <span class="news-flag" title="${escapeHtmlV2(newsLanguageMetaV2(hero.lang).label)}">${newsLanguageMetaV2(hero.lang).flag}</span>
              <span class="news-date-sm">${escapeHtmlV2(hero.source||"")}${heroDate ? " · " + escapeHtmlV2(heroDate) : ""}</span>
            </div>
            <h2 class="news-hero-title"><button type="button" data-news-index="${heroIndex}">${escapeHtmlV2(hero.title||"")}</button></h2>
            <p class="news-hero-summary">${escapeHtmlV2(newsTruncateV2(hero.summary||"", 320))}</p>
            <div class="news-hero-actions">
              ${heroIsSelected
                ? `<button type="button" class="news-hero-read is-current" disabled aria-disabled="true">✓ Article affiché à droite</button>`
                : `<button type="button" class="news-hero-read" data-news-read-index="${heroIndex}">Lire dans le panneau</button>`}
              <button type="button" class="news-hero-read secondary" data-news-modal-index="${heroIndex}">Agrandir</button>
            </div>
          </div>
        </article>
        <div class="news-grid-v3">
          ${items.map((n,i)=>({n,i})).filter(x=>x.i!==heroIndex).slice(0,visibleGridCount).map(({n,i})=>{
            const c=n.category||"divers",col=NEWS_V2_COLORS[c]||NEWS_V2_COLORS.divers,d=newsDateLabelV2(n,{day:"2-digit",month:"short",year:"numeric"});
            return`<article class="news-tile ${i===selectedIndex?"active":""}">
              ${newsDisplayImageV2(n)?`<button type="button" class="news-tile-img" data-news-index="${i}" title="Afficher à droite"><img src="${safeUrlV2(newsDisplayImageV2(n))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-image-fallback="true"></button>`:`<div class="news-tile-img news-image-resolving" aria-label="Recherche de la vignette"><span data-no-i18n>${escapeHtmlV2(window.ALM_DESIGN?.t("newsNoImage")||"Image unavailable")}</span></div>`}
              <div class="news-tile-body">
                <div class="news-tile-top">
                  <span class="news-tile-cat" style="color:${col}">${NEWS_V2_LABELS[c]||"📰 Actu"}</span>
                  <span class="news-flag-sm">${newsLanguageMetaV2(n.lang).flag}</span>
                  <span class="news-date-sm">${escapeHtmlV2(d)}</span>
                </div>
                <h3 class="news-tile-title"><button type="button" data-news-index="${i}">${escapeHtmlV2(n.title||"")}</button></h3>
                <p class="news-tile-sum">${escapeHtmlV2(newsTruncateV2(n.summary||"",120))}</p>
                <div class="news-tile-foot"><span class="news-src-sm">${escapeHtmlV2(n.source||"")}</span><button type="button" class="news-read-sm" data-news-read-index="${i}">Lire</button></div>
              </div>
            </article>`;
          }).join("")}
        </div>
        ${(hasMoreLocal || hasMoreServer) ? `<div class="news-load-more-wrap"><button type="button" id="newsLoadMoreBtn" class="news-load-more">${hasMoreLocal ? `Afficher 30 actualités de plus (${Math.min(items.length, _newsDisplayLimit)} sur ${Math.max(items.length, totalMatching)})` : `Charger la suite de l’historique (${items.length} sur ${totalMatching})`}</button></div>` : ""}
      </div>
      <aside class="news-reader-side" id="newsReaderSide">${renderNewsSideV2(selected, selectedIndex)}</aside>
    </div>`;

  container.querySelectorAll("[data-news-read-index]").forEach(btn => {
    btn.addEventListener("click", event => {
      event.preventDefault();
      const index = Number(btn.dataset.newsReadIndex);
      const item = items[index];
      if (!item) return;
      _newsSelectedKey = newsKeyV2(item, index);
      renderNewsV2();
      focusNewsReaderV2();
    });
  });
  container.querySelectorAll("[data-news-index]").forEach(btn=>{
    btn.addEventListener("click", event=>{
      event.preventDefault();
      const index=Number(btn.dataset.newsIndex);
      const item=items[index];
      if(!item)return;
      _newsSelectedKey=newsKeyV2(item,index);
      renderNewsV2();
      document.getElementById("newsReaderSide")?.scrollIntoView({behavior:"smooth",block:"nearest",inline:"nearest"});
    });
  });
  container.querySelectorAll("[data-news-modal-index]").forEach(btn=>{
    btn.addEventListener("click", event=>{
      event.preventDefault();
      const item=items[Number(btn.dataset.newsModalIndex)];
      openNewsArticleModalV2(item);
    });
  });
  document.getElementById("newsLoadMoreBtn")?.addEventListener("click",()=>{
    if (_newsDisplayLimit < items.length) {
      _newsDisplayLimit += 30;
      renderNewsV2();
    } else {
      loadMoreNewsFromServerV2();
    }
  });
  loadNewsArticleTextV2(selected, selectedIndex);
  hydrateVisibleNewsImagesV2(items.slice(0, Math.max(_newsDisplayLimit, 24)));
}

// ─── RECOMMANDATIONS : masquage local des propositions ───────
const RECO_HIDDEN_STORAGE_KEY = "alm.hiddenRecommendations.v2";
function recoKeyV2(item) {
  return String(item?.malId || item?.title || "").toLowerCase().trim();
}
function getHiddenRecoV2() {
  try { return new Set(JSON.parse(localStorage.getItem(RECO_HIDDEN_STORAGE_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveHiddenRecoV2(set) {
  try { localStorage.setItem(RECO_HIDDEN_STORAGE_KEY, JSON.stringify([...set].filter(Boolean))); } catch {}
}
function isRecoHiddenV2(item) {
  const key = recoKeyV2(item);
  return !!key && getHiddenRecoV2().has(key);
}
function filterRecoItemsV2(items) {
  const library = getAnimes();
  const ids = new Set(library.map(item => String(item.malId || "")).filter(Boolean));
  const titles = new Set(library.map(item => normalizeRecoSearchV2(item.title)).filter(Boolean));
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => {
    const key = recoKeyV2(item);
    if (!key || seen.has(key) || isRecoHiddenV2(item)) return false;
    if (item.malId && ids.has(String(item.malId))) return false;
    if (!item.malId && titles.has(normalizeRecoSearchV2(item.title))) return false;
    seen.add(key); return true;
  });
}

function hideRecoItemV2(item, card) {
  const key = recoKeyV2(item);
  if (!key) return;
  const set = getHiddenRecoV2();
  set.add(key);
  saveHiddenRecoV2(set);
  card?.remove();
  window.notifyApp?.("Proposition masquée. Tu peux la réafficher avec le bouton de la page Recommandations.", "success");
}
function resetHiddenRecoV2() {
  try { localStorage.removeItem(RECO_HIDDEN_STORAGE_KEY); } catch {}
  window.notifyApp?.("Propositions masquées réaffichées.", "success");
  initRecommendations();
}

// ─── RECOMMANDATIONS ────────────────────────────────────────
const _recoGenrePayloadsV2 = new Map();
const _recoGenreRequestsV2 = new Map();
let _recoGenreRenderSerialV2 = 0;

function normalizeRecoGenreKeyV2(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function getRecoGenrePayloadV2(genre, force = false) {
  const key = normalizeRecoGenreKeyV2(genre);
  if (!key) throw new Error("Genre manquant");
  if (force) {
    _recoGenrePayloadsV2.delete(key);
    _recoGenreRequestsV2.delete(key);
  }
  if (_recoGenrePayloadsV2.has(key)) return _recoGenrePayloadsV2.get(key);
  if (_recoGenreRequestsV2.has(key)) return _recoGenreRequestsV2.get(key);

  const request = (async () => {
    const params = new URLSearchParams({ genre: String(genre || "") });
    if (force) params.set("refresh", "1");
    const response = await fetch(`/api/v2/reco/genres?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.error) {
      throw new Error(data?.error || `Erreur HTTP ${response.status}`);
    }
    if (!Array.isArray(data?.items) && (!data?.results || typeof data.results !== "object")) {
      throw new Error("Réponse de recommandations incomplète");
    }
    return data;
  })();
  _recoGenreRequestsV2.set(key, request);

  try {
    const data = await request;
    if (_recoGenreRequestsV2.get(key) === request) _recoGenrePayloadsV2.set(key, data);
    return data;
  } finally {
    if (_recoGenreRequestsV2.get(key) === request) _recoGenreRequestsV2.delete(key);
  }
}

function recoGenreItemsV2(payload, genre) {
  if (Array.isArray(payload?.items)) return payload.items;
  const results = payload?.results || {};
  if (Array.isArray(results[genre])) return results[genre];
  const wanted = normalizeRecoGenreKeyV2(genre);
  const matchingKey = Object.keys(results).find(key => normalizeRecoGenreKeyV2(key) === wanted);
  return matchingKey && Array.isArray(results[matchingKey]) ? results[matchingKey] : [];
}

function recoSourceLabelV2(data) {
  const source = String(data?.source || "");
  const count = Number(data?.metadataCount || 0);
  if (/metadata-locale/i.test(source)) {
    return `Suggestions calculées depuis la base locale${count ? ` de ${count.toLocaleString("fr-FR")} fiches` : ""} — sans attendre les APIs externes.`;
  }
  return source ? `Source : ${source}` : "Suggestions personnalisées selon ta bibliothèque.";
}

async function initRecommendations(force = false) {
  const container = document.getElementById("recoContainer");
  if (!container) return;
  if (force) {
    _recoGenrePayloadsV2.clear();
    _recoGenreRequestsV2.clear();
  }

  const animes = getAnimeFeatureAnimesV2();
  const genreWeights = Object.create(null);
  for (const anime of animes) {
    const scoreWeight = Math.max(1, Number(anime.score) || 1);
    for (const rawGenre of (anime.genres || [])) {
      const genre = String(rawGenre || "").trim();
      if (genre) genreWeights[genre] = (genreWeights[genre] || 0) + scoreWeight;
    }
  }
  const allGenres = Object.entries(genreWeights)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .map(([genre]) => genre);
  const visibleGenreCount = Math.min(8, allGenres.length);

  const allWithMalId = animes.filter(anime => anime.malId).sort((a, b) => {
    const scoreA = Number(a.score || 0);
    const scoreB = Number(b.score || 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    const order = { Completed: 0, Watching: 1, "Plan to Watch": 2, "On Hold": 3, "On-Hold": 3, Dropped: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });
  const topAnimes = allWithMalId.slice(0, 8);
  const allAnimes = allWithMalId;
  const heroHost = document.getElementById("recoHeroBlock");
  if (heroHost) heroHost.innerHTML = "";

  if (!allGenres.length && !topAnimes.length) {
    container.innerHTML = `<div class="reco-empty"><p>📚 Importe ta liste pour obtenir des recommandations personnalisées.</p></div>`;
    return;
  }

  const makePickerCard = anime => `
    <button type="button" class="reco-pick-card" data-malid="${escapeHtmlV2(anime.malId)}" data-title="${escapeHtmlV2(anime.title || "")}">
      ${recoPickerImageMarkupV2(anime)}
      <span>${escapeHtmlV2((anime.title || "").slice(0, 18))}${(anime.title || "").length > 18 ? "…" : ""}</span>
      ${anime.score ? `<small style="color:var(--accent);font-size:9px">⭐${escapeHtmlV2(anime.score)}</small>` : ""}
    </button>`;

  const makePickerCards = () => allAnimes.slice(0, 12).map(makePickerCard).join("") +
    (allAnimes.length > 12 ? `<button type="button" class="reco-show-more" data-total="${allAnimes.length}">+ ${allAnimes.length - 12} autres animés</button>` : "");

  const recoStatusFrV2 = status => ({Completed:"Terminé", Watching:"En cours", "Plan to Watch":"À voir", "On Hold":"En pause", "On-Hold":"En pause", Dropped:"Abandonné"}[status] || status || "");
  const optionRows = allAnimes.map(anime => {
    const suffix = [anime.score ? `⭐ ${anime.score}` : "", recoStatusFrV2(anime.status)].filter(Boolean).join(" · ");
    return `<option value="${escapeHtmlV2(anime.malId)}">${escapeHtmlV2(anime.title || "Sans titre")}${suffix ? " — " + escapeHtmlV2(suffix) : ""}</option>`;
  }).join("");
  const dataRows = allAnimes.map(anime => `<option value="${escapeHtmlV2(anime.title || "")}"></option>`).join("");
  const makeRecoChooser = (kind, buttonText) => `
    <div class="reco-smart-picker" data-kind="${kind}">
      <div class="reco-smart-row">
        <label for="reco-${kind}-search">Rechercher un animé</label>
        <select id="reco-${kind}-select" class="reco-select reco-select-state" aria-hidden="true" tabindex="-1">
          <option value="">Sélectionne un animé…</option>
          ${optionRows}
        </select>
        <div class="reco-search-wrap">
          <input id="reco-${kind}-search" class="reco-search" autocomplete="off" aria-autocomplete="list" aria-controls="reco-${kind}-suggestions" aria-expanded="false" placeholder="Tape un titre… ex. Fullmetal">
          <div id="reco-${kind}-suggestions" class="reco-search-suggestions hidden" role="listbox" aria-label="Titres possibles"></div>
        </div>
        <button type="button" id="reco-${kind}-launch" class="reco-launch">${buttonText}</button>
      </div>
      <p class="reco-smart-hint">Tu peux aussi cliquer directement sur une jaquette en dessous.</p>
    </div>`;

  const genreButtons = allGenres.map((genre, index) => `
    <button type="button" class="reco-genre-pill${index >= visibleGenreCount ? " reco-genre-extra hidden" : ""}" data-genre="${escapeHtmlV2(genre)}">${escapeHtmlV2(genre)}</button>`).join("");

  container.innerHTML = `
    <div class="reco-block">
      <h3 class="reco-block-title">🎯 Explore par genre</h3>
      <p class="reco-block-sub">Clique sur un genre pour voir les meilleurs animés absents de ta bibliothèque.</p>
      <div class="reco-genre-pills" id="recoGenrePills">
        ${genreButtons}
        ${allGenres.length > visibleGenreCount ? `<button type="button" class="reco-genre-pill reco-genre-more" id="recoMoreGenres" aria-expanded="false">+ ${allGenres.length - visibleGenreCount} autres genres</button>` : ""}
      </div>
      <div class="reco-tools-row">
        <span id="recoGenreSource" class="reco-source-note">Préparation des suggestions locales…</span>
        <button type="button" id="recoResetHidden" class="reco-reset-hidden">Réafficher les propositions masquées</button>
      </div>
      <div id="recoGenreResults" class="reco-grid" style="display:none"></div>
    </div>

    ${topAnimes.length ? `
    <div class="reco-block">
      <h3 class="reco-block-title">❤️ Si tu as aimé...</h3>
      <p class="reco-block-sub">Sélectionne un animé, choisis dans la liste ou tape son nom pour trouver des recommandations proches.</p>
      ${makeRecoChooser("similar", "Trouver les animés")}
      <div class="reco-anime-selector" id="recoAnimePicker">${makePickerCards()}</div>
      <div id="recoSimilarResults" class="reco-grid" style="display:none"></div>
    </div>

    <div class="reco-block">
      <h3 class="reco-block-title">✍️ Même créateur / mangaka</h3>
      <p class="reco-block-sub">Choisis un animé pour voir les autres œuvres du même auteur ou de la même équipe créative.</p>
      ${makeRecoChooser("creator", "Trouver les œuvres")}
      <div class="reco-anime-selector" id="recoCreatorPicker">${makePickerCards()}</div>
      <div id="recoCreatorResults" class="reco-grid" style="display:none"></div>
    </div>

    <div class="reco-block">
      <h3 class="reco-block-title">🎙️ Mêmes acteurs voix (seiyuu)</h3>
      <p class="reco-block-sub">Choisis un animé pour retrouver les mêmes voix japonaises principales.</p>
      ${makeRecoChooser("seiyuu", "Trouver les voix")}
      <div class="reco-anime-selector" id="recoSeiyuuPicker">${makePickerCards()}</div>
      <div id="recoSeiyuuResults" class="reco-grid" style="display:none"></div>
    </div>
    ` : "<div class='reco-block'><p class='reco-block-sub'>Ajoute des identifiants MyAnimeList à quelques fiches pour activer les sections similaire / créateur / seiyuu.</p></div>"}`;

  window.ALM_NOCTURNE?.organizeRecommendations();
  const sourceEl = document.getElementById("recoGenreSource");
  _recoGenreRenderSerialV2++;

  container.querySelectorAll(".reco-genre-pill[data-genre]").forEach(button => {
    button.addEventListener("click", async () => {
      const serial = ++_recoGenreRenderSerialV2;
      container.querySelectorAll(".reco-genre-pill[data-genre]").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      const resultsEl = document.getElementById("recoGenreResults");
      if (!resultsEl) return;
      resultsEl.style.display = "";
      resultsEl.innerHTML = `<div class="reco-loading-inline"><div class="news-spinner" style="width:20px;height:20px;border-width:2px"></div> Recherche locale : ${escapeHtmlV2(button.dataset.genre)}…</div>`;

      try {
        const data = await getRecoGenrePayloadV2(button.dataset.genre, false);
        if (serial !== _recoGenreRenderSerialV2) return;
        if (sourceEl) sourceEl.textContent = recoSourceLabelV2(data);
        const rawItems = recoGenreItemsV2(data, button.dataset.genre);
        const items = filterRecoItemsV2(rawItems);
        if (items.length) {
          resultsEl.innerHTML = items.map(item => recoCard(item, `Genre : ${button.dataset.genre}`)).join("");
          wireAdd(resultsEl);
        } else if (rawItems.length) {
          resultsEl.innerHTML = `<div class="reco-result-message"><strong>Toutes les propositions de ce genre sont masquées.</strong><span>Utilise « Réafficher les propositions masquées » pour les retrouver.</span></div>`;
        } else {
          resultsEl.innerHTML = `<div class="reco-result-message"><strong>Aucune suggestion locale pour ${escapeHtmlV2(button.dataset.genre)}.</strong><span>Essaie un autre genre ou actualise les recommandations.</span></div>`;
        }
      } catch (error) {
        if (serial !== _recoGenreRenderSerialV2) return;
        if (sourceEl) sourceEl.textContent = `Suggestions indisponibles : ${error.message}`;
        resultsEl.innerHTML = `<div class="reco-result-message error"><strong>Impossible de charger les recommandations.</strong><span>${escapeHtmlV2(error.message)}</span><button type="button" class="reco-inline-retry">Réessayer</button></div>`;
        resultsEl.querySelector(".reco-inline-retry")?.addEventListener("click", () => initRecommendations(true));
      }
    });
  });

  document.getElementById("recoMoreGenres")?.addEventListener("click", event => {
    const button = event.currentTarget;
    const expanded = button.getAttribute("aria-expanded") === "true";
    container.querySelectorAll(".reco-genre-extra").forEach(item => item.classList.toggle("hidden", expanded));
    button.setAttribute("aria-expanded", String(!expanded));
    button.textContent = expanded ? `+ ${allGenres.length - visibleGenreCount} autres genres` : "Réduire les genres";
  });
  document.getElementById("recoResetHidden")?.addEventListener("click", resetHiddenRecoV2);
  if (heroHost) renderRecoHeroV2(heroHost, { animes: allAnimes, topGenres: allGenres, topAnimes });

  const sections = [
    {
      kind: "similar",
      pickerId: "recoAnimePicker",
      resultsId: "recoSimilarResults",
      selectId: "reco-similar-select",
      searchId: "reco-similar-search",
      launchId: "reco-similar-launch",
      urlFn: id => `/api/v2/reco/similar/${id}`,
      extractFn: data => data.items,
      labelFn: item => item.matchedGenres?.length ? `❤️ Genres communs : ${item.matchedGenres.slice(0, 3).join(", ")}` : "❤️ Recommandé car similaire"
    },
    {
      kind: "creator",
      pickerId: "recoCreatorPicker",
      resultsId: "recoCreatorResults",
      selectId: "reco-creator-select",
      searchId: "reco-creator-search",
      launchId: "reco-creator-launch",
      urlFn: id => `/api/v2/reco/creator/${id}${force ? "?refresh=1" : ""}`,
      extractFn: data => data.items,
      labelFn: item => `✍️ ${item.creatorName || "même auteur"}${item.creatorRole ? ` · ${item.creatorRole}` : ""}`
    },
    {
      kind: "seiyuu",
      pickerId: "recoSeiyuuPicker",
      resultsId: "recoSeiyuuResults",
      selectId: "reco-seiyuu-select",
      searchId: "reco-seiyuu-search",
      launchId: "reco-seiyuu-launch",
      urlFn: id => `/api/v2/reco/seiyuu/${id}${force ? "?refresh=1" : ""}`,
      extractFn: data => data.items,
      labelFn: item => `🎙️ ${item.seiyuuName || "même seiyuu"}${item.role ? ` · ${item.role}` : ""}`
    }
  ];
  sections.forEach(config => {
    setupRecoSmartPicker(config, allAnimes);
    wireSection(config.pickerId, config.resultsId, config.urlFn, config.extractFn, config.labelFn, config);
  });
  hydrateRecoPickerImagesV2(container);

  container.querySelectorAll(".reco-show-more").forEach(button => {
    button.addEventListener("click", () => {
      const pickerId = button.parentElement.id;
      button.insertAdjacentHTML("beforebegin", allAnimes.slice(12).map(makePickerCard).join(""));
      button.remove();
      sections.forEach(config => wireSection(config.pickerId, config.resultsId, config.urlFn, config.extractFn, config.labelFn, config));
      hydrateRecoPickerImagesV2(document.getElementById(pickerId));
    });
  });

  container.querySelector(".reco-genre-pill[data-genre]")?.click();
}
function recoSimilarItemsV2(payload) { return Array.isArray(payload?.items) ? payload.items : []; }

async function recoFetchPayloadV2(url) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error || `Erreur HTTP ${response.status}`);
  return data;
}

function buildRecoBlendV2(primaryItems, secondaryItems) {
  const merged = new Map();
  const pushItem = (item, origin, index) => {
    const key = recoKeyV2(item);
    if (!key) return;
    const score = Math.max(0, 60 - index);
    const existing = merged.get(key) || { ...item, origins: [], blendScore: 0 };
    existing.origins = Array.from(new Set([...(existing.origins || []), origin]));
    existing.blendScore += score;
    if (!existing.publicScore && item.publicScore) existing.publicScore = item.publicScore;
    if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
    merged.set(key, existing);
  };
  (primaryItems || []).forEach((item, index) => pushItem(item, "primary", index));
  (secondaryItems || []).forEach((item, index) => pushItem(item, "secondary", index));
  return filterRecoItemsV2(Array.from(merged.values()))
    .sort((a, b) => (b.origins?.length || 0) - (a.origins?.length || 0) || (b.blendScore || 0) - (a.blendScore || 0) || Number(b.publicScore || 0) - Number(a.publicScore || 0));
}

function recoRenderHeroResultsV2(host, title, subtitle, items, labelFn) {
  const titleEl = host.querySelector(".reco-hero-results-title");
  const subEl = host.querySelector(".reco-hero-results-sub");
  const grid = host.querySelector(".reco-hero-results-grid");
  if (!titleEl || !subEl || !grid) return;
  titleEl.textContent = title || "Sélection prête";
  subEl.textContent = subtitle || "";
  if (!Array.isArray(items) || !items.length) {
    grid.innerHTML = `<div class="reco-result-message"><strong>Aucune proposition affichable pour l’instant.</strong><span>Essaie un autre bouton ou relance après avoir enrichi la bibliothèque.</span></div>`;
    return;
  }
  grid.innerHTML = items.slice(0, 12).map(item => recoCard(item, typeof labelFn === "function" ? labelFn(item) : labelFn)).join("");
  wireAdd(grid);
}

function renderRecoHeroV2(host, context) {
  if (!host) return;
  const animes = Array.isArray(context?.animes) ? context.animes : [];
  const topGenres = Array.isArray(context?.topGenres) ? context.topGenres : [];
  const topAnimes = Array.isArray(context?.topAnimes) ? context.topAnimes : [];
  const primaryGenre = topGenres[0] || "Action";
  const secondaryGenre = topGenres[1] || primaryGenre;
  const heroAnime = topAnimes[0] || animes.find(anime => Number(anime?.malId || 0) > 0) || null;
  const surprisePool = topAnimes.slice(0, 8).filter(anime => Number(anime?.malId || 0) > 0);
  if (!animes.length) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = `
    <div class="reco-hero-header">
      <div>
        <div class="reco-hero-kicker">Découverte intelligente</div>
        <h3 class="reco-hero-title">Des raccourcis malins pour trouver ton prochain anime</h3>
        <p class="reco-hero-subtitle">Tu sembles aimer <strong>${escapeHtmlV2(primaryGenre)}</strong>${secondaryGenre && secondaryGenre !== primaryGenre ? `, avec une forte dose de <strong>${escapeHtmlV2(secondaryGenre)}</strong>` : ""}. Lance une exploration ciblée en un clic et laisse ALM faire le tri.</p>
        <div class="reco-hero-pills">${[
          `${animes.length} titres analysés`,
          topAnimes[0]?.title ? `Coup de cœur : ${topAnimes[0].title}` : "",
          secondaryGenre && secondaryGenre !== primaryGenre ? `Mix favori : ${primaryGenre} × ${secondaryGenre}` : ""
        ].filter(Boolean).map(label => `<span class="reco-hero-pill">${escapeHtmlV2(label)}</span>`).join("")}</div>
      </div>
    </div>
    <div class="reco-hero-actions">
      <button type="button" class="reco-hero-action" data-hero-action="blend">
        <strong>⚡ Mix ${escapeHtmlV2(primaryGenre)} × ${escapeHtmlV2(secondaryGenre)}</strong>
        <span>Croise tes deux genres dominants pour une sélection très ciblée.</span>
      </button>
      <button type="button" class="reco-hero-action" data-hero-action="similar" ${heroAnime ? "" : "disabled"}>
        <strong>🎯 Même vibe que ${escapeHtmlV2(heroAnime?.title || "ton favori")}</strong>
        <span>Recherche des œuvres qui rappellent ton anime le mieux noté.</span>
      </button>
      <button type="button" class="reco-hero-action" data-hero-action="surprise" ${surprisePool.length ? "" : "disabled"}>
        <strong>🎲 Surprise-moi</strong>
        <span>On pioche un anime fort de ta bibliothèque puis on part en exploration.</span>
      </button>
    </div>
    <div class="reco-hero-results-title">Prêt à explorer</div>
    <div class="reco-hero-results-sub">Choisis un raccourci ci-dessus pour générer une sélection instantanée.</div>
    <div class="reco-grid reco-hero-results-grid"></div>
  `;
  const heroToken = Symbol("reco-hero");
  host.__almHeroToken = heroToken;
  let actionSerial = 0;
  const runAction = async type => {
    const serial = ++actionSerial;
    const isCurrent = () => serial === actionSerial && host.isConnected && host.__almHeroToken === heroToken;
    const grid = host.querySelector('.reco-hero-results-grid');
    const subEl = host.querySelector('.reco-hero-results-sub');
    if (grid) grid.innerHTML = `<div class="reco-loading-inline"><div class="news-spinner" style="width:20px;height:20px;border-width:2px"></div> Préparation des recommandations…</div>`;
    if (subEl) subEl.textContent = 'Recherche en cours…';
    try {
      if (type === 'blend') {
        const [a, b] = await Promise.all([
          getRecoGenrePayloadV2(primaryGenre),
          getRecoGenrePayloadV2(secondaryGenre)
        ]);
        if (!isCurrent()) return;
        const items = buildRecoBlendV2(recoGenreItemsV2(a, primaryGenre), primaryGenre === secondaryGenre ? [] : recoGenreItemsV2(b, secondaryGenre));
        recoRenderHeroResultsV2(host, `Mix ${primaryGenre} × ${secondaryGenre}`, 'Les meilleurs croisements entre tes deux genres dominants, en privilégiant les titres présents dans les deux listes.', items, item => item.origins?.length > 1 ? `Présent dans ${primaryGenre} et ${secondaryGenre}` : `Plutôt ${item.origins?.[0] === 'secondary' ? secondaryGenre : primaryGenre}`);
        return;
      }
      if (type === 'similar' && heroAnime?.malId) {
        const data = await recoFetchPayloadV2(`/api/v2/reco/similar/${encodeURIComponent(heroAnime.malId)}`);
        if (!isCurrent()) return;
        recoRenderHeroResultsV2(host, `Même vibe que ${heroAnime.title}`, 'Une sélection proche de ton anime le mieux classé dans la bibliothèque.', recoSimilarItemsV2(data), item => `Proche de ${heroAnime.title}`);
        return;
      }
      if (type === 'surprise' && surprisePool.length) {
        const picked = surprisePool[Math.floor(Math.random() * surprisePool.length)];
        const data = await recoFetchPayloadV2(`/api/v2/reco/similar/${encodeURIComponent(picked.malId)}`);
        if (!isCurrent()) return;
        recoRenderHeroResultsV2(host, `Surprise autour de ${picked.title}`, 'Une pioche aléatoire parmi tes favoris pour casser la routine.', recoSimilarItemsV2(data), item => `Surprise inspirée par ${picked.title}`);
        return;
      }
      recoRenderHeroResultsV2(host, 'Action indisponible', 'Cette exploration n’est pas encore prête avec la bibliothèque actuelle.', [], '');
    } catch (error) {
      if (!isCurrent()) return;
      recoRenderHeroResultsV2(host, 'Impossible de charger cette sélection', error.message || 'Erreur inconnue', [], '');
    }
  };
  host.querySelectorAll('[data-hero-action]').forEach(button => button.addEventListener('click', () => runAction(button.dataset.heroAction)));
}

function recoImageCandidateV2(anime) {
  return String(anime?.poster || anime?.imageUrl || anime?.cover || anime?.thumbnail || anime?.coverImage || "").trim();
}

function recoPickerImageMarkupV2(anime) {
  const url = safeUrlV2(recoImageCandidateV2(anime));
  if (url && url !== "#") {
    return `<img class="reco-pick-img" src="${url}" alt="" loading="lazy" data-image-fallback="true">`;
  }
  return `<div class="reco-pick-ph" data-needs-meta="1">🎌</div>`;
}

async function hydrateRecoPickerImagesV2(root) {
  const cards = Array.from((root || document).querySelectorAll(".reco-pick-card[data-malid]:not([data-thumb-hydrated])"))
    .filter(card => card.querySelector("[data-needs-meta]"))
    .slice(0, 72);
  if (!cards.length) return;
  const malIds = [...new Set(cards.map(card => Number(card.dataset.malid || 0)).filter(id => Number.isFinite(id) && id > 0))];
  cards.forEach(card => { card.dataset.thumbHydrated = "1"; });
  if (!malIds.length) return;
  try {
    const response = await fetch("/api/metadata/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ malIds })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Metadata indisponible");
    const items = payload?.items || {};
    for (const card of cards) {
      const malId = String(Number(card.dataset.malid || 0) || "");
      const data = items[malId];
      if (!data?.imageUrl) continue;
      const ph = card.querySelector(".reco-pick-ph");
      if (!ph) continue;
      const img = document.createElement("img");
      img.className = "reco-pick-img";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      // Afficher immédiatement l'URL metadata. La route de cache serveur reste
      // un secours, mais ne doit plus retarder l'apparition de la jaquette.
      img.src = safeUrlV2(data.imageUrl || "");
      img.dataset.fallback = `/api/v2/reco/image/${encodeURIComponent(malId)}`;
      img.onerror = () => {
        const fallback = img.dataset.fallback || "";
        if (fallback && fallback !== "#" && img.src !== fallback) {
          img.dataset.fallback = "";
          img.src = fallback;
          return;
        }
        img.replaceWith(Object.assign(document.createElement("div"), { className: "reco-pick-ph", textContent: "🎌" }));
      };
      ph.replaceWith(img);
    }
  } catch (error) {
    console.warn("Miniatures recommandations :", error);
    cards.forEach(card => { delete card.dataset.thumbHydrated; });
  }
}

function normalizeRecoSearchV2(value) {
  return String(value || "").normalize("NFKC").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function recoSearchCandidatesV2(value, allAnimes, limit = 8) {
  const q = normalizeRecoSearchV2(value);
  if (!q) return [];
  const qTokens = q.split(/\s+/).filter(Boolean);
  return (Array.isArray(allAnimes) ? allAnimes : [])
    .map(anime => {
      const title = normalizeRecoSearchV2(anime?.title || "");
      if (!title) return null;
      let rank = 99;
      if (title === q) rank = 0;
      else if (title.startsWith(q)) rank = 1;
      else if (title.split(" ").some(word => word.startsWith(q))) rank = 2;
      else if (title.includes(q)) rank = 3;
      else if (qTokens.length > 1 && qTokens.every(token => title.includes(token))) rank = 4;
      if (rank === 99) return null;
      return { anime, rank, title };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank || a.title.length - b.title.length || a.title.localeCompare(b.title, "fr"))
    .slice(0, Math.max(1, limit))
    .map(entry => entry.anime);
}
function hideRecoSuggestionsV2(cfg) {
  const box = document.getElementById(`reco-${cfg.kind}-suggestions`);
  const search = document.getElementById(cfg.searchId);
  if (box) { box.classList.add("hidden"); box.innerHTML = ""; box.dataset.activeIndex = "-1"; }
  search?.setAttribute("aria-expanded", "false");
}
function renderRecoSuggestionsV2(cfg, allAnimes) {
  const search = document.getElementById(cfg.searchId);
  const box = document.getElementById(`reco-${cfg.kind}-suggestions`);
  if (!search || !box) return [];
  const matches = recoSearchCandidatesV2(search.value, allAnimes, 8);
  if (!String(search.value || "").trim() || !matches.length) { hideRecoSuggestionsV2(cfg); return []; }
  box.innerHTML = matches.map((anime, index) => {
    const status = ({Completed:"Terminé", Watching:"En cours", "Plan to Watch":"À voir", "On Hold":"En pause", "On-Hold":"En pause", Dropped:"Abandonné"}[anime.status] || anime.status || "");
    const meta = [status, anime.score ? `⭐ ${anime.score}` : ""].filter(Boolean).join(" · ");
    return `<button type="button" class="reco-search-suggestion" role="option" data-index="${index}" data-malid="${escapeHtmlV2(anime.malId)}"><strong>${escapeHtmlV2(anime.title || "Sans titre")}</strong>${meta ? `<span>${escapeHtmlV2(meta)}</span>` : ""}</button>`;
  }).join("");
  box.classList.remove("hidden");
  box.dataset.activeIndex = "-1";
  search.setAttribute("aria-expanded", "true");
  box.querySelectorAll(".reco-search-suggestion").forEach((button, index) => {
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => {
      const anime = matches[index];
      const select = document.getElementById(cfg.selectId);
      if (anime && select) select.value = String(anime.malId || "");
      if (anime) search.value = anime.title || "";
      hideRecoSuggestionsV2(cfg);
    });
  });
  return matches;
}
function findRecoAnimeV2(cfg, allAnimes) {
  const select = document.getElementById(cfg.selectId);
  const search = document.getElementById(cfg.searchId);
  const typed = String(search?.value || "").trim();
  if (typed) {
    const q = normalizeRecoSearchV2(typed);
    const exact = allAnimes.find(a => normalizeRecoSearchV2(a.title) === q);
    if (exact) return exact;
    const starts = allAnimes.find(a => normalizeRecoSearchV2(a.title).startsWith(q));
    if (starts) return starts;
    const includes = allAnimes.find(a => normalizeRecoSearchV2(a.title).includes(q));
    if (includes) return includes;
  }
  const id = String(select?.value || "");
  return allAnimes.find(a => String(a.malId) === id) || null;
}
async function launchRecoFromControlsV2(cfg, allAnimes) {
  const anime = findRecoAnimeV2(cfg, allAnimes);
  if (!anime?.malId) {
    window.notifyApp?.("Choisis un animé dans ta bibliothèque.", "warning");
    return;
  }
  const select = document.getElementById(cfg.selectId);
  const search = document.getElementById(cfg.searchId);
  if (select) select.value = String(anime.malId);
  if (search) search.value = anime.title || "";
  const picker = document.getElementById(cfg.pickerId);
  picker?.querySelectorAll(".reco-pick-card").forEach(card => card.classList.toggle("active", String(card.dataset.malid) === String(anime.malId)));
  await loadRecoSection(cfg.resultsId, cfg.urlFn(anime.malId), cfg.labelFn, cfg.extractFn);
}
function setupRecoSmartPicker(cfg, allAnimes) {
  const select = document.getElementById(cfg.selectId);
  const search = document.getElementById(cfg.searchId);
  const launch = document.getElementById(cfg.launchId);
  const suggestionBox = document.getElementById(`reco-${cfg.kind}-suggestions`);
  select?.addEventListener("change", () => {
    const anime = allAnimes.find(a => String(a.malId) === String(select.value));
    if (anime && search) search.value = anime.title || "";
    hideRecoSuggestionsV2(cfg);
  });
  search?.addEventListener("keydown", event => {
    const buttons = Array.from(suggestionBox?.querySelectorAll(".reco-search-suggestion") || []);
    let activeIndex = Number(suggestionBox?.dataset.activeIndex ?? -1);
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && buttons.length) {
      event.preventDefault();
      activeIndex += event.key === "ArrowDown" ? 1 : -1;
      if (activeIndex < 0) activeIndex = buttons.length - 1;
      if (activeIndex >= buttons.length) activeIndex = 0;
      if (suggestionBox) suggestionBox.dataset.activeIndex = String(activeIndex);
      buttons.forEach((button, index) => button.classList.toggle("active", index === activeIndex));
      buttons[activeIndex]?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Escape") { hideRecoSuggestionsV2(cfg); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && buttons[activeIndex]) {
        buttons[activeIndex].click();
        return;
      }
      const matches = recoSearchCandidatesV2(search.value, allAnimes, 8);
      if (matches.length > 1 && normalizeRecoSearchV2(matches[0]?.title) !== normalizeRecoSearchV2(search.value)) {
        renderRecoSuggestionsV2(cfg, allAnimes);
        return;
      }
      launchRecoFromControlsV2(cfg, allAnimes);
    }
  });
  search?.addEventListener("input", () => {
    const anime = findRecoAnimeV2(cfg, allAnimes);
    if (anime && select) select.value = String(anime.malId);
    renderRecoSuggestionsV2(cfg, allAnimes);
  });
  search?.addEventListener("focus", () => renderRecoSuggestionsV2(cfg, allAnimes));
  search?.addEventListener("blur", () => setTimeout(() => hideRecoSuggestionsV2(cfg), 120));
  launch?.addEventListener("click", () => { hideRecoSuggestionsV2(cfg); launchRecoFromControlsV2(cfg, allAnimes); });
}


function wireSection(pickerId, resultsId, urlFn, extractFn, labelFn, options = {}) {
  document.getElementById(pickerId)?.querySelectorAll(".reco-pick-card:not([data-wired])").forEach(card=>{
    card.dataset.wired = "1";
    card.addEventListener("click",async()=>{
      document.getElementById(pickerId)?.querySelectorAll(".reco-pick-card").forEach(c=>c.classList.remove("active"));
      card.classList.add("active");
      const select = options.selectId ? document.getElementById(options.selectId) : null;
      const search = options.searchId ? document.getElementById(options.searchId) : null;
      if (select) select.value = card.dataset.malid || "";
      if (search) search.value = card.dataset.title || "";
      await loadRecoSection(resultsId, urlFn(card.dataset.malid), labelFn, extractFn);
    });
  });
}

function recoForceUrlV2(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set("refresh", "1");
    return parsed.pathname + parsed.search;
  } catch {
    return String(url || "") + (String(url || "").includes("?") ? "&" : "?") + "refresh=1";
  }
}

function recoSectionContextMarkupV2(data) {
  let peopleMarkup = "";
  if (Array.isArray(data?.creators) && data.creators.length) {
    const names = data.creators.map(person => `${person.name || "Auteur inconnu"}${person.role ? ` · ${person.role}` : ""}`);
    peopleMarkup = `<div class="reco-section-context"><strong>✍️ Créateur détecté</strong><span>${escapeHtmlV2(names.join(" · "))}</span></div>`;
  } else if (Array.isArray(data?.seiyuu) && data.seiyuu.length) {
    const names = data.seiyuu.map(person => `${person.name || "Voix inconnue"}${person.role ? ` · ${person.role}` : ""}`).filter(Boolean);
    peopleMarkup = `<div class="reco-section-context"><strong>🎙️ Voix détectées</strong><span>${escapeHtmlV2(names.join(" · "))}</span></div>`;
  }

  const source = String(data?.source || "").trim();
  const sourceMarkup = source
    ? `<div class="reco-section-source"><span>Sources : ${escapeHtmlV2(source)}</span>${data?.cached ? "<em>cache local</em>" : "<em>actualisé</em>"}</div>`
    : "";
  const warning = String(data?.warning || "").trim();
  const warningMarkup = warning ? `<div class="reco-section-warning">⚠ ${escapeHtmlV2(warning)}</div>` : "";
  return peopleMarkup + sourceMarkup + warningMarkup;
}

function wireRecoRetryV2(el, url, labelFn, extractFn) {
  el.querySelector(".reco-inline-retry")?.addEventListener("click", () => {
    loadRecoSection(el.id, recoForceUrlV2(url), labelFn, extractFn);
  });
}

const recoSectionRequestsV2 = new Map();
async function loadRecoSection(elId, url, labelFn, extractFn) {
  const el = document.getElementById(elId);
  if (!el) return;
  const request = Symbol(elId);
  recoSectionRequestsV2.set(elId, request);
  const isCurrent = () => recoSectionRequestsV2.get(elId) === request && document.getElementById(elId) === el;
  el.style.display = "";
  el.innerHTML = `<div class="reco-loading-inline"><div class="news-spinner" style="width:20px;height:20px;border-width:2px"></div> Recherche AniList rapide… Jikan uniquement si nécessaire…</div>`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!isCurrent()) return;
    if (!response.ok || data?.error) throw new Error(data?.error || `Erreur HTTP ${response.status}`);
    const extracted = extractFn(data);
    const rawItems = Array.isArray(extracted) ? extracted : [];
    const items = filterRecoItemsV2(rawItems);
    const contextMarkup = recoSectionContextMarkupV2(data);
    if (!items.length) {
      const message = rawItems.length
        ? "Toutes les propositions trouvées sont actuellement masquées."
        : (data?.message || "Aucune proposition n’a été trouvée pour cet animé.");
      el.innerHTML = contextMarkup + `<div class="reco-result-message"><strong>${escapeHtmlV2(message)}</strong><span>Essaie un autre animé ou relance une recherche directe sans utiliser l’ancien cache.</span><button type="button" class="reco-inline-retry">Réessayer sans cache</button></div>`;
      wireRecoRetryV2(el, url, labelFn, extractFn);
      return;
    }
    el.innerHTML = contextMarkup + items.map(item => recoCard(item, typeof labelFn === "function" ? labelFn(item) : labelFn)).join("");
    wireAdd(el);
  } catch (error) {
    if (!isCurrent()) return;
    el.innerHTML = `<div class="reco-result-message error"><strong>Impossible de charger cette section.</strong><span>${escapeHtmlV2(error.message)}</span><button type="button" class="reco-inline-retry">Réessayer sans cache</button></div>`;
    wireRecoRetryV2(el, url, labelFn, extractFn);
  }
}

function recoCard(item,label){
  item={...item,title:window.ALM_TITLES?.title(item)||item.title};
  const inCollection=window.ALM_COLLECTION?.find(item);
  const directImage = safeUrlV2(item.imageUrl || "");
  const cachedImage = item.malId ? `/api/v2/reco/image/${encodeURIComponent(item.malId)}` : "";
  const imageSrc = directImage !== "#" ? directImage : cachedImage;
  const fallbackAttr = cachedImage && directImage !== "#" ? ` data-fallback="${escapeHtmlV2(cachedImage)}"` : "";
  const thumb=imageSrc?`<img class="reco-card-thumb" src="${imageSrc}" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer"${fallbackAttr} data-image-fallback="true">`:`<div class="reco-card-thumb-ph">🎌</div>`;
  return`<div class="reco-card" data-record="${escapeHtmlV2(JSON.stringify(item))}" data-reco-key="${escapeHtmlV2(recoKeyV2(item))}" data-malid="${escapeHtmlV2(item.malId||"")}" data-title="${escapeHtmlV2(item.title||"")}">${thumb}<div class="reco-card-body">
    <div class="reco-card-title">${escapeHtmlV2(item.title||"")}</div>
    <div class="reco-card-meta">${escapeHtmlV2(label||"")}</div>
    <div class="reco-card-score">${item.publicScore?"⭐ "+escapeHtmlV2(item.publicScore):""}</div>
    <div class="reco-card-actions">
      ${!inCollection?`<select class="reco-add-status" data-no-i18n aria-label="${escapeHtmlV2(window.ALM_RETOUCHES.t('add'))}">${window.ALM_WATCH_STATUS.options('Plan to Watch')}</select>`:''}
      <button class="reco-card-add" ${inCollection?'disabled data-in-collection="1"':''} data-malid="${escapeHtmlV2(item.malId||"")}" data-title="${escapeHtmlV2(item.title||"")}">${escapeHtmlV2(inCollection?window.ALM_COLLECTION.label(inCollection):window.ALM_DESIGN.t("searchAdd"))}</button>
      <button class="reco-card-hide" data-malid="${escapeHtmlV2(item.malId||"")}" data-title="${escapeHtmlV2(item.title||"")}">Masquer</button>
    </div>
  </div></div>`;
}

function wireAdd(container){
  container.querySelectorAll('.reco-add-status:not([data-label-wired])').forEach(select=>{select.dataset.labelWired='1';const update=()=>{const b=select.closest('.reco-card').querySelector('.reco-card-add');if(!b.disabled)b.textContent=window.ALM_ADD_LABEL(select.value);};select.addEventListener('change',update);update();});
  container.querySelectorAll(".reco-card-hide:not([data-wired])").forEach(btn=>{
    btn.dataset.wired = "1";
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const card = btn.closest(".reco-card");
      hideRecoItemV2({ malId: btn.dataset.malid, title: btn.dataset.title }, card);
    });
  });
  container.querySelectorAll(".reco-card-add:not([data-wired])").forEach(btn=>{
    btn.dataset.wired = "1";
    btn.addEventListener("click",async e=>{
      e.stopPropagation();
      if (btn.disabled) return;
      const existing = window.ALM_COLLECTION?.find({malId:btn.dataset.malid,title:btn.dataset.title});
      if(existing){btn.disabled=true;btn.dataset.inCollection='1';btn.textContent=window.ALM_COLLECTION.label(existing);return;}
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Ajout…";
      try {
        const status=btn.closest('.reco-card').querySelector('.reco-add-status')?.value||'Plan to Watch';
        let record={...JSON.parse(btn.closest('.reco-card').dataset.record||'{}'),malId:btn.dataset.malid,title:btn.dataset.title};record.poster=record.poster||record.imageUrl||'';
        if(record.malId)try{const r=await fetch('/api/discover/'+encodeURIComponent(record.malId)+'/record');if(r.ok){const exact=await r.json();if(Number(exact.malId)===Number(record.malId)&&exact.title)record={...record,...exact};}}catch{}
        const payload=await window.ALM_BETA38.preparePayload({...record,status,episodesSeen:status==='Completed'?record.episodesTotal||'':'0',autoInfo:false,catalogAdd:true},null);
        if(!payload){btn.disabled=false;btn.textContent=original;return;}
        const response=await fetch('/api/animes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data?.error) throw new Error(data?.error || `Erreur HTTP ${response.status}`);

        if (typeof load === "function") await load();
        btn.classList.add("added");
        if (data?.alreadyExists) {
          btn.textContent = "✓ Déjà présent";
          const storedTitle = data?.existingAnime?.title || btn.dataset.title || "cet animé";
          window.notifyApp?.(`Déjà dans ta bibliothèque : ${storedTitle}`, "info");
        } else {
          btn.textContent = "✓ Ajouté";
          window.notifyApp?.((data?.anime?.title||btn.dataset.title)+' · '+window.ALM_WATCH_STATUS.label(status), "success");
        }
      } catch (error) {
        btn.disabled = false;
        btn.textContent = original || "+ Ma liste";
        window.notifyApp?.(`Ajout impossible : ${error.message}`, "error");
      }
    });
  });
}

// ─── SCORE PRÉDICTIF ───────────────────────────────────────
async function loadProfileAndInjectBadges() {
  try{const r=await fetch("/api/v2/profile");if(!r.ok)return;window._v2Profile=await r.json();}catch{}
  injectBadges();
}
function injectBadges() {
  const prof=window._v2Profile;if(!prof?.patterns)return;
  const animes=getAnimes();
  document.querySelectorAll("[data-anime-id]:not([data-predicted])").forEach(card=>{
    const a=animes.find(x=>String(x.id)===String(card.dataset.animeId));
    if(!a||!isAnimeFeatureEligibleV2(a)||a.score)return;
    let tot=0,w=0;for(const g of(a.genres||[])){const p=prof.patterns[g];if(p?.count>=2){tot+=p.averageScore*p.count;w+=p.count;}}
    if(!w)return;
    const pred=Math.round((tot/w)*10)/10;card.dataset.predicted=pred;
    const el=card.querySelector("[class*='score']");
    if(el&&!el.querySelector(".predict-badge")){const b=document.createElement("span");b.className="predict-badge";b.title="Score prédictif";b.textContent=`🎯 ${pred}`;el.appendChild(b);}
  });
}

// ─── INIT ────────────────────────────────────────────────

// ─────────────────────────────────────────────
//  PAGE NEWS SAISONS (indépendante, sans reset)
// ─────────────────────────────────────────────
let _seasonNewsData = null;
let _seasonNewsMeta = { cacheValid: false, completedAt: "", cached: false };
let _seasonNewsLoading = false;
let _seasonScanJobId = "";
let _seasonDetailsJobId = "";
let _seasonProgressMode = "scan";
let _seasonProgressMinimized = false;
let _seasonAutoDismissTimer = null;
let _seasonAutoDismissTick = null;

function seasonProgressText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? "");
}

function seasonProgressDuration(seconds) {
  if (typeof formatJobDuration === "function") return formatJobDuration(seconds);
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  return `${String(minutes).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function seasonScanDateLabelV2(value) {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) return "";
  try {
    return new Date(time).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function rememberSeasonScanMetaV2(payload = {}) {
  const state = payload?.scanState && typeof payload.scanState === "object" ? payload.scanState : {};
  const completedAt = String(payload?.lastScanAt || state?.completedAt || _seasonNewsMeta.completedAt || "");
  _seasonNewsMeta = {
    cacheValid: payload?.cacheValid === true || payload?.cached === true || _seasonNewsMeta.cacheValid === true,
    cached: payload?.cached === true,
    completedAt
  };
}

let _seasonDismissClock=null;
function cancelSeasonAutoDismissV2() {
  _seasonDismissClock?.stop();_seasonDismissClock=null;
  if (_seasonAutoDismissTimer) clearTimeout(_seasonAutoDismissTimer);
  if (_seasonAutoDismissTick) clearInterval(_seasonAutoDismissTick);
  _seasonAutoDismissTimer = null;
  _seasonAutoDismissTick = null;
  const dismiss = document.getElementById("seasonProgressDismiss");
  if (dismiss && !dismiss.classList.contains("hidden")) dismiss.textContent = "Fermer";
}

function scheduleSeasonAutoDismissV2(seconds = 10) {
  cancelSeasonAutoDismissV2();
  const panel = document.getElementById("seasonProgressPanel");
  const dock = document.getElementById("seasonProgressDock");
  const dismiss = document.getElementById("seasonProgressDismiss");
  if (!panel || panel.classList.contains("hidden")) return;
  if(window.ALM_COUNTDOWN&&dismiss){
    _seasonDismissClock=window.ALM_COUNTDOWN.start(dismiss,Math.max(1,Number(seconds)||10)*1000,()=>{ cancelSeasonAutoDismissV2();panel.classList.add('hidden');dock?.classList.add('hidden');},panel);return;
  }
  const startedAt = Date.now();
  const updateLabel = () => {
    const remaining = Math.max(0, Math.ceil(seconds - (Date.now() - startedAt) / 1000));
    if (dismiss && !dismiss.classList.contains("hidden")) dismiss.textContent = remaining > 0 ? `Fermer · ${remaining} s` : "Fermer";
  };
  updateLabel();
  _seasonAutoDismissTick = setInterval(updateLabel, 250);
  _seasonAutoDismissTimer = setTimeout(() => {
    cancelSeasonAutoDismissV2();
    panel.classList.add("hidden");
    dock?.classList.add("hidden");
  }, Math.max(1, Number(seconds) || 10) * 1000);
}

function setSeasonProgressMinimized(minimized) {
  _seasonProgressMinimized = Boolean(minimized);
  const panel = document.getElementById("seasonProgressPanel");
  const dock = document.getElementById("seasonProgressDock");
  if (!panel || !dock) return;
  panel.classList.toggle("hidden", _seasonProgressMinimized);
  dock.classList.toggle("hidden", !_seasonProgressMinimized);
  if (!_seasonProgressMinimized) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetSeasonProgress(mode = "scan") {
  cancelSeasonAutoDismissV2();
  _seasonProgressMode = mode;
  _seasonProgressMinimized = false;
  const panel = document.getElementById("seasonProgressPanel");
  panel?.classList.remove("hidden", "is-done", "is-error", "is-cancelled");
  document.getElementById("seasonProgressDock")?.classList.add("hidden");
  document.getElementById("seasonProgressDismiss")?.classList.add("hidden");
  const cancel = document.getElementById("seasonProgressCancel");
  if (cancel) {
    cancel.classList.remove("hidden");
    cancel.disabled = true;
    cancel.textContent = "Préparation…";
  }

  const isDetails = mode === "details";
  seasonProgressText("seasonProgressState", isDetails ? "Mise à jour des fiches saisons" : "Analyse des nouvelles saisons");
  seasonProgressText("seasonProgressTitle", isDetails ? "Compléter les informations détectées" : "Recherche des suites et nouvelles saisons");
  seasonProgressText("seasonProgressCurrent", isDetails ? "Préparation des métadonnées locales…" : "Lecture de la bibliothèque locale…");
  seasonProgressText("seasonProgressCount", "0 / 0");
  seasonProgressText("seasonProgressCountLabel", isDetails ? "fiches traitées" : "analysés");
  seasonProgressText("seasonProgressPercent", "0 %");
  seasonProgressText("seasonProgressTime", "Calcul du temps restant…");
  seasonProgressText("seasonProgressDockText", isDetails ? "Mise à jour des saisons — préparation…" : "Recherche des saisons — préparation…");

  const labels = isDetails
    ? ["Fiches locales", "Fiches réseau", "Complétées", "À vérifier"]
    : ["Cache réutilisé", "Identifiants locaux", "Appels réseau", "Suites trouvées"];
  labels.forEach((label, index) => {
    seasonProgressText(`seasonProgressMetric${index + 1}Label`, label);
    seasonProgressText(`seasonProgressMetric${index + 1}`, "0");
  });
  const bar = document.getElementById("seasonProgressBar");
  if (bar) bar.style.width = "2%";
  panel?.querySelector(".completion-progress-track")?.setAttribute("aria-valuenow", "0");
}

function updateSeasonProgress(job = {}, mode = _seasonProgressMode) {
  const total = Math.max(0, Number(job.total) || 0);
  const done = Math.max(0, Number(job.done) || 0);
  const prepared = Math.max(0, Number(job.prepared) || 0);
  const terminal = ["done", "cancelled", "error"].includes(job.status);
  const serverPercent = Number(job.percent);
  const computedPercent = total ? Math.round((Math.min(done, total) / total) * 100) : 0;
  const pct = job.status === "done"
    ? 100
    : Math.max(0, Math.min(99, Number.isFinite(serverPercent) ? Math.round(serverPercent) : computedPercent));
  const panel = document.getElementById("seasonProgressPanel");
  const isDetails = mode === "details";
  const preparingScan = !isDetails && ["prepare", "relations"].includes(String(job.phase || ""));
  const visibleDone = preparingScan ? Math.min(prepared, total) : done;

  const stateByStatus = isDetails
    ? { running: "Mise à jour en cours", cancelling: "Annulation demandée", cancelled: "Mise à jour arrêtée", done: "Traitement terminé", error: "Erreur de mise à jour" }
    : { running: "Analyse en cours", cancelling: "Annulation demandée", cancelled: "Analyse arrêtée", done: "Analyse terminée", error: "Erreur d’analyse" };
  const scanPhaseLabels = {
    prepare: "Préparation locale",
    relations: "Relations AniList groupées",
    scan: "Analyse des suites",
    save: "Sauvegarde locale",
    cache: "Résultats en cache"
  };
  const baseState = stateByStatus[job.status] || stateByStatus.running;
  seasonProgressText(
    "seasonProgressState",
    !isDetails && job.status === "running" && scanPhaseLabels[job.phase]
      ? `${baseState} · ${scanPhaseLabels[job.phase]}`
      : baseState
  );
  seasonProgressText("seasonProgressCount", `${visibleDone} / ${total}`);
  seasonProgressText("seasonProgressCountLabel", isDetails ? "fiches traitées" : (preparingScan ? "préparés" : "analysés"));
  const phasePct = Math.max(0, Math.min(100, Number(job.phasePercent ?? (total ? Math.round((visibleDone / total) * 100) : 0))));
  seasonProgressText("seasonProgressPercent", isDetails ? `${pct} %` : `global ${pct} % · phase ${phasePct} %`);

  const elapsed = seasonProgressDuration(job.elapsed || 0);
  const remaining = Number(job.estimatedRemainingSeconds);
  const time = Number.isFinite(remaining) && remaining > 0 && ["running", "cancelling"].includes(job.status)
    ? `Écoulé ${elapsed} · reste environ ${seasonProgressDuration(remaining)}`
    : (["running", "cancelling"].includes(job.status) && !Number.isFinite(remaining)
      ? `Écoulé ${elapsed} · estimation en cours…`
      : `Temps écoulé : ${elapsed}`);
  seasonProgressText("seasonProgressTime", time);

  let current = job.current || (isDetails ? "Préparation de la prochaine fiche…" : "Préparation du prochain animé…");
  if (job.status === "done") current = isDetails
    ? `${Number(job.local || 0) + Number(job.network || 0)} fiche(s) réellement complètes · ${Number(job.incomplete || 0)} incomplète(s) · ${Number(job.failed || 0)} introuvable(s)`
    : `${Number(job.found || job.count || 0)} suite(s) ou nouvelle(s) saison(s) détectée(s)`;
  if (job.status === "cancelled") current = "Arrêt propre effectué. Les résultats déjà trouvés sont conservés.";
  if (job.status === "error") current = job.error || "Erreur inconnue";
  seasonProgressText("seasonProgressCurrent", current);

  if (isDetails) {
    const completed = Math.max(0, Number(job.local || 0) + Number(job.network || 0));
    seasonProgressText("seasonProgressMetric1", Number(job.local || 0));
    seasonProgressText("seasonProgressMetric2", Number(job.network || 0));
    seasonProgressText("seasonProgressMetric3", completed);
    seasonProgressText("seasonProgressMetric4", Number(job.incomplete || 0) + Number(job.failed || 0));
  } else {
    seasonProgressText("seasonProgressMetric1", Number(job.cacheHits || 0));
    seasonProgressText("seasonProgressMetric2", Number(job.localMatches || 0));
    seasonProgressText("seasonProgressMetric3", Number(job.networkRequests || 0));
    seasonProgressText("seasonProgressMetric4", Number(job.found || job.count || 0));
  }

  seasonProgressText("seasonProgressDockText", `${isDetails ? "Mise à jour" : "Recherche des saisons"} — ${visibleDone}/${total} (${pct} %)`);
  const bar = document.getElementById("seasonProgressBar");
  if (bar) bar.style.width = `${Math.max(job.status === "running" ? 2 : 0, pct)}%`;
  panel?.querySelector(".completion-progress-track")?.setAttribute("aria-valuenow", String(pct));

  if (terminal) {
    setSeasonProgressMinimized(false);
    panel?.classList.toggle("is-done", job.status === "done");
    panel?.classList.toggle("is-error", job.status === "error");
    panel?.classList.toggle("is-cancelled", job.status === "cancelled");
    document.getElementById("seasonProgressCancel")?.classList.add("hidden");
    document.getElementById("seasonProgressDismiss")?.classList.remove("hidden");
    if (job.status === "done") scheduleSeasonAutoDismissV2(10);
    else cancelSeasonAutoDismissV2();
  }
}

function ensureSeasonNewsPageActive() {
  if (typeof showV2Page === "function") showV2Page("seasonNewsPage", "navSeasonNews");
}

async function pollSeasonScanJob(jobId) {
  _seasonScanJobId = String(jobId || "");
  const cancel = document.getElementById("seasonProgressCancel");
  if (cancel) { cancel.disabled = false; cancel.textContent = "Annuler"; }
  let failures = 0;

  while (_seasonScanJobId) {
    try {
      const response = await fetch(`/api/news/seasons/job/${encodeURIComponent(_seasonScanJobId)}`);
      if (!response.ok) throw new Error("Progression indisponible");
      const job = await response.json();
      failures = 0;
      updateSeasonProgress(job, "scan");
      if (["done", "cancelled", "error"].includes(job.status)) {
        _seasonScanJobId = "";
        _seasonNewsData = Array.isArray(job.news) ? job.news : [];
        rememberSeasonScanMetaV2(job);
        if (!Array.isArray(job.news)) {
          const cached = await fetch("/api/news/results").then(r => r.ok ? r.json() : null).catch(() => null);
          _seasonNewsData = cached?.news || [];
          if (cached) rememberSeasonScanMetaV2(cached);
        }
        const pageVisible = !document.getElementById("seasonNewsPage")?.classList.contains("hidden");
        renderSeasonNewsPage({ activate: pageVisible });
        if (job.status === "error") {
          window.notifyApp?.(`Recherche des saisons impossible : ${job.error || "erreur inconnue"}`, "error");
        } else if (!pageVisible) {
          window.notifyApp?.(`Recherche terminée : ${Number(job.found || 0)} nouvelle(s) saison(s) détectée(s).`, "success");
        }
        break;
      }
    } catch (error) {
      failures++;
      if (failures >= 6) {
        updateSeasonProgress({ status: "error", error: error.message, done: 0, total: 0 }, "scan");
        _seasonScanJobId = "";
        break;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 650));
  }
}

async function loadSeasonNews(force = false) {
  ensureSeasonNewsPageActive();
  if (_seasonNewsLoading) {
    setSeasonProgressMinimized(false);
    return;
  }
  if (_seasonDetailsJobId) {
    setSeasonProgressMinimized(false);
    window.notifyApp?.("La mise à jour des fiches saisons est déjà en cours.", "info");
    return;
  }
  _seasonNewsLoading = true;
  const container = document.getElementById("seasonNewsContainer");
  const refreshButton = document.getElementById("seasonNewsRefreshBtn");
  if (refreshButton) refreshButton.disabled = true;

  try {
    if (!force) {
      const active = await fetch("/api/news/seasons/active-job").then(r => r.ok ? r.json() : null).catch(() => null);
      if (active?.active && active.jobId) {
        resetSeasonProgress("scan");
        await pollSeasonScanJob(active.jobId);
        return;
      }

      if (Array.isArray(_seasonNewsData)) {
        renderSeasonNewsPage();
        return;
      }

      const cached = await fetch("/api/news/results").then(r => r.ok ? r.json() : null).catch(() => null);
      if (Array.isArray(cached?.news) && (cached.news.length || cached.cacheValid)) {
        _seasonNewsData = cached.news;
        rememberSeasonScanMetaV2(cached);
        renderSeasonNewsPage();
        return;
      }
    }

    resetSeasonProgress("scan");
    if (!_seasonNewsData?.length && container) {
      container.innerHTML = `<div class="season-news-loading compact"><div class="news-spinner"></div><p>La liste apparaîtra ici pendant que l’analyse progresse.</p></div>`;
    }
    const startedResponse = await fetch("/api/news/seasons/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force })
    });
    if (!startedResponse.ok) throw new Error("Impossible de démarrer la recherche");
    const started = await startedResponse.json();
    if (!started.jobId) throw new Error("Identifiant de recherche manquant");
    await pollSeasonScanJob(started.jobId);
  } catch (error) {
    updateSeasonProgress({ status: "error", error: error.message, done: 0, total: 0 }, "scan");
    window.notifyApp?.(`Recherche des saisons impossible : ${error.message}`, "error");
  } finally {
    _seasonNewsLoading = false;
    if (refreshButton) refreshButton.disabled = false;
  }
}

function updateSeasonSelectionControlsV2() {
  const checks = [...document.querySelectorAll(".snews-check")];
  const checked = checks.filter(input => input.checked);
  const addButton = document.getElementById("seasonNewsAddAllBtn");
  const selectAll = document.getElementById("seasonNewsSelectAllBtn");
  const clearAll = document.getElementById("seasonNewsClearSelectionBtn");
  const forgetAll = document.getElementById("seasonNewsForgetAllBtn");
  if (addButton) addButton.textContent = window.ALM_DESIGN.t("seasonAddVisible",{count:checked.length});
  if(selectAll)selectAll.textContent=window.ALM_DESIGN.t("seasonSelectVisible");
  if(clearAll)clearAll.textContent=window.ALM_DESIGN.t("seasonClearVisible");
  if (addButton) addButton.disabled = checks.length === 0 || checked.length === 0;
  if (selectAll) selectAll.disabled = checks.length === 0 || checked.length === checks.length;
  if (clearAll) clearAll.disabled = checked.length === 0;
  if (forgetAll) {
    forgetAll.disabled = checks.length === 0;
    forgetAll.textContent = window.ALM_DESIGN.t("seasonForgetVisible",{count:checks.length});
  }
}

function setAllSeasonNewsSelectionV2(checked) {
  document.querySelectorAll(".snews-check").forEach(input => { input.checked = Boolean(checked);window.ALM_SEASON_FILTERS?.setChecked(_seasonNewsData?.[Number(input.id.replace("snews-chk-",""))],input.checked); });
  updateSeasonSelectionControlsV2();
}

function renderSeasonNewsPage(options = {}) {
  const activate = options.activate !== false;
  if (activate) {
    ensureSeasonNewsPageActive();
    document.getElementById("animeGrid")?.classList.add("hidden");
    document.querySelector(".filters")?.classList.add("hidden");
    document.getElementById("stats")?.classList.add("hidden");
    document.querySelector(".hero")?.classList.add("hidden");
  }
  const container = document.getElementById("seasonNewsContainer");
  const subtitle = document.getElementById("seasonNewsSubtitle");
  if (!container) return;
  const news = _seasonNewsData || [];
  const filters=window.ALM_SEASON_FILTERS;
  filters?.prepare(news,window._almAnimes||[]);
  const entries=filters?filters.select(news,window._almAnimes||[]):news.map((item,index)=>({item,index}));

  if (subtitle) {
    const dateLabel = seasonScanDateLabelV2(_seasonNewsMeta.completedAt);
    const directCount = news.filter(item => item?.defaultSelected === true || item?.seasonClass === "direct_sequel").length;
    const extrasCount = Math.max(0, news.length - directCount);
    subtitle.textContent = `${directCount} vraie(s) saison(s)/suite(s) directe(s)${extrasCount ? ` · ${extrasCount} contenu(s) lié(s) à vérifier` : ""}${dateLabel ? ` · dernière recherche : ${dateLabel}` : ""}`;
  }

  if (!news.length) {
    const dateLabel = seasonScanDateLabelV2(_seasonNewsMeta.completedAt);
    container.innerHTML = `<div class="season-news-empty"><div style="font-size:48px">🎉</div><p>Aucune nouvelle saison détectée pour le moment.</p><p style="color:var(--muted);font-size:13px">${dateLabel ? `Recherche terminée le ${escapeHtmlV2(dateLabel)}. ` : ""}Ce résultat est conservé localement ; “Nouvelle recherche” force une nouvelle analyse.</p></div>`;
    updateSeasonSelectionControlsV2();
    return;
  }

  if(!entries.length){container.innerHTML=`<p class="season-news-empty" role="status">${escapeHtmlV2(window.ALM_DESIGN.t('seasonNoMatch'))}</p>`;updateSeasonSelectionControlsV2();return;}
  container.innerHTML = entries.map(({item,index:i}) => {
    const hasImg = safeUrlV2(item.imageUrl || item.poster || "");
    const scoreHtml = item.publicScore ? `<span class="snews-score">⭐ ${escapeHtmlV2(item.publicScore)}</span>` : "";
    const typeHtml = item.type ? `<span class="snews-type">${escapeHtmlV2(item.type)}</span>` : "";
    const title = decodeHtmlTextV2(item.title || item.sequelTitle || "");
    const sourceTitle = decodeHtmlTextV2(item.sourceTitle || item.parentTitle || item.animeTitle || "");
    const relation = decodeHtmlTextV2(item.relation || "");
    const seasonClassLabel = decodeHtmlTextV2(item.seasonClassLabel || (item.seasonClass === "direct_sequel" ? "Saison / suite directe" : "Contenu lié"));
    const defaultSelected = item.defaultSelected === true || item.seasonClass === "direct_sequel";
    const synopsisText = window.ALM_CONTENT_LANGUAGE?.clean(item.synopsis) || decodeHtmlTextV2(item.synopsis || "").replace(/<[^>]*>/g," ");
    const synopsis = synopsisText ? `<p class="snews-synopsis">${escapeHtmlV2(synopsisText.slice(0, 180))}${synopsisText.length > 180 ? "…" : ""}</p>` : `<p class="snews-synopsis muted">Informations en attente. Clique sur “Compléter les infos” pour compléter affiches, dates et descriptions.</p>`;
    return `<div class="snews-card" data-idx="${i}">
      <div class="snews-thumb">
        ${hasImg && hasImg !== "#"
          ? `<img src="${hasImg}" alt="" loading="lazy" referrerpolicy="no-referrer" data-image-fallback="true">`
          : `<div class="snews-thumb-ph">📺</div>`}
      </div>
      <div class="snews-body">
        <div class="snews-meta">${typeHtml}${scoreHtml}<span class="snews-class ${defaultSelected ? "direct" : "extra"}">${escapeHtmlV2(seasonClassLabel)}</span></div>
        <h3 class="snews-title"><button type="button" class="season-detail-open" data-season-detail="${i}">${escapeHtmlV2(title)}</button></h3>
        <p class="snews-from">Suite de : <strong>${escapeHtmlV2(sourceTitle)}</strong>${relation ? ` · ${escapeHtmlV2(relation)}` : ""}</p>
        ${synopsis}
        <div class="snews-details">
          <span>📅 ${escapeHtmlV2(item.startDate || "Date inconnue")}</span>
          <span>🎞️ ${escapeHtmlV2(item.episodesTotal || "?")} épisode(s)</span>
          ${item.genres?.length ? `<span>🏷️ ${escapeHtmlV2(item.genres.slice(0,3).map(g=>window.ALM_CONTENT_LANGUAGE?.genre(g)||g).join(", "))}</span>` : ""}
        </div>
        <div class="snews-actions">
          <label><input type="checkbox" class="snews-check" id="snews-chk-${i}" ${(filters?.checked(item,defaultSelected)??defaultSelected) ? "checked" : ""}> ${defaultSelected ? "Ajouter par défaut" : "Inclure ce contenu lié"}</label>
          ${item.malUrl || item.url ? `<a href="${safeUrlV2(item.malUrl || item.url)}" target="_blank" rel="noopener" class="snews-mal-link">MAL ↗</a>` : ""}
        </div>
      </div>
      <div class="snews-decision-actions">
        <button type="button" data-add-one="${i}" class="snews-decision add">Ajouter à voir prochainement</button>
        <button type="button" data-hide-one="${i}" class="snews-decision neutral">Ne pas ajouter</button>
        <button type="button" data-ignore-one="${i}" class="snews-decision danger">Oublier définitivement</button>
      </div>
    </div>`;
  }).join("");
  window.ALM_CONTENT_LANGUAGE?.seasonDescriptions(news);
  const openDetails=(index,source)=>window.ALM_CATALOG?.openRecords(entries.map(({item})=>({...item,title:item.title||item.sequelTitle,malId:Number(item.malId||item.sequelMalId||String(item.malUrl||item.url||'').match(/\/anime\/(\d+)/)?.[1]),poster:item.poster||item.imageUrl||''})),entries.findIndex(r=>r.index===index),source);
  container.querySelectorAll('.snews-card').forEach(card=>{
    const index=Number(card.dataset.idx),button=card.querySelector('[data-season-detail]');
    button.onclick=()=>openDetails(index,button);
    card.onclick=event=>{if(!event.target.closest('button,a,input,label,select'))openDetails(index,button);};
  });
  container.querySelectorAll(".snews-check").forEach(input => input.addEventListener("change",()=>{filters?.setChecked(news[Number(input.id.replace("snews-chk-",""))],input.checked);updateSeasonSelectionControlsV2();}));
  updateSeasonSelectionControlsV2();
}

async function completeSeasonInfos() {
  if (!_seasonNewsData?.length) {
    window.notifyApp?.("Aucune saison à compléter.", "info");
    return;
  }
  if (_seasonDetailsJobId || _seasonScanJobId) {
    window.notifyApp?.("Une opération sur les saisons est déjà en cours.", "info");
    setSeasonProgressMinimized(false);
    return;
  }

  const btn = document.getElementById("seasonNewsCompleteBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ En cours..."; }
  resetSeasonProgress("details");

  try {
    const response = await fetch("/api/news/details/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: _seasonNewsData })
    });
    if (!response.ok) throw new Error("Impossible de démarrer la mise à jour");
    const started = await response.json();
    _seasonDetailsJobId = String(started.jobId || "");
    if (!_seasonDetailsJobId) throw new Error("Identifiant de mise à jour manquant");

    const cancel = document.getElementById("seasonProgressCancel");
    if (cancel) { cancel.disabled = false; cancel.textContent = "Annuler"; }
    let failures = 0;

    while (_seasonDetailsJobId) {
      try {
        const progressResponse = await fetch(`/api/news/details/progress/${encodeURIComponent(_seasonDetailsJobId)}`);
        if (!progressResponse.ok) throw new Error("Progression indisponible");
        const job = await progressResponse.json();
        failures = 0;
        updateSeasonProgress(job, "details");
        if (["done", "cancelled", "error"].includes(job.status)) {
          _seasonDetailsJobId = "";
          if (Array.isArray(job.items)) _seasonNewsData = job.items;
          else {
            const saved = await fetch("/api/news/results").then(r => r.ok ? r.json() : null).catch(() => null);
            if (Array.isArray(saved?.news)) _seasonNewsData = saved.news;
          }
          const pageVisible = !document.getElementById("seasonNewsPage")?.classList.contains("hidden");
          renderSeasonNewsPage({ activate: pageVisible });
          if (job.status === "error") throw new Error(job.error || "Erreur de mise à jour");
          if (!pageVisible) window.notifyApp?.("Mise à jour des fiches saisons terminée.", "success");
          break;
        }
      } catch (error) {
        failures++;
        if (failures >= 6) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 550));
    }
  } catch (error) {
    _seasonDetailsJobId = "";
    updateSeasonProgress({ status: "error", error: error.message, done: 0, total: _seasonNewsData.length }, "details");
    window.notifyApp?.(`Mise à jour des saisons impossible : ${error.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "📋 Compléter les infos"; }
  }
}

async function cancelSeasonOperation() {
  const button = document.getElementById("seasonProgressCancel");
  if (button) { button.disabled = true; button.textContent = "Annulation…"; }
  seasonProgressText("seasonProgressState", "Annulation demandée");
  seasonProgressText("seasonProgressCurrent", "Les requêtes déjà lancées se terminent, puis l’opération s’arrête proprement.");

  try {
    if (_seasonScanJobId) {
      const response = await fetch(`/api/news/seasons/job/${encodeURIComponent(_seasonScanJobId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (!response.ok) throw new Error("Annulation indisponible");
      return;
    }
    if (_seasonDetailsJobId) {
      const response = await fetch(`/api/news/details/cancel/${encodeURIComponent(_seasonDetailsJobId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (!response.ok) throw new Error("Annulation indisponible");
      return;
    }
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = "Annuler"; }
    window.notifyApp?.(`Annulation impossible : ${error.message}`, "error");
  }
}

async function hideOneSeasonNewsV2(idx) {
  if (!Number.isInteger(idx) || idx < 0 || !_seasonNewsData?.[idx]) return;
  _seasonNewsData = _seasonNewsData.filter((_, index) => index !== idx);
  await fetch("/api/news/results/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: _seasonNewsData })
  }).catch(() => {});
  renderSeasonNewsPage();
}

async function forgetAllSeasonNewsV2() {
  const all=Array.isArray(_seasonNewsData)?_seasonNewsData:[];
  const items = window.ALM_SEASON_FILTERS?window.ALM_SEASON_FILTERS.select(all,window._almAnimes||[]).map(r=>r.item):all.filter(Boolean);
  if (!items.length) {
    window.notifyApp?.("Aucun contenu restant à oublier.", "info");
    return;
  }
  const accepted = typeof window.showAppConfirm === "function"
    ? await window.showAppConfirm(
        window.ALM_DESIGN.t("seasonForgetConfirm",{count:items.length}),
        { title: window.ALM_DESIGN.t("seasonForgetTitle"), okText: window.ALM_DESIGN.t("seasonForgetVisible",{count:items.length}), cancelText: window.ALM_DESIGN.t("cancel"), danger: true }
      )
    : false;
  if (!accepted) return;
  const button = document.getElementById("seasonNewsForgetAllBtn");
  if (button) { button.disabled = true; button.textContent = window.ALM_DESIGN.t("seasonForgetting"); }
  try {
    const response = await fetch("/api/news/ignore-all-sequels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
    const removed=new Set(items);_seasonNewsData=all.filter(item=>!removed.has(item));
    renderSeasonNewsPage();
    window.notifyApp?.(window.ALM_DESIGN.t("seasonForgotten",{count:Number(data.ignored||items.length)}),"success");
  } catch (error) {
    window.notifyApp?.(window.ALM_DESIGN.t("seasonForgetFailed"), "error");
    updateSeasonSelectionControlsV2();
  }
}

async function addSelectedSeasonNews() {
  const checked = document.querySelectorAll(".snews-check:checked");
  if (!checked.length) {
    window.notifyApp?.("Aucune saison sélectionnée.", "info");
    return;
  }
  const idxs = [...checked].map(c => Number(c.id.replace("snews-chk-","")));
  const toAdd = idxs.map(i => _seasonNewsData[i]).filter(Boolean);
  const counts = toAdd.reduce((acc, item) => {
    const label = item?.seasonClassLabel || "Contenu lié";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts).map(([label, count]) => `${count} × ${label}`).join(" · ");
  const accepted = typeof askAppConfirmation === "function"
    ? await askAppConfirmation(`Tu vas ajouter ${toAdd.length} élément(s) à « À voir ».\n\n${summary}\n\nLes OVA, specials, films et spin-off ne sont jamais cochés par défaut.`, {
        title: "Confirmer les ajouts de saisons", okText: `Ajouter ${toAdd.length}`, cancelText: "Annuler"
      })
    : false;
  if (!accepted) return;

  const btn = document.getElementById("seasonNewsAddAllBtn");
  if (btn) { btn.disabled = true; btn.textContent = `⏳ Ajout de ${toAdd.length}...`; }
  try {
    const r = await fetch("/api/news/add-all-to-watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: toAdd })
    });
    if (!r.ok) throw new Error("Erreur " + r.status);
    const data = await r.json();
    if (btn) { btn.disabled = false; btn.textContent = `✅ ${data.added || 0} ajouté(s)`; }
    if (data.operationId && Number(data.added || 0) > 0) {
      window.notifyApp?.(`${data.added} ajout(s) effectué(s). Tu peux annuler cette opération pendant 15 minutes.`, "success");
      const undo = document.getElementById("seasonNewsUndoBtn");
      if (undo) { undo.classList.remove("hidden"); undo.dataset.operationId = data.operationId; undo.textContent = `↶ Annuler les ${data.added} ajouts`; }
    }
    const addedKeys = new Set(toAdd.map(x => String(x?.malId || normalizeRecoSearchV2(x?.title || x?.sequelTitle || "")).trim()).filter(Boolean));
    const beforeCount = (_seasonNewsData || []).length;
    _seasonNewsData = (_seasonNewsData || []).filter(item => {
      const key = String(item?.malId || normalizeRecoSearchV2(item?.title || item?.sequelTitle || "")).trim();
      return !addedKeys.has(key);
    });
    if (toAdd.length >= beforeCount) _seasonNewsData = [];
    await fetch("/api/news/results/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: _seasonNewsData })
    }).catch(()=>{});
    renderSeasonNewsPage();
    if (typeof load === "function") load().then(() => ensureSeasonNewsPageActive()).catch(()=>{});
    setTimeout(updateSeasonSelectionControlsV2, 500);
  } catch(e) {
    window.notifyApp?.("Erreur lors de l’ajout : " + e.message, "error");
    if (btn) btn.disabled = false;
    updateSeasonSelectionControlsV2();
  }
}

async function undoLastSeasonBulkAddV2() {
  const button = document.getElementById("seasonNewsUndoBtn");
  const operationId = button?.dataset?.operationId || "";
  if (!operationId) return;
  const accepted = typeof askAppConfirmation === "function"
    ? await askAppConfirmation("Retirer les fiches ajoutées lors de la dernière opération et les remettre dans Nouvelles Saisons ?", { title: "Annuler les ajouts ?", okText: "Oui, annuler", cancelText: "Garder" })
    : false;
  if (!accepted) return;
  try {
    button.disabled = true;
    const response = await fetch("/api/news/undo-last-add", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({operationId}) });
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
    _seasonNewsData = Array.isArray(data.news) ? data.news : _seasonNewsData;
    button.classList.add("hidden");
    button.dataset.operationId = "";
    await (typeof load === "function" ? load() : Promise.resolve());
    renderSeasonNewsPage();
    window.notifyApp?.(`${data.removed || 0} ajout(s) annulé(s).`, "success");
  } catch (error) {
    window.notifyApp?.(`Annulation impossible : ${error.message}`, "error");
  } finally { if (button) button.disabled = false; }
}

const _seasonAddsPending = new WeakSet();
async function addOneSeasonNews(idx) {
  const item = _seasonNewsData?.[idx];
  if (!item || _seasonAddsPending.has(item)) return;
  _seasonAddsPending.add(item);
  const button=document.querySelector('[data-add-one="'+idx+'"]');if(button)button.disabled=true;
  try {
    const response = await fetch("/api/news/add-to-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, title: item.title || item.sequelTitle })
    });
    const result=await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Erreur " + response.status);
    _seasonNewsData = _seasonNewsData.filter(candidate => candidate !== item);
    await fetch("/api/news/results/save", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ items: _seasonNewsData }) }).catch(()=>{});
    await window.reloadAnimeLibrary();
    renderSeasonNewsPage();
    window.notifyApp?.(window.ALM_DESIGN.t(result.alreadyExists?'seasonAlreadyAdded':'seasonAdded',{title:item.title||item.sequelTitle}),result.alreadyExists?'info':'success');
  } catch(e) { window.notifyApp?.("Erreur lors de l’ajout : " + e.message, "error"); }
  finally {_seasonAddsPending.delete(item);if(button?.isConnected)button.disabled=false;}
}

async function ignoreOneSeasonNews(idx) {
  const item = _seasonNewsData?.[idx];
  if (!item) return;
  const accepted = typeof window.showAppConfirm === "function"
    ? await window.showAppConfirm(
        `Oublier définitivement « ${item.title || item.sequelTitle || "cette saison"} » ?`,
        { title: "Oublier cette saison ?", okText: "Oublier", cancelText: "Conserver" }
      )
    : false;
  if (!accepted) return;
  try {
    const r = await fetch("/api/news/ignore-sequel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, title: item.title || item.sequelTitle })
    });
    if (!r.ok) throw new Error("Erreur " + r.status);
    _seasonNewsData = _seasonNewsData.filter(candidate => candidate !== item);
    renderSeasonNewsPage();
  } catch(e) { window.notifyApp?.("Erreur lors de l’oubli : " + e.message, "error"); }
}

// ─────────────────────────────────────────────
//  DNA DROITE : score dist + prochains à finir
// ─────────────────────────────────────────────
function dnaProgressThumbV2(anime, kind) {
  const sizeClass = kind === "almost" ? "dna-almost-thumb" : "dna-watch-thumb";
  const image = safeUrlV2(anime?.poster || anime?.imageUrl || "");
  const malId = Number(anime?.malId);
  const owned = Number.isSafeInteger(malId) && malId > 0 && malId <= 100000000;
  // The normal library already serves known CDN covers from the local cache.
  // DNA must use that same path, including when its library row lacks a poster.
  const managed = owned && (image === "#" || /^https:\/\/(?:cdn\.myanimelist\.net|s4\.anilist\.co|static\.tvmaze\.com|media\.kitsu\.io)\//i.test(image));
  const url = managed ? `/api/cover-cache/${malId}` : image;
  // The fallback stays underneath the image. The global image-error handler
  // hides failed images, leaving a visible (and stable-sized) placeholder.
  return `<span class="${sizeClass}" aria-hidden="true">🎌${url !== "#" ? `<img src="${escapeHtmlV2(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-image-fallback="true"${managed ? ' data-alm-managed-cover="1"' : ""}>` : ""}</span>`;
}
function renderDnaExtras(animes) {
  // Score distribution
  const scoreDistEl = document.getElementById("dnaScoreDist");
  if (scoreDistEl) {
    const dist = {};
    for (let i = 1; i <= 10; i++) dist[i] = 0;
    const scored = animes.filter(a => Number(a.score) > 0);
    const scoreSummaryEl = document.getElementById("dnaScoreSummary");
    const scorePostersEl = document.getElementById("dnaScorePosters");
    if (scored.length) {
      const average = scored.reduce((sum,a)=>sum+Number(a.score||0),0)/scored.length;
      const sortedScores = scored.slice().sort((a,b)=>Number(b.score||0)-Number(a.score||0)||String(a.title||"").localeCompare(String(b.title||"")));
      const best = Number(sortedScores[0]?.score||0);
      const favoriteCount = scored.filter(a=>Number(a.score)>=9).length;
      if (scoreSummaryEl) scoreSummaryEl.innerHTML = `
        <div class="dna-score-stat"><span>⭐</span><strong>${average.toFixed(1)}<small>/10</small></strong><em>Note moyenne</em></div>
        <div class="dna-score-stat"><span>🎬</span><strong>${scored.length}</strong><em>Animés notés</em></div>
        <div class="dna-score-stat"><span>💜</span><strong>${favoriteCount}</strong><em>Coups de cœur 9+</em></div>
        <div class="dna-score-stat"><span>🏆</span><strong>${best}<small>/10</small></strong><em>Meilleure note</em></div>`;
      if (scorePostersEl) scorePostersEl.innerHTML = sortedScores.slice(0,8).map(a=>`
        <button type="button" class="dna-score-poster" data-dna-personal-score="${Math.round(Number(a.score))}" title="${escapeHtmlV2(a.title||"Anime")} — ${escapeHtmlV2(a.score)}/10">
          ${a.poster?`<img src="${safeUrlV2(a.poster)}" alt="${escapeHtmlV2(a.title||"")}" loading="lazy" data-image-fallback="true">`:""}
          <span class="dna-score-poster-ph" ${a.poster?'style="display:none"':''}>🎌</span>
          <span class="dna-score-badge">⭐ ${escapeHtmlV2(a.score)}</span>
          <span class="dna-score-poster-title">${escapeHtmlV2(a.title||"Anime")}</span>
        </button>`).join("");
      scorePostersEl?.querySelectorAll("[data-dna-personal-score]").forEach(button=>button.addEventListener("click",()=>window.showLibraryByPersonalScore?.(Number(button.dataset.dnaPersonalScore||0))));
    } else {
      if (scoreSummaryEl) scoreSummaryEl.innerHTML = "";
      if (scorePostersEl) scorePostersEl.innerHTML = "";
    }
    for (const a of scored) {
      const s = Math.round(Number(a.score));
      if (s >= 1 && s <= 10) dist[s]++;
    }
    const maxDist = Math.max(...Object.values(dist), 1);
    const totalDist = Math.max(1, scored.length);
    const barColor = (s) => s >= 9 ? "#fbbf24" : s >= 8 ? "#a78bfa" : s >= 7 ? "#38bdf8" : s >= 6 ? "#34d399" : s >= 5 ? "#fb923c" : "#fb7185";
    scoreDistEl.innerHTML = `<div class="dna-score-histogram">${Object.entries(dist).reverse().map(([s, n]) => {
      const score = Number(s);
      const height = n ? Math.max(14, Math.round((n / maxDist) * 100)) : 3;
      const percent = Math.round((n / totalDist) * 100);
      return `
      <button type="button" class="dna-score-column${n ? " is-clickable" : " is-empty"}" data-dna-personal-score="${s}" ${n ? "" : "disabled"}
        style="--score-fill:${height}%;--score-color:${barColor(score)}"
        aria-label="Voir les ${n} animé${n > 1 ? "s" : ""} noté${n > 1 ? "s" : ""} ${s} sur 10">
        <span class="dna-score-column-count">${n || "·"}</span>
        <span class="dna-score-column-track" aria-hidden="true"><span class="dna-score-column-fill"></span></span>
        <span class="dna-score-column-label">${score >= 9 ? "★ " : ""}${s}</span>
        <span class="dna-score-column-percent">${n ? percent + "%" : ""}</span>
      </button>`;
    }).join("")}</div>`;
    scoreDistEl.querySelectorAll("[data-dna-personal-score]").forEach(button => {
      button.addEventListener("click", () => {
        const score = Number(button.dataset.dnaPersonalScore || 0);
        if (score > 0 && typeof window.showLibraryByPersonalScore === "function") {
          window.showLibraryByPersonalScore(score);
        }
      });
    });
    if (!scored.length) scoreDistEl.innerHTML = `
      <div class="dna-empty-note">
        <span aria-hidden="true">✍️</span>
        <strong>Aucune note personnelle pour le moment</strong>
        <p>${animes.length} animé${animes.length > 1 ? "s" : ""} sans note personnelle. Ajoute des notes de 1 à 10 : le graphique montrera combien d’animés ont reçu chaque note.</p>
      </div>`;
  }

  // Prochains à finir (Watching avec episodesTotal connu)
  const almostDoneEl = document.getElementById("dnaAlmostDone");
  if (almostDoneEl) {
    const watching = animes.filter(a =>
      a.status === "Watching" &&
      Number(a.episodesTotal) > 0 &&
      Number(a.episodesSeen) > 0 &&
      Number(a.episodesSeen) < Number(a.episodesTotal)
    ).map(a => ({
      ...a,
      remaining: Number(a.episodesTotal) - Number(a.episodesSeen),
      pct: Math.round((Number(a.episodesSeen) / Number(a.episodesTotal)) * 100)
    })).sort((a, b) => a.remaining - b.remaining).slice(0, 5);

    if (!watching.length) {
      almostDoneEl.innerHTML = `<p style="color:var(--muted);font-size:12px;text-align:center;padding:10px">Aucun animé en cours avec progression connue</p>`;
    } else {
      almostDoneEl.innerHTML = watching.map(a => `
        <div class="dna-almost-item">
          ${dnaProgressThumbV2(a, "almost")}
          <div class="dna-almost-info">
            <div class="dna-almost-title" title="${escapeHtmlV2(a.title || "")}" translate="no">${escapeHtmlV2(a.title || "")}</div>
            <div class="dna-almost-ep">${escapeHtmlV2(a.episodesSeen)}/${escapeHtmlV2(a.episodesTotal)} ep · ${a.remaining} restant${a.remaining>1?"s":""}</div>
            <div class="dna-almost-bar"><div style="width:${a.pct}%;background:var(--accent)"></div></div>
          </div>
        </div>`).join("");
    }
  }

  // En cours — liste condensée
  const watchingEl = document.getElementById("dnaWatchingList");
  if (watchingEl) {
    const incomplete = animes.filter(a => a.status === "Watching").slice(0, 8);
    if (!incomplete.length) {
      watchingEl.innerHTML = `<p style="color:var(--muted);font-size:12px;text-align:center;padding:10px">Aucun animé en cours</p>`;
    } else {
      watchingEl.innerHTML = incomplete.map(a => `
        <div class="dna-watch-row">
          ${dnaProgressThumbV2(a, "watch")}
          <div class="dna-watch-info">
            <span class="dna-watch-title" title="${escapeHtmlV2(a.title || "")}" translate="no">${escapeHtmlV2(a.title || "")}</span>
            ${a.episodesSeen ? `<span class="dna-watch-ep">${escapeHtmlV2(a.episodesSeen)}${a.episodesTotal?"/"+escapeHtmlV2(a.episodesTotal):""} ep</span>` : ""}
          </div>
        </div>`).join("");
    }
  }
}

let _auditCache = null;
let _auditVisualObserver = null;
const AUDIT_PAGE_SIZE = 8;
let _auditRenderOffset = 0;
let _auditSearchQuery = "";
let _auditSearchTimer = null;
let _auditResolveTimer = null;
let _auditResolveBusy = false;
const _auditResolveQueue = new Set();
const _auditResolveAttempted = new Set();

function auditSafePosterV2(value) {
  const url = safeUrlV2(value);
  return url === "#" ? "" : url;
}

function auditEmptyMarkupV2(icon, title, text) {
  return `<div class="audit-empty"><span aria-hidden="true">${icon}</span><strong>${escapeHtmlV2(title)}</strong><p>${escapeHtmlV2(text)}</p></div>`;
}

function auditYearV2(value) {
  return String(value || "").match(/\b(19\d{2}|20\d{2}|21\d{2})\b/)?.[1] || "";
}

function auditEvidenceRowsV2(item) {
  const map = new Map();
  for (const row of Array.isArray(item?.evidence) ? item.evidence : []) {
    const kind = String(row?.kind || "").toLowerCase();
    if (!kind || !["anime", "tv"].includes(kind)) continue;
    const previous = map.get(kind);
    const score = Math.max(0, Math.min(100, Math.round(Number(row?.score || 0))));
    if (!previous || score > previous.score) map.set(kind, { ...row, kind, score });
  }
  if (!map.has("anime") && item?.found) {
    map.set("anime", {
      kind: "anime",
      score: Math.max(0, Math.min(100, Math.round(Number(item.found.matchingScore || 0)))),
      source: item.found.source || "MAL / AniList"
    });
  }
  if (!map.has("tv") && item?.tvmaze) {
    map.set("tv", {
      kind: "tv",
      score: Math.max(0, Math.min(100, Math.round(Number(item.tvmaze.matchingScore || 0)))),
      source: item.tvmaze.source || "TVMaze"
    });
  }
  return { anime: map.get("anime") || null, tv: map.get("tv") || null };
}

function auditEvidenceSummaryMarkupV2(item) {
  const { anime, tv } = auditEvidenceRowsV2(item);
  const hasAnime = Boolean(anime && anime.score > 0);
  const hasTv = Boolean(tv && tv.score > 0);
  const classification = String(item?.classification || "review");
  let title = "Aucune correspondance fiable";
  if (hasAnime && hasTv) title = anime.score >= 86 && tv.score >= 86 ? "Deux correspondances fortes" : "Deux candidats à comparer";
  else if (classification === "non_anime" && hasTv) title = "Hors-anime probable";
  else if (classification === "anime" && hasAnime) title = "Anime confirmé";
  else if (hasAnime) title = "Correspondance anime à vérifier";
  else if (hasTv) title = "Correspondance série / film à vérifier";

  const chips = [];
  if (hasAnime) chips.push(`<span class="audit-evidence-chip anime" title="Ressemblance entre le titre importé et le candidat anime. Ce score n’est pas une probabilité."><b>Proximité titre anime</b><span>${anime.score}%</span><small>${escapeHtmlV2(anime.source || "MAL / AniList")}</small></span>`);
  if (hasTv) chips.push(`<span class="audit-evidence-chip tv" title="Ressemblance entre le titre importé et le candidat série ou film. Ce score n’est pas une probabilité."><b>Proximité titre série / film</b><span>${tv.score}%</span><small>${escapeHtmlV2(tv.source || "TVMaze")}</small></span>`);
  return `<div class="audit-evidence-summary"><strong>${escapeHtmlV2(title)}</strong>${chips.length ? `<div>${chips.join("")}</div>` : `<small>Le titre n’a pas reçu de correspondance assez sûre pour afficher un score.</small>`}</div>`;
}

function auditPosterMarkupV2(poster, kind, title, type = "") {
  const safePoster = auditSafePosterV2(poster);
  const isFilm = /\b(?:film|movie|cinema)\b/i.test(String(type || ""));
  const icon = kind === "anime" ? "🎌" : (kind === "tv" ? (isFilm ? "🎬" : "📺") : "📥");
  const label = kind === "anime"
    ? "Image anime indisponible"
    : (kind === "tv"
      ? (isFilm ? "Affiche du film indisponible" : "Affiche de la série indisponible")
      : "Image de l’entrée importée indisponible");
  return `<div class="audit-candidate-poster ${kind}${safePoster ? "" : " is-missing"}">
    ${safePoster ? `<img src="${escapeHtmlV2(safePoster)}" alt="Affiche de ${escapeHtmlV2(title || "candidat")}" loading="lazy" decoding="async" fetchpriority="low" data-image-fallback="true">` : ""}
    <span class="audit-poster-fallback" ${safePoster ? "hidden" : ""}><b aria-hidden="true">${icon}</b><small>${escapeHtmlV2(label)}</small></span>
  </div>`;
}

function auditCandidatePanelMarkupV2(candidate, kind, fallback = {}, selection = null) {
  if (!candidate && !fallback?.title && !fallback?.poster) return "";
  const data = candidate || {};
  const title = String(data.officialTitle || data.name || data.title || fallback.title || "Candidat inconnu");
  const defaultType = kind === "anime" ? "Anime" : (kind === "tv" ? "Série / film" : "Entrée importée");
  const defaultSource = kind === "anime" ? "MAL / AniList" : (kind === "tv" ? "TVMaze" : "Import");
  const defaultKindLabel = kind === "anime" ? "Candidat anime" : (kind === "tv" ? "Candidat série / film" : "Entrée importée");
  const type = String(data.type || fallback.type || defaultType);
  const dateValue = data.startDate || data.premiered || fallback.startDate || "";
  const year = auditYearV2(dateValue);
  const source = String(data.source || fallback.source || defaultSource);
  const poster = data.imageUrl || data.poster || fallback.poster || "";
  const score = Math.max(0, Math.min(100, Math.round(Number(data.matchingScore || fallback.score || 0))));
  const kindLabel = String(fallback.kindLabel || defaultKindLabel);
  const selectionMarkup = selection?.key && selection?.candidate
    ? `<button type="button" class="audit-candidate-select ${escapeHtmlV2(selection.candidate)}${selection.warning ? " warning" : ""}"
        data-audit-origin="pending"
        data-audit-quarantine="${escapeHtmlV2(selection.key)}"
        data-audit-action="select"
        data-audit-candidate="${escapeHtmlV2(selection.candidate)}"
        data-audit-candidate-title="${escapeHtmlV2(title)}"
        data-audit-candidate-type="${escapeHtmlV2(type)}"
        data-audit-candidate-warning="${selection.warning ? "1" : "0"}">
        <span>${escapeHtmlV2(selection.label || "Choisir cette fiche")}</span>
        <small>${escapeHtmlV2(selection.help || "La progression importée sera conservée.")}</small>
      </button>`
    : "";
  return `<section class="audit-candidate ${kind}${selection?.key ? " is-selectable" : ""}">
    ${auditPosterMarkupV2(poster, kind, title, type)}
    <div class="audit-candidate-copy">
      <span class="audit-candidate-kind">${escapeHtmlV2(kindLabel)}</span>
      <strong title="${escapeHtmlV2(title)}">${escapeHtmlV2(title)}</strong>
      <div class="audit-candidate-meta">
        <span>${escapeHtmlV2(type || "Type inconnu")}</span>
        ${year ? `<span>${escapeHtmlV2(year)}</span>` : ""}
        ${data.network ? `<span>${escapeHtmlV2(data.network)}</span>` : ""}
        ${data.country ? `<span>${escapeHtmlV2(data.country)}</span>` : ""}
      </div>
      <small>${escapeHtmlV2(source)}${score ? ` · proximité du titre ${score}%` : ""}</small>
    </div>
    ${selectionMarkup}
  </section>`;
}

function auditIsRemotePosterV2(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function auditNeedsVisualResolveV2(item, origin) {
  const foundImage = auditSafePosterV2(item?.found?.imageUrl);
  const tvImage = auditSafePosterV2(item?.tvmaze?.imageUrl);
  const sourceImage = auditSafePosterV2(item?.sourceImageUrl || item?.poster || item?.anime?.poster || item?.anime?.imageUrl);
  const evidence = auditEvidenceRowsV2(item);
  const hasAnimeCandidate = Boolean(item?.found || evidence.anime);
  const wantsTv = item?.classification === "non_anime" || /betaseries/i.test(String(item?.source || "")) || Boolean(evidence.tv);
  // Une URL distante déjà connue est affichée directement par Chromium en lazy-loading.
  // La recopier dans le cache au moment du scroll provoquait des POST, des remplacements
  // de cartes et des gels visibles. On ne contacte le serveur que si l'image manque.
  if (hasAnimeCandidate && !foundImage) return true;
  if (wantsTv && !tvImage) return true;
  return origin !== "library" && !sourceImage;
}

function auditLibraryCardMarkupV2(item) {
  const nonAnime = item?.classification === "non_anime";
  const tags = (Array.isArray(item?.tags) ? item.tags : []).slice(0, 6)
    .map(tag => `<span>${escapeHtmlV2(tag)}</span>`).join("");
  const ref = String(item?.ref || `library:${Number(item?.id || 0)}`);
  const sourceKind = item?.tvmaze || nonAnime || auditEvidenceRowsV2(item).tv ? "tv" : "source";
  const sourcePanel = auditCandidatePanelMarkupV2(item?.tvmaze, sourceKind, {
    title: item?.title,
    poster: item?.sourceImageUrl || item?.poster,
    type: item?.type,
    startDate: item?.startDate,
    source: item?.source || "Bibliothèque",
    score: auditEvidenceRowsV2(item).tv?.score || 0
  });
  const animePanel = auditCandidatePanelMarkupV2(item?.found, "anime", {
    title: item?.found?.officialTitle,
    score: auditEvidenceRowsV2(item).anime?.score || 0
  });
  const comparison = [sourcePanel, animePanel].filter(Boolean).join("");
  return `<article class="audit-card ${nonAnime ? "non-anime" : "review"}" data-audit-ref="${escapeHtmlV2(ref)}" data-audit-origin="library" data-audit-needs-visual="${auditNeedsVisualResolveV2(item, "library") ? "1" : "0"}">
    <div class="audit-card-main">
      <div class="audit-card-heading"><div><span class="audit-badge">${nonAnime ? "Série non-anime probable" : "À vérifier"}</span><h4>${escapeHtmlV2(item?.title || "Sans titre")}</h4></div>${auditEvidenceSummaryMarkupV2(item)}</div>
      <p>${escapeHtmlV2(item?.reason || "Vérification nécessaire.")}</p>
      ${comparison ? `<div class="audit-comparison ${sourcePanel && animePanel ? "has-two" : "has-one"}">${comparison}</div>` : ""}
      <div class="audit-card-meta"><span>${escapeHtmlV2(item?.source || "Bibliothèque")}</span>${item?.status ? `<span>${escapeHtmlV2(window.ALM_WATCH_STATUS.label(item.status)||item.status)}</span>` : ""}${item?.type ? `<span>${escapeHtmlV2(item.type)}</span>` : ""}</div>
      ${tags ? `<div class="audit-tags">${tags}</div>` : ""}
      <div class="audit-card-actions">
        <button type="button" class="audit-keep" data-audit-library="${Number(item?.id || 0)}" data-audit-action="keep">✓ Garder comme anime</button>
        <button type="button" class="danger" data-audit-library="${Number(item?.id || 0)}" data-audit-action="remove">Retirer vers la quarantaine</button>
      </div>
    </div>
  </article>`;
}

function auditQuarantineCardMarkupV2(item) {
  const anime = item?.anime || {};
  const removed = item?.state === "removed" || item?.source === "Bibliothèque" || item?.source === "Library";
  const origin = removed ? "removed" : "pending";
  const nonAnime = item?.classification === "non_anime";
  const key = String(item?.key || "");
  const ref = String(item?.ref || `${origin}:${key}`);
  const actions = removed
    ? `<button type="button" class="audit-keep" data-audit-origin="removed" data-audit-quarantine="${escapeHtmlV2(key)}" data-audit-action="restore">↩ Restaurer dans la bibliothèque</button>
       <button type="button" class="danger subtle" data-audit-origin="removed" data-audit-quarantine="${escapeHtmlV2(key)}" data-audit-action="delete">Supprimer définitivement</button>`
    : `<button type="button" data-audit-origin="pending" data-audit-quarantine="${escapeHtmlV2(key)}" data-audit-action="dismiss">Ne pas importer</button>
       <button type="button" class="subtle" data-audit-origin="pending" data-audit-quarantine="${escapeHtmlV2(key)}" data-audit-action="delete">Oublier cette décision</button>`;
  const decisionHelp = removed
    ? "La fiche reste intacte ici jusqu’à sa restauration ou sa suppression définitive."
    : "Choisis directement le candidat de gauche ou la fiche anime de droite. La progression BetaSeries sera appliquée à la fiche retenue. « Ne pas importer » mémorise ton refus ; « Oublier » autorise une nouvelle proposition lors d’un prochain import.";
  const evidence = auditEvidenceRowsV2(item);
  const sourceKind = item?.tvmaze || nonAnime || evidence.tv ? "tv" : "source";
  const sourceType = String(item?.tvmaze?.type || (nonAnime ? anime.type : "Entrée importée") || "");
  const sourceLooksAnimated = /(?:anim|anime)/i.test(sourceType) ||
    (Array.isArray(item?.tvmaze?.genres) && item.tvmaze.genres.some(value => /(?:anim|anime)/i.test(String(value || ""))));
  const tvPanel = auditCandidatePanelMarkupV2(item?.tvmaze, sourceKind, {
    title: item?.sourceTitle || anime.title,
    poster: item?.sourceImageUrl || (nonAnime ? anime.poster : ""),
    type: item?.tvmaze?.type || (nonAnime ? anime.type : "Entrée importée"),
    startDate: item?.tvmaze?.premiered || anime.startDate,
    source: item?.tvmaze?.source || item?.source || "Import",
    score: evidence.tv?.score || 0
  }, !removed ? {
    key,
    candidate: "source",
    label: "Choisir le candidat de gauche",
    help: sourceLooksAnimated
      ? "Conserver cette fiche, son titre et sa jaquette."
      : "Série ou film généraliste : conservé comme exception manuelle.",
    warning: !sourceLooksAnimated && sourceKind === "tv"
  } : null);
  const animePanel = auditCandidatePanelMarkupV2(item?.found, "anime", {
    title: item?.found?.officialTitle,
    poster: item?.found?.imageUrl || (!nonAnime && !item?.tvmaze ? anime.poster : ""),
    type: item?.found?.type,
    startDate: item?.found?.startDate,
    source: item?.found?.source || "MAL / AniList",
    score: evidence.anime?.score || 0
  }, !removed && item?.found ? {
    key,
    candidate: "anime",
    label: "Choisir la fiche anime de droite",
    help: "Utiliser les informations MAL/AniList et garder ta progression BetaSeries."
  } : null);
  const panels = [tvPanel, animePanel].filter(Boolean);
  const fallbackForce = !removed && !panels.length
    ? `<button type="button" class="audit-keep" data-audit-origin="pending" data-audit-quarantine="${escapeHtmlV2(key)}" data-audit-action="force">✓ Ajouter la seule fiche disponible</button>`
    : "";
  return `<article class="audit-card quarantine-card ${nonAnime ? "non-anime" : "review"}" data-audit-origin="${origin}" data-audit-ref="${escapeHtmlV2(ref)}" data-audit-needs-visual="${auditNeedsVisualResolveV2(item, origin) ? "1" : "0"}">
    <div class="audit-card-main">
      <div class="audit-card-heading"><div><span class="audit-badge">${removed ? "Retiré de la bibliothèque" : (nonAnime ? "Non-anime probable" : "Correspondance ambiguë")}</span><h4>${escapeHtmlV2(item?.sourceTitle || anime.title || "Sans titre")}</h4></div>${auditEvidenceSummaryMarkupV2(item)}</div>
      <p>${escapeHtmlV2(item?.reason || "Entrée conservée pour décision manuelle.")}</p>
      ${!removed && panels.length > 1 ? `<div class="audit-choice-hint"><span aria-hidden="true">↔</span><div><strong>Choisis la fiche à conserver</strong><small>Gauche = candidat importé / série-film. Droite = fiche anime spécialisée.</small></div></div>` : ""}
      ${panels.length ? `<div class="audit-comparison ${panels.length > 1 ? "has-two" : "has-one"}">${panels.join("")}</div>` : ""}
      <div class="audit-card-meta"><span>${escapeHtmlV2(item?.source || "Import")}</span>${item?.found?.officialTitle ? `<span>Anime : ${escapeHtmlV2(item.found.officialTitle)}</span>` : ""}${item?.tvmaze?.name ? `<span>Série / film : ${escapeHtmlV2(item.tvmaze.name)}</span>` : ""}</div>
      <p class="audit-decision-help">${escapeHtmlV2(decisionHelp)} Les pourcentages indiquent uniquement la proximité des titres, jamais une probabilité.</p>
      <div class="audit-card-actions">${fallbackForce}${actions}</div>
    </div>
  </article>`;
}

function auditStopVisualObserverV2() {
  _auditVisualObserver?.disconnect();
  _auditVisualObserver = null;
}

function auditFindCardByRefV2(ref) {
  return [...document.querySelectorAll("#auditPage [data-audit-ref]")].find(node => node.dataset.auditRef === ref) || null;
}

function auditUpdateCachedItemV2(result) {
  const ref = String(result?.ref || "");
  if (!ref || !result?.item || !_auditCache) return;
  if (result.kind === "library") {
    const list = _auditCache?.library?.suspects;
    const index = Array.isArray(list) ? list.findIndex(item => String(item?.ref || `library:${item?.id}`) === ref) : -1;
    if (index >= 0) list[index] = result.item;
  } else {
    const list = _auditCache?.quarantine?.items;
    const index = Array.isArray(list) ? list.findIndex(item => String(item?.ref || "") === ref) : -1;
    if (index >= 0) list[index] = result.item;
  }
}

function auditSetResolvedPosterV2(card, selector, imageUrl, title = "candidat") {
  const safe = auditSafePosterV2(imageUrl);
  if (!card || !safe) return false;
  const panel = card.querySelector(selector);
  const poster = panel?.querySelector(".audit-candidate-poster");
  if (!poster) return false;
  let image = poster.querySelector("img");
  const fallback = poster.querySelector(".audit-poster-fallback");
  if (!image) {
    image = document.createElement("img");
    image.loading = "lazy";
    image.alt = `Affiche de ${String(title || "candidat")}`;
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.hidden = true;
      if (fallback) fallback.hidden = false;
    }, { once: true });
    poster.prepend(image);
  }
  image.src = safe;
  image.hidden = false;
  if (fallback) fallback.hidden = true;
  return true;
}

function auditReplaceResolvedCardV2(result) {
  if(result.excluded && _auditCache?.quarantine){
    const quarantine=_auditCache.quarantine;quarantine.items=quarantine.items.filter(item=>item.ref!==result.ref);
    quarantine.total=quarantine.items.length;quarantine.pending=Math.max(0,Number(quarantine.pending||0)-1);quarantine.autoExcluded=Number(quarantine.autoExcluded||0)+1;
    quarantine.nonAnime=quarantine.items.filter(item=>item.classification==='non_anime').length;quarantine.review=quarantine.items.filter(item=>item.classification==='review').length;
    auditRenderQuarantinePageV2();updateAuditHeaderOnlyV2(_auditCache);return;
  }
  auditUpdateCachedItemV2(result);
  const current = auditFindCardByRefV2(result.ref);
  const item = result?.item;
  if (!current || !item) return;

  // La résolution d'une jaquette ne doit plus reconstruire toute la carte.
  // Un replaceWith() sur des cartes hautes modifiait la géométrie pendant le
  // scroll et déclenchait des à-coups visibles dans Chromium/Electron.
  auditSetResolvedPosterV2(current, ".audit-candidate.anime", item?.found?.imageUrl, item?.found?.officialTitle || item?.found?.title);
  auditSetResolvedPosterV2(current, ".audit-candidate.tv", item?.tvmaze?.imageUrl || item?.sourceImageUrl, item?.tvmaze?.name || item?.sourceTitle || item?.title);
  auditSetResolvedPosterV2(current, ".audit-candidate.source", item?.sourceImageUrl || item?.poster || item?.anime?.poster || item?.anime?.imageUrl, item?.sourceTitle || item?.title || item?.anime?.title);

  const origin = String(current.dataset.auditOrigin || result.kind || "");
  current.dataset.auditNeedsVisual = auditNeedsVisualResolveV2(item, origin) ? "1" : "0";
}

function auditQueueVisualResolveV2(ref) {
  const key = String(ref || "").trim();
  if (!key || _auditResolveAttempted.has(key)) return;
  _auditResolveQueue.add(key);
  clearTimeout(_auditResolveTimer);
  _auditResolveTimer = setTimeout(auditFlushVisualResolveV2, 120);
}

async function auditFlushVisualResolveV2() {
  if (_auditResolveBusy || !_auditResolveQueue.size) return;
  _auditResolveBusy = true;
  const refs = [..._auditResolveQueue].slice(0, 1);
  refs.forEach(ref => {
    _auditResolveQueue.delete(ref);
    _auditResolveAttempted.add(ref);
  });
  try {
    const response = await fetch("/api/v2/content-audit/images/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refs })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Jaquettes indisponibles");
    for (const result of Array.isArray(payload?.items) ? payload.items : []) auditReplaceResolvedCardV2(result);
  } catch (error) {
    console.warn("Contrôle anime : récupération visuelle impossible", error);
  } finally {
    _auditResolveBusy = false;
    if (_auditResolveQueue.size) _auditResolveTimer = setTimeout(auditFlushVisualResolveV2, 420);
  }
}

function auditObserveVisualsV2() {
  // Ne plus déclencher de résolution réseau au rythme du scroll. Sur cette page
  // cela provoquait des à-coups : les images manquantes de la page courante sont
  // maintenant cherchées uniquement quand Chromium est au repos.
  auditStopVisualObserverV2();
  const cards = [...document.querySelectorAll('#auditPage [data-audit-needs-visual="1"]')];
  if (!cards.length) return;
  const run = () => {
    cards.slice(0, 2).forEach((card, index) => {
      setTimeout(() => auditQueueVisualResolveV2(card.dataset.auditRef), index * 500);
    });
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 1800 });
  else setTimeout(run, 1200);
}

function updateAuditHeaderOnlyV2(payload) {
  const library = payload?.library || {};
  const quarantine = payload?.quarantine || {};
  const stats = document.getElementById("auditStats");
  if (stats) stats.innerHTML = `
    <div><span>Bibliothèque</span><strong>${Number(library.total || 0)}</strong></div>
    <div><span>Anime confirmés</span><strong>${Number(library.confirmed || 0)}</strong></div>
    <div><span>Hors anime probables</span><strong>${Number(library.nonAnime || 0)}</strong></div>
    <div><span>À vérifier</span><strong>${Number(library.review || 0)}</strong></div>
    <div><span>Quarantaine</span><strong>${Number(quarantine.total || 0)}</strong></div>
    <div><span>Écartés automatiquement</span><strong>${Number(quarantine.autoExcluded || 0)}</strong></div>`;
  if(stats)stats.innerHTML+='<div><span data-design-text="completionMissingTitle">'+window.ALM_DESIGN.t('completionMissingTitle')+'</span><strong>'+Number(payload?.completion?.items?.length||0)+'</strong></div>';
  const suspects = Array.isArray(library.suspects) ? library.suspects : [];
  const quarantineItems = Array.isArray(quarantine.items) ? quarantine.items : [];
  const safeNonAnime = suspects.filter(item => item.classification === "non_anime" && Number(item.confidence || 0) >= 90);
  const bulkButton = document.getElementById("auditBulkBtn");
  if (bulkButton) {
    bulkButton.disabled = safeNonAnime.length === 0;
    bulkButton.dataset.count = String(safeNonAnime.length);
    bulkButton.textContent = safeNonAnime.length
      ? `Mettre ${safeNonAnime.length} hors-anime sûr${safeNonAnime.length > 1 ? "s" : ""} en quarantaine`
      : "Aucun hors-anime sûr à déplacer";
  }
  const clearButton = document.getElementById("auditClearBtn");
  if (clearButton) {
    clearButton.disabled = quarantineItems.length === 0;
    clearButton.textContent = quarantineItems.length ? `🗑 Vider la quarantaine (${quarantineItems.length})` : "🗑 Quarantaine vide";
  }
  const libraryCount = document.getElementById("auditLibraryCount");
  const quarantineCount = document.getElementById("auditQuarantineCount");
  if (libraryCount) libraryCount.textContent = String(suspects.length);
  if (quarantineCount) quarantineCount.textContent = String(quarantineItems.length);
}

async function syncContentAuditCacheSilentlyV2() {
  try {
    const response = await fetch("/api/v2/content-audit", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) return;
    _auditCache = payload;
    // Mettre à jour uniquement les compteurs : ne pas reconstruire les cartes
    // pendant que l'utilisateur est en train de scroller.
    if (!document.getElementById("auditPage")?.classList.contains("hidden")) updateAuditHeaderOnlyV2(payload);
  } catch {}
}

function auditNormalizeSearchV2(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const auditSearchMemoV2=new WeakMap();
function auditSearchHaystackV2(item){if(!item||typeof item!=='object')return '';if(auditSearchMemoV2.has(item))return auditSearchMemoV2.get(item);const text=auditSearchHaystackV2Uncached(item);auditSearchMemoV2.set(item,text);return text;}
function auditSearchHaystackV2Uncached(item) {
  const anime = item?.anime || {};
  const found = item?.found || {};
  const tv = item?.tvmaze || {};
  return auditNormalizeSearchV2([
    item?.sourceTitle, item?.title, item?.reason, item?.source, item?.classification,
    anime?.title, anime?.type, ...(Array.isArray(anime?.tags) ? anime.tags : []),
    found?.officialTitle, found?.englishTitle, found?.romajiTitle, found?.title,
    tv?.name, tv?.type, tv?.network
  ].filter(Boolean).join(" "));
}

function auditMatchesSearchV2(item) {
  const query = auditNormalizeSearchV2(_auditSearchQuery);
  if (!query) return true;
  const haystack = auditSearchHaystackV2(item);
  return query.split(" ").filter(Boolean).every(part => haystack.includes(part));
}

function auditFilteredListsV2(payload = _auditCache) {
  const library = payload?.library || {};
  const quarantine = payload?.quarantine || {};
  const suspects = (Array.isArray(library.suspects) ? library.suspects : []).filter(auditMatchesSearchV2);
  const quarantineItems = (Array.isArray(quarantine.items) ? quarantine.items : []).filter(auditMatchesSearchV2);
  return { suspects, quarantineItems };
}

function auditSyncTopPagerV2(totalItems) {
  const totalPages = Math.max(1, Math.ceil(Number(totalItems || 0) / AUDIT_PAGE_SIZE));
  const page = Math.min(totalPages, Math.floor(_auditRenderOffset / AUDIT_PAGE_SIZE) + 1);

  for (const selectId of ["auditPageSelect", "auditPageBottomSelect"]) {
    const select = document.getElementById(selectId);
    if (!select) continue;
    if (select.options.length !== totalPages) {
      select.innerHTML = Array.from({ length: totalPages }, (_, index) => `<option value="${index}">${index + 1}</option>`).join("");
    }
    select.value = String(Math.max(0, page - 1));
    select.disabled = totalItems <= AUDIT_PAGE_SIZE;
  }

  for (const totalId of ["auditPageTotal", "auditPageBottomTotal"]) {
    const total = document.getElementById(totalId);
    if (total) total.textContent = `/ ${totalPages}`;
  }

  const disabled = totalItems <= AUDIT_PAGE_SIZE;
  const buttonStates = [
    ["auditFirstPageBtn", page <= 1 || disabled],
    ["auditPrevPageTopBtn", page <= 1 || disabled],
    ["auditNextPageTopBtn", page >= totalPages || disabled],
    ["auditLastPageBtn", page >= totalPages || disabled],
    ["auditFirstPageBottomBtn", page <= 1 || disabled],
    ["auditPrevPageBottomBtn", page <= 1 || disabled],
    ["auditNextPageBottomBtn", page >= totalPages || disabled],
    ["auditLastPageBottomBtn", page >= totalPages || disabled],
  ];
  for (const [id, isDisabled] of buttonStates) {
    const button = document.getElementById(id);
    if (button) button.disabled = isDisabled;
  }

  const bottom = document.getElementById("auditBottomPageJump");
  if (bottom) bottom.classList.toggle("is-single-page", disabled);
}

function auditRenderLibraryListV2(suspects) {
  const list = document.getElementById("auditLibraryList");
  const count = document.getElementById("auditLibraryCount");
  if (count) count.textContent = String(suspects.length);
  if (!list) return;
  // Cette zone contient normalement très peu d'éléments. En cas d'import
  // exceptionnellement ambigu, on limite le DOM pour protéger le scroll.
  const visible = suspects.slice(0, 16);
  list.innerHTML = visible.length
    ? visible.map(auditLibraryCardMarkupV2).join("") + (suspects.length > visible.length
      ? `<div class="audit-list-limit">${suspects.length - visible.length} autre(s) résultat(s). Utilise la recherche pour affiner.</div>` : "")
    : auditEmptyMarkupV2("✅", _auditSearchQuery ? "Aucune fiche correspondante" : "Bibliothèque propre", _auditSearchQuery ? "Aucune entrée à examiner ne correspond à cette recherche." : "Aucune série hors anime probable n'a été détectée.");
}

function auditRenderQuarantinePageV2({ scroll = false } = {}) {
  const list = document.getElementById("auditQuarantineList");
  if (!list || !_auditCache) return;
  auditStopVisualObserverV2();
  const { quarantineItems } = auditFilteredListsV2(_auditCache);
  const maxOffset = quarantineItems.length
    ? Math.floor((quarantineItems.length - 1) / AUDIT_PAGE_SIZE) * AUDIT_PAGE_SIZE
    : 0;
  _auditRenderOffset = Math.max(0, Math.min(_auditRenderOffset, maxOffset));
  const visible = quarantineItems.slice(_auditRenderOffset, _auditRenderOffset + AUDIT_PAGE_SIZE);
  const pageStart = quarantineItems.length ? _auditRenderOffset + 1 : 0;
  const pageEnd = Math.min(quarantineItems.length, _auditRenderOffset + visible.length);
  const totalPages = Math.max(1, Math.ceil(quarantineItems.length / AUDIT_PAGE_SIZE));
  const page = Math.min(totalPages, Math.floor(_auditRenderOffset / AUDIT_PAGE_SIZE) + 1);
  const pagination = "";
  list.innerHTML = visible.length
    ? visible.map(auditQuarantineCardMarkupV2).join("") + pagination
    : auditEmptyMarkupV2("📺", _auditSearchQuery ? "Aucun résultat" : "Quarantaine vide", _auditSearchQuery ? "Aucune fiche de la quarantaine ne correspond à cette recherche." : "Les prochains imports ambigus apparaîtront ici, sans polluer ta bibliothèque.");

  const status = document.getElementById("auditSearchStatus");
  if (status) {
    const allCount = Array.isArray(_auditCache?.quarantine?.items) ? _auditCache.quarantine.items.length : 0;
    status.textContent = _auditSearchQuery
      ? `${quarantineItems.length} résultat(s) sur ${allCount} · ${AUDIT_PAGE_SIZE} par page`
      : `${quarantineItems.length} entrée(s) · ${AUDIT_PAGE_SIZE} par page`;
  }
  auditSyncTopPagerV2(quarantineItems.length);
  if (scroll) window.ALM_SCROLL_PROGRESS?.toStart(list, list.querySelector("button"));

  // Les jaquettes déjà connues sont affichées immédiatement. Pour préserver la
  // fluidité, au maximum deux jaquettes réellement manquantes sont résolues
  // après une période d'inactivité, jamais au rythme du scroll.
  auditObserveVisualsV2();
}

function auditGoToPageV2(target, scroll = true) {
  const { quarantineItems } = auditFilteredListsV2(_auditCache);
  const totalPages = Math.max(1, Math.ceil(quarantineItems.length / AUDIT_PAGE_SIZE));
  const current = Math.floor(_auditRenderOffset / AUDIT_PAGE_SIZE);
  let pageIndex = current;
  if (target === "first") pageIndex = 0;
  else if (target === "prev") pageIndex = Math.max(0, current - 1);
  else if (target === "next") pageIndex = Math.min(totalPages - 1, current + 1);
  else if (target === "last") pageIndex = totalPages - 1;
  else pageIndex = Math.max(0, Math.min(totalPages - 1, Number(target) || 0));
  _auditRenderOffset = pageIndex * AUDIT_PAGE_SIZE;
  auditRenderQuarantinePageV2({ scroll });
}

function renderContentAuditV2(payload) {
  // A scan may have started before the last correction. Fetch completion from
  // current saved records instead of reviving that older embedded snapshot.
  window.ALM_COMPLETION_ISSUES?.refresh();
  _auditCache = payload;
  updateAuditHeaderOnlyV2(payload);
  const { suspects } = auditFilteredListsV2(payload);
  auditRenderLibraryListV2(suspects);
  auditRenderQuarantinePageV2();
}

function updateAuditProgressUiV2(progress = {}) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress?.percent || 0))));
  const bar = document.getElementById("auditProgressBar");
  const track = bar?.parentElement;
  const percentEl = document.getElementById("auditProgressPercent");
  const currentEl = document.getElementById("auditProgressCurrent");
  const countEl = document.getElementById("auditProgressCount");
  const titleEl = document.getElementById("auditProgressTitle");
  if (bar) bar.style.width = `${percent}%`;
  if (track) track.setAttribute("aria-valuenow", String(percent));
  if (percentEl) percentEl.textContent = `${percent} %`;
  if (currentEl) currentEl.textContent = String(progress?.current || "Analyse locale…");
  const total = Math.max(0, Number(progress?.total || 0));
  const done = Math.max(0, Math.min(total || Number(progress?.done || 0), Number(progress?.done || 0)));
  if (countEl) countEl.textContent = total ? `${done} / ${total}` : "Préparation";
  if (titleEl) titleEl.textContent = progress?.status === "done" ? "Analyse terminée" : "Analyse locale en cours…";
}

function startAuditProgressPollingV2() {
  let stopped = false;
  let timer = null;
  const poll = async () => {
    if (stopped) return;
    try {
      const response = await fetch("/api/v2/content-audit/progress", { cache: "no-store" });
      const progress = await response.json().catch(() => ({}));
      if (response.ok && progress?.ok) updateAuditProgressUiV2(progress);
    } catch {}
    if (!stopped) timer = setTimeout(poll, 400);
  };
  poll();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

async function loadContentAuditV2(force = false) {
  const loading = document.getElementById("auditLoading");
  const button = document.getElementById("auditScanBtn");
  if (force) {
    _auditResolveAttempted.clear();
    _auditResolveQueue.clear();
    _auditRenderOffset = 0;
  }
  loading?.classList.remove("hidden");
  updateAuditProgressUiV2({ percent: 1, current: force ? "Nouvelle analyse locale…" : "Ouverture du contrôle anime…", done: 0, total: 0 });
  const stopProgressPolling = startAuditProgressPollingV2();
  if (button) { button.disabled = true; button.textContent = "Analyse…"; }
  try {
    const response = await fetch(force ? "/api/v2/content-audit/scan" : "/api/v2/content-audit", {
      method: force ? "POST" : "GET",
      headers: force ? { "Content-Type": "application/json" } : undefined,
      body: force ? "{}" : undefined
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Analyse impossible");
    renderContentAuditV2(payload);
    if (force) window.notifyApp?.("Contrôle anime terminé.", "success");
  } catch (error) {
    window.notifyApp?.(`Contrôle anime impossible : ${error.message}`, "error");
  } finally {
    stopProgressPolling();
    updateAuditProgressUiV2({ status: "done", percent: 100, current: "Contrôle anime prêt.", done: 1, total: 1 });
    setTimeout(() => loading?.classList.add("hidden"), 260);
    if (button) { button.disabled = false; button.textContent = "↻ Analyser maintenant"; }
  }
}

window.loadContentAuditV2 = loadContentAuditV2;

async function quarantineSafeNonAnimeV2() {
  const button = document.getElementById("auditBulkBtn");
  const suspects = Array.isArray(_auditCache?.library?.suspects) ? _auditCache.library.suspects : [];
  const candidates = suspects.filter(item => item.classification === "non_anime" && Number(item.confidence || 0) >= 90);
  if (!candidates.length || button?.disabled) return;
  const names = candidates.slice(0, 5).map(item => `• ${item.title}`).join("\n");
  const extra = candidates.length > 5 ? `\n• … et ${candidates.length - 5} autre${candidates.length - 5 > 1 ? "s" : ""}` : "";
  let confirmed = true;
  if (typeof window.showAppConfirm === "function") {
    confirmed = await window.showAppConfirm(
      `Déplacer ${candidates.length} série${candidates.length > 1 ? "s" : ""} hors-anime probable${candidates.length > 1 ? "s" : ""} vers la quarantaine ?\n\n${names}${extra}\n\nAucune fiche ne sera supprimée définitivement.`,
      {
        title: "Nettoyage groupé sécurisé",
        confirmText: "Déplacer vers la quarantaine",
        cancelText: "Annuler",
        danger: true
      }
    );
  }
  if (!confirmed) return;

  const oldLabel = button?.textContent || "";
  if (button) { button.disabled = true; button.textContent = "Déplacement en cours…"; }
  try {
    const response = await fetch("/api/v2/content-audit/library/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "quarantine_non_anime",
        minConfidence: 90,
        ids: candidates.map(item => Number(item.id)).filter(Boolean)
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error || "Déplacement impossible");
    if (typeof window.reloadAnimeLibrary === "function") await window.reloadAnimeLibrary();
    await loadContentAuditV2(false);
    const moved = Number(result?.moved || 0);
    window.notifyApp?.(`${moved} fiche${moved > 1 ? "s" : ""} déplacée${moved > 1 ? "s" : ""} en quarantaine.`, "success");
  } catch (error) {
    window.notifyApp?.(error.message || "Déplacement impossible", "error");
    if (button) { button.disabled = false; button.textContent = oldLabel; }
  }
}

async function handleAuditActionV2(button) {
  const action = String(button?.dataset?.auditAction || "");
  const libraryId = button?.dataset?.auditLibrary;
  const quarantineKey = button?.dataset?.auditQuarantine;
  const origin = String(button?.dataset?.auditOrigin || "");
  const candidate = String(button?.dataset?.auditCandidate || "");
  const candidateTitle = String(button?.dataset?.auditCandidateTitle || "");
  const candidateType = String(button?.dataset?.auditCandidateType || "");
  const candidateWarning = button?.dataset?.auditCandidateWarning === "1";
  if (!action || (!libraryId && !quarantineKey)) return;
  if (action === "select" && !["source", "anime"].includes(candidate)) return;

  const requiresConfirmation = ["remove", "delete", "dismiss", "force", "restore", "select"].includes(action);
  if (requiresConfirmation && typeof window.showAppConfirm === "function") {
    const messages = {
      remove: "Retirer cette fiche de la bibliothèque ? Elle restera intacte et restaurable dans la quarantaine.",
      delete: origin === "removed"
        ? "Supprimer définitivement cette fiche retirée ? Cette action efface la seule copie conservée dans la quarantaine."
        : "Oublier cette décision de quarantaine ? Le titre pourra être proposé à nouveau lors d’un prochain import.",
      dismiss: "Ne pas importer ce titre et mémoriser cette décision pour les prochains imports similaires ?",
      force: "Forcer cette entrée dans la bibliothèque anime ? Elle sera marquée comme confirmée manuellement.",
      restore: "Restaurer cette fiche dans la bibliothèque anime ?",
      select: candidate === "anime"
        ? `Ajouter la fiche anime de droite « ${candidateTitle || "candidat anime"} » ?\n\nLes informations MAL/AniList seront utilisées et ta progression BetaSeries sera conservée.`
        : `Ajouter le candidat de gauche « ${candidateTitle || "fiche importée"} »${candidateType ? ` (${candidateType})` : ""} ?\n\n${candidateWarning ? "Attention : cette fiche ressemble à une série ou un film généraliste. Elle sera conservée comme exception manuelle et ne deviendra pas une preuve anime pour les prochains imports." : "Son titre, sa jaquette et ses informations généralistes seront conservés."}`
    };
    const deleteRemoved = action === "delete" && origin === "removed";
    const ok = await window.showAppConfirm(messages[action], {
      title: deleteRemoved
        ? "Suppression définitive"
        : (action === "dismiss"
          ? "Mémoriser le refus"
          : (action === "select"
            ? (candidate === "anime" ? "Choisir la fiche anime" : "Choisir le candidat de gauche")
            : "Confirmer l'action")),
      confirmText: deleteRemoved
        ? "Supprimer définitivement"
        : (action === "dismiss"
          ? "Ne pas importer"
          : (action === "select" ? "Ajouter cette fiche" : "Continuer")),
      cancelText: "Annuler",
      danger: action === "remove" || deleteRemoved || (action === "select" && candidateWarning)
    });
    if (!ok) return;
  }

  const card = button.closest?.(".audit-card");
  const actionButtons = card ? [...card.querySelectorAll("button[data-audit-action]")] : [button];
  actionButtons.forEach(node => { node.disabled = true; });
  try {
    const endpoint = libraryId
      ? `/api/v2/content-audit/library/${encodeURIComponent(libraryId)}/action`
      : "/api/v2/content-audit/quarantine/action";
    const body = libraryId ? { action } : { action, key: quarantineKey, ...(action === "select" ? { candidate } : {}) };
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error || "Action impossible");
    // Réaction immédiate : la carte disparaît dès que le serveur confirme la
    // décision. La bibliothèque et l'analyse se synchronisent ensuite sans
    // bloquer le bouton plusieurs secondes.
    if (card?.isConnected) {
      card.classList.add("audit-card-leaving");
      setTimeout(() => card.remove(), 170);
    }
    // Retirer localement l'élément de notre cache pour que les compteurs suivent
    // le geste sans refaire tout le DOM. Le serveur est resynchronisé en silence.
    if (_auditCache) {
      if (quarantineKey && Array.isArray(_auditCache?.quarantine?.items)) {
        _auditCache.quarantine.items = _auditCache.quarantine.items.filter(item => String(item?.key || item?.quarantineId || "") !== String(quarantineKey));
        _auditCache.quarantine.total = _auditCache.quarantine.items.length;
      }
      if (libraryId && Array.isArray(_auditCache?.library?.suspects)) {
        _auditCache.library.suspects = _auditCache.library.suspects.filter(item => Number(item?.id || item?.animeId || 0) !== Number(libraryId));
      }
      updateAuditHeaderOnlyV2(_auditCache);
    }
    // Ne pas reconstruire en arrière-plan les centaines de cartes de la
    // bibliothèque cachée : c'était la source du gel de plusieurs secondes après
    // un choix gauche/droite. On marque simplement les données comme obsolètes ;
    // elles seront rechargées au prochain écran qui en a réellement besoin.
    window.markAnimeLibraryStale?.();
    // Le cache local vient d'être mis à jour précisément. Ne pas forcer une
    // analyse complète de la page au prochain clic : le serveur recalculera si
    // l'empreinte de bibliothèque a réellement changé.
    window.__almAuditNeedsRefresh = false;
    const auditFilteredAfterAction = auditFilteredListsV2(_auditCache);
    auditSyncTopPagerV2(auditFilteredAfterAction.quarantineItems.length);
    const successMessages = {
      keep: "Fiche conservée comme anime.",
      remove: "Fiche retirée et conservée dans la quarantaine.",
      force: "Entrée ajoutée comme anime confirmé manuellement.",
      restore: "Fiche restaurée dans la bibliothèque.",
      dismiss: "Le titre ne sera pas importé automatiquement.",
      delete: origin === "removed" ? "Fiche supprimée définitivement." : "Décision oubliée : le titre pourra être proposé à nouveau.",
      select: candidate === "anime"
        ? `Fiche anime ajoutée${result?.selectedTitle ? ` : ${result.selectedTitle}` : ""}.`
        : `Candidat de gauche ajouté${result?.selectedTitle ? ` : ${result.selectedTitle}` : ""}.`
    };
    window.notifyApp?.(successMessages[action] || "Contrôle anime mis à jour.", "success");
  } catch (error) {
    window.notifyApp?.(error.message || "Action impossible", "error");
  } finally {
    actionButtons.forEach(node => { if (node.isConnected) node.disabled = false; });
  }
}


async function clearAuditQuarantineV2() {
  const items = Array.isArray(_auditCache?.quarantine?.items) ? _auditCache.quarantine.items : [];
  if (!items.length) return;
  const ok = typeof window.showAppConfirm === "function"
    ? await window.showAppConfirm(
        `Supprimer définitivement les ${items.length} entrée(s) actuellement en quarantaine ?\n\nCela vide les propositions en attente et les fiches retirées. Cette action n'est pas annulable. Les refus déjà mémorisés restent conservés pour éviter de réimporter les mêmes erreurs.`,
        { title: "Vider la quarantaine", confirmText: `Supprimer ${items.length} entrée(s)`, cancelText: "Annuler", danger: true }
      )
    : false;
  if (!ok) return;
  const button = document.getElementById("auditClearBtn");
  const old = button?.textContent || "";
  if (button) { button.disabled = true; button.textContent = "Suppression…"; }
  try {
    const response = await fetch("/api/v2/content-audit/quarantine/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "Suppression impossible");
    _auditRenderOffset = 0;
    await loadContentAuditV2(false);
    window.notifyApp?.(`${Number(result.removed || 0)} entrée(s) supprimée(s) de la quarantaine.`, "success");
  } catch (error) {
    window.notifyApp?.(error.message || "Suppression impossible", "error");
    if (button) { button.disabled = false; button.textContent = old; }
  }
}

document.addEventListener("DOMContentLoaded",()=>{
  // Nav Saisons (page indépendante)
  document.getElementById("navSeasonNews")?.addEventListener("click", () => {
    showV2Page("seasonNewsPage", "navSeasonNews");
    loadSeasonNews(false);
  });
  document.getElementById("seasonNewsRefreshBtn")?.addEventListener("click", () => loadSeasonNews(true));
  document.getElementById("seasonNewsCompleteBtn")?.addEventListener("click", () => completeSeasonInfos());
  document.getElementById("seasonNewsSelectAllBtn")?.addEventListener("click", () => setAllSeasonNewsSelectionV2(true));
  document.getElementById("seasonNewsClearSelectionBtn")?.addEventListener("click", () => setAllSeasonNewsSelectionV2(false));
  document.getElementById("seasonNewsAddAllBtn")?.addEventListener("click", () => addSelectedSeasonNews());
  document.getElementById("seasonNewsForgetAllBtn")?.addEventListener("click", () => forgetAllSeasonNewsV2());
  document.getElementById("seasonNewsUndoBtn")?.addEventListener("click", undoLastSeasonBulkAddV2);
  document.getElementById("seasonProgressMinimize")?.addEventListener("click", () => setSeasonProgressMinimized(true));
  document.getElementById("seasonProgressDock")?.addEventListener("click", () => setSeasonProgressMinimized(false));
  document.getElementById("seasonProgressCancel")?.addEventListener("click", cancelSeasonOperation);
  document.getElementById("seasonProgressDismiss")?.addEventListener("click", () => {
    cancelSeasonAutoDismissV2();
    document.getElementById("seasonProgressPanel")?.classList.add("hidden");
    document.getElementById("seasonProgressDock")?.classList.add("hidden");
  });
  document.getElementById("seasonNewsContainer")?.addEventListener("click", e => {
    const addBtn = e.target.closest("[data-add-one]");
    if (addBtn) return addOneSeasonNews(Number(addBtn.dataset.addOne));
    const hideBtn = e.target.closest("[data-hide-one]");
    if (hideBtn) return hideOneSeasonNewsV2(Number(hideBtn.dataset.hideOne));
    const ignoreBtn = e.target.closest("[data-ignore-one]");
    if (ignoreBtn) return ignoreOneSeasonNews(Number(ignoreBtn.dataset.ignoreOne));
  });

  document.getElementById("navDna")?.addEventListener("click",async()=>{await window.ensureAnimeLibraryFresh?.();showV2Page("dnaPage","navDna");setTimeout(()=>renderDNA(),60);});
  document.getElementById("navLexicon")?.addEventListener("click",()=>{showV2Page("lexiconPage","navLexicon");window.initLexiconPage?.();});
  document.getElementById("navAudit")?.addEventListener("click",()=>{showV2Page("auditPage","navAudit");const stale=Boolean(window.__almAuditNeedsRefresh);window.__almAuditNeedsRefresh=false;loadContentAuditV2(stale);});
  document.getElementById("auditScanBtn")?.addEventListener("click",()=>loadContentAuditV2(true));
  document.getElementById("auditBulkBtn")?.addEventListener("click",quarantineSafeNonAnimeV2);
  document.getElementById("auditClearBtn")?.addEventListener("click",clearAuditQuarantineV2);
  document.getElementById("auditSearchInput")?.addEventListener("input",event=>{
    clearTimeout(_auditSearchTimer);
    const value=String(event.target.value||"");
    _auditSearchTimer=setTimeout(()=>{
      _auditSearchQuery=value;
      _auditRenderOffset=0;
      if(_auditCache){
        const {suspects}=auditFilteredListsV2(_auditCache);
        auditRenderLibraryListV2(suspects);
        auditRenderQuarantinePageV2();
      }
    },120);
  });
  document.getElementById("auditFirstPageBtn")?.addEventListener("click",()=>auditGoToPageV2("first"));
  document.getElementById("auditPrevPageTopBtn")?.addEventListener("click",()=>auditGoToPageV2("prev"));
  document.getElementById("auditNextPageTopBtn")?.addEventListener("click",()=>auditGoToPageV2("next"));
  document.getElementById("auditLastPageBtn")?.addEventListener("click",()=>auditGoToPageV2("last"));
  document.getElementById("auditFirstPageBottomBtn")?.addEventListener("click",()=>auditGoToPageV2("first"));
  document.getElementById("auditPrevPageBottomBtn")?.addEventListener("click",()=>auditGoToPageV2("prev"));
  document.getElementById("auditNextPageBottomBtn")?.addEventListener("click",()=>auditGoToPageV2("next"));
  document.getElementById("auditLastPageBottomBtn")?.addEventListener("click",()=>auditGoToPageV2("last"));
  document.getElementById("auditPageBottomSelect")?.addEventListener("change", event => auditGoToPageV2(event.target.value));
  document.getElementById("auditPageSelect")?.addEventListener("change",event=>auditGoToPageV2(Number(event.target.value||0)));
  document.getElementById("auditPage")?.addEventListener("click",event=>{
    const pageButton=event.target.closest("[data-audit-page]");
    if(pageButton){auditGoToPageV2(pageButton.dataset.auditPage);return;}
    const actionButton = event.target.closest("[data-audit-action]");
    if (actionButton) handleAuditActionV2(actionButton);
  });
  document.getElementById("navNewsV2")?.addEventListener("click",()=>{
    showV2Page("newsV2Page","navNewsV2");
    if (!Array.isArray(_newsCache) || !_newsCache.length) loadNews(false);
    else renderNewsV2();
  });
  ["newsDateFrom","newsDateTo"].forEach(id=>{
    document.getElementById(id)?.addEventListener("change",()=>{
      _newsDateFrom=document.getElementById("newsDateFrom")?.value||"";
      _newsDateTo=document.getElementById("newsDateTo")?.value||"";
      const preset=document.getElementById("newsRangePreset");
      if(preset) preset.value=(_newsDateFrom||_newsDateTo)?"custom":"all";
      if (!validateNewsDateRangeV2()) return;
      _newsSelectedKey="";
      if (Array.isArray(_newsCache)) { renderNewsV2(); syncNewsHistoryMetaV2(_newsMeta); }
      else loadNews(false);
    });
  });
  document.getElementById("newsDateClear")?.addEventListener("click",()=>{
    _newsDateFrom=""; _newsDateTo="";
    const from=document.getElementById("newsDateFrom"), to=document.getElementById("newsDateTo");
    if(from) from.value=""; if(to) to.value="";
    const preset=document.getElementById("newsRangePreset");
    if(preset) preset.value="all";
    _newsSelectedKey="";
    if (Array.isArray(_newsCache)) { renderNewsV2(); syncNewsHistoryMetaV2(_newsMeta); }
    else loadNews(false);
  });
  document.getElementById("newsRangePreset")?.addEventListener("change",event=>{
    setNewsQuickRangeV2(event.target.value);
    if (!validateNewsDateRangeV2()) return;
    _newsSelectedKey="";
    if (Array.isArray(_newsCache)) { renderNewsV2(); syncNewsHistoryMetaV2(_newsMeta); }
    else loadNews(false);
  });
  document.getElementById("navReco")?.addEventListener("click",async()=>{
    await window.ensureAnimeLibraryFresh?.();
    showV2Page("recoPage","navReco");
    // Recommandations reconstruit son contenu de façon asynchrone. Chromium peut
    // alors restaurer l'ancienne position après le premier reset de navigation.
    // On attend le rendu puis on force une seconde fois le haut de page.
    await initRecommendations();
    resetTopLevelScrollV2("recoPage");
    setTimeout(()=>resetTopLevelScrollV2("recoPage"),80);
  });
  document.getElementById("recoRefreshBtn")?.addEventListener("click", () => initRecommendations(true));
  document.getElementById("newsV2RefreshBtn")?.addEventListener("click",()=>{ _newsCache=null; _newsSelectedKey=""; _newsImageAttempted.clear(); loadNews(true); });
  document.getElementById("newsHistoryRetention")?.addEventListener("change",event=>updateNewsRetentionV2(event.target.value));

  // Filtres catégorie news
  document.querySelectorAll(".news-v2-filter").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".news-v2-filter").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      _newsCatFilter=btn.dataset.filter||"all";
      _newsSelectedKey="";
      if (Array.isArray(_newsCache)) { renderNewsV2(); syncNewsHistoryMetaV2(_newsMeta); }
      else loadNews(false);
    });
  });
  // Filtres langue — préférence indépendante de la langue de l'interface
  document.querySelectorAll(".news-lang-btn").forEach(btn=>btn.classList.toggle("active", normalizeNewsLanguageV2(btn.dataset.lang||"all")===_newsLang));
  window.ALM_NEWS_LANGUAGE = {
    get:()=>_newsLang,
    set:(language,{reload=true}={})=>{
      _newsLang=normalizeNewsLanguageV2(language); writeNewsLanguageV2(_newsLang);
      document.querySelectorAll(".news-lang-btn").forEach(btn=>btn.classList.toggle("active",normalizeNewsLanguageV2(btn.dataset.lang||"all")===_newsLang));
      window.dispatchEvent(new CustomEvent("alm:news-language-changed",{detail:{language:_newsLang}}));
      _newsSelectedKey=""; if(reload){if(Array.isArray(_newsCache)){renderNewsV2();syncNewsHistoryMetaV2(_newsMeta);}else loadNews(false);}
      return _newsLang;
    },
    supported:()=>[{code:"all",flag:"🌍",label:"Toutes"},...Object.entries(NEWS_LANG_META_V2).map(([code,meta])=>({code,...meta}))]
  };
  // Filtres langue
  document.querySelectorAll(".news-lang-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".news-lang-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      _newsLang=normalizeNewsLanguageV2(btn.dataset.lang||"all");
      writeNewsLanguageV2(_newsLang);
      window.dispatchEvent(new CustomEvent("alm:news-language-changed",{detail:{language:_newsLang}}));
      _newsSelectedKey="";
      if (Array.isArray(_newsCache)) { renderNewsV2(); syncNewsHistoryMetaV2(_newsMeta); }
      else loadNews(false);
    });
  });

  // Retour accueil
  document.querySelectorAll(".nav-item[data-filter]").forEach(btn=>btn.addEventListener("click",()=>{if(!btn.classList.contains('active'))window.showAnimesV1?.(btn.dataset.filter||'');}));
  document.getElementById("homeLink")?.addEventListener("click",()=>hideAllV2Pages());

  // Bannière : gérée par app.js uniquement, pour éviter un double lancement
  // du job de complétion quand l'utilisateur clique sur "Tout compléter".

  // Score prédictif
  setTimeout(()=>loadProfileAndInjectBadges(),2500);
  new MutationObserver(()=>{if(window._v2Profile)injectBadges();}).observe(document.body,{childList:true,subtree:true});
});

// Si une URL de vignette existe mais que le CDN refuse le hotlink, on force une
// nouvelle résolution depuis l'article. Une seule tentative par carte est faite.
document.addEventListener("error", event => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  const page = img.closest?.("#newsV2Page");
  if (!page) return;
  const holder = img.closest?.("[data-news-index]");
  const renderedIndex = Number(holder?.dataset?.newsIndex);
  if (!Number.isFinite(renderedIndex)) return;

  // data-news-index appartient à la liste actuellement filtrée, pas au cache
  // complet. Utiliser directement _newsCache[index] effaçait parfois la
  // vignette d'un autre article lorsqu'un filtre date/langue/catégorie était actif.
  const renderedItem = _newsLastRenderedItems?.[renderedIndex];
  if (!renderedItem || !Array.isArray(_newsCache)) return;
  const renderedKey = newsKeyV2(renderedItem, renderedIndex);
  const cacheItem = _newsCache.find(item => newsKeyV2(item) === renderedKey)
    || _newsCache.find(item => item?.articleUrl && item.articleUrl === renderedItem.articleUrl);
  if (!cacheItem) return;
  const key = newsKeyV2(cacheItem);
  if (img.getAttribute("src")?.startsWith("/api/v2/news/image") && !img.dataset.directRetry) {
    img.dataset.directRetry="1";img.onload=()=>{img.style.display="";img.parentElement.classList.remove("news-image-error");};img.src=cacheItem.imageUrl;return;
  }
  if (cacheItem._forcedImageRetry) return;
  cacheItem._forcedImageRetry = true;
  cacheItem._failedImageUrl=cacheItem.imageUrl;
  cacheItem.imageUrl = "";
  _newsImageAttempted.delete(key);
  setTimeout(() => hydrateVisibleNewsImagesV2([cacheItem], true), 120);
}, true);

// Keep membership current across recommendation blocks and language switches.
function refreshRecommendationMembership(){
  document.querySelectorAll('.reco-add-status').forEach(s=>window.ALM_WATCH_STATUS.apply(s));
  document.querySelectorAll('.reco-card-add').forEach(button=>{
    const item=window.ALM_COLLECTION?.find({malId:button.dataset.malid,title:button.dataset.title});
    if(item){button.disabled=true;button.dataset.inCollection='1';button.textContent=window.ALM_COLLECTION.label(item);button.setAttribute('data-no-i18n','');}
    else if(button.dataset.inCollection){button.disabled=false;delete button.dataset.inCollection;button.textContent=window.ALM_DESIGN.t('searchAdd');}
  });
}
window.addEventListener('alm:collection-changed',refreshRecommendationMembership);
window.addEventListener('alm:language-changed',refreshRecommendationMembership);

window.addEventListener("alm:language-changed",()=>{if(!document.getElementById("dnaPage")?.classList.contains("hidden"))renderDNA();});
