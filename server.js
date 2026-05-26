const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = 3123;
const BACKUP_VERSION = "1.0.0";
const upload = multer({ storage: multer.memoryStorage() });

const DATA_DIR = process.env.ALM_DATA_DIR || path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
const IMAGES_DIR = process.env.ALM_IMAGES_DIR || path.join(PUBLIC_DIR, "images");
const DATA_FILE = path.join(DATA_DIR, "animes.json");
const IGNORED_NEWS_FILE = path.join(DATA_DIR, "ignored-news.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const NEWS_CACHE_FILE = path.join(DATA_DIR, "news-cache.json");
const NEWS_RESULTS_FILE = path.join(DATA_DIR, "news-results.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

app.use(express.json({ limit: "20mb" }));
app.use("/images", express.static(IMAGES_DIR));
app.use(express.static(PUBLIC_DIR));

function readAnimes() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeAnimes(animes) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(animes, null, 2), "utf8");
  
}

function readIgnoredNews() {
  if (!fs.existsSync(IGNORED_NEWS_FILE)) return [];
  return JSON.parse(fs.readFileSync(IGNORED_NEWS_FILE, "utf8"));
}

function writeIgnoredNews(items) {
  fs.writeFileSync(IGNORED_NEWS_FILE, JSON.stringify(items, null, 2), "utf8");
  
}

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { cloudBackupPath: "", storageMode: "local-project" };
    }
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return {
      cloudBackupPath: parsed.cloudBackupPath || "",
      storageMode: parsed.storageMode || "local-project",
      ...parsed
    };
  } catch (error) {
    return { cloudBackupPath: "", storageMode: "local-project" };
  }
}



function readNewsResults() {
  try {
    if (!fs.existsSync(NEWS_RESULTS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(NEWS_RESULTS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeNewsResults(items) {
  fs.writeFileSync(NEWS_RESULTS_FILE, JSON.stringify(Array.isArray(items) ? items : [], null, 2), "utf8");
  
}

function readNewsCache() {
  if (!fs.existsSync(NEWS_CACHE_FILE)) return {};
  return JSON.parse(fs.readFileSync(NEWS_CACHE_FILE, "utf8"));
}

function writeNewsCache(cache) {
  fs.writeFileSync(NEWS_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

function newsCacheKey(item) {
  return normalizeTitle(item?.title || "") || String(item?.malId || "");
}

function writeConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config || {}, null, 2), "utf8");
}


function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFileIfExists(src, dest) {
  if (fs.existsSync(src)) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

function copyDirSafe(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDirSafe(s, d);
    else fs.copyFileSync(s, d);
  }
}


function slugify(text) {
  return String(text)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 90) || "anime";
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function fetchJsonWithRetry(url, attempts = 3) {
  let lastError = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Anime Local Manager"
        }
      });

      if (response.status === 429) {
        await sleep(1600 + i * 1200);
        continue;
      }

      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(900 + i * 800);
        continue;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      await sleep(900 + i * 800);
    }
  }

  throw lastError || new Error("Fetch failed");
}

function mergeDetailsIntoNewsItem(item, details) {
  if (!details) return item;

  return {
    ...item,
    imageUrl: details.imageUrl || item.imageUrl || "",
    synopsis: details.synopsis || item.synopsis || "",
    type: details.type || item.type || "",
    episodesTotal: details.episodesTotal || item.episodesTotal || "",
    startDate: details.startDate || item.startDate || "",
    endDate: details.endDate || item.endDate || "",
    publicScore: details.publicScore || item.publicScore || "",
    rank: details.rank || item.rank || "",
    genres: details.genres || item.genres || [],
    url: details.malUrl || item.url || "",
    malId: details.malId || item.malId || ""
  };
}

