
let animes = [];
let appConfig = {};
let currentNews = [];
let progressTimer = null;
let completionJobRunning = false;
let activeBulkJobId = "";
let activeBulkJobTitle = "Mise à jour de la bibliothèque";
let bulkJobPolling = false;
let bulkProgressMinimized = false;
let completionAutoDismissTimer = null;
let completionAutoDismissTick = null;
let activePersonalScoreFilter = 0;
let currentLibraryViewKey = "all";
const libraryFilterStates = Object.create(null);
const LIBRARY_FILTER_FIELDS = ["search", "statusFilter", "typeFilter", "genreFilter", "studioFilter", "yearFilter", "sort"];
window.__almBulkJobRunning = false;
window.__almLibraryStale = false;

const COMPLETION_BANNER_SNOOZE_KEY = "alm_completion_banner_snooze_v2";
const COMPLETION_BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function completionLibraryFingerprint() {
  const rows = (Array.isArray(animes) ? animes : [])
    .map(a => `${a?.id || ""}|${a?.malId || ""}|${a?.anilistId || ""}|${String(a?.title || "").trim().toLowerCase()}|${a?.type || ""}|${a?.episodesTotal || ""}|${a?.startDate || ""}|${String(a?.poster || a?.imageUrl || "").trim() ? 1 : 0}|${Array.isArray(a?.genres) ? a.genres.length : 0}|${Math.min(9, Math.floor(String(a?.synopsis || "").trim().length / 40))}`)
    .sort();
  // Hash léger côté navigateur : il sert uniquement à détecter un changement de
  // bibliothèque, pas à la sécurité.
  let hash = 2166136261;
  for (const ch of rows.join("\n")) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${rows.length}:${(hash >>> 0).toString(16)}`;
}

function rememberCompletionBannerSnooze(hours = 168) {
  try {
    localStorage.setItem(COMPLETION_BANNER_SNOOZE_KEY, JSON.stringify({
      fingerprint: completionLibraryFingerprint(),
      until: Date.now() + Math.max(1, Number(hours) || 24) * 60 * 60 * 1000
    }));
  } catch {}
}

function completionBannerIsSnoozed() {
  try {
    const value = JSON.parse(localStorage.getItem(COMPLETION_BANNER_SNOOZE_KEY) || "{}");
    if (!value?.until || Number(value.until) <= Date.now()) return false;
    return String(value.fingerprint || "") === completionLibraryFingerprint();
  } catch { return false; }
}

const animeGrid = document.getElementById("animeGrid") || document.getElementById("grid");
const stats = document.getElementById("stats");

function isV2PageActive(pageId = "") {
  if (!document.body.classList.contains("alm-v2-active")) return false;
  if (!pageId) return true;
  return document.body.classList.contains(`alm-view-${pageId}`);
}

function setV2BodyView(pageId = "") {
  document.body.classList.remove("alm-v2-active", "alm-view-communityPage", "alm-view-dnaPage", "alm-view-newsV2Page", "alm-view-recoPage", "alm-view-seasonNewsPage", "alm-view-lexiconPage", "alm-view-auditPage", "alm-view-discoveryPage", "alm-view-rankingPage");
  if (pageId) document.body.classList.add("alm-v2-active", `alm-view-${pageId}`);
}

function $(id) {
  return document.getElementById(id);
}

function statusLabelFr(value) {
  const map = { "Completed":"Terminé", "Watching":"En cours", "Plan to Watch":"À voir", "On Hold":"En pause", "On-Hold":"En pause", "Dropped":"Abandonné" };
  return map[String(value || "")] || String(value || "-");
}

function genreLabelFr(value) {
  const raw = String(value || "");
  return ({
    "Award Winning": "Primé",
    "Slice of Life": "Tranche de vie",
    "Girls Love": "Girls' Love",
    "Boys Love": "Boys' Love"
  })[raw] || raw;
}

function safeText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

async function askAppConfirmation(message, options = {}) {
  if (typeof window.showAppConfirm === "function") {
    return window.showAppConfirm(message, options);
  }
  window.notifyApp?.("La fenêtre de confirmation interne est indisponible. Recharge la page puis réessaie.", "error");
  return false;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    let message = "Erreur inconnue";
    try {
      const body = await response.json();
      message = body.error || message;
    } catch (_) {}
    throw new Error(message);
  }

  return response.json();
}

let libraryLoadSerial = 0;
async function load() {
  const serial=++libraryLoadSerial;
  const nextAnimes = await api("/api/animes");
  if(serial!==libraryLoadSerial)return;
  let nextConfig;
  try { nextConfig = await api("/api/config"); } catch (_) { nextConfig = {}; }
  if(serial!==libraryLoadSerial)return;
  animes=nextAnimes;appConfig=nextConfig;
  // Exposer sur window pour alm-v2.js (Ctrl+K, DNA, Kanban)
  window._almAnimes = animes;
  rebuildDynamicFilters();
  render();
  window.dispatchEvent(new Event("alm:collection-changed"));
  // Ne jamais laisser un re-render asynchrone réafficher la grille au-dessus
  // d'une page V2 active, surtout pendant l'analyse des saisons.
  if (isV2PageActive("seasonNewsPage") && typeof showV2Page === "function") {
    showV2Page("seasonNewsPage", "navSeasonNews");
  }
}
window.reloadAnimeLibrary = load;
window.markAnimeLibraryStale = () => { window.__almLibraryStale = true; };
window.ensureAnimeLibraryFresh = async () => {
  if (!window.__almLibraryStale) return window._almAnimes || animes;
  window.__almLibraryStale = false;
  await load();
  return window._almAnimes || animes;
};

function showProgress(label) {
  const panel = $("progressPanel");
  const labelEl = $("progressLabel");
  const bar = $("progressBar");
  if (!panel || !labelEl || !bar) return;

  panel.classList.remove("hidden");
  labelEl.textContent = label;
  bar.style.width = "0%";
  clearInterval(progressTimer);

  let value = 0;
  progressTimer = setInterval(() => {
    value = Math.min(value + 3, 90);
    bar.style.width = value + "%";
  }, 400);
}

function finishProgress(label) {
  clearInterval(progressTimer);
  const panel = $("progressPanel");
  const labelEl = $("progressLabel");
  const bar = $("progressBar");
  if (!panel || !labelEl || !bar) return;

  labelEl.textContent = label;
  bar.style.width = "100%";
  setTimeout(() => panel.classList.add("hidden"), 1800);
}

function formatJobDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

let completionDismissClock=null;
function cancelCompletionAutoDismiss() {
  completionDismissClock?.stop();completionDismissClock=null;
  if (completionAutoDismissTimer) clearTimeout(completionAutoDismissTimer);
  if (completionAutoDismissTick) clearInterval(completionAutoDismissTick);
  completionAutoDismissTimer = null;
  completionAutoDismissTick = null;
  const dismiss = $("completionProgressDismiss");
  if (dismiss && !dismiss.classList.contains("hidden")) dismiss.textContent = "Fermer";
}

function scheduleCompletionAutoDismiss(seconds = 10) {
  const dock=$("completionProgressDock");
  cancelCompletionAutoDismiss();
  const panel = $("completionProgressPanel");
  const dismiss = $("completionProgressDismiss");
  if (!panel || panel.classList.contains("hidden")) return;
  if(window.ALM_COUNTDOWN&&dismiss){
    completionDismissClock=window.ALM_COUNTDOWN.start(dismiss,Math.max(1,Number(seconds)||10)*1000,()=>{ cancelCompletionAutoDismiss();panel.classList.add('hidden');dock?.classList.add('hidden');},panel);return;
  }
  const startedAt = Date.now();
  const updateLabel = () => {
    const remaining = Math.max(0, Math.ceil(seconds - (Date.now() - startedAt) / 1000));
    if (dismiss && !dismiss.classList.contains("hidden")) dismiss.textContent = remaining > 0 ? `Fermer · ${remaining} s` : "Fermer";
  };
  updateLabel();
  completionAutoDismissTick = setInterval(updateLabel, 250);
  completionAutoDismissTimer = setTimeout(() => {
    cancelCompletionAutoDismiss();
    $("completionProgressPanel")?.classList.add("hidden");
    $("completionProgressDock")?.classList.add("hidden");
    document.body.classList.remove("bulk-progress-expanded");
    // Le diagnostic de bannière utilise un mode anti-répétition : les fiches
    // vérifiées récemment ne reviennent pas immédiatement comme une nouvelle tâche.
    setTimeout(checkCompletionBanner, 50);
  }, Math.max(1, Number(seconds) || 10) * 1000);
}

function setCompletionProgressMinimized(minimized) {
  bulkProgressMinimized = Boolean(minimized);
  const panel = $("completionProgressPanel");
  const dock = $("completionProgressDock");
  if (!panel || !dock) return;

  panel.classList.toggle("hidden", bulkProgressMinimized);
  dock.classList.toggle("hidden", !bulkProgressMinimized);
  document.body.classList.toggle("bulk-progress-expanded", !bulkProgressMinimized);
  if (!bulkProgressMinimized) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function resetCompletionProgress(title = "Mise à jour de la bibliothèque") {
  cancelCompletionAutoDismiss();
  activeBulkJobTitle = title;
  bulkProgressMinimized = false;
  $("progressPanel")?.classList.add("hidden");
  $("completionProgressPanel")?.classList.remove("hidden", "is-done", "is-error", "is-cancelled");
  $("completionProgressDock")?.classList.add("hidden");
  document.body.classList.add("bulk-progress-expanded");
  $("completionProgressCancel")?.classList.remove("hidden");
  $("completionProgressDismiss")?.classList.add("hidden");

  const cancel = $("completionProgressCancel");
  if (cancel) {
    cancel.disabled = true;
    cancel.textContent = "Préparation…";
  }

  safeText("completionProgressIcon", "⚡");
  safeText("completionProgressState", "Mise à jour de la bibliothèque");
  safeText("completionProgressTitle", title);
  safeText("completionProgressCurrent", "Préparation de la file de traitement…");
  safeText("completionProgressCount", "0 / 0");
  safeText("completionProgressPercent", "0 %");
  safeText("completionProgressTime", "Calcul du temps restant…");
  safeText("completionProgressInfos", "0");
  safeText("completionProgressImages", "0");
  safeText("completionProgressSuccess", "0");
  safeText("completionProgressFailed", "0");
  safeText("completionProgressDockText", `${title} — préparation…`);

  const bar = $("completionProgressBar");
  if (bar) bar.style.width = "2%";
  const track = document.querySelector("#completionProgressPanel .completion-progress-track");
  track?.setAttribute("aria-valuenow", "0");
}

function completionResultText(job = {}) {
  const parts = [];
  if (Number(job.updatedInfos) > 0) parts.push(job.kind==="titles"?window.ALM_DESIGN.t("titlesRenamed",{count:job.updatedInfos}):`${job.updatedInfos} fiche(s) enrichie(s)`);
  if (Number(job.updatedImages) > 0) parts.push(`${job.updatedImages} image(s) ajoutée(s)`);
  if (Number(job.resolved)>0)parts.push(window.ALM_DESIGN.t("automationResolved",{count:job.resolved}));
  if (Number(job.waiting)>0)parts.push(window.ALM_DESIGN.t("automationWaitingCount",{count:job.waiting}));
  if (Number(job.failed) > 0) parts.push(window.ALM_DESIGN.t("completionMissingCount",{count:job.failed}));
  return parts.join(" · ") || "Aucune modification nécessaire";
}

function updateCompletionProgress(job = {}) {
  const total = Math.max(0, Number(job.total) || 0);
  const done = Math.max(0, Number(job.done) || 0);
  const rawPct = Number.isFinite(Number(job.percent))?Number(job.percent):total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0;
  const pct = job.status === "done" ? 100 : rawPct;
  const panel = $("completionProgressPanel");

  const stateByStatus = {
    queued: window.ALM_DESIGN.t("automationQueued"),
    running: job.phase === "second-pass" ? "Deuxième passe de vérification" : "Mise à jour en cours",
    cancelling: "Annulation demandée",
    cancelled: "Mise à jour arrêtée",
    done: "Traitement terminé",
    error: "Une erreur est survenue"
  };
  const state = stateByStatus[job.status] || "Mise à jour en cours";
  const iconByStatus = { done: "✓", cancelled: "■", error: "!", cancelling: "■", running: "⚡" };

  safeText("completionProgressIcon", iconByStatus[job.status] || "⚡");
  safeText("completionProgressState", state);
  safeText("completionProgressTitle", activeBulkJobTitle);
  safeText("completionProgressCount", `${done} / ${total}`);
  safeText("completionProgressPercent", `${pct} %`);
  safeText("completionProgressInfos", String(job.updatedInfos || 0));
  safeText("completionProgressImages", String(job.updatedImages || 0));
  safeText("completionProgressSuccess", String(job.successful ?? Math.max(0, done - Number(job.failed || 0))));
  safeText("completionProgressFailed", String(job.failed || 0));
  safeText("completionProgressWaiting",String(job.waiting||0));
  if($("completionOpenIssues"))$("completionOpenIssues").hidden=!Number(job.failed);

  const elapsed = formatJobDuration(job.elapsed || 0);
  const remaining = Number(job.estimatedRemainingSeconds);
  const timeLabel = Number.isFinite(remaining) && remaining > 0 && ["running", "cancelling"].includes(job.status)
    ? `Écoulé ${elapsed} · reste environ ${formatJobDuration(remaining)}`
    : `Temps écoulé : ${elapsed}`;
  safeText("completionProgressTime", timeLabel);

  let current = job.current ? `En cours : ${job.current}` : "Préparation du prochain animé…";
  if (job.status === "done") { current = completionResultText(job); if(job.relationsUnavailable&&Number(job.failed)>0)current += " · " + window.ALM_DESIGN.t("completionSourceUnavailable"); }
  if (job.status === "cancelled") current = `Arrêt propre effectué après ${done} élément(s). Les données déjà récupérées sont conservées.`;
  if (job.status === "error") current = job.error || "Erreur inconnue";
  safeText("completionProgressCurrent", current);
  safeText("completionProgressDockText", `${activeBulkJobTitle} — ${done}/${total} (${pct} %)`);

  const bar = $("completionProgressBar");
  if (bar) bar.style.width = `${Math.max(job.status === "running" ? 2 : 0, pct)}%`;
  const track = document.querySelector("#completionProgressPanel .completion-progress-track");
  track?.setAttribute("aria-valuenow", String(pct));

  const terminal = ["done", "error", "cancelled"].includes(job.status);
  if (terminal) {
    setCompletionProgressMinimized(false);
    panel?.classList.toggle("is-done", job.status === "done");
    panel?.classList.toggle("is-error", job.status === "error");
    panel?.classList.toggle("is-cancelled", job.status === "cancelled");
    $("completionProgressCancel")?.classList.add("hidden");
    $("completionProgressDismiss")?.classList.remove("hidden");
    if (job.status === "done") scheduleCompletionAutoDismiss(10);
    else cancelCompletionAutoDismiss();
  }
}

function showCompletionDialog(status = {}, options = {}) {
  const dialog = $("completionDialog");
  const start = $("completionDialogStart");
  const cancel = $("completionDialogCancel");

  if (!dialog || !start || !cancel) {
    const message = options.intro || "Compléter automatiquement les informations et les images manquantes ?";
    if (typeof window.showAppConfirm === "function") {
      return window.showAppConfirm(message, {
        title: options.title || "Compléter la bibliothèque ?",
        okText: options.startText || "Lancer",
        cancelText: options.cancelText || "Pas maintenant"
      });
    }
    window.notifyApp?.("La fenêtre de confirmation interne est indisponible. Recharge la page puis réessaie.", "error");
    return Promise.resolve(false);
  }

  safeText("completionDialogTitle", options.title || "Compléter la bibliothèque ?");
  safeText("completionDialogIntro", options.intro || "Les informations et images manquantes seront recherchées automatiquement.");
  safeText("completionDialogTotal", String(status.needsCount || 0));
  safeText("completionDialogMissingInfo", String(status.missingInfo || 0));
  safeText("completionDialogMissingImage", String(status.missingImage || 0));
  safeText("completionDialogEstimate", `~${Math.max(1, Number(status.estimatedMinutes) || 1)} min`);

  const kicker = dialog.querySelector(".completion-dialog-kicker");
  if (kicker) kicker.textContent = options.kicker || "Une seule passe";
  start.textContent = options.startText || "Lancer la mise à jour";
  cancel.textContent = options.cancelText || "Pas maintenant";

  return new Promise(resolve => {
    const finish = value => {
      start.onclick = null;
      cancel.onclick = null;
      dialog.oncancel = null;
      if (dialog.open) dialog.close();
      resolve(value);
    };

    start.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    dialog.oncancel = event => {
      event.preventDefault();
      finish(false);
    };

    if (dialog.open) dialog.close();
    dialog.showModal();
  });
}

async function runBulkCompletionJob({ endpoint, body = {}, title = "Mise à jour de la bibliothèque" }) {
  if (bulkJobPolling || completionJobRunning) {
    window.notifyApp?.("Une mise à jour est déjà en cours.", "info");
    setCompletionProgressMinimized(false);
    return null;
  }

  const active = await api("/api/bulk/active-job").catch(() => null);
  if (active?.active && active.jobId) {
    const activeTitle = bulkJobTitleFromKind(active.job?.kind || "");
    window.notifyApp?.("Une opération existante a été retrouvée. Reprise de son suivi.", "info");
    return resumeBulkCompletionJob(active.jobId, activeTitle);
  }

  bulkJobPolling = true;
  completionJobRunning = true;
  window.__almBulkJobRunning = true;
  activeBulkJobId = "";
  $("completionBanner")?.classList.add("hidden");
  resetCompletionProgress(title);

  let finalJob = null;
  try {
    const started = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
    if (!started?.jobId) throw new Error("Le serveur n’a pas renvoyé d’identifiant de traitement.");
    activeBulkJobId = String(started.jobId);
    const cancelButton = $("completionProgressCancel");
    if (cancelButton) {
      cancelButton.disabled = false;
      cancelButton.textContent = "Annuler";
    }

    let failures = 0;
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 700));
      let job;
      try {
        job = await api(`/api/bulk/complete-all/progress/${activeBulkJobId}`);
        failures = 0;
      } catch (error) {
        failures++;
        if (failures < 6) continue;
        throw error;
      }

      finalJob = job;
      updateCompletionProgress(job);
      if (["done", "error", "cancelled"].includes(job.status)) break;
    }
  } catch (error) {
    finalJob = {
      status: "error",
      done: finalJob?.done || 0,
      total: finalJob?.total || 0,
      updatedInfos: finalJob?.updatedInfos || 0,
      updatedImages: finalJob?.updatedImages || 0,
      updatedRelations: finalJob?.updatedRelations || 0,
      failed: finalJob?.failed || 0,
      elapsed: finalJob?.elapsed || 0,
      error: error.message
    };
    updateCompletionProgress(finalJob);
    window.notifyApp?.(`Mise à jour impossible : ${error.message}`, "error");
  } finally {
    activeBulkJobId = "";
    bulkJobPolling = false;
    completionJobRunning = false;
    window.__almBulkJobRunning = false;
    try { await load(); } catch (_) {}
    if (finalJob?.status === "done") rememberCompletionBannerSnooze(168);
    setTimeout(checkCompletionBanner, 700);
  }

  return finalJob;
}

function bulkJobTitleFromKind(kind = "") {
  if(kind === "titles") return window.ALM_DESIGN.t("formatTitles");
  if (kind === "images-only") return "Téléchargement des images";
  if (kind === "info-images") return "Mise à jour des informations et images";
  return "Mise à jour de la bibliothèque";
}

async function resumeBulkCompletionJob(jobId, title = "Mise à jour de la bibliothèque") {
  if (!jobId || bulkJobPolling || completionJobRunning) return null;

  bulkJobPolling = true;
  completionJobRunning = true;
  window.__almBulkJobRunning = true;
  activeBulkJobId = String(jobId);
  resetCompletionProgress(title);
  const cancelButton = $("completionProgressCancel");
  if (cancelButton) {
    cancelButton.disabled = false;
    cancelButton.textContent = "Annuler";
  }

  let finalJob = null;
  try {
    let failures = 0;
    while (true) {
      let job;
      try {
        job = await api(`/api/bulk/complete-all/progress/${activeBulkJobId}`);
        failures = 0;
      } catch (error) {
        failures++;
        if (failures < 6) {
          await new Promise(resolve => setTimeout(resolve, 700));
          continue;
        }
        throw error;
      }

      finalJob = job;
      updateCompletionProgress(job);
      if (["done", "error", "cancelled"].includes(job.status)) break;
      await new Promise(resolve => setTimeout(resolve, 700));
    }
  } catch (error) {
    finalJob = {
      status: "error",
      done: finalJob?.done || 0,
      total: finalJob?.total || 0,
      updatedInfos: finalJob?.updatedInfos || 0,
      updatedImages: finalJob?.updatedImages || 0,
      updatedRelations: finalJob?.updatedRelations || 0,
      failed: finalJob?.failed || 0,
      elapsed: finalJob?.elapsed || 0,
      error: error.message
    };
    updateCompletionProgress(finalJob);
  } finally {
    activeBulkJobId = "";
    bulkJobPolling = false;
    completionJobRunning = false;
    window.__almBulkJobRunning = false;
    try { await load(); } catch (_) {}
    if (finalJob?.status === "done") rememberCompletionBannerSnooze(168);
    setTimeout(checkCompletionBanner, 700);
  }

  return finalJob;
}

async function cancelActiveBulkJob() {
  if (!activeBulkJobId) return;

  const button = $("completionProgressCancel");
  if (button) {
    button.disabled = true;
    button.textContent = "Annulation…";
  }
  safeText("completionProgressState", "Annulation demandée");
  safeText("completionProgressCurrent", "La requête en cours se termine, puis la file sera arrêtée proprement.");

  try {
    await api(`/api/bulk/complete-all/cancel/${activeBulkJobId}`, {
      method: "POST",
      body: JSON.stringify({})
    });
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "Annuler";
    }
    window.notifyApp?.(`Annulation impossible : ${error.message}`, "error");
  }
}

function dismissCompletionProgress() {
  cancelCompletionAutoDismiss();
  $("completionProgressPanel")?.classList.add("hidden");
  $("completionProgressDock")?.classList.add("hidden");
  document.body.classList.remove("bulk-progress-expanded");
  setTimeout(checkCompletionBanner, 0);
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function animeYear(anime) {
  const candidates = [
    anime?.startDate,
    anime?.year,
    anime?.seasonYear,
    anime?.releaseYear,
    anime?.airedFrom,
    anime?.aired?.from,
    anime?.premiered,
    anime?.endDate
  ];
  for (const value of candidates) {
    const match = String(value || "").match(/(?:^|\D)(19\d{2}|20\d{2}|21\d{2})(?:\D|$)/);
    if (match) return match[1];
  }
  return "";
}

function rebuildDynamicFilters() {
  const typeSelect = $("typeFilter");
  const genreSelect = $("genreFilter");
  const yearSelect = $("yearFilter");
  const studioSelect=$("studioFilter"),currentStudio=studioSelect?.value||"";
  if(studioSelect){const placeholder=new Option(window.ALM_DESIGN.t("allStudios"),"");placeholder.dataset.designText="allStudios";placeholder.setAttribute("data-no-i18n","");studioSelect.replaceChildren(placeholder,...uniq(animes.flatMap(a=>[...(a.studios||[]),a.studio])).map(s=>new Option(s,s)));studioSelect.value=currentStudio;}
  if (!typeSelect || !genreSelect || !yearSelect) return;

  const currentType = typeSelect.value;
  const currentGenre = genreSelect.value;
  const currentYear = yearSelect.value;

  typeSelect.innerHTML = '<option value="">Tous les types</option>';
  genreSelect.innerHTML = '<option value="">Tous les genres</option>';
  yearSelect.innerHTML = '<option value="">Toutes années</option>';

  uniq(animes.map(a => a.type)).forEach(type => {
    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = type;
    typeSelect.appendChild(opt);
  });

  uniq(animes.flatMap(a => a.genres || [])).forEach(genre => {
    const opt = document.createElement("option");
    opt.value = genre;
    opt.textContent = genreLabelFr(genre);
    genreSelect.appendChild(opt);
  });

  const yearCounts = new Map();
  for (const anime of animes) {
    const year = animeYear(anime);
    if (year) yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
  }

  [...yearCounts.keys()]
    .sort((a, b) => Number(b) - Number(a))
    .forEach(year => {
      const opt = document.createElement("option");
      opt.value = year;
      opt.textContent = `${year} (${yearCounts.get(year)})`;
      yearSelect.appendChild(opt);
    });

  typeSelect.value = currentType;
  genreSelect.value = currentGenre;
  yearSelect.value = currentYear;
}

function normalizeLibraryViewKey(statusValue = "") {
  const status = String(statusValue || "").trim();
  return status || "all";
}

function defaultLibraryFilterState(viewKey = "all") {
  const forcedStatus = viewKey === "all" ? "" : viewKey;
  return {
    search: "",
    statusFilter: forcedStatus,
    typeFilter: "",
    genreFilter: "",
    studioFilter: "",
    yearFilter: "",
    sort: "title",
    personalScore: 0
  };
}

function captureLibraryFilterState() {
  const state = {};
  LIBRARY_FILTER_FIELDS.forEach(id => { state[id] = String($(id)?.value || ""); });
  state.personalScore = activePersonalScoreFilter;
  return state;
}

function saveCurrentLibraryFilterState() {
  libraryFilterStates[currentLibraryViewKey] = captureLibraryFilterState();
}

function applyLibraryFilterState(viewKey = "all", { reset = false } = {}) {
  const key = normalizeLibraryViewKey(viewKey);
  const state = reset ? defaultLibraryFilterState(key) : (libraryFilterStates[key] || defaultLibraryFilterState(key));
  LIBRARY_FILTER_FIELDS.forEach(id => {
    const el = $(id);
    if (!el) return;
    const value = id === "statusFilter" && key !== "all" ? key : String(state[id] || "");
    el.value = value;
  });
  activePersonalScoreFilter = Number(state.personalScore || 0) || 0;
  const status = $("statusFilter");
  if (status) {
    status.disabled = key !== "all";
    status.title = key !== "all" ? `Cette vue affiche uniquement : ${statusLabelFr(key)}.` : "Filtrer par statut";
  }
}

function resetCurrentLibraryFilterState() {
  libraryFilterStates[currentLibraryViewKey] = defaultLibraryFilterState(currentLibraryViewKey);
  applyLibraryFilterState(currentLibraryViewKey, { reset: true });
}

function noteLibraryFilterMutation() {
  saveCurrentLibraryFilterState();
}
window.__almLibraryFilterStates = libraryFilterStates;
window.__almSaveLibraryFilterState = saveCurrentLibraryFilterState;

function filteredAnimes() {
  const q = ($("search")?.value || "").toLowerCase();
  const status = $("statusFilter")?.value || "";
  const type = $("typeFilter")?.value || "";
  const genre = $("genreFilter")?.value || "";
  const year = $("yearFilter")?.value || "";
  const studio=$("studioFilter")?.value||"";
  const sort = $("sort")?.value || "title";

  // Filter cheap fields first. Building search text (including notes and seven
  // language titles) for every entry when q is empty costs time and allocations.
  const unratedOnly = $('unratedOnly')?.checked;
  let list = animes.filter(a => {
    if ((status && (a.status==='On Hold'?'On-Hold':a.status) !== status)
      || (type && a.type !== type)
      || (genre && !(a.genres || []).includes(genre))
      || (year && animeYear(a) !== year)
      || (studio && ![...(a.studios||[]),a.studio].includes(studio))
      || (unratedOnly && (a.status !== "Completed" || Number(a.score)))
      || (activePersonalScoreFilter && Math.round(Number(a.score || 0)) !== activePersonalScoreFilter)) return false;
    if (!q) return true;
    const text = `${globalThis.ALM_TITLES?.title(a)||a.title} ${a.title} ${a.canonicalTitle||""} ${a.titleEn||""} ${a.titleJa||""} ${Object.values(a.localizedTitles||{}).join(" ")} ${(a.tags || []).join(" ")} ${(a.genres || []).join(" ")} ${a.notes || ""}`.toLowerCase();
    return text.includes(q);
  });

  list.sort((a, b) => {
    if (sort === "scoreDesc") return Number(b.score || 0) - Number(a.score || 0);
    if (sort === "publicScoreDesc") return Number(b.publicScore || 0) - Number(a.publicScore || 0);
    if (sort === "rankAsc") return Number(a.rank || 999999) - Number(b.rank || 999999);
    if (sort === "progressDesc") return Number(b.episodesSeen || 0) - Number(a.episodesSeen || 0);
    if (sort === "startDateDesc") return String(b.startDate || "").localeCompare(String(a.startDate || ""));
    if (sort === "startDateAsc") return String(a.startDate || "9999").localeCompare(String(b.startDate || "9999"));
    if(sort==="studio")return String(a.studios?.[0]||a.studio||"\uffff").localeCompare(String(b.studios?.[0]||b.studio||"\uffff"))||String(globalThis.ALM_TITLES?.title(a)||a.title||"").localeCompare(String(globalThis.ALM_TITLES?.title(b)||b.title||""),globalThis.ALM_DESIGN?.language?.());
    return String(globalThis.ALM_TITLES?.title(a)||a.title||"").localeCompare(String(globalThis.ALM_TITLES?.title(b)||b.title||""),globalThis.ALM_DESIGN?.language?.());
  });

  return list;
}

function renderStats() {
  safeText("totalCount", animes.length);
  safeText("completedCount", animes.filter(a => a.status === "Completed").length);
  safeText("onholdCount", animes.filter(a => ["On-Hold","On Hold"].includes(a.status)).length);
  safeText("watchingCount", animes.filter(a => a.status === "Watching").length);
  safeText("planCount", animes.filter(a => a.status === "Plan to Watch").length);
}

// Rebuilding every season group for each filter/keystroke is wasteful. The
// library is replaced with a new array after successful loads, so the array
// identity safely invalidates this cache without caching personal data to disk.
let groupedLibraryInput = null;
let groupedLibraryRows = [];
function visibleLibraryGroups(items, order) {
  if (groupedLibraryInput !== items) {
    groupedLibraryInput = items;
    groupedLibraryRows = window.ALM_SERIES?.groups(items) || [];
  }
  const ranked = [];
  for (const group of groupedLibraryRows) {
    let first = Infinity;
    for (const anime of group.items) {
      const index = order.get(String(anime.id));
      if (index !== undefined && index < first) first = index;
    }
    if (first !== Infinity) ranked.push({group, first});
  }
  ranked.sort((a,b)=>a.first-b.first);
  return ranked.map(row=>row.group);
}

function render() {
  const displayTitle=a=>a.__seriesGroup?.title||window.ALM_TITLES?.title(a)||a.title;
  renderStats();
  if (!animeGrid) return;

  const list = filteredAnimes();
  const grouped=$("seriesView")?.checked!==false;
  const selectedIds=grouped?new Set(list.map(a=>String(a.id))):null;
  const order=grouped?new Map(list.map((a,i)=>[String(a.id),i])):null;
  const shown=grouped?visibleLibraryGroups(animes,order).map(g=>{
    const a=g.items.find(a=>a.status==="Watching"&&selectedIds.has(String(a.id)))||g.items.find(a=>selectedIds.has(String(a.id)))||g.active;
    return g.grouped?{...a,__seriesGroup:g,poster:g.poster||a.poster||a.imageUrl,episodesSeen:g.progressUnknown?'?':String(g.seen),episodesTotal:(g.unknown||g.gaps.length)?(g.total?g.total+" + ?":"?"):String(g.total||"?")}:a;
  }):list;
  const viewMode = $("viewMode")?.value || "cards";
  animeGrid.className = `grid view-${viewMode}${animeGrid.classList.contains("hidden") ? " hidden" : ""}`;
  animeGrid.innerHTML = "";
  const visibleShown=window.ALM_LIBRARY_PAGING?.render(shown,{key:currentLibraryViewKey,signature:JSON.stringify([LIBRARY_FILTER_FIELDS.map(id=>$(id)?.value||""),grouped,$("unratedOnly")?.checked,activePersonalScoreFilter,window.ALM_DESIGN.language()])})||shown;

  if (stats) {
    stats.innerHTML = `<span>${escapeHtml(window.ALM_DESIGN.t("seriesStats",{series:shown.length,seasons:list.length}))} / ${animes.length}</span>${activePersonalScoreFilter ? `<button type="button" id="activeScoreFilterChip" class="active-library-filter">⭐ Ma note : ${activePersonalScoreFilter}/10 <span aria-hidden="true">×</span></button>` : ""}`;
    $("activeScoreFilterChip")?.addEventListener("click", () => {
      activePersonalScoreFilter = 0;
      render();
    });
  }

  if(grouped&&stats?.querySelector("span"))stats.querySelector("span").textContent=window.ALM_DESIGN.t("seriesStats",{series:shown.length,seasons:list.length});
  const fragment=document.createDocumentFragment(),animesById=new Map();
  for(const a of animes)if(!animesById.has(String(a.id)))animesById.set(String(a.id),a);
  for (const anime of visibleShown) {
    const group=anime.__seriesGroup,actualAnime=animesById.get(String(anime.id))||anime;
    const article = document.createElement("article");
    article.className = "card";
    article.dataset.animeId = String(anime.id || "");
    article.dataset.status = String(anime.status || "");
    if(group)article.dataset.seriesKey=group.key;

    const tagHtml = [
      ...(anime.genres || []).map(t => ({ value: genreLabelFr(t), genre: true })),
      ...(anime.tags || []).map(t => ({ value: t, genre: false }))
    ].slice(0, 8).map(t => `<span class="tag"${t.genre ? "" : ' translate="no"'}>${escapeHtml(t.value)}</span>`).join("");

    const posterSrc = String(anime.poster || anime.imageUrl || "").trim();
    // Lazy cover caching only for identified MAL entries in the user's library.
    // Never cache arbitrary URLs or eagerly download the complete catalogue.
    const canCache=Number.isSafeInteger(Number(actualAnime.malId))&&Number(actualAnime.malId)>0&&/^https:\/\/(?:cdn\.myanimelist\.net|s4\.anilist\.co|static\.tvmaze\.com|media\.kitsu\.io)\//i.test(posterSrc);
    const localCover=canCache?'/api/cover-cache/'+Number(actualAnime.malId):posterSrc;
    const poster = posterSrc
      ? `<img loading="lazy" decoding="async" src="${escapeHtml(localCover)}" ${canCache?'data-alm-managed-cover="1"':''} alt="${escapeHtml(displayTitle(anime))}" data-image-fallback="true">`
      : `Image absente<br>${escapeHtml(displayTitle(anime))}`;

    article.innerHTML = `
      <div class="poster">${poster}<span class="badge">${escapeHtml(anime.type || "TV")}</span></div>
      <div class="card-body">
        <div class="title" translate="no">${escapeHtml(displayTitle(anime))}</div>
        <div class="meta">
          ⭐ <strong>Ma note :</strong> ${anime.score && anime.score !== "0" ? escapeHtml(anime.score) : "-"}<br>
          🌍 <strong>Note publique :</strong> ${escapeHtml(anime.publicScore || "-")} ${anime.rank ? ` / Rang #${escapeHtml(anime.rank)}` : ""}<br>
          🎬 <strong>Progression :</strong> ${escapeHtml(anime.episodesSeen || "?")} / ${escapeHtml(anime.episodesTotal || "?")}<br>
          📅 <strong>Diffusion :</strong> ${formatDate(anime.startDate)} → ${formatDate(anime.endDate)}<br>
          📌 <strong>Statut :</strong> ${escapeHtml(statusLabelFr(anime.status))}
        </div>
        ${tagHtml ? `<div class="tags">${tagHtml}</div>` : ""}
        <div class="actions">
          <button type="button" data-action="edit" data-anime-id="${escapeHtml(anime.id || "")}">Modifier</button>
          <button type="button" data-notebook-action="open-notebook" data-id="${Number(actualAnime.id)}" data-notebook-text="notebook" data-no-i18n>${escapeHtml(window.ALM_NOTEBOOK?.t("notebook")||"Mon carnet")}</button>
          <button type="button" data-action="refresh" data-anime-id="${escapeHtml(anime.id || "")}">Infos auto</button>
          <button type="button" data-action="image" data-anime-id="${escapeHtml(anime.id || "")}">Image</button>
          ${anime.malUrl ? `<a href="${escapeHtml(typeof safeUrlV2 === "function" ? safeUrlV2(anime.malUrl) : "#")}" target="_blank" rel="noopener">MAL</a>` : ""}
          ${Number.isSafeInteger(Number(actualAnime.malId))&&Number(actualAnime.malId)>0 ? `<button type="button" data-action="recommend" data-mal-id="${Number(actualAnime.malId)}" data-no-i18n>${escapeHtml(window.ALM_COMMUNITY_T?.('recommendFriend')||'Recommander à un ami')}</button>` : ''}
          <button type="button" class="delete" data-action="delete" data-anime-id="${escapeHtml(anime.id || "")}">Supprimer</button>
        </div>
      </div>
    `;

    article.querySelector('[data-action="edit"]')?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openEdit(actualAnime); });
    article.querySelector('[data-action="refresh"]')?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); refreshInfoById(anime.id, event.currentTarget); });
    article.querySelector('[data-action="image"]')?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); downloadImageById(anime.id, event.currentTarget); });
    article.querySelector('[data-action="recommend"]')?.addEventListener('click', event => {event.preventDefault();event.stopPropagation();window.ALM_COMMUNITY_WORKSPACE.recommendAnime(Number(actualAnime.malId),actualAnime).catch(error=>window.ALM_COMMUNITY.toast(window.ALM_COMMUNITY_ERROR(error),true));});
    article.querySelector('[data-action="delete"]')?.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); deleteAnime(anime); });

    if(group){
      const hint=document.createElement("p");hint.className="series-card-hint";hint.textContent=window.ALM_SERIES.summary(group,window.ALM_DESIGN.t);
      article.classList.add("studio-card-has-series");
      const button=document.createElement("button");button.type="button";button.className="series-show";button.textContent=window.ALM_DESIGN.t("seriesShow");button.onclick=event=>{event.stopPropagation();window.ALM_SERIES_UI.open(group.key,button);};
      article.querySelector(".actions").prepend(button);article.querySelector(".actions").before(hint);
    }
    if(anime.betaseriesProgressScope==='season-marker'){
      const position=document.createElement('p');position.className='series-card-hint';position.textContent=window.ALM_DESIGN.t('seriesImportedPosition',{position:anime.betaseriesEpisode});article.querySelector('.actions').before(position);
    }
    if(anime.importIdentityReview){const warning=document.createElement('p');warning.className='series-gap';warning.textContent=window.ALM_DESIGN.t('importIdentityReview');article.querySelector('.actions').before(warning);}
    fragment.appendChild(article);
  }
  animeGrid.appendChild(fragment);
  window.dispatchEvent(new CustomEvent("alm:library-rendered", {detail:{shown:visibleShown.length, filtered:shown.length, total:animes.length, view:currentLibraryViewKey}}));
}

function formatDate(value) {
  return value ? escapeHtml(String(value).slice(0, 10)) : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[s]));
}

function openAdd() {
  for(const id of ["seriesGroupTitle","seriesSeasonNumber"])if($(id))$(id).value="";
  if($("seriesSeparate"))$("seriesSeparate").checked=false;
  $("dialogTitle").textContent = "Ajouter un animé";
  $("animeForm").reset();
  $("animeId").value = "";
  $("status").value = "Watching";
  $("type").value = "TV";
  $("autoInfo").checked = true;
  window.ALM_FORM?.reset(null);
  $("formDialog").showModal();
}

function openEdit(anime) {
  if($("seriesGroupTitle"))$("seriesGroupTitle").value=anime.seriesGroupTitle||"";
  if($("seriesSeasonNumber"))$("seriesSeasonNumber").value=anime.manualSeasonNumber||anime.betaseriesSeason||"";
  if($("seriesSeparate"))$("seriesSeparate").checked=anime.seriesSeparate===true;
  $("dialogTitle").textContent = "Modifier un animé";
  $("animeId").value = anime.id;
  $("title").value = anime.title || "";
  $("status").value = anime.status || "Watching";
  $("type").value = anime.type || "TV";
  $("score").value = Number(anime.score)>0 ? anime.score : "";
  $("episodesSeen").value = anime.episodesSeen || "";
  $("episodesTotal").value = anime.episodesTotal || "";
  $("startDate").value = anime.startDate || "";
  $("endDate").value = anime.endDate || "";
  $("genres").value = (anime.genres || []).join(", ");
  $("tags").value = (anime.tags || []).join(", ");
  $("notes").value = anime.notes || "";
  $("notes").dataset.baseline = String(anime.notes||"").replace(/\r\n?/g,"\n");
  $("autoInfo").checked = true;
  if ($('watchedOn')) $('watchedOn').value = '';
  if ($('completedOn')) $('completedOn').value = anime.completedOn || '';
  window.ALM_FORM?.reset(anime);
  $("formDialog").showModal();
}

async function saveForm(event) {
  event.preventDefault();

  const id = $("animeId").value;
  let payload = {
    title: $("title").value.trim(),
    status: $("status").value,
    type: $("type").value,
    score: $("score").value,
    episodesSeen: $("episodesSeen").value,
    episodesTotal: $("episodesTotal").value,
    startDate: $("startDate").value,
    endDate: $("endDate").value,
    genres: $("genres").value.split(",").map(x => x.trim()).filter(Boolean),
    tags: $("tags").value.split(",").map(x => x.trim()).filter(Boolean),
    notes: $("notes").value,
    ...(id?{expectedNotes:$("notes").dataset.baseline}:{}),
    seriesGroupTitle:$("seriesGroupTitle")?.value.trim()||"",
    manualSeasonNumber:Number($("seriesSeasonNumber")?.value)||0,
    seriesSeparate:$("seriesSeparate")?.checked===true,
    autoInfo: $("autoInfo").checked,
    watchedOn: $('watchedOn')?.value || '',
    completedOn: $('completedOn')?.value || ''
  };

  if (!payload.title) return;
  const submit = $("animeForm")?.querySelector('button[type="submit"]');
  const oldSubmit = submit?.textContent || "Enregistrer";
  if (submit) { submit.disabled = true; submit.textContent = id ? "Enregistrement…" : "Ajout…"; }

  showProgress(id ? "Modification en cours..." : "Ajout en cours...");
  try {
    if ($("manualMode")?.checked) Object.assign(payload,await window.ALM_FORM.payload(),{autoInfo:false});
    payload = await window.ALM_BETA38.preparePayload(payload,id);
    if (!payload) { finishProgress(''); return; }
    const result = id
      ? await api(`/api/animes/${id}`, { method: "PUT", body: JSON.stringify(payload) })
      : await api("/api/animes", { method: "POST", body: JSON.stringify(payload) });

    await load();
    const persisted = animes.find(item => String(item.id) === String(result?.id))
      || animes.find(item => String(item.title || "").toLowerCase() === String(result?.title || payload.title).toLowerCase());
    if (!persisted) throw new Error("La fiche a été enregistrée par le serveur mais n'apparaît pas dans la bibliothèque après rechargement.");

    finishProgress("Terminé.");
    $("formDialog").close();

    if (!id) {
      const outcome = result?._addOutcome || {};
      if (outcome.status === "existing") {
        window.notifyApp?.(`Déjà présent dans Mes animés : ${outcome.storedTitle || persisted.title}.`, "info");
      } else if (outcome.matched) {
        const matched = outcome.matchedTitle && outcome.matchedTitle !== outcome.storedTitle ? ` · reconnu comme « ${outcome.matchedTitle} »` : "";
        window.notifyApp?.(`Ajouté à Mes animés : ${persisted.title}${matched}.`, "success");
      } else {
        const suffix = outcome.backgroundEnrichment
          ? " Les métadonnées se complètent en arrière-plan."
          : " Les métadonnées pourront être complétées plus tard.";
        window.notifyApp?.(`Ajouté à Mes animés : ${persisted.title}.${suffix}`, "success");
      }
    } else {
      window.notifyApp?.(`Fiche mise à jour : ${persisted.title}.`, "success");
    }
  } catch (error) {
    finishProgress("Erreur.");
    window.notifyApp?.(error.message==='NOTEBOOK_CONFLICT'?window.ALM_NOTEBOOK.t('conflict'):`Impossible d'enregistrer la fiche : ${error.message || error}`, "error");
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = oldSubmit; }
  }
}

