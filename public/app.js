
let animes = [];
let appConfig = {};
let currentNews = [];
let progressTimer = null;

const animeGrid = document.getElementById("animeGrid") || document.getElementById("grid");
const stats = document.getElementById("stats");

function $(id) {
  return document.getElementById(id);
}

function safeText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
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

async function load() {
  animes = await api("/api/animes");
  try { appConfig = await api("/api/config"); } catch (_) { appConfig = {}; }
  rebuildDynamicFilters();
  render();
}

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

function uniq(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function rebuildDynamicFilters() {
  const typeSelect = $("typeFilter");
  const genreSelect = $("genreFilter");
  if (!typeSelect || !genreSelect) return;

  const currentType = typeSelect.value;
  const currentGenre = genreSelect.value;

  typeSelect.innerHTML = '<option value="">Tous les types</option>';
  genreSelect.innerHTML = '<option value="">Tous les genres</option>';

  uniq(animes.map(a => a.type)).forEach(type => {
    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = type;
    typeSelect.appendChild(opt);
  });

  uniq(animes.flatMap(a => a.genres || [])).forEach(genre => {
    const opt = document.createElement("option");
    opt.value = genre;
    opt.textContent = genre;
    genreSelect.appendChild(opt);
  });

  typeSelect.value = currentType;
  genreSelect.value = currentGenre;
}

function filteredAnimes() {
  const q = ($("search")?.value || "").toLowerCase();
  const status = $("statusFilter")?.value || "";
  const type = $("typeFilter")?.value || "";
  const genre = $("genreFilter")?.value || "";
  const sort = $("sort")?.value || "title";

  let list = animes.filter(a => {
    const text = `${a.title} ${(a.tags || []).join(" ")} ${(a.genres || []).join(" ")} ${a.notes || ""}`.toLowerCase();
    return text.includes(q)
      && (!status || a.status === status)
      && (!type || a.type === type)
      && (!genre || (a.genres || []).includes(genre));
  });

  list.sort((a, b) => {
    if (sort === "scoreDesc") return Number(b.score || 0) - Number(a.score || 0);
    if (sort === "publicScoreDesc") return Number(b.publicScore || 0) - Number(a.publicScore || 0);
    if (sort === "rankAsc") return Number(a.rank || 999999) - Number(b.rank || 999999);
    if (sort === "progressDesc") return Number(b.episodesSeen || 0) - Number(a.episodesSeen || 0);
    if (sort === "startDateDesc") return String(b.startDate || "").localeCompare(String(a.startDate || ""));
    if (sort === "startDateAsc") return String(a.startDate || "9999").localeCompare(String(b.startDate || "9999"));
    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  return list;
}

function renderStats() {
  safeText("totalCount", animes.length);
  safeText("completedCount", animes.filter(a => a.status === "Completed").length);
  safeText("watchingCount", animes.filter(a => a.status === "Watching").length);
  safeText("planCount", animes.filter(a => a.status === "Plan to Watch").length);
}

function render() {
  renderStats();
  if (!animeGrid) return;

  const list = filteredAnimes();
  const viewMode = $("viewMode")?.value || "cards";
  animeGrid.className = `grid view-${viewMode}`;
  animeGrid.innerHTML = "";

  if (stats) stats.textContent = `${list.length} animé(s) affiché(s) / ${animes.length}`;

  for (const anime of list) {
    const article = document.createElement("article");
    article.className = "card";

    const tagHtml = [...(anime.genres || []), ...(anime.tags || [])]
      .slice(0, 8)
      .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    const poster = anime.poster
      ? `<img src="${anime.poster}" alt="${escapeHtml(anime.title)}">`
      : `Image absente<br>${escapeHtml(anime.title)}`;

    article.innerHTML = `
      <div class="poster">${poster}<span class="badge">${escapeHtml(anime.type || "TV")}</span></div>
      <div class="card-body">
        <div class="title">${escapeHtml(anime.title)}</div>
        <div class="meta">
          ⭐ <strong>Ma note :</strong> ${anime.score && anime.score !== "0" ? escapeHtml(anime.score) : "-"}<br>
          🌍 <strong>Note publique :</strong> ${escapeHtml(anime.publicScore || "-")} ${anime.rank ? ` / Rang #${escapeHtml(anime.rank)}` : ""}<br>
          🎬 <strong>Progression :</strong> ${escapeHtml(anime.episodesSeen || "?")} / ${escapeHtml(anime.episodesTotal || "?")}<br>
          📅 <strong>Diffusion :</strong> ${formatDate(anime.startDate)} → ${formatDate(anime.endDate)}<br>
          📌 <strong>Statut :</strong> ${escapeHtml(anime.status || "-")}
        </div>
        ${tagHtml ? `<div class="tags">${tagHtml}</div>` : ""}
        <div class="actions">
          <button data-action="edit">Modifier</button>
          <button data-action="refresh">Infos auto</button>
          <button data-action="image">Image</button>
          ${anime.malUrl ? `<a href="${anime.malUrl}" target="_blank" rel="noopener">MAL</a>` : ""}
          <button class="delete" data-action="delete">Supprimer</button>
        </div>
      </div>
    `;

    article.querySelector('[data-action="edit"]')?.addEventListener("click", () => openEdit(anime));
    article.querySelector('[data-action="refresh"]')?.addEventListener("click", () => refreshInfo(anime));
    article.querySelector('[data-action="image"]')?.addEventListener("click", () => downloadImage(anime));
    article.querySelector('[data-action="delete"]')?.addEventListener("click", () => deleteAnime(anime));

    animeGrid.appendChild(article);
  }
}

function formatDate(value) {
  return value ? String(value).slice(0, 10) : "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[s]));
}

function openAdd() {
  $("dialogTitle").textContent = "Ajouter un animé";
  $("animeForm").reset();
  $("animeId").value = "";
  $("status").value = "Watching";
  $("type").value = "TV";
  $("autoInfo").checked = true;
  $("formDialog").showModal();
}

function openEdit(anime) {
  $("dialogTitle").textContent = "Modifier un animé";
  $("animeId").value = anime.id;
  $("title").value = anime.title || "";
  $("status").value = anime.status || "Watching";
  $("type").value = anime.type || "TV";
  $("score").value = anime.score || "";
  $("episodesSeen").value = anime.episodesSeen || "";
  $("episodesTotal").value = anime.episodesTotal || "";
  $("startDate").value = anime.startDate || "";
  $("endDate").value = anime.endDate || "";
  $("genres").value = (anime.genres || []).join(", ");
  $("tags").value = (anime.tags || []).join(", ");
  $("notes").value = anime.notes || "";
  $("autoInfo").checked = false;
  $("formDialog").showModal();
}

async function saveForm(event) {
  event.preventDefault();

  const id = $("animeId").value;
  const payload = {
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
    autoInfo: $("autoInfo").checked
  };

  showProgress(id ? "Modification en cours..." : "Ajout en cours...");
  if (id) {
    await api(`/api/animes/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  } else {
    await api("/api/animes", { method: "POST", body: JSON.stringify(payload) });
  }
  finishProgress("Terminé.");

  $("formDialog").close();
  await load();
}

async function deleteAnime(anime) {
  if (!confirm(`Supprimer "${anime.title}" ?`)) return;
  await api(`/api/animes/${anime.id}`, { method: "DELETE" });
  await load();
}

async function downloadImage(anime) {
  const query = prompt("Titre à chercher pour l'image :", anime.title);
  if (query === null) return;

  showProgress(`Téléchargement de l'image : ${anime.title}`);
  await api(`/api/animes/${anime.id}/download-image`, {
    method: "POST",
    body: JSON.stringify({ query })
  });
  finishProgress("Image téléchargée.");
  await load();
}

async function refreshInfo(anime) {
  const query = prompt("Titre à chercher pour les infos :", anime.title);
  if (query === null) return;

  const overwrite = confirm("Remplacer les infos existantes si elles existent déjà ?");
  showProgress(`Récupération des infos : ${anime.title}`);
  await api(`/api/animes/${anime.id}/refresh-info`, {
    method: "POST",
    body: JSON.stringify({ query, overwrite })
  });
  finishProgress("Infos récupérées.");
  await load();
}

async function downloadAllMissingImages() {
  const missing = animes.filter(a => !a.poster);
  if (missing.length === 0) return alert("Toutes les images sont déjà téléchargées.");
  if (!confirm(`Télécharger ${missing.length} image(s) manquante(s) ?`)) return;

  const panel = $("progressPanel");
  const bar = $("progressBar");
  const label = $("progressLabel");
  if (panel) panel.classList.remove("hidden");

  let success = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i++) {
    const anime = missing[i];
    if (bar) bar.style.width = `${Math.round((i / missing.length) * 100)}%`;
    if (label) label.textContent = `Téléchargement ${i + 1}/${missing.length} : ${anime.title}`;

    try {
      await api(`/api/animes/${anime.id}/download-image`, {
        method: "POST",
        body: JSON.stringify({ query: anime.title })
      });
      success++;
    } catch (error) {
      failed++;
      console.error(error);
    }
  }

  if (bar) bar.style.width = "100%";
  if (label) label.textContent = `Terminé : ${success} réussie(s), ${failed} échec(s).`;
  setTimeout(() => panel?.classList.add("hidden"), 1800);
  await load();
}

async function refreshAllInfo() {
  if (!confirm("Compléter les informations automatiques de toute la liste ? Cela peut prendre quelques minutes.")) return;

  const overwrite = confirm("Remplacer les infos existantes si elles existent déjà ?");
  const targets = [...animes];
  const panel = $("progressPanel");
  const bar = $("progressBar");
  const label = $("progressLabel");
  if (panel) panel.classList.remove("hidden");

  let success = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const anime = targets[i];
    if (bar) bar.style.width = `${Math.round((i / targets.length) * 100)}%`;
    if (label) label.textContent = `Infos ${i + 1}/${targets.length} : ${anime.title}`;

    try {
      const result = await api("/api/bulk/refresh-one", {
        method: "POST",
        body: JSON.stringify({ id: anime.id, overwrite })
      });
      if (result.success) success++;
      else failed++;
    } catch (error) {
      failed++;
      console.error(error);
    }
  }

  if (bar) bar.style.width = "100%";
  if (label) label.textContent = `Terminé : ${success} complété(s), ${failed} échec(s).`;
  setTimeout(() => panel?.classList.add("hidden"), 2200);

  await load();
}

async function importXml(event) {
  event.preventDefault();

  const file = $("xmlFile").files[0];
  if (!file) return;

  const overwrite = $("overwriteImport").checked;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("overwrite", overwrite ? "true" : "false");

  showProgress("Import XML en cours...");
  const result = await api("/api/import/xml", { method: "POST", body: formData });
  finishProgress(`Import terminé : ${result.added} ajouté(s), ${result.updated} doublon(s) traité(s).`);

  $("importDialog").close();
  alert(`Import terminé : ${result.added} ajouté(s), ${result.updated} doublon(s) traité(s).`);
  await load();
}

async function checkSeasonNews(force = false) {
  if (force && !confirm("Lancer une nouvelle recherche complète ?")) return;

  showProgress(force ? "Nouvelle recherche des saisons..." : "Chargement des saisons détectées...");
  const result = await api("/api/news/seasons", {
    method: "POST",
    body: JSON.stringify({ force })
  });
  finishProgress(`${result.count} nouvelle(s) saison(s) détectée(s).`);

  currentNews = result.news || [];
  renderNews(currentNews);
  await load();
}

function renderNews(news) {
  const panel = $("newsPanel");
  const list = $("newsList");
  if (!panel || !list) return;

  panel.classList.remove("hidden");
  list.innerHTML = "";

  if (!news.length) {
    list.innerHTML = `<p class="muted">Aucune nouvelle saison détectée pour le moment.</p>`;
    return;
  }

  for (const item of news) {
    const div = document.createElement("div");
    div.className = "news-item rich-news";

    const cover = item.imageUrl
      ? `<img class="news-cover" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}">`
      : `<div class="news-cover placeholder">Infos</div>`;

    const synopsis = item.synopsis
      ? escapeHtml(item.synopsis).slice(0, 450) + (item.synopsis.length > 450 ? "..." : "")
      : "Informations en attente. Clique sur “Charger les informations”. Si certaines fiches restent vides, la source publique n’a pas retourné toutes les données.";

    div.innerHTML = `
      <div class="news-content">
        ${cover}
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>Suite liée à : ${escapeHtml(item.sourceTitle || "-")} • ${escapeHtml(item.relation || "-")}</small>
          <div class="news-details">
            <p>${synopsis}</p>
            <div class="meta">
              📺 Type : ${escapeHtml(item.type || "-")}<br>
              🎬 Épisodes : ${escapeHtml(item.episodesTotal || "-")}<br>
              📅 Début : ${formatDate(item.startDate)}<br>
              🌍 Note publique : ${escapeHtml(item.publicScore || "-")} ${item.rank ? ` / Rang #${escapeHtml(item.rank)}` : ""}<br>
              🏷 Genres : ${(item.genres || []).map(escapeHtml).join(", ") || "-"}
            </div>
          </div>
        </div>
      </div>
      <div class="news-actions">
        <button data-add>Ajouter à voir prochainement</button>
        <button data-skip>Ne pas ajouter</button>
        <button class="delete" data-ignore>Oublier définitivement</button>
      </div>
    `;

    div.querySelector("[data-add]")?.addEventListener("click", async () => {
      await api("/api/news/add-to-plan", { method: "POST", body: JSON.stringify(item) });
      div.remove();
      await load();
    });

    div.querySelector("[data-skip]")?.addEventListener("click", () => div.remove());

    div.querySelector("[data-ignore]")?.addEventListener("click", async () => {
      if (!confirm(`Oublier définitivement "${item.title}" ?`)) return;
      await api("/api/news/ignore", { method: "POST", body: JSON.stringify(item) });
      div.remove();
    });

    list.appendChild(div);
  }
}

async function loadVisibleNewsInfo() {
  if (!currentNews.length) {
    try {
      const result = await api("/api/news/seasons", { method: "POST", body: JSON.stringify({ force: false }) });
      currentNews = result.news || [];
    } catch (error) {
      alert("Impossible de charger les news : " + error.message);
      return;
    }
  }

  if (!currentNews.length) return alert("Aucune news à compléter.");

  const panel = $("progressPanel");
  const bar = $("progressBar");
  const label = $("progressLabel");
  if (panel) panel.classList.remove("hidden");

  let success = 0;
  let failed = 0;
  let done = 0;
  const results = [...currentNews];
  const batchSize = 4;

  for (let i = 0; i < currentNews.length; i += batchSize) {
    const batch = currentNews.slice(i, i + batchSize);

    if (label) label.textContent = `News ${Math.min(i + 1, currentNews.length)}-${Math.min(i + batch.length, currentNews.length)}/${currentNews.length}`;

    const batchResults = await Promise.all(batch.map(async (item) => {
      try {
        const result = await api("/api/news/detail-one", {
          method: "POST",
          body: JSON.stringify(item)
        });

        if (result.success) success++;
        else failed++;

        return result.item || item;
      } catch (error) {
        failed++;
        return item;
      }
    }));

    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }

    done += batch.length;
    if (bar) bar.style.width = `${Math.round((done / currentNews.length) * 100)}%`;

    currentNews = results;
    renderNews(currentNews);
  }

  try {
    await api("/api/news/results/save", {
      method: "POST",
      body: JSON.stringify({ items: currentNews })
    });
  } catch (_) {}

  if (bar) bar.style.width = "100%";
  if (label) label.textContent = `Terminé : ${success} complétée(s), ${failed} échec(s).`;
  setTimeout(() => panel?.classList.add("hidden"), 2200);

  renderNews(currentNews);
}

function filterByStatusCard(status) {
  if ($("search")) $("search").value = "";
  if ($("statusFilter")) $("statusFilter").value = status || "";
  $("newsPanel")?.classList.add("hidden");
  render();
}

function resetFilters() {
  ["search", "statusFilter", "typeFilter", "genreFilter"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });
  if ($("sort")) $("sort").value = "title";
  render();
}

function goHome() {
  $("newsPanel")?.classList.add("hidden");
  resetFilters();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bind(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}

bind("openAdd", "click", openAdd);
bind("cancel", "click", () => $("formDialog")?.close());
bind("exportBtn", "click", () => location.href = "/api/export");
bind("downloadAllImages", "click", downloadAllMissingImages);
bind("bulkInfo", "click", refreshAllInfo);
bind("seasonNewsBtn", "click", () => checkSeasonNews(false));
bind("resetFilters", "click", resetFilters);
bind("importXmlBtn", "click", () => $("importDialog")?.showModal());
bind("cancelImport", "click", () => $("importDialog")?.close());
bind("importForm", "submit", importXml);
bind("closeNews", "click", () => $("newsPanel")?.classList.add("hidden"));
bind("loadNewsInfoBtn", "click", loadVisibleNewsInfo);
bind("forceNewsSearchBtn", "click", () => checkSeasonNews(true));
bind("homeLink", "click", e => { e.preventDefault(); goHome(); });

$("animeForm")?.addEventListener("submit", saveForm);

["search", "statusFilter", "typeFilter", "genreFilter", "sort", "viewMode"].forEach(id => {
  const el = $(id);
  if (el) {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  }
});

$("totalCount")?.closest(".stat-card")?.addEventListener("click", () => filterByStatusCard(""));
$("completedCount")?.closest(".stat-card")?.addEventListener("click", () => filterByStatusCard("Completed"));
$("watchingCount")?.closest(".stat-card")?.addEventListener("click", () => filterByStatusCard("Watching"));
$("planCount")?.closest(".stat-card")?.addEventListener("click", () => filterByStatusCard("Plan to Watch"));

load().catch(error => {
  alert(error.message);
  console.error(error);
});


// V1.1 side navigation
document.querySelectorAll(".nav-item[data-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    const filter = btn.dataset.filter || "";
    const status = document.getElementById("statusFilter");
    const news = document.getElementById("newsPanel");
    if (news) news.classList.add("hidden");
    if (status) status.value = filter;
    render();
  });
});

document.getElementById("navNews")?.addEventListener("click", () => {
  document.getElementById("seasonNewsBtn")?.click();
});

document.getElementById("navImages")?.addEventListener("click", () => {
  document.getElementById("downloadAllImages")?.click();
});

document.getElementById("navSettings")?.addEventListener("click", () => {
  document.getElementById("settingsBtn")?.click();
});

document.getElementById("navAbout")?.addEventListener("click", () => {
  document.querySelector(".site-footer")?.scrollIntoView({ behavior: "smooth" });
});


// V1.2 navigation and page switching fixes
function showHomeView() {
  document.getElementById("aboutPage")?.classList.add("hidden");
  document.getElementById("newsPanel")?.classList.add("hidden");
  document.querySelector(".filters")?.classList.remove("hidden");
  document.getElementById("stats")?.classList.remove("hidden");
  document.getElementById("animeGrid")?.classList.remove("hidden");
  document.querySelector(".hero")?.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  document.querySelector('.nav-item[data-view="home"]')?.classList.add("active");
  if (document.getElementById("search")) document.getElementById("search").value = "";
  if (document.getElementById("statusFilter")) document.getElementById("statusFilter").value = "";
  render();
}

function showAboutView() {
  document.getElementById("newsPanel")?.classList.add("hidden");
  document.querySelector(".filters")?.classList.add("hidden");
  document.getElementById("stats")?.classList.add("hidden");
  document.getElementById("animeGrid")?.classList.add("hidden");
  document.querySelector(".hero")?.classList.add("hidden");
  document.getElementById("aboutPage")?.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  document.getElementById("navAbout")?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  document.getElementById("aboutPage")?.classList.add("hidden");
  document.getElementById("donationsPage")?.classList.add("hidden");
  document.getElementById("newsPanel")?.classList.add("hidden");
  document.querySelector(".filters")?.classList.remove("hidden");
  document.getElementById("stats")?.classList.remove("hidden");
  document.getElementById("animeGrid")?.classList.remove("hidden");
  document.querySelector(".hero")?.classList.remove("hidden");
}

function showAnimesV1(statusValue = "") {
  hideV1Pages();
  const status = document.getElementById("statusFilter");
  if (status) status.value = statusValue;
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  if (statusValue === "Plan to Watch") document.querySelector('.nav-item[data-filter="Plan to Watch"]')?.classList.add("active");
  else document.querySelector('.nav-item[data-filter=""]')?.classList.add("active");
  render();
}

function showDonationsV1() {
  document.getElementById("newsPanel")?.classList.add("hidden");
  document.querySelector(".filters")?.classList.add("hidden");
  document.getElementById("stats")?.classList.add("hidden");
  document.getElementById("animeGrid")?.classList.add("hidden");
  document.querySelector(".hero")?.classList.add("hidden");
  document.getElementById("aboutPage")?.classList.add("hidden");
  document.getElementById("donationsPage")?.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
  document.getElementById("navDonations")?.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("navDonations")?.addEventListener("click", showDonationsV1);
document.querySelector('.nav-item[data-filter=""]')?.addEventListener("click", () => showAnimesV1(""));
document.querySelector('.nav-item[data-filter="Plan to Watch"]')?.addEventListener("click", () => showAnimesV1("Plan to Watch"));
document.addEventListener("DOMContentLoaded", () => setTimeout(() => showAnimesV1(""), 50));