const aliases = {
  "Red Eyes Sword - Akame ga Kill!": ["Akame ga Kill"],
  "DanMachi: Familia Myth": ["Dungeon ni Deai wo Motomeru no wa Machigatteiru Darou ka", "Is It Wrong to Try to Pick Up Girls in a Dungeon"],
  "The Rising of the Shield Hero": ["Tate no Yuusha no Nariagari"],
  "Demon Slayer": ["Kimetsu no Yaiba"],
  "Tower of God": ["Kami no Tou"],
  "Solo Leveling": ["Ore dake Level Up na Ken", "Solo Leveling"],
  "The Heroic Legend of Arslân": ["Arslan Senki"],
  "Bofuri": ["Itai no wa Iya nanode Bougyoryoku ni Kyokufuri Shitai to Omoimasu"],
  "Black Summoner": ["Kuro no Shoukanshi"],
  "Frieren": ["Sousou no Frieren"],
  "Chainsaw Man Movie: Reze-hen": ["Chainsaw Man Reze Arc"]
};

function queriesForTitle(title) {
  const cleaned = String(title)
    .replace(/\(TV\)/gi, "")
    .replace(/SAISON/gi, "Season")
    .replace(/[“”]/g, "\"")
    .trim();

  return [...new Set([title, cleaned, ...(aliases[title] || [])].filter(Boolean))];
}

function mapJikanAnime(best, currentTitle) {
  return {
    title: currentTitle || best.title || "",
    officialTitle: best.title || "",
    type: best.type || "",
    episodesTotal: best.episodes ? String(best.episodes) : "",
    startDate: best.aired?.from ? best.aired.from.slice(0, 10) : "",
    endDate: best.aired?.to ? best.aired.to.slice(0, 10) : "",
    publicScore: best.score ? String(best.score) : "",
    rank: best.rank ? String(best.rank) : "",
    popularity: best.popularity ? String(best.popularity) : "",
    members: best.members ? String(best.members) : "",
    genres: Array.isArray(best.genres) ? best.genres.map(g => g.name).filter(Boolean) : [],
    synopsis: best.synopsis || "",
    malUrl: best.url || "",
    malId: best.mal_id || "",
    imageUrl: best.images?.jpg?.large_image_url || best.images?.jpg?.image_url || ""
  };
}

async function searchJikan(title) {
  for (const query of queriesForTitle(title)) {
    try {
      const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`;
      const response = await fetch(url);

      if (!response.ok) {
        await sleep(900);
        continue;
      }

      const json = await response.json();
      const results = json.data || [];
      if (!results.length) {
        await sleep(900);
        continue;
      }

      const exact = results.find(x => String(x.title || "").toLowerCase() === String(query).toLowerCase());
      const best = exact || results.find(x => x.images?.jpg?.large_image_url) || results[0];

      return mapJikanAnime(best, title);
    } catch (error) {
      console.error("Erreur Jikan:", error.message);
    }

    await sleep(900);
  }

  return null;
}



function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
  ]);
}

async function getAnimeById(malId) {
  if (!malId) return null;

  try {
    let response = await fetch(`https://api.jikan.moe/v4/anime/${malId}/full`);
    if (response.ok) {
      const json = await response.json();
      if (json.data) return mapJikanAnime(json.data, json.data.title);
    }
  } catch (e) {}

  try {
    let response = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
    if (response.ok) {
      const json = await response.json();
      if (json.data) return mapJikanAnime(json.data, json.data.title);
    }
  } catch (e) {}

  return null;
}


async function searchAniListImage(title) {
  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          title { romaji english native }
          coverImage { extraLarge large medium }
        }
      }
    `;

    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ query, variables: { search: title } })
    });

    if (!response.ok) return "";
    const json = await response.json();
    const cover = json?.data?.Media?.coverImage;
    return cover?.extraLarge || cover?.large || cover?.medium || "";
  } catch (e) {
    return "";
  }
}

async function searchBestImageUrl(title) {
  const attempts = [
    title,
    String(title || "").replace(/[:\-].*$/g, "").trim(),
    String(title || "").replace(/\([^)]*\)/g, "").trim(),
    String(title || "").replace(/\b(TV|Movie|Season|Saison|Part|OVA|ONA|Special)\b/gi, "").trim()
  ].filter(Boolean);

  for (const q of [...new Set(attempts)]) {
    try {
      const found = await searchJikan(q);
      if (found?.imageUrl) return found.imageUrl;
    } catch (e) {}
    await sleep(350);
  }

  for (const q of [...new Set(attempts)]) {
    const ani = await searchAniListImage(q);
    if (ani) return ani;
    await sleep(350);
  }

  return "";
}

async function downloadImage(imageUrl, title) {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Image introuvable");

  const contentType = response.headers.get("content-type") || "";
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const filename = `${slugify(title)}-${Date.now()}.${extension}`;
  const filepath = path.join(IMAGES_DIR, filename);

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(arrayBuffer));

  return `/images/${filename}`;
}

function mergeAutoInfo(anime, found, overwrite = false) {
  if (!found) return anime;

  const fields = ["type", "episodesTotal", "startDate", "endDate", "publicScore", "rank", "popularity", "members", "malUrl", "synopsis", "malId"];
  for (const field of fields) {
    if (overwrite || !anime[field]) anime[field] = found[field] || anime[field] || "";
  }

  if (overwrite || !anime.genres || anime.genres.length === 0) anime.genres = found.genres || [];
  return anime;
}





function nextId(animes) {
  return (Array.isArray(animes) ? animes : []).reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1;
}

function normalizeTitle(title) {
  return String(title || "").trim().toLowerCase();
}

function nextAnimeId(animes) {
  return animes.reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1;
}

function mergeImportedAnime(existing, incoming, overwrite) {
  if (overwrite) return { ...existing, ...incoming, id: existing.id, poster: existing.poster || incoming.poster || "" };
  const merged = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "id") continue;
    if ((merged[key] === "" || merged[key] == null || (Array.isArray(merged[key]) && merged[key].length === 0)) && value) merged[key] = value;
  }
  return merged;
}

async function getRelations(malId) {
  if (!malId) return [];
  try {
    const response = await fetch(`https://api.jikan.moe/v4/anime/${malId}/relations`);
    if (!response.ok) return [];
    const json = await response.json();
    return json.data || [];
  } catch (e) { return []; }
}