async function deleteAnime(anime) {
  const accepted = await askAppConfirmation(`Supprimer « ${anime.title} » ?`, {
    title: "Supprimer cet animé ?",
    okText: "Supprimer",
    cancelText: "Conserver"
  });
  if (!accepted) return;
  await api(`/api/animes/${anime.id}`, { method: "DELETE" });
  await load();
}

const singleAnimeActionLocks = new Set();

function getAnimeByLocalId(id) {
  return animes.find(a => String(a.id) === String(id)) || null;
}

async function runSingleAnimeAction(id, kind, button, runner) {
  const key = `${kind}:${id}`;
  if (singleAnimeActionLocks.has(key)) {
    window.notifyApp?.("Action déjà en cours pour cet animé.", "warning");
    return;
  }

  const anime = getAnimeByLocalId(id);
  if (!anime) {
    alert("Anime introuvable dans la vue actuelle. Recharge la page puis réessaie.");
    return;
  }

  singleAnimeActionLocks.add(key);
  const oldText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = kind === "image" ? "Image..." : "Infos...";
  }

  try {
    await runner(anime);
  } finally {
    singleAnimeActionLocks.delete(key);
    if (button) {
      button.disabled = false;
      button.textContent = oldText || (kind === "image" ? "Image" : "Infos auto");
    }
  }
}