function nextSeasonFromRelations(relations, existingTitles) {
  const candidates = [];
  for (const relation of relations || []) {
    if (!["Sequel", "Side story", "Spin-off"].includes(relation.relation)) continue;
    for (const entry of relation.entry || []) {
      if (entry.type !== "anime") continue;
      if (!existingTitles.has(normalizeTitle(entry.name))) candidates.push({ title: entry.name, type: entry.type, relation: relation.relation, url: entry.url, malId: entry.mal_id });
    }
  }
  return candidates;
}


function xmlDecode(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function getTag(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? xmlDecode(match[1]) : "";
}

function normalizeMalStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "completed") return "Completed";
  if (s === "watching") return "Watching";
  if (s === "on-hold" || s === "on hold") return "On-Hold";
  if (s === "dropped") return "Dropped";
  if (s === "plan to watch" || s === "plantowatch" || s === "ptw") return "Plan to Watch";
  return status || "Completed";
}

function parseMalXml(xmlText) {
  const blocks = String(xmlText).match(/<anime>[\s\S]*?<\/anime>/gi) || [];

  return blocks.map(block => {
    const title = getTag(block, "series_title") || getTag(block, "title");
    if (!title) return null;

    const myTags = getTag(block, "my_tags");
    const notes = getTag(block, "my_comments");

    return {
      title,
      status: normalizeMalStatus(getTag(block, "my_status") || "Completed"),
      score: getTag(block, "my_score") || "",
      episodesSeen: getTag(block, "my_watched_episodes") || "0",
      episodesTotal: getTag(block, "series_episodes") || "",
      type: getTag(block, "series_type") || "TV",
      tags: myTags ? myTags.split(",").map(x => x.trim()).filter(Boolean) : [],
      poster: "",
      malUrl: "",
      notes: notes || "",
      startDate: "",
      endDate: "",
      publicScore: "",
      rank: "",
      popularity: "",
      members: "",
      genres: [],
      synopsis: "",
      relations: [],
      nextSeasonCandidates: []
    };
  }).filter(Boolean);
}


app.get("/api/animes", (req, res) => {
  res.json(readAnimes());
});