function downloadImageById(id, button) {
  return runSingleAnimeAction(id, "image", button, downloadImage);
}

function refreshInfoById(id, button) {
  return runSingleAnimeAction(id, "info", button, anime => refreshInfo(anime, false));
}

async function downloadImage(anime) {
  // Action stricte par carte : une requête = un id précis, jamais un lot.
  try {
    showProgress(`Téléchargement de l'image : ${anime.title}`);
    const result = await api(`/api/animes/${anime.id}/download-image`, {
      method: "POST",
      body: JSON.stringify({ query: anime.title, single: true })
    });
    finishProgress(`Image téléchargée${result.source ? " via " + result.source : ""}.`);
    window.notifyApp?.("Image téléchargée pour un seul animé.", "success");
    await load();
  } catch (error) {
    finishProgress("Erreur image.");
    window.notifyApp?.("Image introuvable : " + error.message, "error");
    alert("Image introuvable : " + error.message);
  }
}


async function refreshInfo(anime, overwrite = false) {
  try {
    showProgress(`Récupération des infos : ${anime.title}`);
    const result = await api(`/api/animes/${anime.id}/refresh-info`, {
      method: "POST",
      body: JSON.stringify({ query: anime.title, overwrite, single: true })
    });
    finishProgress(`Infos récupérées${result.source ? " via " + result.source : ""}.`);
    window.notifyApp?.("Infos auto récupérées pour un seul animé.", "success");
    await load();
  } catch (error) {
    finishProgress("Erreur infos auto.");
    window.notifyApp?.("Infos auto impossibles : " + error.message, "error");
    alert("Infos auto impossibles : " + error.message);
  }
}


// ── COMPLETION INTELLIGENTE EN UNE SEULE PASSE ──
async function smartCompleteAll(overwrite = false, options = {}) {
  let status = options.status || null;
  if (!status) {
    try {
      status = await api("/api/bulk/smart-status");
    } catch (error) {
      window.notifyApp?.(`Diagnostic impossible : ${error.message}`, "error");
      return null;
    }
  }

  const total = Number(status.needsCount ?? Math.max(status.missingInfo || 0, status.missingImage || 0));
  if (total === 0 && !overwrite) {
    window.notifyApp?.("Ta bibliothèque est déjà complète : aucune information ni image ne manque.", "success");
    return { status: "done", total: 0, done: 0 };
  }

  if (status.completionRunning && status.activeJobId) {
    window.notifyApp?.("Une mise à jour est déjà en cours. Son suivi a été réaffiché.", "info");
    return resumeBulkCompletionJob(status.activeJobId, bulkJobTitleFromKind(status.activeJobKind || ""));
  }

  if (!options.skipConfirmation) {
    const accepted = await showCompletionDialog(status, options.dialog || {});
    if (!accepted) return null;
  }

  return runBulkCompletionJob({
    endpoint: "/api/bulk/info-only",
    body: { overwrite, retryMarked: options.retryMarked === true },
    title: options.progressTitle || "Mise à jour de la bibliothèque"
  });
}

async function downloadAllMissingImages() {
  const missing = animes.filter(a => a?.title && !String(a.poster || a.imageUrl || "").trim());
  if (!missing.length) {
    window.notifyApp?.("Toutes les images disponibles sont déjà présentes.", "success");
    return;
  }

  const accepted = typeof window.showAppConfirm === "function"
    ? await window.showAppConfirm(
        `${missing.length} image(s) manquante(s) seront recherchée(s) et téléchargée(s). Les informations existantes ne seront pas modifiées.`,
        {
          title: "Télécharger les images manquantes ?",
          okText: "Télécharger",
          cancelText: "Pas maintenant"
        }
      )
    : false;

  if (!accepted) return;
  return runBulkCompletionJob({
    endpoint: "/api/bulk/images-only",
    body: {},
    title: "Téléchargement des images"
  });
}

async function completeInfoOnly(overwrite = false) {
  // Le bouton historique « Compléter les infos » lance désormais la passe unique
  // infos + images afin d'éviter deux opérations et deux confirmations successives.
  return smartCompleteAll(overwrite, {
    progressTitle: "Mise à jour des informations et images"
  });
}

async function refreshAllInfo() {
  return completeInfoOnly(false);
}

async function pollXmlProgress(progressId, signal = null) {
  const panel = $("progressPanel");
  const bar = $("progressBar");
  const label = $("progressLabel");
  if (panel) panel.classList.remove("hidden");

  let finished = false;
  while (!finished && !signal?.aborted) {
    try {
      const response = await fetch(`/api/import/xml/progress/${progressId}`, { signal });
      const data = await response.json();
      const done = Number(data.done || 0);
      const total = Number(data.total || 0);
      const pct = total ? Math.round((done / total) * 100) : 0;
      const phase = data.phase === "parse" ? "Analyse XML" : data.phase === "merge" ? "Import" : data.phase === "save" ? "Sauvegarde" : "Import XML";

      if (bar) bar.style.width = `${pct}%`;
      if (label) label.textContent = total ? `${phase} ${done}/${total}${data.current ? " — " + data.current : ""}` : `${phase}...`;

      finished = data.status === "done" || data.status === "error";
      if (!finished && !signal?.aborted) await new Promise(resolve => setTimeout(resolve, 350));
    } catch {
      if (!signal?.aborted) await new Promise(resolve => setTimeout(resolve, 600));
    }
  }
}

async function importXml(event) {
  event.preventDefault();

  const file = $("xmlFile").files[0];
  if (!file) return;

  const submitButton = event.submitter || $("importForm")?.querySelector('button[type="submit"]');
  const previousButtonText = submitButton?.textContent || "Importer";
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Import en cours…";
  }

  const overwrite = $("overwriteImport").checked;
  const progressId = String(Date.now());
  const pollingController = new AbortController();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("overwrite", overwrite ? "true" : "false");
  formData.append("progressId", progressId);

  showProgress("Import XML en cours...");
  const polling = pollXmlProgress(progressId, pollingController.signal);

  try {
    const result = await api("/api/import/xml", { method: "POST", body: formData });
    pollingController.abort();
    await polling;
    finishProgress(`Import terminé : ${result.added} ajouté(s), ${result.updated} doublon(s) traité(s).`);

    $("importDialog")?.close();
    await load();

    const importedCount = Number(result.added || 0) + Number(result.updated || 0);
    if (importedCount > 0) {
      const status = await api("/api/bulk/smart-status").catch(() => null);
      if (status?.needsWork) {
        const completed = await smartCompleteAll(false, {
          status,
          progressTitle: "Enrichissement après import MyAnimeList",
          dialog: {
            kicker: "Import MyAnimeList terminé",
            title: `${result.added || 0} ajouté(s) · ${result.updated || 0} mis à jour`,
            intro: "L’import est enregistré. Veux-tu compléter maintenant les informations et les images manquantes ?",
            startText: "Compléter maintenant",
            cancelText: "Plus tard"
          }
        });
        if (!completed) window.notifyApp?.("Import terminé. La mise à jour reste disponible depuis la bannière.", "success");
      } else {
        window.notifyApp?.(`Import terminé : ${result.added || 0} ajouté(s), ${result.updated || 0} doublon(s) traité(s).`, "success");
      }
    } else {
      window.notifyApp?.("Import terminé : aucun changement à appliquer.", "info");
    }
  } catch (error) {
    pollingController.abort();
    finishProgress("Erreur pendant l’import MyAnimeList.");
    window.notifyApp?.(`Import MyAnimeList impossible : ${error.message}`, "error");
  } finally {
    pollingController.abort();
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = previousButtonText;
    }
  }
}


function showSeasonNewsView() {
  if (typeof showV2Page === "function") {
    showV2Page("seasonNewsPage", "navSeasonNews");
    return;
  }
  setV2BodyView("seasonNewsPage");
  document.getElementById("aboutPage")?.classList.add("hidden");
  document.getElementById("donationsPage")?.classList.add("hidden");
  document.querySelector(".hero")?.classList.add("hidden");
  document.querySelector(".filters")?.classList.add("hidden");
  document.getElementById("stats")?.classList.add("hidden");
  document.getElementById("animeGrid")?.classList.add("hidden");
  document.getElementById("completionBanner")?.classList.add("hidden");
  document.getElementById("seasonNewsPage")?.classList.remove("hidden");
  document.querySelectorAll(".nav-item, .studio-account-shortcut").forEach(x => x.classList.remove("active"));
  document.getElementById("navSeasonNews")?.classList.add("active");
}