app.post("/api/animes", async (req, res) => {
  const animes = readAnimes();
  const body = req.body || {};
  const nextId = animes.reduce((max, a) => Math.max(max, Number(a.id) || 0), 0) + 1;

  let anime = {
    id: nextId,
    title: String(body.title || "").trim(),
    status: body.status || "Watching",
    score: body.score || "",
    episodesSeen: body.episodesSeen || "",
    episodesTotal: body.episodesTotal || "",
    type: body.type || "TV",
    tags: Array.isArray(body.tags) ? body.tags : [],
    poster: body.poster || "",
    malUrl: body.malUrl || "",
    notes: body.notes || "",
    startDate: body.startDate || "",
    endDate: body.endDate || "",
    publicScore: body.publicScore || "",
    rank: body.rank || "",
    popularity: body.popularity || "",
    members: body.members || "",
    genres: Array.isArray(body.genres) ? body.genres : [],
    synopsis: body.synopsis || ""
  };

  if (!anime.title) return res.status(400).json({ error: "Titre obligatoire." });

  if (body.autoInfo !== false) {
    try {
      const found = await searchJikan(anime.title);
      anime = mergeAutoInfo(anime, found, false);

      if (!anime.poster && found?.imageUrl) {
        anime.poster = await downloadImage(found.imageUrl, anime.title);
      }
    } catch (error) {
      console.error("Infos automatiques non récupérées:", error.message);
    }
  }

  animes.push(anime);
  writeAnimes(animes);
  res.json(anime);
});

app.put("/api/animes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const animes = readAnimes();
  const index = animes.findIndex(a => Number(a.id) === id);
  if (index === -1) return res.status(404).json({ error: "Anime introuvable." });

  animes[index] = { ...animes[index], ...req.body, id };
  writeAnimes(animes);
  res.json(animes[index]);
});

app.delete("/api/animes/:id", (req, res) => {
  const id = Number(req.params.id);
  const animes = readAnimes();
  const filtered = animes.filter(a => Number(a.id) !== id);
  writeAnimes(filtered);
  res.json({ ok: true });
});


app.post("/api/animes/:id/download-image", async (req, res) => {
  const id = Number(req.params.id);
  const query = String(req.body?.query || "").trim();

  const animes = readAnimes();
  const anime = animes.find(a => Number(a.id) === id);
  if (!anime) return res.status(404).json({ error: "Anime introuvable." });

  try {
    const imageUrl = await searchBestImageUrl(query || anime.title);
    if (!imageUrl) return res.status(404).json({ error: "Image introuvable." });

    anime.poster = await downloadImage(imageUrl, anime.title);
    writeAnimes(animes);

    res.json({ ok: true, anime });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/animes/:id/refresh-info", async (req, res) => {
  const id = Number(req.params.id);
  const animes = readAnimes();
  const anime = animes.find(a => Number(a.id) === id);
  if (!anime) return res.status(404).json({ error: "Anime introuvable." });

  try {
    const found = await searchJikan(req.body?.query || anime.title);
    if (!found) return res.status(404).json({ error: "Informations non trouvées." });

    mergeAutoInfo(anime, found, req.body?.overwrite === true);

    if (!anime.poster && found.imageUrl) {
      anime.poster = await downloadImage(found.imageUrl, anime.title);
    }

    writeAnimes(animes);
    res.json(anime);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/bulk/missing-images", async (req, res) => {
  const animes = readAnimes();
  const missing = animes.filter(a => !a.poster);
  let success = 0;
  let failed = 0;

  for (const anime of missing) {
    try {
      const found = await searchJikan(anime.title);
      mergeAutoInfo(anime, found, false);

      if (found?.imageUrl) {
        anime.poster = await downloadImage(found.imageUrl, anime.title);
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      console.error("Image manquante:", anime.title, error.message);
    }

    await sleep(1200);
  }

  writeAnimes(animes);
  res.json({ ok: true, total: missing.length, success, failed });
});



app.post("/api/bulk/refresh-one", async (req, res) => {
  const id = Number(req.body?.id);
  const overwrite = req.body?.overwrite === true;
  const animes = readAnimes();
  const anime = animes.find(a => Number(a.id) === id);
  if (!anime) return res.status(404).json({ error: "Anime introuvable." });

  try {
    const found = await searchJikan(anime.title);
    if (found) {
      mergeAutoInfo(anime, found, overwrite);
      if (found.malId) anime.relations = await getRelations(found.malId);
    }

    if (!anime.poster) {
      const imageUrl = found?.imageUrl || await searchBestImageUrl(anime.title);
      if (imageUrl) anime.poster = await downloadImage(imageUrl, anime.title);
    }

    writeAnimes(animes);
    return res.json({ ok: true, success: Boolean(found || anime.poster), anime });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post("/api/news/detail-one", async (req, res) => {
  const item = req.body || {};

  try {
    const details = await searchNewsDetailsAllMethods(item);

    if (!details) {
      return res.json({ ok: true, success: false, item });
    }

    res.json({ ok: true, success: true, item: details });
  } catch (error) {
    console.error("News detail-one error:", error.message);
    res.json({ ok: true, success: false, item });
  }
});

app.post("/api/bulk/refresh-info", async (req, res) => {
  const animes = readAnimes();
  let success = 0;
  let failed = 0;

  for (const anime of animes) {
    try {
      const found = await searchJikan(anime.title);
      if (found) {
        mergeAutoInfo(anime, found, req.body?.overwrite === true);
        if (!anime.poster && found.imageUrl) {
          anime.poster = await downloadImage(found.imageUrl, anime.title);
        }
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      failed++;
      console.error("Infos non trouvées:", anime.title, error.message);
    }

    await sleep(1200);
  }

  writeAnimes(animes);
  res.json({ ok: true, total: animes.length, success, failed });
});



app.post("/api/import/xml", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fichier XML manquant." });

  const overwrite = String(req.body.overwrite || "false") === "true";
  const xmlText = req.file.buffer.toString("utf8");
  const imported = parseMalXml(xmlText);

  const animes = readAnimes();
  const byTitle = new Map(animes.map(a => [normalizeTitle(a.title), a]));

  let added = 0;
  let updated = 0;
  let ignored = 0;

  for (const incoming of imported) {
    const key = normalizeTitle(incoming.title);
    const existing = byTitle.get(key);

    if (existing) {
      const index = animes.findIndex(a => Number(a.id) === Number(existing.id));
      if (overwrite) {
        animes[index] = { ...existing, ...incoming, id: existing.id, poster: existing.poster || incoming.poster || "" };
      } else {
        for (const [field, value] of Object.entries(incoming)) {
          if (field === "id") continue;
          if ((animes[index][field] === "" || animes[index][field] == null || (Array.isArray(animes[index][field]) && animes[index][field].length === 0)) && value) {
            animes[index][field] = value;
          }
        }
      }
      updated++;
    } else {
      incoming.id = nextId(animes);
      animes.push(incoming);
      byTitle.set(key, incoming);
      added++;
    }
  }

  writeAnimes(animes);
  res.json({ ok: true, total: imported.length, added, updated, ignored, overwrite });
});



function simplifyAnimeTitleForSearch(title) {
  return String(title || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(TV|Movie|OVA|ONA|Special)\b/gi, " ")
    .replace(/\b(Season|Saison|Part|Cour)\b.*$/gi, " ")
    .replace(/[:\-].*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchAniListDetails(title) {
  try {
    const query = `
      query ($search: String) {
        Media(search: $search, type: ANIME) {
          title { romaji english native }
          description(asHtml: false)
          episodes
          type
          startDate { year month day }
          endDate { year month day }
          averageScore
          popularity
          genres
          coverImage { extraLarge large medium }
          siteUrl
        }
      }
    `;

    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ query, variables: { search: title } })
    });

    if (!response.ok) return null;

    const media = (await response.json())?.data?.Media;
    if (!media) return null;

    const dateToString = (d) => {
      if (!d || !d.year) return "";
      const m = String(d.month || 1).padStart(2, "0");
      const day = String(d.day || 1).padStart(2, "0");
      return `${d.year}-${m}-${day}`;
    };

    return {
      title: media.title?.romaji || media.title?.english || title,
      imageUrl: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || "",
      synopsis: media.description || "",
      type: media.type || "",
      episodesTotal: media.episodes || "",
      startDate: dateToString(media.startDate),
      endDate: dateToString(media.endDate),
      publicScore: media.averageScore ? (Number(media.averageScore) / 10).toFixed(2) : "",
      rank: "",
      popularity: media.popularity || "",
      genres: media.genres || [],
      malUrl: media.siteUrl || ""
    };
  } catch (e) {
    return null;
  }
}

async function searchNewsDetailsAllMethods(item) {
  let details = null;

  if (item?.malId && typeof getAnimeById === "function") {
    try { details = await getAnimeById(item.malId); } catch (e) {}
  }

  if (!details && item?.url && typeof getAnimeById === "function") {
    const match = String(item.url).match(/\/anime\/(\d+)/);
    if (match) {
      try { details = await getAnimeById(match[1]); } catch (e) {}
    }
  }

  const titles = [
    item?.title,
    simplifyAnimeTitleForSearch(item?.title),
    String(item?.title || "").replace(/\b\d+(st|nd|rd|th)?\s+Season\b/gi, "").trim(),
    String(item?.title || "").replace(/Movie|OVA|ONA|Special/gi, "").trim()
  ].filter(Boolean);

  for (const title of [...new Set(titles)]) {
    if (details) break;
    try { details = await searchJikan(title); } catch (e) {}
    if (!details) {
      try { details = await searchAniListDetails(title); } catch (e) {}
    }
    await sleep(450);
  }

  if (!details) return null;

  return {
    ...item,
    imageUrl: details.imageUrl || item.imageUrl || "",
    synopsis: details.synopsis || item.synopsis || "",
    type: details.type || item.type || "",
    episodesTotal: details.episodesTotal || item.episodesTotal || "",
    startDate: details.startDate || item.startDate || "",
    endDate: details.endDate || item.endDate || "",
    publicScore: details.publicScore || item.publicScore || "",
    rank: details.rank || item.rank || "",
    genres: details.genres || item.genres || [],
    url: details.malUrl || item.url || "",
    malId: details.malId || item.malId || ""
  };
}

async function resolveNewsDetails(item) {
  return await searchNewsDetailsAllMethods(item);
}

app.post("/api/news/seasons", async (req, res) => {
  const force = req.body?.force === true;

  if (!force) {
    const cached = readNewsResults();
    if (cached.length > 0) {
      return res.json({ ok: true, cached: true, checked: 0, count: cached.length, news: cached });
    }
  }

  const animes = readAnimes();
  const ignored = new Set(readIgnoredNews().map(x => normalizeTitle(x.title)));
  const existingTitles = new Set(animes.map(a => normalizeTitle(a.title)));
  const checkedStatuses = new Set(["Watching", "Completed", "On-Hold"]);
  const targets = animes.filter(a => checkedStatuses.has(a.status));
  const seenNews = new Set();
  const news = [];

  for (const anime of targets) {
    try {
      let malId = anime.malId;
      if (!malId) {
        const found = await searchJikan(anime.title);
        if (found) {
          mergeAutoInfo(anime, found, false);
          malId = found.malId;
        }
      }

      if (malId) {
        const relations = await getRelations(malId);
        anime.relations = relations;
        const candidates = nextSeasonFromRelations(relations, existingTitles);
        anime.nextSeasonCandidates = candidates;

        for (const c of candidates) {
          const key = normalizeTitle(c.title);
          if (ignored.has(key) || seenNews.has(key)) continue;
          seenNews.add(key);

          news.push({
            sourceTitle: anime.title,
            title: c.title,
            relation: c.relation,
            url: c.url,
            malId: c.malId,
            imageUrl: "",
            synopsis: "",
            type: "",
            episodesTotal: "",
            startDate: "",
            endDate: "",
            publicScore: "",
            rank: "",
            genres: []
          });
        }
      }
    } catch (e) {
      console.error("News saison non récupérée:", anime.title, e.message);
    }

    await sleep(1200);
  }

  writeAnimes(animes);
  writeNewsResults(news);
  res.json({ ok: true, cached: false, checked: targets.length, count: news.length, news });
});




app.post("/api/news/details/bulk", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : readNewsResults();
  const resolved = [];

  for (const item of items) {
    try {
      const details = await searchNewsDetailsAllMethods(item);
      resolved.push(details || item);
    } catch (e) {
      resolved.push(item);
    }
    await sleep(700);
  }

  writeNewsResults(resolved);
  res.json({ ok: true, items: resolved });
});

app.post("/api/news/results/save", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  writeNewsResults(items);
  res.json({ ok: true, count: items.length });
});

app.post("/api/news/add-to-plan", async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Titre manquant." });

  const animes = readAnimes();

  if (animes.some(a => normalizeTitle(a.title) === normalizeTitle(title))) {
    return res.json({ ok: true, alreadyExists: true });
  }

  const item = req.body || {};
  const anime = {
    id: nextId(animes),
    title,
    status: "Plan to Watch",
    score: "",
    episodesSeen: "0",
    episodesTotal: item.episodesTotal || "",
    type: item.type || "TV",
    tags: ["nouvelle saison"],
    poster: "",
    malUrl: item.url || "",
    notes: item.sourceTitle ? `Suite détectée depuis : ${item.sourceTitle}` : "",
    startDate: item.startDate || "",
    endDate: item.endDate || "",
    publicScore: item.publicScore || "",
    rank: item.rank || "",
    popularity: "",
    members: "",
    genres: Array.isArray(item.genres) ? item.genres : [],
    synopsis: item.synopsis || "",
    relations: [],
    nextSeasonCandidates: []
  };

  animes.push(anime);
  writeAnimes(animes);

  const remaining = readNewsResults().filter(x => normalizeTitle(x.title) !== normalizeTitle(title));
  writeNewsResults(remaining);

  res.json({ ok: true, anime });
});


app.get("/api/config", (req, res) => {
  res.json({ storageMode: "local-json" });
});


function safeReadJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function createBackupPayload() {
  return {
    app: "Anime Local Manager",
    version: typeof BACKUP_VERSION !== "undefined" ? BACKUP_VERSION : "1.0.0",
    createdAt: new Date().toISOString(),
    data: {
      animes: readAnimes(),
      ignoredNews: typeof IGNORED_NEWS_FILE !== "undefined" ? safeReadJsonFile(IGNORED_NEWS_FILE, []) : [],
      newsCache: typeof NEWS_CACHE_FILE !== "undefined" ? safeReadJsonFile(NEWS_CACHE_FILE, {}) : {},
      newsResults: typeof NEWS_RESULTS_FILE !== "undefined" ? safeReadJsonFile(NEWS_RESULTS_FILE, []) : [],
      config: { storageMode: "local-json" }
    }
  };
}


app.get("/api/backup/export", (req, res) => {
  const payload = createBackupPayload();
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename=anime-local-manager-backup-${date}.json`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(payload, null, 2));
});


function localPosterFileExists(poster) {
  if (!poster) return false;
  const normalized = String(poster).replace(/\\/g, "/");
  if (normalized.includes("/images/")) {
    const filename = path.basename(normalized);
    return fs.existsSync(path.join(IMAGES_DIR, filename));
  }
  return false;
}

function normalizeRestoredAnimeImages(animes) {
  return (Array.isArray(animes) ? animes : []).map(anime => {
    const copy = { ...anime };
    if (copy.poster && !localPosterFileExists(copy.poster)) copy.poster = "";
    return copy;
  });
}

app.post("/api/backup/restore", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Fichier de sauvegarde manquant." });

  try {
    const payload = JSON.parse(req.file.buffer.toString("utf8"));
    const data = payload.data || payload;

    if (Array.isArray(data.animes)) writeAnimes(normalizeRestoredAnimeImages(data.animes));
    if (Array.isArray(data.ignoredNews)) writeIgnoredNews(data.ignoredNews);
    if (data.newsCache && typeof data.newsCache === "object") writeNewsCache(data.newsCache);
    if (data.config && typeof data.config === "object") writeConfig(data.config);

    
    res.json({ ok: true, restored: true });
  } catch (error) {
    res.status(400).json({ error: "Sauvegarde invalide : " + error.message });
  }
});

app.get("/api/export", (req, res) => {
  res.download(DATA_FILE, "animes.json");
});

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`Anime Local Manager V1 lance : http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer(PORT);
}

module.exports = { app, startServer, PORT };