async function checkSeasonNews(force = false) {
  // Toutes les entrées historiques (bouton d'accueil, ancien panneau, raccourci)
  // utilisent désormais le même job annulable et la même barre de progression
  // que la page Saisons moderne. Le fallback ci-dessous reste uniquement pour
  // une ancienne page qui chargerait app.js sans alm-v2.js.
  if (typeof loadSeasonNews === "function") {
    return loadSeasonNews(force);
  }

  if (force) {
    const accepted = await askAppConfirmation(
      "Une nouvelle analyse complète remplacera les résultats de saisons actuellement affichés.",
      { title: "Relancer la recherche des saisons ?", okText: "Relancer", cancelText: "Annuler" }
    );
    if (!accepted) return;
  }

  try {
    showProgress(force ? "Nouvelle recherche des saisons..." : "Chargement des saisons détectées...");
    const result = await api("/api/news/seasons", {
      method: "POST",
      body: JSON.stringify({ force })
    });
    finishProgress(`${result.count || 0} nouvelle(s) saison(s) détectée(s).`);

    currentNews = Array.isArray(result.news) ? result.news : [];

    // Afficher les saisons comme une vraie page dédiée : pas au-dessus de la grille Animés.
    showSeasonNewsView();
    await load();

    const showPanel = () => {
      showSeasonNewsView();
      renderSeasonNews(currentNews);
      const panel = document.getElementById("newsPanel");
      panel?.classList.remove("hidden");
    };
    showPanel();
    // Repassage volontaire : certaines fonctions de navigation V1/V2 peuvent cacher le panel.
    setTimeout(showPanel, 80);
    setTimeout(() => document.getElementById("newsPanel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 180);
  } catch (error) {
    finishProgress("Erreur saisons.");
    window.notifyApp?.("Recherche saisons impossible : " + error.message, "error");
    alert("Recherche saisons impossible : " + error.message);
  }
}

function renderSeasonNews(news) {
  const panel = $("newsPanel");
  const list = $("newsList");
  if (!panel || !list) return;

  const items = Array.isArray(news) ? news : [];
  panel.classList.remove("hidden");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<p class="muted season-empty">Aucune nouvelle saison détectée pour le moment.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const div = document.createElement("div");
    div.className = "news-item rich-news season-news-item";

    const img = item.imageUrl || item.poster || "";
    const cover = img
      ? `<img class="news-cover" src="${escapeHtml(img)}" alt="${escapeHtml(item.title)}" loading="lazy">`
      : `<div class="news-cover placeholder">Infos</div>`;

    const synopsisRaw = String(item.synopsis || item.summary || "");
    const synopsis = synopsisRaw
      ? escapeHtml(synopsisRaw).slice(0, 650) + (synopsisRaw.length > 650 ? "..." : "")
      : "Informations en attente. Clique sur “Charger les informations” pour compléter les affiches, dates et descriptions.";

    const genreList = Array.isArray(item.genres)
      ? item.genres
      : String(item.genres || "").split(/[,;|]/).map(x => x.trim()).filter(Boolean);
    const scoreRank = `${escapeHtml(item.publicScore || "-")}${item.rank ? ` / Rang #${escapeHtml(item.rank)}` : ""}`;

    div.innerHTML = `
      <div class="news-content">
        ${cover}
        <div class="news-main-text">
          <strong>${escapeHtml(item.title || "Titre inconnu")}</strong>
          <small>Suite liée à : ${escapeHtml(item.sourceTitle || "-")} ${item.relation ? `• ${escapeHtml(item.relation)}` : ""}</small>
          <p>${synopsis}</p>
          <div class="meta news-meta">
            📺 Type : ${escapeHtml(item.type || "-")}<br>
            🎬 Épisodes : ${escapeHtml(item.episodesTotal || "-")}<br>
            📅 Début : ${formatDate(item.startDate)}${item.endDate ? ` → ${formatDate(item.endDate)}` : ""}<br>
            🌍 Note publique : ${scoreRank}<br>
            🏷 Genres : ${genreList.map(escapeHtml).join(", ") || "-"}
          </div>
        </div>
      </div>
      <div class="news-actions season-news-actions">
        <button data-add>Ajouter à voir prochainement</button>
        <button data-skip>Ne pas ajouter</button>
        <button class="delete" data-ignore>Oublier définitivement</button>
      </div>
    `;

    div.querySelector("[data-add]")?.addEventListener("click", async () => {
      await api("/api/news/add-to-plan", { method: "POST", body: JSON.stringify(item) });
      div.remove();
      currentNews = currentNews.filter(x => normalizeNewsKey(x) !== normalizeNewsKey(item));
      await load();
    });

    div.querySelector("[data-skip]")?.addEventListener("click", () => {
      div.remove();
      currentNews = currentNews.filter(x => normalizeNewsKey(x) !== normalizeNewsKey(item));
    });

    div.querySelector("[data-ignore]")?.addEventListener("click", async () => {
      const accepted = await askAppConfirmation(`Oublier définitivement « ${item.title} » ?`, {
        title: "Oublier cette saison ?",
        okText: "Oublier",
        cancelText: "Conserver"
      });
      if (!accepted) return;
      await api("/api/news/ignore", { method: "POST", body: JSON.stringify(item) });
      div.remove();
      currentNews = currentNews.filter(x => normalizeNewsKey(x) !== normalizeNewsKey(item));
    });

    fragment.appendChild(div);
  }

  list.appendChild(fragment);
}

function normalizeNewsKey(item) {
  return String(item?.malId || item?.title || "").toLowerCase().trim();
}

// Compatibilité avec les anciens appels V1.
function renderNews(news) {
  return renderSeasonNews(news);
}

async function loadVisibleNewsInfo() {
  // Ce bouton ne lance plus une détection de nouvelles saisons.
  // Il complète uniquement la liste déjà détectée, avec une progression réelle.
  if (!currentNews.length) {
    try {
      const result = await api("/api/news/results");
      currentNews = Array.isArray(result.news) ? result.news : [];
    } catch (error) {
      alert("Impossible de lire les saisons détectées : " + error.message);
      return;
    }
  }

  if (!currentNews.length) return alert("Aucune saison détectée à compléter. Lance d'abord une nouvelle recherche.");

  const panel = $("progressPanel");
  const bar = $("progressBar");
  const label = $("progressLabel");
  if (panel) panel.classList.remove("hidden");
  if (bar) bar.style.width = "2%";
  if (label) label.textContent = `Préparation de ${currentNews.length} saison(s) détectée(s)...`;

  let jobId = "";
  try {
    const started = await api("/api/news/details/job", {
      method: "POST",
      body: JSON.stringify({ items: currentNews })
    });
    jobId = started.jobId;
  } catch (error) {
    if (panel) panel.classList.add("hidden");
    alert("Impossible de démarrer la mise à jour : " + error.message);
    return;
  }

  while (true) {
    await new Promise(r => setTimeout(r, 700));
    let job;
    try { job = await api("/api/news/details/progress/" + encodeURIComponent(jobId)); }
    catch { continue; }

    const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 100;
    if (bar) bar.style.width = Math.max(3, Math.min(100, pct)) + "%";

    const rem = job.estimatedRemainingSeconds;
    const remStr = rem > 60 ? ` · ~${Math.ceil(rem / 60)}min restantes` : rem > 0 ? ` · ~${rem}s` : "";
    const phaseLabel = job.phase === "local" ? "metadata locale" : job.phase === "network" ? "APIs externes" : "sauvegarde";
    if (label) {
      label.textContent = `${job.done}/${job.total || currentNews.length} — ${phaseLabel} — ${job.current || ""} · ${job.local || 0} local · ${job.network || 0} réseau · ${job.failed || 0} échec(s)${remStr}`;
    }

    if (job.status === "done" || job.status === "error") {
      if (bar) bar.style.width = "100%";
      if (job.status === "done") {
        currentNews = Array.isArray(job.items) ? job.items : currentNews;
        if (label) label.textContent = `✅ Terminé : ${currentNews.length} saison(s) complétée(s) — ${job.local || 0} via metadata locale · ${job.network || 0} via réseau.`;
        await api("/api/news/results/save", {
          method: "POST",
          body: JSON.stringify({ items: currentNews })
        }).catch(() => {});
        showSeasonNewsView();
        renderSeasonNews(currentNews);
      } else {
        if (label) label.textContent = "❌ Erreur : " + (job.error || "mise à jour impossible");
        window.notifyApp?.("Mise à jour des saisons impossible : " + (job.error || "erreur"), "error");
      }
      setTimeout(() => panel?.classList.add("hidden"), 2600);
      break;
    }
  }
}

async function addAllNewsToWatchlist() {
  if (!currentNews.length) {
    try {
      const result = await api("/api/news/results");
      currentNews = Array.isArray(result.news) ? result.news : [];
    } catch (error) {
      alert("Impossible de lire les saisons détectées : " + error.message);
      return;
    }
  }

  if (!currentNews.length) return alert("Aucune saison à ajouter.");
  const accepted = await askAppConfirmation(`Ajouter ${currentNews.length} saison(s) à « À voir » ?`, {
    title: "Ajouter toutes les saisons ?",
    okText: "Tout ajouter",
    cancelText: "Annuler"
  });
  if (!accepted) return;

  try {
    showProgress("Ajout des nouvelles saisons à voir...");
    const result = await api("/api/news/add-all-to-watchlist", {
      method: "POST",
      body: JSON.stringify({ items: currentNews })
    });
    finishProgress(`${result.added || 0} saison(s) ajoutée(s).`);
    currentNews = [];
    renderSeasonNews([]);
    await load();
    showSeasonNewsView();
  } catch (error) {
    finishProgress("Erreur ajout saisons.");
    alert("Ajout impossible : " + error.message);
  }
}

function filterByStatusCard(status) {
  if (typeof showAnimesV1 === "function") showAnimesV1(status || "");
  else {
    if ($("statusFilter")) $("statusFilter").value = status || "";
    $("newsPanel")?.classList.add("hidden");
    render();
  }
}

function showLibraryByPersonalScore(score) {
  const value = Math.max(1, Math.min(10, Math.round(Number(score) || 0)));
  if (!value) return;
  if (typeof showAnimesV1 === "function") showAnimesV1("");
  else if (typeof hideAllV2Pages === "function") hideAllV2Pages();
  ["search", "statusFilter", "typeFilter", "genreFilter", "studioFilter", "yearFilter"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
  activePersonalScoreFilter = value;
  if ($("sort")) $("sort").value = "title";
  $("newsPanel")?.classList.add("hidden");
  render();
  saveCurrentLibraryFilterState();
  try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch { window.scrollTo(0, 0); }
  window.notifyApp?.(`Bibliothèque filtrée : note personnelle ${value}/10.`, "info");
}
window.showLibraryByPersonalScore = showLibraryByPersonalScore;

function resetFilters() {
  resetCurrentLibraryFilterState();
  render();
  saveCurrentLibraryFilterState();
}

function goHome() {
  if (typeof showAnimesV1 === "function") showAnimesV1("");
  else {
    if (typeof showMainGrid === "function") showMainGrid();
    $("newsPanel")?.classList.add("hidden");
    render();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}


let csvPreviewItems = [];
let csvPreviewFilter = "all";
let csvPreviewSearch = "";
let csvPreviewPage=0,csvSearchTimer=null;
let csvPartialResults=new Map();
function renderCsvPartialResults(data){
  if(!activeCsvAnalysis||activeCsvAnalysis.finished)return;
  for(const preview of data.previews||[])if(preview.item&&Number.isInteger(preview.index))csvPartialResults.set(preview.index,preview.item);
  if(!csvPartialResults.size)return;
  const results=$('csvImportResults'),summary=$('csvImportSummary');
  results.classList.remove('hidden');$('csvResultsPanel')?.classList.remove('is-empty');$('csvResultsPlaceholder')?.classList.add('hidden');
  summary.classList.remove('hidden');summary.replaceChildren();const title=document.createElement('strong'),hint=document.createElement('p');title.textContent=window.ALM_DESIGN.t('csvPartialTitle',{count:csvPartialResults.size});hint.textContent=window.ALM_DESIGN.t('csvPartialHint');summary.append(title,hint);
  $('csvResultsVisibleCount').textContent=csvPartialResults.size+' / '+Number(data.total||0);
  const rows=[...csvPartialResults].sort((a,b)=>a[0]-b[0]).slice(0,40);results.replaceChildren();
  for(const [,item]of rows){const row=document.createElement('article');row.className='csv-row csv-partial-row';const body=document.createElement('div');body.className='csv-row-body';const name=document.createElement('strong'),facts=document.createElement('p');name.textContent=item.sourceTitle||item.anime?.title||'';name.setAttribute('translate','no');facts.textContent=csvClassificationMeta(item).badge+' · '+(item.found?.title||item.reason||'');body.append(name,facts);row.append(body);results.append(row);}
  $('importSelectedCsv').disabled=true;
}
const CSV_PREVIEW_PAGE_SIZE=40;
let csvSearchSuggestionIndex = -1;
let lastCsvDismissSnapshot = null;
let lastCsvDismissUndoTimer = null;
let activeCsvAnalysis = null;
let activeCsvImport = null;

function setupImportTabs() {
  // A single delegated controller below handles all formats, including free lists.
}

$("csvResultsSearch")?.addEventListener("input", event => {
  csvPreviewSearch = String(event.target?.value || "");
  csvSearchSuggestionIndex = -1;
  csvPreviewPage=0;clearTimeout(csvSearchTimer);
  csvSearchTimer=setTimeout(()=>{renderCsvPreviewRows();renderCsvSearchSuggestions();},120);
});
$("csvResultsSearch")?.addEventListener("focus", renderCsvSearchSuggestions);
$("csvResultsSearch")?.addEventListener("blur", () => {
  setTimeout(() => $("csvResultsSuggestions")?.classList.add("hidden"), 120);
});
$("csvResultsSearch")?.addEventListener("keydown", event => {
  const box = $("csvResultsSuggestions");
  const buttons = Array.from(box?.querySelectorAll("button[data-csv-suggestion-index]") || []);
  if (!buttons.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    csvSearchSuggestionIndex = (csvSearchSuggestionIndex + delta + buttons.length) % buttons.length;
    buttons.forEach((button, index) => button.classList.toggle("active", index === csvSearchSuggestionIndex));
    buttons[csvSearchSuggestionIndex]?.scrollIntoView?.({ block: "nearest" });
  } else if (event.key === "Enter" && csvSearchSuggestionIndex >= 0) {
    event.preventDefault();
    buttons[csvSearchSuggestionIndex]?.click();
  } else if (event.key === "Escape") {
    box?.classList.add("hidden");
    csvSearchSuggestionIndex = -1;
  }
});
$("csvSelectVisibleReview")?.addEventListener("click", () => {
  csvVisibleRows().forEach(({ item }) => {
    if (item.classification === "anime" || item.forceImport === true) item.__selected = true;
    else if (item.reviewState !== "dismissed" && ["review", "non_anime"].includes(String(item.classification || ""))) item.__actionSelected = true;
  });
  renderCsvPreviewRows();
});
$("csvClearReviewSelection")?.addEventListener("click", () => {
  csvVisibleRows().forEach(({ item }) => {
    item.__selected = false;
    item.__actionSelected = false;
  });
  renderCsvPreviewRows();
});
$("csvDismissSelectedReview")?.addEventListener("click", dismissSelectedCsvReviewItems);
$("csvForceSelectedReview")?.addEventListener("click", forceSelectedCsvReviewItems);
$("csvDismissSafeNonAnime")?.addEventListener("click", dismissSafeNonAnimeCsvItems);
$("csvUndoDismissReview")?.addEventListener("click", undoLastCsvDismiss);

function csvClassificationMeta(item) {
  const classification = String(item?.classification || "review");
  if (classification === "anime") return { badge: "✅ Anime confirmé", tone: "anime", selectable: true, reviewSelectable: false };
  if (classification === "non_anime") return { badge: item.forceImport === true ? "🛡️ Non animé · import forcé" : "🛡️ Non animé · exclu de l’import", tone: "non-anime", selectable: false, reviewSelectable: item.reviewState !== "dismissed" };
  if (classification === "ignored") return { badge: "❌ Entrée écartée", tone: "ignored", selectable: false, reviewSelectable: false };
  return { badge: "⚠️ À vérifier", tone: "review", selectable: false, reviewSelectable: true };
}

function updateCsvImportButtonState() {
  const importBtn = $("importSelectedCsv");
  if (!importBtn) return;
  if (activeCsvImport && !activeCsvImport.finished) {
    importBtn.disabled = true;
    return;
  }
  importBtn.disabled = !csvPreviewItems.some(item => item?.__selected === true);
}

function csvVisibleRows() {
  return csvPreviewItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => csvPreviewItemMatchesView(item));
}

function csvVisibleReviewItems() {
  return csvVisibleRows()
    .filter(({ item }) => ["review", "non_anime"].includes(String(item?.classification || "")) && item?.reviewState !== "dismissed" && item?.forceImport !== true);
}

function updateCsvReviewBulkActions() {
  const bar = $("csvReviewBulkActions");
  const dismiss = $("csvDismissSelectedReview");
  const force = $("csvForceSelectedReview");
  const safeDismiss = $("csvDismissSafeNonAnime");
  const selectionCount = $("csvBulkSelectionCount");
  const visible = csvVisibleRows();
  const selectedImport = csvPreviewItems.filter(item => item?.__selected === true && (item.classification === "anime" || item.forceImport === true));
  const selectedReview = csvPreviewItems.filter(item => item?.__actionSelected === true && item?.reviewState !== "dismissed" && ["review", "non_anime"].includes(String(item?.classification || "")));
  const totalSelected = selectedImport.length + selectedReview.length;
  const usefulView = csvPreviewItems.length > 0 && (visible.length > 0 || totalSelected > 0);
  bar?.classList.toggle("hidden", !usefulView);
  if (selectionCount) selectionCount.textContent = `${totalSelected} sélectionné${totalSelected > 1 ? "s" : ""}`;
  if (dismiss) {
    dismiss.disabled = selectedReview.length === 0;
    dismiss.textContent = selectedReview.length ? `🗑 Écarter (${selectedReview.length})` : "🗑 Écarter";
  }
  if (force) {
    force.disabled = selectedReview.length === 0;
    force.textContent = selectedReview.length ? `✓ Forcer l’import (${selectedReview.length})` : "✓ Forcer l’import";
  }
  if (safeDismiss) {
    const safeCount = csvPreviewItems.filter(item => item?.classification === "non_anime" && item?.reviewState !== "dismissed" && item?.forceImport !== true).length;
    safeDismiss.disabled = safeCount === 0;
    safeDismiss.hidden = safeCount === 0;
    safeDismiss.textContent = safeCount ? `🛡️ Écarter les hors-anime sûrs (${safeCount})` : "🛡️ Aucun hors-anime sûr";
  }
}

function updateCsvSummaryCountsFromItems() {
  const counts = {
    all: csvPreviewItems.length,
    anime: csvPreviewItems.filter(item => item.classification === "anime").length,
    review: csvPreviewItems.filter(item => item.classification === "review").length,
    non_anime: csvPreviewItems.filter(item => item.classification === "non_anime").length,
    ignored: csvPreviewItems.filter(item => item.classification === "ignored").length
  };
  Object.entries(counts).forEach(([key, value]) => {
    const strong = document.querySelector(`[data-csv-summary-filter="${key}"] strong`);
    if (strong) strong.textContent = String(value);
    const filter=strong?.closest('button');if(filter)filter.hidden=key==='ignored'&&value===0;
  });
}

async function dismissSelectedCsvReviewItems(options = {}) {
  const selected = csvPreviewItems.filter(item => item?.__actionSelected === true && item?.reviewState !== "dismissed" && ["review", "non_anime"].includes(String(item?.classification || "")));
  if (!selected.length) return;
  if (!options.skipConfirmation) {
    const ok = await askAppConfirmation(
      `Écarter ${selected.length} entrée(s) de cet import ? Elles ne seront pas ajoutées et ne seront plus reproposées dans le Contrôle anime pour ce même import, sauf si une future analyse apporte une meilleure correspondance.`,
      { title: "Écarter la sélection", confirmText: `Écarter ${selected.length} entrée(s)`, cancelText: "Annuler", danger: true }
    );
    if (!ok) return;
  }
  const button = $("csvDismissSelectedReview");
  if (button) { button.disabled = true; button.textContent = "Traitement…"; }
  try {
    const keys = selected.map(item => String(item.reviewKey || "").trim()).filter(Boolean);
    if (!keys.length) throw new Error("Clé de contrôle introuvable. Relance l’analyse CSV.");
    const response = await fetch("/api/v2/content-audit/quarantine/bulk-dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    const keySet = new Set(keys);
    lastCsvDismissSnapshot = selected.map(item => ({
      key: String(item.reviewKey || ""),
      classification: String(item.classification || "review"),
      reason: String(item.reason || ""),
      reviewState: item.reviewState, importExcluded: item.importExcluded
    }));
    csvPreviewItems.forEach(item => {
      if (!keySet.has(String(item.reviewKey || ""))) return;
      if(item.classification!=="non_anime")item.classification = "ignored";
      item.reviewState="dismissed";item.importExcluded=true;
      item.reason = "Écartée manuellement depuis l’analyse BetaSeries.";
      item.__selected = false;
      item.__actionSelected = false;
      item.forceImport = false;
    });
    updateCsvSummaryCountsFromItems();
    renderCsvPreviewRows();
    const undo = $("csvUndoDismissReview");
    if (undo) {
      undo.classList.remove("hidden");
      undo.textContent = `↶ Annuler (${Number(payload.dismissed || selected.length)})`;
      clearTimeout(lastCsvDismissUndoTimer);
      lastCsvDismissUndoTimer = setTimeout(() => undo.classList.add("hidden"), 12000);
    }
    window.notifyApp?.(`${Number(payload.dismissed || selected.length)} entrée(s) écartée(s) de l’import.`, "success");
  } catch (error) {
    window.notifyApp?.(`Impossible d’écarter la sélection : ${error.message}`, "error");
    updateCsvReviewBulkActions();
  }
}


async function dismissSafeNonAnimeCsvItems() {
  const candidates = csvPreviewItems.filter(item => item?.classification === "non_anime" && item?.reviewState !== "dismissed" && item?.forceImport !== true);
  if (!candidates.length) return;
  const ok = await askAppConfirmation(
    `Écarter les ${candidates.length} entrée(s) classées « hors-anime probable » ?\n\nElles ne seront pas importées. Les cas ambigus « À vérifier » ne sont pas concernés, et tu pourras annuler cette action juste après.`,
    { title: "Écarter les hors-anime sûrs", confirmText: `Écarter ${candidates.length} entrée(s)`, cancelText: "Annuler", danger: true }
  );
  if (!ok) return;
  csvPreviewItems.forEach(item => { item.__actionSelected = candidates.includes(item); });
  await dismissSelectedCsvReviewItems({ skipConfirmation: true });
}

async function forceSelectedCsvReviewItems() {
  const selected = csvPreviewItems.filter(item => item?.__actionSelected === true && item?.reviewState !== "dismissed" && ["review", "non_anime"].includes(String(item?.classification || "")));
  if (!selected.length) return;
  const nonAnimeCount = selected.filter(item => item.classification === "non_anime").length;
  const ok = await askAppConfirmation(
    `Forcer l’import de ${selected.length} entrée(s) sélectionnée(s) ?${nonAnimeCount ? `\n\n${nonAnimeCount} semblent être des séries/films non-anime. Elles seront conservées uniquement parce que tu les forces.` : ""}`,
    { title: "Forcer la sélection", confirmText: `Forcer ${selected.length} entrée(s)`, cancelText: "Annuler", danger: nonAnimeCount > 0 }
  );
  if (!ok) return;
  selected.forEach(item => {
    item.forceImport = true;
    item.__selected = true;
    item.__actionSelected = false;
  });
  renderCsvPreviewRows();
  window.notifyApp?.(`${selected.length} entrée(s) ajoutée(s) à la sélection d’import forcé.`, "success");
}

async function undoLastCsvDismiss() {
  const snapshot = Array.isArray(lastCsvDismissSnapshot) ? lastCsvDismissSnapshot.filter(item => item.key) : [];
  if (!snapshot.length) return;
  const button = $("csvUndoDismissReview");
  if (button) { button.disabled = true; button.textContent = "Restauration…"; }
  try {
    const response = await fetch("/api/v2/content-audit/quarantine/bulk-restore-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: snapshot.map(item => item.key) })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    const byKey = new Map(snapshot.map(item => [item.key, item]));
    csvPreviewItems.forEach(item => {
      const previous = byKey.get(String(item.reviewKey || ""));
      if (!previous) return;
      item.classification = previous.classification;
      item.reason = previous.reason;
      item.reviewState=previous.reviewState;item.importExcluded=previous.importExcluded;
      item.__selected = false;
      item.__actionSelected = false;
      item.forceImport = false;
    });
    lastCsvDismissSnapshot = null;
    clearTimeout(lastCsvDismissUndoTimer);
    if (button) button.classList.add("hidden");
    updateCsvSummaryCountsFromItems();
    renderCsvPreviewRows();
    window.notifyApp?.(`${Number(payload.restored || snapshot.length)} entrée(s) restaurée(s) dans l’analyse.`, "success");
  } catch (error) {
    window.notifyApp?.(`Impossible d’annuler : ${error.message}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function csvSearchSuggestionCandidates() {
  const q = String(csvPreviewSearch || "").trim().toLocaleLowerCase("fr");
  if (q.length < 2) return [];
  return csvPreviewItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => csvPreviewFilter === "all" || String(item?.classification || "review") === csvPreviewFilter)
    .map(({ item, index }) => {
      const titles = [item?.sourceTitle, item?.found?.officialTitle, item?.found?.title, item?.tvmaze?.name].filter(Boolean);
      const best = titles.find(value => String(value).toLocaleLowerCase("fr").startsWith(q)) || titles.find(value => String(value).toLocaleLowerCase("fr").includes(q));
      return best ? { item, index, label: String(best), prefix: String(best).toLocaleLowerCase("fr").startsWith(q) ? 1 : 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.prefix - a.prefix || a.label.localeCompare(b.label, "fr", { sensitivity: "base" }))
    .slice(0, 7);
}

function renderCsvSearchSuggestions() {
  const box = $("csvResultsSuggestions");
  if (!box) return;
  const suggestions = csvSearchSuggestionCandidates();
  if (!suggestions.length) {
    box.innerHTML = "";
    box.classList.add("hidden");
    csvSearchSuggestionIndex = -1;
    return;
  }
  box.innerHTML = suggestions.map(({ item, index, label }, suggestionIndex) => {
    const meta = csvClassificationMeta(item);
    return `<button type="button" data-csv-suggestion-index="${suggestionIndex}" data-csv-row-index="${index}"><strong>${escapeHtml(label)}</strong><span>${meta.badge}</span></button>`;
  }).join("");
  box.classList.remove("hidden");
  box.querySelectorAll("button[data-csv-row-index]").forEach(button => button.addEventListener("click", () => {
    const index = Number(button.dataset.csvRowIndex);
    const item = csvPreviewItems[index];
    if (!item) return;
    const label = item.sourceTitle || item.found?.officialTitle || item.found?.title || item.tvmaze?.name || "";
    csvPreviewSearch = String(label);
    const input = $("csvResultsSearch");
    if (input) input.value = csvPreviewSearch;
    box.classList.add("hidden");
    csvSearchSuggestionIndex = -1;
    renderCsvPreviewRows();
    setTimeout(() => document.querySelector(`[data-csv-index="${index}"]`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }), 0);
  }));
}

const csvBoundResults = new WeakSet();
function bindCsvPreviewControls(results) {
  if (!results || csvBoundResults.has(results)) return;
  csvBoundResults.add(results);
  results.dataset.controlsBound = "1";
  results.addEventListener("change", event => {
    if (event.target?.classList?.contains("csv-select")) {
      const index = Number(event.target.dataset.index);
      if (csvPreviewItems[index]) csvPreviewItems[index].__selected = event.target.checked === true;
      updateCsvImportButtonState();
    }
    if (event.target?.classList?.contains("csv-review-select")) {
      const index = Number(event.target.dataset.index);
      if (csvPreviewItems[index]) csvPreviewItems[index].__actionSelected = event.target.checked === true;
      updateCsvReviewBulkActions();
    }
  });
  results.addEventListener("click", async event => {
    const detail = event.target.closest('[data-csv-detail]') || (!event.target.closest('button,a,input,label,select') && event.target.closest('.csv-row-body')?.querySelector('[data-csv-detail]'));
    if (detail) {
      const item=csvPreviewItems[Number(detail.dataset.csvDetail)];
      if(item?.found)window.ALM_CATALOG?.openRecords([{...item.anime,...item.found,title:item.found.officialTitle||item.found.title||item.anime?.title,poster:item.found.imageUrl||item.anime?.poster}],0,detail,{readOnly:true});
      return;
    }
    const button = event.target.closest("[data-csv-force]");
    if (!button) return;
    const index = Number(button.dataset.csvForce);
    const item = csvPreviewItems[index];
    if (!item || item.reviewState === "dismissed") return;
    const forced = item.forceImport === true;
    if (!forced) {
      const isNonAnime = item.classification === "non_anime";
      const ok = await askAppConfirmation(
        isNonAnime
          ? `« ${item.sourceTitle || item.anime?.title || "Cette entrée"} » ressemble fortement à une série TV non anime. Veux-tu vraiment la forcer dans la bibliothèque anime ?`
          : `« ${item.sourceTitle || item.anime?.title || "Cette entrée"} » n’a pas pu être confirmée par une base anime. Veux-tu tout de même la forcer ?`,
        {
          title: isNonAnime ? "Série non-anime probable" : "Correspondance à vérifier",
          confirmText: "Forcer l’import",
          cancelText: "Laisser en quarantaine",
          danger: isNonAnime
        }
      );
      if (!ok) return;
    }
    item.forceImport = !forced;
    item.__selected = !forced;
    item.__actionSelected = false;
    renderCsvPreviewRows();
  });
}

function csvPreviewItemMatchesView(item) {
  const classification = String(item?.classification || "review");
  if (csvPreviewFilter !== "all" && classification !== csvPreviewFilter) return false;
  const q = String(csvPreviewSearch || "").trim().toLocaleLowerCase("fr");
  if (!q) return true;
  const haystack = [
    item?.sourceTitle,
    item?.anime?.title,
    item?.found?.officialTitle,
    item?.found?.title,
    item?.tvmaze?.name,
    item?.reason,
    classification
  ].filter(Boolean).join(" ").toLocaleLowerCase("fr");
  return haystack.includes(q);
}

function renderCsvPreviewRows() {
  const results = $("csvImportResults");
  if (!results) return;
  bindCsvPreviewControls(results);
  const visible = csvPreviewItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => csvPreviewItemMatchesView(item));

  const countEl = $("csvResultsVisibleCount");
  if (countEl) countEl.textContent = `${visible.length} / ${csvPreviewItems.length}`;
  const pages=Math.max(1,Math.ceil(visible.length/CSV_PREVIEW_PAGE_SIZE));
  csvPreviewPage=Math.min(csvPreviewPage,pages-1);
  const pageRows=visible.slice(csvPreviewPage*CSV_PREVIEW_PAGE_SIZE,(csvPreviewPage+1)*CSV_PREVIEW_PAGE_SIZE);
  let pager=$('csvPagination');
  if(!pager){pager=document.createElement('nav');pager.id='csvPagination';pager.className='csv-pagination';pager.setAttribute('data-no-i18n','');results.after(pager);pager.addEventListener('click',event=>{const button=event.target.closest('[data-csv-page]');if(!button||button.disabled)return;csvPreviewPage=button.dataset.csvPage==='first'?0:button.dataset.csvPage==='last'?Math.max(0,Number(pager.dataset.pages||1)-1):csvPreviewPage+Number(button.dataset.csvPage);renderCsvPreviewRows();results.scrollTop=0;const focus=results.querySelector('input:not(:disabled),button:not(:disabled)');if(!focus)results.tabIndex=-1;window.ALM_SCROLL_PROGRESS?.toStart(results,focus||results);});}
  pager.hidden=pages<=1;pager.dataset.pages=String(pages);
  pager.innerHTML='<button type="button" data-csv-page="first" aria-label="Première page" '+(csvPreviewPage===0?'disabled':'')+'>&lt;&lt;</button><button type="button" data-csv-page="-1" aria-label="Page précédente" '+(csvPreviewPage===0?'disabled':'')+'>&lt;</button><span aria-live="polite">'+escapeHtml(window.ALM_DESIGN.t('csvPageCount',{page:csvPreviewPage+1,pages}))+'</span><button type="button" data-csv-page="1" aria-label="Page suivante" '+(csvPreviewPage===pages-1?'disabled':'')+'>&gt;</button><button type="button" data-csv-page="last" aria-label="Dernière page" '+(csvPreviewPage===pages-1?'disabled':'')+'>&gt;&gt;</button>';

  results.innerHTML = pageRows.map(({ item, index }) => {
    const meta = csvClassificationMeta(item);
    const foundTitle = item.found?.officialTitle || item.found?.title || "";
    const tvmazeTitle = item.tvmaze?.name || "";
    const official = foundTitle ? `<div class="csv-match">Base anime : <strong>${escapeHtml(foundTitle)}</strong>${item.found?.source ? ` · ${escapeHtml(item.found.source)}` : ""}</div>` : "";
    const tvmaze = tvmazeTitle ? `<div class="csv-match tv">TVMaze : <strong>${escapeHtml(tvmazeTitle)}</strong>${item.tvmaze?.type ? ` · ${escapeHtml(item.tvmaze.type)}` : ""}</div>` : "";
    const forceButton = item.reviewState !== "dismissed" && ["review", "non_anime"].includes(item.classification)
      ? `<button type="button" class="csv-force-btn${item.forceImport === true ? " active" : ""}" data-csv-force="${index}">${item.forceImport === true ? "✓ Import forcé confirmé" : "Forcer l’import"}</button>`
      : "";
    const checkbox = meta.selectable || item.forceImport === true
      ? `<input type="checkbox" class="csv-select" data-index="${index}" ${item.__selected === true ? "checked" : ""} aria-label="Importer ${escapeHtml(item.sourceTitle || "")}">`
      : meta.reviewSelectable
        ? `<input type="checkbox" class="csv-review-select" data-index="${index}" ${item.__actionSelected === true ? "checked" : ""} aria-label="Sélectionner ${escapeHtml(item.sourceTitle || "")} pour l’écarter de cet import">`
        : `<input type="checkbox" class="csv-review-select" data-index="${index}" disabled aria-label="Entrée déjà écartée : ${escapeHtml(item.sourceTitle || "")}">`;

    return `
      <div class="csv-row ${meta.tone}${item.forceImport === true ? " forced" : ""}" data-csv-index="${index}">
        <div class="csv-row-select">${checkbox}</div>
        <div class="csv-row-body">
          <div class="csv-row-title">${item.found?`<button type="button" class="csv-detail-open" data-csv-detail="${index}">${escapeHtml(item.sourceTitle || item.anime?.title || "")}</button>`:`<strong>${escapeHtml(item.sourceTitle || item.anime?.title || "")}</strong>`}<span class="csv-classification-badge">${meta.badge}</span></div>
          ${official}${tvmaze}
          ${item.anime?.progressWarning ? `<div class="muted warning-text">${escapeHtml(item.anime.progressWarning)}</div>` : ""}
          <div class="csv-row-reason">${escapeHtml(item.reason || "")}</div>
        </div>
        <div class="csv-row-action">${forceButton}</div>
      </div>
    `;
  }).join("") || `<div class="csv-results-empty"><strong>Aucun résultat dans cette vue.</strong><span>Change le filtre ou efface la recherche pour retrouver les autres entrées.</span></div>`;

  updateCsvImportButtonState();
  updateCsvReviewBulkActions();
}

function setCsvPreviewFilter(filter = "all") {
  csvPreviewPage=0;clearTimeout(csvSearchTimer);
  csvPreviewFilter = ["all", "anime", "review", "non_anime", "ignored"].includes(filter) ? filter : "all";
  document.querySelectorAll("[data-csv-summary-filter]").forEach(button => {
    const active = button.dataset.csvSummaryFilter === csvPreviewFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  renderCsvPreviewRows();
  renderCsvSearchSuggestions();
  $("csvImportResults")?.scrollTo?.({ top: 0, behavior: "auto" });
}

function renderCsvPreview(items, counts) {
  csvPreviewItems = (items || []).map(item => {
    if (typeof item.__selected !== "boolean") item.__selected = item.classification === "anime" || item.forceImport === true;
    if(item.classification!=="anime" && item.forceImport!==true)item.__selected=false;
    if (typeof item.__actionSelected !== "boolean") item.__actionSelected = false;
    return item;
  });
  csvPreviewFilter = "all";
  csvPreviewPage=0;clearTimeout(csvSearchTimer);
  csvPreviewSearch = "";
  csvSearchSuggestionIndex = -1;
  lastCsvDismissSnapshot = null;
  clearTimeout(lastCsvDismissUndoTimer);
  $("csvUndoDismissReview")?.classList.add("hidden");

  const summary = $("csvImportSummary");
  const results = $("csvImportResults");
  const importBtn = $("importSelectedCsv");
  const searchInput = $("csvResultsSearch");
  if (!summary || !results || !importBtn) return;

  summary.classList.remove("hidden");
  results.classList.remove("hidden");
  $("csvResultsPanel")?.classList.remove("is-empty");
  $("csvResultsPlaceholder")?.classList.add("hidden");
  if (searchInput) searchInput.value = "";
  summary.innerHTML = `
    <div class="csv-summary-title"><strong>Analyse terminée</strong><span>${Number(counts.total || csvPreviewItems.length)} entrée(s)</span></div>
    <div class="csv-summary-grid" role="group" aria-label="Afficher une catégorie de résultats">
      <button type="button" class="csv-summary-filter all active" data-csv-summary-filter="all" aria-pressed="true">📋 <strong>${Number(counts.total || csvPreviewItems.length)}</strong> tous les résultats</button>
      <button type="button" class="csv-summary-filter anime" data-csv-summary-filter="anime" aria-pressed="false">✅ <strong>${Number(counts.anime || 0)}</strong> anime confirmé(s)</button>
      <button type="button" class="csv-summary-filter review" data-csv-summary-filter="review" aria-pressed="false">⚠️ <strong>${Number(counts.review || 0)}</strong> à vérifier</button>
      <button type="button" class="csv-summary-filter non-anime" data-csv-summary-filter="non_anime" aria-pressed="false">🛡️ <strong>${Number(counts.nonAnime || 0)}</strong> série(s) / film(s) non animés · exclus de l’import</button>
      <button type="button" class="csv-summary-filter ignored" data-csv-summary-filter="ignored" aria-pressed="false">❌ <strong>${Number(counts.ignored || 0)}</strong> ignorée(s)</button>
    </div>
    <p class="csv-quarantine-note">Clique sur un compteur pour inspecter directement cette catégorie. Les séries et films non animés sont exclus de l’import et restent consultables ici. Seuls les anime confirmés sont sélectionnés automatiquement ; les cas ambigus restent disponibles dans le <strong>Contrôle anime</strong>.</p>
    ${Number(counts.tvUnverified||0)>0?`<p class="csv-tv-unverified">${Number(counts.tvUnverified)} entrée(s) restent à vérifier : leur contre-vérification TV n’a pas abouti. Elles ne sont pas sélectionnées pour l’import.</p>`:""}
    <button type="button" class="csv-open-audit" data-open-content-audit>Ouvrir le Contrôle anime</button>
  `;
  summary.querySelectorAll("[data-csv-summary-filter]").forEach(button => {
    button.addEventListener("click", () => setCsvPreviewFilter(button.dataset.csvSummaryFilter || "all"));
  });
  summary.querySelector("[data-open-content-audit]")?.addEventListener("click", () => {
    $("importDialog")?.close();
    if (typeof showV2Page === "function") {
      showV2Page("auditPage", "navAudit");
      if (typeof loadContentAuditV2 === "function") loadContentAuditV2(false);
    }
  });

  results.dataset.controlsBound = results.dataset.controlsBound || "0";
  updateCsvSummaryCountsFromItems();
  bindCsvPreviewControls(results);
  renderCsvPreviewRows();
}


function setCsvAnalysisUiRunning(running, cancelling = false) {
  const previewBtn = $("previewCsvImport");
  const importBtn = $("importSelectedCsv");
  const cancelAnalysisBtn = $("cancelCsvAnalysis");
  const closeBtn = $("cancelCsvImport");
  const fileInput = $("csvFile");
  if($('csvResultsSearch'))$('csvResultsSearch').disabled=running;
  if (previewBtn) {
    previewBtn.disabled = running;
    previewBtn.textContent = running ? (cancelling ? "Annulation…" : "Analyse en cours…") : "Analyser le CSV";
  }
  if (fileInput) fileInput.disabled = running;
  if (importBtn && running) importBtn.disabled = true;
  if (cancelAnalysisBtn) {
    cancelAnalysisBtn.classList.toggle("hidden", !running);
    cancelAnalysisBtn.disabled = cancelling;
    cancelAnalysisBtn.textContent = cancelling ? "Annulation en cours…" : "Annuler l’analyse";
  }
  if (closeBtn) {
    closeBtn.disabled = running;
    closeBtn.title = running ? "Annule d’abord l’analyse en cours." : "Fermer";
  }
}

function setCsvImportUiRunning(running, cancelling = false) {
  if($('csvImportBackground'))$('csvImportBackground').hidden=!running;
  const previewBtn = $("previewCsvImport");
  const importBtn = $("importSelectedCsv");
  const cancelBtn = $("cancelCsvAnalysis");
  const closeBtn = $("cancelCsvImport");
  const fileInput = $("csvFile");
  if (previewBtn) previewBtn.disabled = running;
  if (fileInput) fileInput.disabled = running;
  if (importBtn) {
    importBtn.disabled = running || !csvPreviewItems.some(item => item?.__selected === true);
    importBtn.textContent = running ? (cancelling ? "Annulation…" : "Import en cours…") : "Importer la sélection";
  }
  if (cancelBtn) {
    cancelBtn.classList.toggle("hidden", !running);
    cancelBtn.disabled = cancelling;
    cancelBtn.textContent = cancelling ? "Annulation en cours…" : "Annuler l’import";
  }
  if (closeBtn) {
    closeBtn.disabled = running;
    closeBtn.title = running ? "Annule d’abord l’import en cours." : "Fermer";
  }
  $("csvImportResults")?.classList.toggle("is-importing", running);
}

async function cancelCsvAnalysis() {
  const importJob = activeCsvImport && !activeCsvImport.finished ? activeCsvImport : null;
  const analysisJob = activeCsvAnalysis && !activeCsvAnalysis.finished ? activeCsvAnalysis : null;
  const job = importJob || analysisJob;
  if (!job?.progressId || job.cancelling) return;
  job.cancelling = true;
  if (importJob) setCsvImportUiRunning(true, true);
  else setCsvAnalysisUiRunning(true, true);
  const step = $("csvCurrentStep");
  if (step) step.textContent = importJob ? "Annulation de l’import demandée…" : "Annulation demandée…";
  try {
    const result = await api(`/api/import/csv/cancel/${encodeURIComponent(job.progressId)}`, {
      method: "POST",
      body: JSON.stringify({})
    });
    if (result?.tooLate) {
      job.cancelling = false;
      if (importJob) setCsvImportUiRunning(true, false);
      else setCsvAnalysisUiRunning(true, false);
      window.notifyApp?.("Enregistrement final déjà commencé : l’import va se terminer dans quelques instants.", "info");
    }
  } catch (error) {
    job.cancelling = false;
    if (importJob) setCsvImportUiRunning(true, false);
    else setCsvAnalysisUiRunning(true, false);
    window.notifyApp?.(`Impossible de demander l’annulation : ${error.message}`, "error");
  }
}

function formatCsvClock(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const secs = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

async function pollCsvImportProgress(progressId) {
  const box = $("csvModalProgress");
  const label = $("csvModalProgressLabel");
  const bar = $("csvModalProgressBar");
  const step = $("csvCurrentStep");
  const elapsed = $("csvElapsedTime");
  const eta = $("csvEtaTime");
  const log = $("csvLiveLog");
  const localStartedAt = Date.now();
  if (box) box.classList.remove("hidden", "indeterminate");
  if (bar) bar.style.width = "1%";
  if (label) label.textContent = "Import BetaSeries — démarrage…";
  if (step) step.textContent = "Préparation de l’import…";
  if (elapsed) elapsed.textContent = "00:00";
  if (eta) eta.textContent = "--:--";
  if (log) { log.innerHTML = ""; log.classList.add("hidden"); }

  let finalData = null;
  while (true) {
    const active = activeCsvImport;
    if (!active || active.progressId !== progressId || active.finished) break;
    try {
      const response = await fetch(`/api/import/csv/progress/${encodeURIComponent(progressId)}`);
      const data = await response.json();
      finalData = data;
      const status = String(data.status || "unknown");
      const total = Math.max(0, Number(data.total || 0));
      const done = Math.max(0, Number(data.done || 0));
      const explicit = Number(data.percent);
      const percent = Number.isFinite(explicit)
        ? Math.max(0, Math.min(100, Math.round(explicit)))
        : (total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 1);
      if (bar) bar.style.width = `${Math.max(1, percent)}%`;
      if (label) {
        const count = total > 0 && ["merge", "distribution"].includes(String(data.phase || "")) ? ` · ${done}/${total}` : "";
        label.textContent = status === "cancelled"
          ? "Import BetaSeries annulé"
          : status === "error"
            ? "Erreur pendant l’import BetaSeries"
            : `Import BetaSeries — ${percent} %${count}`;
      }
      if (step) step.textContent = status==='queued'?window.ALM_DESIGN.t("automationQueued"):data.current || "Import en cours…";
      const elapsedSeconds = Number.isFinite(Number(data.elapsedSeconds))
        ? Number(data.elapsedSeconds)
        : (Date.now() - localStartedAt) / 1000;
      if (elapsed) elapsed.textContent = formatCsvClock(Math.max(elapsedSeconds,(Date.now()-localStartedAt)/1000));
      if (eta) {
        const remaining = Number(data.estimatedRemainingSeconds || 0);
        eta.textContent = percent >=100?"00:00":"--:--";
      }
      if (["error", "cancelled"].includes(status)||(status==='done'&&data.result)) break;
    } catch (_) {
      // Le POST peut être enregistré quelques millisecondes après le premier poll.
      // On continue tant que le job front-end est actif au lieu de faire croire à
      // un blocage silencieux.
    }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  return finalData;
}

async function previewCsvImport() {
  const file = $("csvFile")?.files?.[0];
  if (!file) { window.notifyApp?.("Choisis un fichier CSV BetaSeries.", "info"); return; }
  if (activeCsvAnalysis && !activeCsvAnalysis.finished) return;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("source", "betaseries");
  const progressId = String(Date.now());
  formData.append("progressId", progressId);
  activeCsvAnalysis = { progressId, finished: false, cancelling: false };
  csvPartialResults.clear();
  csvPreviewItems = [];
  csvPreviewFilter = "all";
  csvPreviewSearch = "";
  $("csvImportSummary")?.classList.add("hidden");
  $("csvImportResults")?.classList.add("hidden");
  $("csvResultsPanel")?.classList.add("is-empty");
  csvPreviewItems=[];csvPreviewPage=0;clearTimeout(csvSearchTimer);
  $('csvPagination')?.setAttribute('hidden','');$('csvReviewBulkActions')?.classList.add('hidden');
  const csvPlaceholder = $("csvResultsPlaceholder");
  if (csvPlaceholder) {
    csvPlaceholder.classList.remove("hidden");
    csvPlaceholder.innerHTML = `<strong>Analyse en cours…</strong><span>Les résultats validés, à vérifier et hors-anime apparaîtront ici dès que l’analyse sera terminée.</span>`;
  }
  setCsvAnalysisUiRunning(true, false);
  const pollPromise = window.pollCsvProgressModalV118?.(progressId);

  try {
    const result = await api("/api/import/csv/preview", { method: "POST", body: formData });
    if (result?.cancelled) {
      if(activeCsvAnalysis?.progressId===progressId)activeCsvAnalysis.finished=true;
      window.finishCsvAnalysisProgress?.('cancelled',result);
      csvPreviewItems = [];
      const summary = $("csvImportSummary");
      const results = $("csvImportResults");
      if (summary) {
        summary.classList.remove("hidden");
        summary.innerHTML = `<div class="csv-summary-title"><strong>Analyse annulée</strong><span>Aucun résultat partiel n’a été importé.</span></div>`;
      }
      if (results) {
        results.classList.add("hidden");
        results.innerHTML = "";
      }
      const placeholder = $("csvResultsPlaceholder");
      if (placeholder) {
        placeholder.classList.remove("hidden");
        placeholder.innerHTML = `<strong>Analyse annulée.</strong><span>Aucun résultat partiel n’a été importé.</span>`;
      }
      window.notifyApp?.("Analyse CSV annulée proprement.", "info");
      return;
    }
    if(activeCsvAnalysis?.progressId===progressId)activeCsvAnalysis.finished=true;
    window.finishCsvAnalysisProgress?.('done',result);
    renderCsvPreview(result.items || [], result.counts || {});
    window.notifyApp?.(`Analyse terminée : ${result.counts?.total || result.items?.length || 0} entrée(s).`, "success");
  } catch (error) {
    if (activeCsvAnalysis?.cancelling) {
      window.finishCsvAnalysisProgress?.('cancelled');
      window.notifyApp?.("Analyse CSV annulée.", "info");
    } else {
      if(activeCsvAnalysis?.progressId===progressId)activeCsvAnalysis.finished=true;
      window.finishCsvAnalysisProgress?.('error');
      window.notifyApp?.(`Analyse CSV impossible : ${error.message}`, "error");
      csvPreviewItems=[];csvPartialResults.clear();$('csvImportResults')?.replaceChildren();$('csvImportResults')?.classList.add('hidden');$('csvImportSummary')?.classList.add('hidden');$('csvResultsPlaceholder')?.classList.remove('hidden');$('csvResultsPlaceholder').textContent=window.ALM_DESIGN.t('csvAnalysisError');
    }
  } finally {
    if (pollPromise && typeof pollPromise.catch === "function") pollPromise.catch(() => {});
    if (activeCsvAnalysis?.progressId === progressId) activeCsvAnalysis.finished = true;
    setCsvAnalysisUiRunning(false, false);
    activeCsvAnalysis = null;
    updateCsvImportButtonState();
  }
}

async function importSelectedCsv() {
  if (activeCsvImport && !activeCsvImport.finished) return;
  const overwrite = $("overwriteCsvImport")?.checked || false;
  const selected = csvPreviewItems.filter(item => item?.__selected === true);
  if (!selected.length) {
    window.notifyApp?.("Aucun élément sélectionné.", "info");
    return;
  }

  const progressId = `import-${Date.now()}`;
  activeCsvImport = { progressId, finished: false, cancelling: false,startedAt:Date.now() };
  setCsvImportUiRunning(true, false);
  const pollPromise = pollCsvImportProgress(progressId);
  const csvClock=setInterval(()=>{if(activeCsvImport&&!activeCsvImport.finished)safeText("csvElapsedTime",formatCsvClock((Date.now()-activeCsvImport.startedAt)/1000));},1000);

  try {
    let result = await api("/api/import/csv", {
      method: "POST",
      body: JSON.stringify({ overwrite, items: selected, progressId,background:true })
    });

    if(result?.queued){const terminal=await pollPromise;if(terminal?.status==='error')throw Error(terminal.current||window.ALM_DESIGN.t("automationError"));result=terminal?.result||{ok:true,cancelled:terminal?.status==='cancelled'};}
    if (result?.cancelled) {
      window.notifyApp?.("Import BetaSeries annulé. Aucune modification n’a été enregistrée.", "info");
      return;
    }

    if (pollPromise && typeof pollPromise.then === "function") {
      await Promise.race([
        pollPromise.catch(() => null),
        new Promise(resolve => setTimeout(resolve, 1200))
      ]);
    }

    const blockedCount = Number(result.blocked || 0);
    const progressionToReview = Number(result.progressionToReview || 0);
    $("importDialog")?.close();
    await load();


    if (result.enrichmentJobId) {
      void resumeBulkCompletionJob(result.enrichmentJobId,window.ALM_DESIGN.t("automationEnrichment"));
    } else {
      window.notifyApp?.(
        `Import terminé : ${result.added || 0} ajouté(s), ${result.updated || 0} mis à jour, ${result.ignored || 0} ignoré(s)${blockedCount ? `, ${blockedCount} conservé(s) dans le Contrôle anime` : ""}${progressionToReview ? `, ${progressionToReview} progression(s) multi-saisons à vérifier` : ""}.`,
        "success"
      );
    }
  } catch (error) {
    if (activeCsvImport?.cancelling) {
      window.notifyApp?.("Import BetaSeries annulé.", "info");
    } else {
      window.notifyApp?.(`Import CSV impossible : ${error.message}`, "error");
    }
  } finally {
    clearInterval(csvClock);
    if (activeCsvImport?.progressId === progressId) activeCsvImport.finished = true;
    setCsvImportUiRunning(false, false);
    activeCsvImport = null;
    updateCsvImportButtonState();
  }
}

function bind(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}

bind("openAdd", "click", openAdd);
bind("cancel", "click", () => $("formDialog")?.close());
bind("backupBtn", "click", () => {document.getElementById("settingsBtn").click();window.ALM_SETTINGS.select("backup");});
bind("downloadAllImages", "click", downloadAllMissingImages);
bind("bulkInfo", "click", refreshAllInfo);
bind("resetFilters", "click", resetFilters);
bind("importXmlBtn", "click", () => $("importDialog")?.showModal());
bind("cancelImport", "click", () => $("importDialog")?.close());
bind("cancelCsvImport", "click", () => {
  const busy = (activeCsvAnalysis && !activeCsvAnalysis.finished) || (activeCsvImport && !activeCsvImport.finished);
  if (!busy) $("importDialog")?.close();
});
bind("cancelCsvAnalysis", "click", cancelCsvAnalysis);
bind("previewCsvImport", "click", previewCsvImport);
bind("importSelectedCsv", "click", importSelectedCsv);
$("importDialog")?.addEventListener("cancel", event => {
  const busy = (activeCsvAnalysis && !activeCsvAnalysis.finished) || (activeCsvImport && !activeCsvImport.finished);
  if (busy) {
    event.preventDefault();
    void cancelCsvAnalysis();
  }
});
bind("importForm", "submit", importXml);
bind("completionProgressCancel", "click", cancelActiveBulkJob);
bind("completionProgressMinimize", "click", () => setCompletionProgressMinimized(true));
bind("completionProgressDock", "click", () => setCompletionProgressMinimized(false));
bind("completionProgressDismiss", "click", dismissCompletionProgress);
bind("closeNews", "click", () => {
  $("newsPanel")?.classList.add("hidden");
  if (typeof showAnimesV1 === "function") showAnimesV1("");
  else if (typeof showHomeView === "function") showHomeView();
});
bind("loadNewsInfoBtn", "click", loadVisibleNewsInfo);
bind("addAllNewsToWatchlistBtn", "click", addAllNewsToWatchlist);
bind("forceNewsSearchBtn", "click", () => checkSeasonNews(true));
bind("homeLink", "click", e => { e.preventDefault(); goHome(); });

$("animeForm")?.addEventListener("submit", saveForm);

["search", "statusFilter", "typeFilter", "genreFilter", "studioFilter", "yearFilter", "sort", "viewMode"].forEach(id => {
  const el = $(id);
  if (el) {
    const onFilterChanged = () => {
      render();
      noteLibraryFilterMutation();
    };
    el.addEventListener("input", onFilterChanged);
    el.addEventListener("change", onFilterChanged);
  }
});

$("totalCount")?.closest(".stat-card")?.addEventListener("click", () => filterByStatusCard(""));
$("completedCount")?.closest(".stat-card")?.addEventListener("click", () => filterByStatusCard("Completed"));
$("onholdCount")?.closest(".stat-card")?.addEventListener("click", () => filterByStatusCard("On-Hold"));
$("watchingCount")?.closest(".stat-card")?.addEventListener("click", () => filterByStatusCard("Watching"));
$("planCount")?.closest(".stat-card")?.addEventListener("click", () => filterByStatusCard("Plan to Watch"));

load().catch(error => {
  alert(error.message);
  console.error(error);
});

// Vérifier ce qui manque et afficher la bannière si besoin
async function checkCompletionBanner() {
  const banner = $("completionBanner");
  if (completionBannerIsSnoozed()) {
    banner?.classList.add("hidden");
    return;
  }
  const progressPanel = $("completionProgressPanel");
  const terminalProgressVisible = progressPanel
    && !progressPanel.classList.contains("hidden")
    && ["is-done", "is-error", "is-cancelled"].some(name => progressPanel.classList.contains(name));
  if (completionJobRunning || window.__almBulkJobRunning || terminalProgressVisible) {
    $("completionBanner")?.classList.add("hidden");
    return;
  }
  try {
    const status = await api("/api/bulk/smart-status?mode=banner");
    const title   = $("completionBannerTitle");
    const sub     = $("completionBannerSub");
    if (!banner) return;
    if (status?.completionRunning) {
      banner.classList.add("hidden");
      if (!completionJobRunning && status.activeJobId) {
        activeBulkJobId = String(status.activeJobId);
        activeBulkJobTitle = bulkJobTitleFromKind(status.activeJobKind);
        void resumeBulkCompletionJob(activeBulkJobId, activeBulkJobTitle);
      }
      return;
    }
    if (completionJobRunning || window.__almBulkJobRunning) {
      banner.classList.add("hidden");
      return;
    }
    if (!status?.needsWork) {
      banner.classList.add("hidden");
      return;
    }

    const parts = [];
    if (status.needsCount > 0) parts.push(`${status.needsCount} animé(s) à traiter`);
    if (status.missingInfo  > 0) parts.push(`${status.missingInfo} sans infos`);
    if (status.missingImage > 0) parts.push(`${status.missingImage} sans image`);
    if (title) title.textContent = `Ta bibliothèque peut être améliorée`;
    if (sub) sub.textContent = parts.join(" · ") + ` — ~${status.estimatedMinutes || 1} min`;
    banner.classList.remove("hidden");
  } catch {}
}

$("completionBannerBtn")?.addEventListener("click", () => {
  void smartCompleteAll(false);
});
$("completionBannerClose")?.addEventListener("click", () => {
  rememberCompletionBannerSnooze(168);
  $("completionBanner")?.classList.add("hidden");
});

// Lancer la vérification 2s après le chargement (non bloquant)
setTimeout(checkCompletionBanner, 2000);


// Navigation bibliothèque : la gestion des filtres est centralisée dans
// showAnimesV1 afin que « Animés », « À voir » et les vues de statut conservent
// chacune leur propre état sans se contaminer.

document.getElementById("navSettings")?.addEventListener("click", () => {
  document.getElementById("settingsBtn")?.click();
});

// À propos est une vraie page, pas un scroll vers le footer.

function hideV2PagesFromApp() {
  setV2BodyView("");
  ["communityPage", "memoryPage", "dnaPage", "newsV2Page", "recoPage", "seasonNewsPage", "lexiconPage", "auditPage", "discoveryPage","rankingPage","calendarPage"].forEach(id => document.getElementById(id)?.classList.add("hidden"));
}

// V1.2 navigation and page switching fixes
function showHomeView() {
  showAnimesV1("");
}

function showAboutView() {
  hideV2PagesFromApp();
  document.getElementById("newsPanel")?.classList.add("hidden");
  document.querySelector(".filters")?.classList.add("hidden");
  document.getElementById("stats")?.classList.add("hidden");
  document.getElementById("animeGrid")?.classList.add("hidden");
  document.querySelector(".hero")?.classList.add("hidden");
  document.getElementById("aboutPage")?.classList.remove("hidden");
  document.getElementById("donationsPage")?.classList.remove("hidden");
  window.dispatchEvent(new CustomEvent("alm:view-changed", {detail:{page:"aboutPage"}}));
  document.querySelectorAll(".nav-item, .studio-account-shortcut").forEach(x => x.classList.remove("active"));
  document.getElementById("navAbout")?.classList.add("active");
  if (typeof window.resetTopLevelScrollV2 === "function") window.resetTopLevelScrollV2("aboutPage");
  else window.scrollTo({ top: 0, behavior: "auto" });
}

document.querySelector('.nav-item[data-view="home"]')?.addEventListener("click", showHomeView);
document.getElementById("homeLink")?.addEventListener("click", (e) => {
  e.preventDefault();
  showAnimesV1("");
});
document.getElementById("navAbout")?.addEventListener("click", showAboutView);

// Prevent side nav from covering or stealing text input focus
["search", "title", "genres", "tags", "notes"].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", e => e.stopPropagation());
    el.addEventListener("keydown", e => e.stopPropagation());
  }
});


// V1 final navigation
function hideV1Pages() {
  hideV2PagesFromApp();
  document.getElementById("aboutPage")?.classList.add("hidden");
  document.getElementById("donationsPage")?.classList.add("hidden");
  document.getElementById("newsPanel")?.classList.add("hidden");
  document.querySelector(".filters")?.classList.remove("hidden");
  document.getElementById("stats")?.classList.remove("hidden");
  document.getElementById("animeGrid")?.classList.remove("hidden");
  document.querySelector(".hero")?.classList.remove("hidden");
}

function showAnimesV1(statusValue = "") {
  saveCurrentLibraryFilterState();
  const nextKey = normalizeLibraryViewKey(statusValue);
  currentLibraryViewKey = nextKey;
  hideV1Pages();
  applyLibraryFilterState(nextKey);
  document.querySelectorAll(".nav-item, .studio-account-shortcut").forEach(x => x.classList.remove("active"));
  if (nextKey === "Plan to Watch") document.querySelector('.nav-item[data-filter="Plan to Watch"]')?.classList.add("active");
  else if (nextKey === "Watching") document.querySelector('.nav-item[data-filter="Watching"]')?.classList.add("active");
  else document.querySelector('.nav-item[data-filter=""]')?.classList.add("active");
  render();
  if (typeof window.resetTopLevelScrollV2 === "function") window.resetTopLevelScrollV2();
  else window.scrollTo({ top: 0, behavior: "auto" });
  setTimeout(checkCompletionBanner, 80);
}

function showDonationsV1() {
  showAboutView();
  requestAnimationFrame(() => document.getElementById("donationsPage")?.scrollIntoView({block:"start", behavior:"auto"}));
}

document.getElementById("navDonations")?.addEventListener("click", showDonationsV1);
document.querySelector('.nav-item[data-filter=""]')?.addEventListener("click", () => showAnimesV1(""));
document.querySelector('.nav-item[data-filter="Watching"]')?.addEventListener("click", () => showAnimesV1("Watching"));
document.querySelector('.nav-item[data-filter="Plan to Watch"]')?.addEventListener("click", () => showAnimesV1("Plan to Watch"));
document.addEventListener("DOMContentLoaded", () => setTimeout(() => {
  if (!isV2PageActive()) showAnimesV1("");
}, 50));


// V1.1.1 fix: import tabs robust binding
(function fixImportTabsV111() {
  function activateImportTab(targetPanelId) {
    const panels=[...document.querySelectorAll('.import-panel')],target=panels.find(p=>p.id===targetPanelId||p.dataset.panel===targetPanelId);if(!target)return;
    document.querySelector('.import-tabs')?.setAttribute('role','tablist');
    document.querySelectorAll('.import-tab').forEach(btn=>{
      const selected=btn.dataset.tab===targetPanelId;btn.classList.toggle('active',selected);btn.setAttribute('role','tab');btn.setAttribute('aria-selected',String(selected));btn.tabIndex=selected?0:-1;btn.id=btn.id||'almImportTab_'+btn.dataset.tab;
      const panel=panels.find(p=>p.id===btn.dataset.tab||p.dataset.panel===btn.dataset.tab);if(panel){btn.setAttribute('aria-controls',panel.id);panel.setAttribute('aria-labelledby',btn.id);}
    });
    panels.forEach(panel=>{const selected=panel===target;panel.classList.toggle('hidden',!selected);panel.hidden=!selected;panel.setAttribute('role','tabpanel');});
  }

  document.addEventListener("click", (event) => {
    const tab = event.target.closest(".import-tab");
    if (!tab) return;

    event.preventDefault();
    event.stopPropagation();

    const target = tab.dataset.tab;
    if (target) activateImportTab(target);
  });

  document.getElementById("importXmlBtn")?.addEventListener("click", () => {
    setTimeout(() => activateImportTab("xmlImportPanel"), 0);
  });

  document.addEventListener('keydown',event=>{
    const current=event.target.closest('.import-tab');if(!current||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const all=[...document.querySelectorAll('.import-tab')],at=all.indexOf(current),n=event.key==='Home'?0:event.key==='End'?all.length-1:(at+(event.key==='ArrowRight'?1:-1)+all.length)%all.length;activateImportTab(all[n].dataset.tab);all[n].focus();
  });
  window.activateImportTab = activateImportTab;
  activateImportTab('xmlImportPanel');
})();


// Les boutons CSV sont déjà liés une seule fois via bind() plus haut.
// Les anciens écouteurs délégués ont été retirés pour éviter les doubles imports.


// V1.1.2 fix: robust BetaSeries CSV workflow
let csvPreviewItemsV112 = [];

async function previewCsvImportV112() {
  const file = document.getElementById("csvFile")?.files?.[0];
  if (!file) {
    window.notifyApp?.("Choisis d’abord un fichier CSV BetaSeries.", "info");
    return;
  }

  const importBtn = document.getElementById("importSelectedCsv");
  if (importBtn) importBtn.disabled = true;

  const summary = document.getElementById("csvImportSummary");
  const results = document.getElementById("csvImportResults");
  if (summary) {
    summary.classList.remove("hidden");
    summary.innerHTML = "Analyse du CSV en cours...";
  }
  if (results) {
    results.classList.add("hidden");
    results.innerHTML = "";
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("source", "betaseries");

  try {
    if (typeof showProgress === "function") showProgress("Analyse du CSV BetaSeries en cours...");

    const response = await fetch("/api/import/csv/preview", {
      method: "POST",
      body: formData
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Analyse CSV impossible.");

    csvPreviewItemsV112 = payload.items || [];
    renderCsvPreviewV112(csvPreviewItemsV112, payload.counts || {});

    if (typeof finishProgress === "function") finishProgress("Analyse CSV terminée.");
  } catch (error) {
    if (typeof finishProgress === "function") finishProgress("Erreur pendant l’analyse CSV.");
    window.notifyApp?.(`Analyse CSV impossible : ${error.message}`, "error");
  }
}

function renderCsvPreviewV112(items, counts) {
  csvPreviewItemsV112 = items || [];
  renderCsvPreview(items, counts);
}


// Le flux CSV actif est previewCsvImport()/importSelectedCsv(), avec suivi de progression intégré.


// V1.1.2 alias cache startup refresh
async function refreshAliasesAtStartup() {
  try {
    await fetch("/api/aliases/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
  } catch {}
}

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(refreshAliasesAtStartup, 1200);
});


// V1.1.3 feedback patch: notifications, CSV progress, view persistence
function notifyApp(message, type = "info") {
  let box = document.getElementById("toastContainer");
  if (!box) { box = document.createElement("div"); box.id = "toastContainer"; document.body.appendChild(box); }
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  box.appendChild(item);
  setTimeout(() => item.classList.add("visible"), 20);
  setTimeout(() => { item.classList.remove("visible"); setTimeout(() => item.remove(), 300); }, 3800);
}
window.alert = (message) => notifyApp(String(message || ""), "info");

function saveViewModeV113() {
  try { localStorage.setItem("alm.viewMode", document.getElementById("viewMode")?.value || "cards"); } catch {}
}
function restoreViewModeV113() {
  try {
    const saved = localStorage.getItem("alm.viewMode");
    if (saved && document.getElementById("viewMode")) document.getElementById("viewMode").value = saved;
  } catch {}
}
document.addEventListener("change", e => { if (e.target?.id === "viewMode") saveViewModeV113(); });
document.addEventListener("DOMContentLoaded", () => setTimeout(() => { restoreViewModeV113(); if (typeof render === "function") render(); }, 300));

async function pollCsvProgressV113(progressId) {
  const label = document.getElementById("progressLabel");
  const bar = document.getElementById("progressBar");
  const panel = document.getElementById("progressPanel");
  if (panel) panel.classList.remove("hidden");
  let finished = false;
  while (!finished) {
    try {
      const r = await fetch(`/api/import/csv/progress/${progressId}`);
      const data = await r.json();
      const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
      if (bar) bar.style.width = `${pct}%`;
      if (label) label.textContent = `Analyse CSV ${data.done || 0}/${data.total || 0} — ${data.current || ""}`;
      finished = data.status === "done" || data.status === "error";
      if (!finished) await new Promise(res => setTimeout(res, 600));
    } catch { finished = true; }
  }
}
// L'enregistrement BetaSeries est centralisé dans saveBetaSeriesKeyVisualV1110().


// V1.1.5 safe UI hotfix: CSV progress inside modal + view persistence + toast notifications
(function almV115Hotfix() {
  function ensureToastContainer() {
    let box = document.getElementById("toastContainer");
    if (!box) {
      box = document.createElement("div");
      box.id = "toastContainer";
      document.body.appendChild(box);
    }
    return box;
  }

  window.notifyApp = function(message, type = "info") {
    const box = ensureToastContainer();
    const item = document.createElement("div");
    item.className = "toast " + type;
    item.textContent = String(message || "");
    box.appendChild(item);
    setTimeout(() => item.classList.add("visible"), 20);
    setTimeout(() => {
      item.classList.remove("visible");
      setTimeout(() => item.remove(), 300);
    }, 3800);
  };

  window.setCsvModalProgress = function(done, total, current = "") {
    const box = document.getElementById("csvModalProgress");
    const label = document.getElementById("csvModalProgressLabel");
    const bar = document.getElementById("csvModalProgressBar");
    if (!box || !label || !bar) return;

    box.classList.remove("hidden");

    const pct = total ? Math.round((done / total) * 100) : 0;
    label.textContent = total
      ? `Analyse CSV ${done}/${total}${current ? " — " + current : ""}`
      : "Analyse CSV en cours...";
    bar.style.width = `${pct}%`;
  };

  window.pollCsvProgressModalV115 = async function(progressId) {
    let finished = false;
    while (!finished) {
      try {
        const response = await fetch(`/api/import/csv/progress/${progressId}`);
        const data = await response.json();
        window.setCsvModalProgress(data.done || 0, data.total || 0, data.current || "");
        finished = data.status === "done" || data.status === "error";
        if (!finished) await new Promise(resolve => setTimeout(resolve, 600));
      } catch {
        finished = true;
      }
    }
  };

  // La persistance du mode d’affichage est centralisée dans
  // saveViewModeV113()/restoreViewModeV113() pour éviter deux sauvegardes
  // et deux rendus successifs au démarrage.
})();


// V1.1.6 safe modal progress + custom confirm
(function almV116() {
  function ensureToastContainer() {
    let box = document.getElementById("toastContainer");
    if (!box) {
      box = document.createElement("div");
      box.id = "toastContainer";
      document.body.appendChild(box);
    }
    return box;
  }

  window.notifyApp = window.notifyApp || function(message, type = "info") {
    const box = ensureToastContainer();
    const item = document.createElement("div");
    item.className = "toast " + type;
    item.textContent = String(message || "");
    box.appendChild(item);
    setTimeout(() => item.classList.add("visible"), 20);
    setTimeout(() => {
      item.classList.remove("visible");
      setTimeout(() => item.remove(), 300);
    }, 3800);
  };

  let confirmationQueue=Promise.resolve();
  window.showAppConfirm = function(message, options = {}) {
    const show=()=>new Promise(resolve=>{
      const dialog=document.getElementById('appConfirmDialog'),title=document.getElementById('appConfirmTitle'),msg=document.getElementById('appConfirmMessage'),ok=document.getElementById('appConfirmOk'),cancel=document.getElementById('appConfirmCancel');
      if(!dialog||!title||!msg||!ok||!cancel){resolve(false);return;}
      const previous=document.activeElement;let settled=false,answer=false;
      title.textContent=options.title||'Anime Local Manager';msg.textContent=String(message||'');
      ok.textContent = options.okText || options.confirmText || 'OK';cancel.textContent=options.cancelText||'Annuler';ok.classList.toggle("danger", options.danger === true);
      const finish=value=>{
        if(settled)return;settled=true;ok.onclick=null;cancel.onclick=null;dialog.oncancel=null;dialog.onclose=null;
        if(dialog.open)dialog.close();
        if(previous?.isConnected&&!previous.disabled)previous.focus({preventScroll:true});
        resolve(value);
      };
      ok.onclick=()=>{answer=true;finish(true);};cancel.onclick=()=>finish(false);
      dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.onclose=()=>finish(answer);
      try{dialog.showModal();cancel.focus();}catch{finish(false);}
    });
    const result=confirmationQueue.then(show,show);confirmationQueue=result.then(()=>{},()=>{});return result;
  };

  window.setCsvModalProgress = function(done, total, current = "") {
    const box = document.getElementById("csvModalProgress");
    const label = document.getElementById("csvModalProgressLabel");
    const bar = document.getElementById("csvModalProgressBar");
    if (!box || !label || !bar) return;

    box.classList.remove("hidden");

    const pct = total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 3;
    label.textContent = total
      ? `Analyse CSV ${done}/${total}${current ? " — " + current : ""}`
      : "Analyse CSV en cours...";
    bar.style.width = `${pct}%`;
  };

  window.startCsvModalIndeterminate = function() {
    const box = document.getElementById("csvModalProgress");
    const label = document.getElementById("csvModalProgressLabel");
    const bar = document.getElementById("csvModalProgressBar");
    if (!box || !label || !bar) return;

    box.classList.remove("hidden");
    box.classList.add("indeterminate");
    label.textContent = "Analyse du CSV en cours...";
    bar.style.width = "35%";
  };

  window.stopCsvModalIndeterminate = function() {
    const box = document.getElementById("csvModalProgress");
    if (box) box.classList.remove("indeterminate");
  };

  window.pollCsvProgressModalV116 = async function(progressId) {
    let finished = false;
    window.startCsvModalIndeterminate();

    while (!finished) {
      try {
        const response = await fetch(`/api/import/csv/progress/${progressId}`);
        const data = await response.json();
        window.stopCsvModalIndeterminate();
        window.setCsvModalProgress(data.done || 0, data.total || 0, data.current || "");
        finished = data.status === "done" || data.status === "error";
        if (!finished) await new Promise(resolve => setTimeout(resolve, 500));
      } catch {
        await new Promise(resolve => setTimeout(resolve, 800));
        finished = false;
      }
    }
  };

  // Les nouveaux flux utilisent showAppConfirm afin de rester cohérents avec le design
  // de l’application et d’éviter les boîtes de dialogue natives du navigateur.
})();

// csv analyse immediate modal v116
document.addEventListener("click", (event) => {
  if (event.target?.id === "previewCsvImport") {
    if (typeof startCsvModalIndeterminate === "function") startCsvModalIndeterminate();
  }
}, true);


// V1.1.7 BetaSeries status
async function refreshBetaSeriesStatusV117() {
  try {
    const r = await fetch("/api/betaseries/status");
    const data = await r.json();
    const el = document.getElementById("betaseriesApiStatus");
    if (el) {
      el.textContent = data.configured
        ? "BetaSeries API : active — bonus/fallback disponible, non requis pour la metadata locale."
        : "BetaSeries API : inactive — fonctionnement normal avec metadata locale + Jikan/AniList si besoin.";
    }
  } catch {}
}
document.addEventListener("DOMContentLoaded", () => setTimeout(refreshBetaSeriesStatusV117, 700));
document.addEventListener("click", (event) => {
  if (event.target?.id === "saveBetaSeriesKey") setTimeout(refreshBetaSeriesStatusV117, 700);
});


// V1.1.8 CSV import details + timer
(function almV118ImportDetails() {
  let csvImportStartTime = 0;
  let csvLiveEntries = [];

  function formatDuration(seconds) {
    seconds = Math.max(0, Math.round(seconds || 0));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function updateCsvTimer(done, total) {
    const elapsedEl = document.getElementById("csvElapsedTime");
    const etaEl = document.getElementById("csvEtaTime");

    if (!csvImportStartTime) csvImportStartTime = Date.now();

    const elapsedSeconds = (Date.now() - csvImportStartTime) / 1000;
    if (elapsedEl) elapsedEl.textContent = formatDuration(elapsedSeconds);

    if (etaEl) {
      if (done > 0 && total > 0) {
        const perItem = elapsedSeconds / done;
        const remaining = Math.max(0, total - done) * perItem;
        etaEl.textContent = formatDuration(remaining);
      } else {
        etaEl.textContent = "--:--";
      }
    }
  }

  function addCsvLiveEntry(done, total, current) {
    if (!current) return;

    const log = document.getElementById("csvLiveLog");
    if (!log) return;

    log.classList.remove("hidden");

    const text = `${done}/${total} — ${current}`;
    if (csvLiveEntries[0] === text) return;

    csvLiveEntries.unshift(text);
    csvLiveEntries = csvLiveEntries.slice(0, 12);

    log.innerHTML = csvLiveEntries.map(entry => `<div>${escapeHtml(entry)}</div>`).join("");
  }

  window.resetCsvImportDetailsV118 = function() {
    csvImportStartTime = Date.now();
    csvLiveEntries = [];

    const current = document.getElementById("csvCurrentStep");
    const elapsed = document.getElementById("csvElapsedTime");
    const eta = document.getElementById("csvEtaTime");
    const log = document.getElementById("csvLiveLog");

    if (current) current.textContent = "Préparation...";
    if (elapsed) elapsed.textContent = "00:00";
    if (eta) eta.textContent = "--:--";
    if (log) {
      log.innerHTML = "";
      log.classList.add("hidden");
    }
  };

  const previousSetCsvModalProgress = window.setCsvModalProgress;

  window.setCsvModalProgress = function(done, total, current = "") {
    if (typeof previousSetCsvModalProgress === "function") {
      previousSetCsvModalProgress(done, total, current);
    } else {
      const box = document.getElementById("csvModalProgress");
      const label = document.getElementById("csvModalProgressLabel");
      const bar = document.getElementById("csvModalProgressBar");
      if (box) box.classList.remove("hidden");
      const pct = total ? Math.round((done / total) * 100) : 0;
      if (label) label.textContent = total ? `Analyse CSV ${done}/${total}${current ? " — " + current : ""}` : "Analyse CSV en cours...";
      if (bar) bar.style.width = `${pct}%`;
    }

    const step = document.getElementById("csvCurrentStep");
    if (step) step.textContent = current ? `Analyse : ${current}` : (total ? "Analyse en cours..." : "Préparation...");

    updateCsvTimer(done, total);
    addCsvLiveEntry(done, total, current);
  };

  const previousPollCsvProgressModalV116 = window.pollCsvProgressModalV116;
  const previousPollCsvProgressModalV115 = window.pollCsvProgressModalV115;

  window.pollCsvProgressModalV118 = async function(progressId) {
    window.resetCsvImportDetailsV118();
    let finalData = null,previewCursor=0;

    while (true) {
      if(!activeCsvAnalysis||activeCsvAnalysis.progressId!==String(progressId)||activeCsvAnalysis.finished)break;
      try {
        const response = await fetch(`/api/import/csv/progress/${progressId}?preview=1&cursor=${previewCursor}`);
        const data = await response.json();
        // The POST is authoritative. An older in-flight poll must never
        // overwrite its terminal counter or inject partial rows afterwards.
        if(!activeCsvAnalysis||activeCsvAnalysis.progressId!==String(progressId)||activeCsvAnalysis.finished)return finalData;
        finalData = data;
        if(data.previews?.length){previewCursor=data.previewCursor||previewCursor;renderCsvPartialResults(data);}
        const status = String(data.status || "");
        const current = status === "cancelling"
          ? (data.current || "Annulation demandée…")
          : (data.current || "");
        window.setCsvModalProgress(data.done || 0, data.total || 0, current);
        if (["done", "error", "cancelled"].includes(status)) break;
        await new Promise(resolve => setTimeout(resolve, 450));
      } catch {
        await new Promise(resolve => setTimeout(resolve, 650));
      }
    }

    if(!['done','error','cancelled'].includes(String(finalData?.status||'')))return finalData;
    const step = document.getElementById("csvCurrentStep");
    const label = document.getElementById("csvModalProgressLabel");
    const bar = document.getElementById("csvModalProgressBar");
    const status = String(finalData?.status || "");
    if (status === "cancelled") {
      const done = Number(finalData?.done || 0);
      const total = Number(finalData?.total || 0);
      const pct = total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
      if (bar) bar.style.width = `${pct}%`;
      if (step) step.textContent = "Analyse annulée";
      if (label) label.textContent = total ? `Analyse annulée à ${done}/${total}` : "Analyse annulée";
      return finalData;
    }
    if (status === "error") {
      if (step) step.textContent = "Erreur pendant l’analyse";
      if (label) label.textContent = finalData?.current || "Analyse CSV interrompue par une erreur";
      return finalData;
    }

    const total = Number(finalData?.total || 0);
    if (total) window.setCsvModalProgress(total, total, "Analyse terminée");
    if (bar) bar.style.width = "100%";
    if (step) step.textContent = "Analyse terminée";
    if (label) label.textContent = total ? `Analyse CSV ${total}/${total} — 100 %` : "Analyse terminée";
    return finalData;
  };

  window.finishCsvAnalysisProgress = function(status, result = {}) {
    const total=Number(result.counts?.total??result.total??result.items?.length??0);
    const step=document.getElementById('csvCurrentStep'),label=document.getElementById('csvModalProgressLabel'),bar=document.getElementById('csvModalProgressBar'),eta=document.getElementById('csvEtaTime');
    if(status==='done'){
      window.setCsvModalProgress(total,total,'Analyse terminée');
      if(label)label.textContent=total?`Analyse CSV ${total}/${total} — 100 %`:'Analyse terminée';
      if(step)step.textContent='Analyse terminée';
      if(bar)bar.style.width='100%';
      if(eta)eta.textContent='00:00';
    }else{
      const text=status==='cancelled'?'Analyse annulée':'Erreur pendant l’analyse';
      if(step)step.textContent=text;if(label)label.textContent=text;if(eta)eta.textContent='--:--';
    }
    document.getElementById('csvModalProgress')?.setAttribute('data-status',status);
  };

  // Compatibility aliases
  window.pollCsvProgressModalV116 = window.pollCsvProgressModalV118;
  window.pollCsvProgressModalV115 = window.pollCsvProgressModalV118;
  window.pollCsvProgressV113 = window.pollCsvProgressModalV118;

  document.addEventListener("click", (event) => {
    if (event.target?.id === "previewCsvImport") {
      window.resetCsvImportDetailsV118();
      const box = document.getElementById("csvModalProgress");
      if (box) box.classList.remove("hidden");
      window.setCsvModalProgress(0, 0, "Démarrage de l’analyse...");
    }
  }, true);
})();


// V1.1.9 API test + watchlist helper
async function testBetaSeriesKeyV119() {
  try {
    const key = document.getElementById("betaseriesApiKey")?.value || "";
    const response = await fetch("/api/betaseries/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betaseriesApiKey: key })
    });
    const data = await response.json();
    const status = document.getElementById("betaseriesLastTestStatus");
    if (data.ok) {
      if (status) status.textContent = `Dernier test : OK (${data.count || 0} résultat(s)) — ${new Date(data.testedAt).toLocaleString()}`;
      window.notifyApp?.("Connexion BetaSeries OK.", "success");
    } else {
      if (status) status.textContent = `Dernier test : échec — ${data.error || data.status || "erreur"}`;
      window.notifyApp?.("Connexion BetaSeries échouée.", "error");
    }
  } catch (error) {
    window.notifyApp?.("Erreur test BetaSeries : " + error.message, "error");
  }
}

async function importAllPlanToWatchV119() {
  try {
    const all = Array.isArray(window.animes) ? window.animes : (typeof animes !== "undefined" ? animes : []);
    const count = all.filter(a => String(a.status || "").toLowerCase().includes("plan") || String(a.status || "").toLowerCase().includes("voir")).length;
    if (!count) return window.notifyApp?.("Aucun anime À voir détecté.", "info");
    window.notifyApp?.(`${count} anime(s) sont déjà dans À voir.`, "success");
    const status = document.getElementById("statusFilter");
    if (status) status.value = "Plan to Watch";
    if (typeof render === "function") render();
  } catch (error) {
    window.notifyApp?.("Erreur À voir : " + error.message, "error");
  }
}

document.addEventListener("click", event => {
  if (event.target?.id === "testBetaSeriesKey") { event.preventDefault(); testBetaSeriesKeyV119(); }
  if (event.target?.id === "importAllPlanToWatchBtn") { event.preventDefault(); importAllPlanToWatchV119(); }
});


// V1.1.10 UI/API/news fixes
async function saveBetaSeriesKeyVisualV1110() {
  const input = document.getElementById("betaseriesApiKey");
  const hint = document.getElementById("betaseriesApiSavedHint");
  if (!input) return;
  try {
    const key = input.value || "";
    const response = await fetch("/api/config/betaseries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betaseriesApiKey: key })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erreur");
    input.value = '';
    if (hint) hint.textContent = data.config?.betaseriesApiKeySaved ? "Clé enregistrée et active." : "Aucune clé enregistrée.";
    window.notifyApp?.("Clé BetaSeries enregistrée/mise à jour.", "success");
    if (typeof refreshBetaSeriesStatusV117 === "function") refreshBetaSeriesStatusV117();
  } catch (error) {
    window.notifyApp?.("Erreur BetaSeries : " + error.message, "error");
  }
}

async function addAllNewsToWatchlistV1110() {
  try {
    const items = Array.isArray(currentNews) ? currentNews.filter(x => x && x.title) : [];
    if (!items.length) {
      window.notifyApp?.("Aucune nouvelle saison visible à ajouter.", "info");
      return;
    }
    const accepted = await askAppConfirmation(`Ajouter les ${items.length} nouvelle(s) saison(s) visibles à « À voir » ?`, {
      title: "Ajouter les saisons visibles ?",
      okText: "Tout ajouter",
      cancelText: "Annuler"
    });
    if (!accepted) return;

    let added = 0;
    let already = 0;
    let failed = 0;
    for (const item of items) {
      try {
        const result = await api("/api/news/add-to-plan", {
          method: "POST",
          body: JSON.stringify(item)
        });
        if (result.alreadyExists) already++;
        else added++;
      } catch (_) {
        failed++;
      }
    }

    currentNews = [];
    renderSeasonNews(currentNews);
    await load();
    window.notifyApp?.(`${added} ajoutée(s), ${already} déjà présente(s), ${failed} échec(s).`, failed ? "warning" : "success");
  } catch (error) {
    window.notifyApp?.("Erreur ajout nouvelles saisons : " + error.message, "error");
    alert("Erreur ajout nouvelles saisons : " + error.message);
  }
}

document.addEventListener("click", event => {
  if (event.target?.id === "saveBetaSeriesKey") {
    event.preventDefault();
    event.stopPropagation();
    saveBetaSeriesKeyVisualV1110();
  }
  if (event.target?.id === "addAllNewsToWatchlistBtn") {
    event.preventDefault();
    addAllNewsToWatchlistV1110();
  }
}, true);

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      const config = await api("/api/config");
      const input = document.getElementById("betaseriesApiKey");
      const hint = document.getElementById("betaseriesApiSavedHint");
      if (input && config.betaseriesApiKeySaved) {
        input.value = '';
        if (hint) hint.textContent = "Clé enregistrée et active.";
      } else if (hint) {
        hint.textContent = "Aucune clé enregistrée.";
      }
    } catch {}
  }, 500);
});

// Affichage progression parallèle sur une seule ligne propre
const oldSetCsvModalProgressV1110 = window.setCsvModalProgress;
window.setCsvModalProgress = function(done, total, current = "") {
  if (typeof oldSetCsvModalProgressV1110 === "function") {
    oldSetCsvModalProgressV1110(done, total, current);
  }
  const step = document.getElementById("csvCurrentStep");
  const log = document.getElementById("csvLiveLog");
  if (step && total) step.textContent = `Analyse parallèle en cours — ${done}/${total}`;
  if (log) {
    log.innerHTML = current ? `<div>${done}/${total} — ${escapeHtml(current)}</div>` : "";
    log.classList.toggle("hidden", !current);
  }
};


// V1.1.11 architecture UI
async function saveWorkerModeV1111() {
  try {
    const workerMode = document.getElementById("workerMode")?.value || "turbo";
    const response = await fetch("/api/config/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workerMode })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erreur");
    const status = document.getElementById("workerModeStatus");
    if (status) status.textContent = `Mode actuel : ${data.workerMode} (${data.workers} workers)`;
    window.notifyApp?.("Mode performance enregistré.", "success");
  } catch (error) {
    window.notifyApp?.("Erreur performance : " + error.message, "error");
  }
}
document.addEventListener("click", event => {
  if (event.target?.id === "saveWorkerMode") {
    event.preventDefault();
    saveWorkerModeV1111();
  }
});
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      const config = await api("/api/config");
      const select = document.getElementById("workerMode");
      const status = document.getElementById("workerModeStatus");
      if (select && config.workerMode) select.value = config.workerMode;
      if (status) status.textContent = `Mode actuel : ${config.workerMode || "normal"}`;
    } catch {}
  }, 700);
});
const oldSetCsvModalProgressV1111 = window.setCsvModalProgress;
window.setCsvModalProgress = function(done, total, current = "") {
  if (typeof oldSetCsvModalProgressV1111 === "function") oldSetCsvModalProgressV1111(done, total, current);
  const step = document.getElementById("csvCurrentStep");
  const log = document.getElementById("csvLiveLog");
  if (step && total) step.textContent = `Analyse parallèle — ${done}/${total} — ${current || "workers actifs"}`;
  if (log) {
    log.innerHTML = current ? `<div>${escapeHtml(current)}</div>` : "";
    log.classList.toggle("hidden", !current);
  }
};


// V1.1.12 Turbo UI
async function preloadCacheV1112() {
  try {
    const status = document.getElementById("cachePreloadStatus");
    if (status) status.textContent = "Cache : préchargement en cours...";
    const response = await fetch("/api/cache/preload", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erreur");
    if (status) status.textContent = `Cache : ${data.count || 0} titre(s) préchargé(s) — ${new Date(data.updatedAt).toLocaleString()}`;
    window.notifyApp?.("Cache préchargé.", "success");
  } catch (error) {
    window.notifyApp?.("Erreur préchargement cache : " + error.message, "error");
  }
}

async function loadCacheStatusV1112() {
  try {
    const response = await fetch("/api/cache/status");
    const data = await response.json();
    const status = document.getElementById("cachePreloadStatus");
    if (status) {
      status.textContent = data.ok
        ? `Cache : ${data.count || 0} titre(s) préchargé(s) — ${new Date(data.updatedAt).toLocaleString()}`
        : "Cache : non préchargé";
    }
  } catch {}
}

document.addEventListener("click", event => {
  if (event.target?.id === "preloadCacheBtn") {
    event.preventDefault();
    preloadCacheV1112();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(async () => {
    try {
      const config = await api("/api/config");
      const select = document.getElementById("workerMode");
      const status = document.getElementById("workerModeStatus");
      if (select) select.value = config.workerMode || "turbo";
      if (status) status.textContent = `Mode actuel : ${config.workerMode || "turbo"}`;
      loadCacheStatusV1112();
    } catch {}
  }, 800);
});

// Stable one-line turbo progress
const oldSetCsvModalProgressV1112 = window.setCsvModalProgress;
window.setCsvModalProgress = function(done, total, current = "") {
  if (typeof oldSetCsvModalProgressV1112 === "function") oldSetCsvModalProgressV1112(done, total, current);
  const step = document.getElementById("csvCurrentStep");
  const log = document.getElementById("csvLiveLog");
  if (step && total) step.textContent = `Mode Turbo — ${done}/${total} — ${current || "20 requêtes simultanées"}`;
  if (log) {
    log.innerHTML = current ? `<div>${escapeHtml(current)}</div>` : "";
    log.classList.toggle("hidden", !current);
  }
};


// V2.0 Database Edition UI
async function loadDatabaseStatusV1113() {
  try {
    const r = await fetch("/api/database/status");
    const data = await r.json();
    const el = document.getElementById("databaseStatus");
    if (el) {
      const remote = data.metadataRemoteConfigured ? "sync distante configurée" : "snapshot local uniquement";
      el.textContent = `Database : ${data.database || 0} fiches JSON, ${data.aliases || 0} alias, ${data.relations || 0} relations, ${data.metadata || 0} metadata SQL (${remote}).`;
    }
  } catch {
    const el = document.getElementById("databaseStatus");
    if (el) el.textContent = "Database : erreur de lecture.";
  }
}

async function preloadDatabaseV1113() {
  try {
    const el = document.getElementById("databaseStatus");
    if (el) el.textContent = "Database : préchargement en cours...";
    const r = await fetch("/api/database/preload", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Erreur");
    const metaCount = data.metadata?.count ?? data.metadata?.after ?? data.metadata?.status?.count ?? 0;
    if (el) el.textContent = `Database : cache préchargé (${data.count || 0} titre(s)), metadata SQL ${metaCount || "inchangée"}.`;
    window.notifyApp?.("Database/cache préchargé.", "success");
  } catch (error) {
    window.notifyApp?.("Erreur Database : " + error.message, "error");
  }
}


async function refreshMetadataSettingsStatusV1114() {
  try {
    const response = await fetch("/api/metadata/status");
    const data = await response.json();
    const el = document.getElementById("metadataSettingsStatus");
    if (!el) return;
    const remote = data.remoteConfigured ? "GitHub optionnel configuré" : "sans GitHub";
    const autonomous = data.autonomous?.updatedAt ? `maintenance autonome : ${data.autonomous.updatedAt}` : "maintenance autonome : jamais";
    const last = data.sync?.lastAutonomousImportAt || data.sync?.lastRemoteImportAt || data.sync?.lastLocalImportAt || data.preload?.updatedAt || "jamais";
    const images = data.withImages ? `, ${data.withImages} images` : "";
    el.textContent = `Metadata : ${data.count || 0} fiches SQL${images}, ${remote}, dernier import : ${last}, ${autonomous}.`;
  } catch {
    const el = document.getElementById("metadataSettingsStatus");
    if (el) el.textContent = "Metadata : statut indisponible.";
  }
}

async function loadMetadataSettingsV1114() {
  try {
    const config = await api("/api/config");
    const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
    const setChecked = (id, value) => { const el = document.getElementById(id); if (el) el.checked = value; };
    setValue("metadataManifestUrl", config.metadataManifestUrl || "");
    setValue("metadataUrl", config.metadataUrl || "");
    setChecked("metadataUpdateOnStart", config.metadataUpdateOnStart === true);
    setValue("metadataUpdateIntervalHours", config.metadataUpdateIntervalHours || 168);
    setChecked("metadataAutonomousUpdateOnStart", config.metadataAutonomousUpdateOnStart !== false);
    setValue("metadataAutonomousIntervalHours", config.metadataAutonomousIntervalHours || 168);
    setValue("metadataAutonomousSeasonalPages", config.metadataAutonomousSeasonalPages || 2);
    setValue("metadataAutonomousUpcomingPages", config.metadataAutonomousUpcomingPages || 2);
    setValue("metadataAutonomousTopPages", config.metadataAutonomousTopPages || 2);
    setValue("metadataAutonomousAniListPages", config.metadataAutonomousAniListPages || 2);
  } catch {}
  refreshMetadataSettingsStatusV1114();
}

async function saveMetadataSettingsV1114() {
  try {
    const num = (id, fallback) => Number(document.getElementById(id)?.value || fallback);
    const payload = {
      metadataManifestUrl: document.getElementById("metadataManifestUrl")?.value || "",
      metadataUrl: document.getElementById("metadataUrl")?.value || "",
      metadataUpdateOnStart: document.getElementById("metadataUpdateOnStart")?.checked === true,
      metadataUpdateIntervalHours: num("metadataUpdateIntervalHours", 168),
      metadataAutonomousUpdateOnStart: document.getElementById("metadataAutonomousUpdateOnStart")?.checked !== false,
      metadataAutonomousIntervalHours: num("metadataAutonomousIntervalHours", 168),
      metadataAutonomousSeasonalPages: num("metadataAutonomousSeasonalPages", 2),
      metadataAutonomousUpcomingPages: num("metadataAutonomousUpcomingPages", 2),
      metadataAutonomousTopPages: num("metadataAutonomousTopPages", 2),
      metadataAutonomousAniListPages: num("metadataAutonomousAniListPages", 2)
    };
    const response = await fetch("/api/config/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erreur");
    window.notifyApp?.("Réglages metadata enregistrés.", "success");
    refreshMetadataSettingsStatusV1114();
  } catch (error) {
    window.notifyApp?.("Erreur metadata : " + error.message, "error");
  }
}

async function syncMetadataNowV1114() {
  try {
    const el = document.getElementById("metadataSettingsStatus");
    if (el) el.textContent = "Metadata : synchronisation GitHub en cours...";
    const response = await fetch("/api/metadata/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Erreur");
    window.notifyApp?.(data.skipped ? "Metadata : aucune mise à jour GitHub à appliquer." : "Metadata GitHub synchronisée.", "success");
    refreshMetadataSettingsStatusV1114();
  } catch (error) {
    window.notifyApp?.("Erreur sync GitHub metadata : " + error.message, "error");
    refreshMetadataSettingsStatusV1114();
  }
}

async function syncMetadataAutonomousNowV1114() { return window.ALM_BETA37.sync(); }

document.addEventListener("click", event => {
  if (event.target?.id === "saveMetadataSettings") {
    event.preventDefault();
    saveMetadataSettingsV1114();
  }
  if (event.target?.id === "syncMetadataNow") {
    event.preventDefault();
    syncMetadataNowV1114();
  }
  if (event.target?.id === "syncMetadataAutonomousNow") {
    event.preventDefault();
    syncMetadataAutonomousNowV1114();
  }
});

document.addEventListener("DOMContentLoaded", () => setTimeout(loadMetadataSettingsV1114, 900));

document.addEventListener("click", event => {
  if (event.target?.id === "databasePreloadBtn") {
    event.preventDefault();
    preloadDatabaseV1113();
  }
});

document.addEventListener("DOMContentLoaded", () => setTimeout(loadDatabaseStatusV1113, 700));

// Database mode progress : une seule ligne propre
const oldSetCsvModalProgressV1113 = window.setCsvModalProgress;
window.setCsvModalProgress = function(done, total, current = "") {
  if (typeof oldSetCsvModalProgressV1113 === "function") oldSetCsvModalProgressV1113(done, total, current);
  const step = document.getElementById("csvCurrentStep");
  const log = document.getElementById("csvLiveLog");
  if (step && total) step.textContent = `Database Edition — ${done}/${total}`;
  if (log) {
    log.innerHTML = current ? `<div>${escapeHtml(current)}</div>` : "";
    log.classList.toggle("hidden", !current);
  }
};

function initFloatingScrollButtons() {
  window.ALM_SCROLL_PROGRESS?.mount();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFloatingScrollButtons);
} else {
  initFloatingScrollButtons();
}

window.addEventListener("alm:titles-changed",()=>render());
window.addEventListener("alm:language-changed",()=>render());
