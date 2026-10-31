"use strict";

function normalizePersonName(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function personNameKey(value) {
  const normalized = normalizePersonName(value);
  if (!normalized) return "";
  // Jikan et AniList n'emploient pas toujours le même ordre pour les noms
  // japonais ("Hayao Miyazaki" / "Miyazaki Hayao"). Un tri des mots rend la
  // fusion multi-source stable sans dépendre d'une translittération précise.
  const words = normalized.split(" ").filter(Boolean);
  return words.length > 1 ? words.sort().join(" ") : normalized;
}

function textList(value) {
  return Array.isArray(value) ? value.map(item => String(item || "").trim()).filter(Boolean) : [];
}

const CREATOR_ROLE_RULES = [
  { pattern: /original creator|original story|story\s*(?:&|and)\s*art|manga original|original author|creator/i, priority: 100 },
  { pattern: /\bstory\b|scenario|screenplay|script|series composition|composition|series script/i, priority: 88 },
  { pattern: /\bart\b|manga|author|novel original|original work|original concept|source material/i, priority: 84 },
  { pattern: /character design|original character design/i, priority: 68 },
  { pattern: /^(?:chief |series )?director(?:\s*\([^)]*\))?$/i, priority: 56 }
];

function creatorRolePriority(role) {
  const text = String(role || "").trim();
  // Ne pas faire remonter par erreur les métiers qui contiennent « Director »
  // sans désigner la personne qui porte la création de l'œuvre.
  if (/sound|audio|music|theme song|insert song|adr script|background art|color design|art director|photograph|animation director|episode director|cg director|3d director/i.test(text)) return 0;
  for (const rule of CREATOR_ROLE_RULES) if (rule.pattern.test(text)) return rule.priority;
  return 0;
}

function normalizePerson(raw, defaults = {}) {
  if (!raw) return null;
  const id = raw.id ?? raw.malId ?? raw.mal_id ?? raw.anilistId ?? "";
  const name = String(raw.name || raw.fullName || raw?.nameData?.full || raw?.nameData?.userPreferred || "").trim();
  if (!name) return null;
  return {
    id: id === null || id === undefined ? "" : String(id),
    malId: raw.malId ?? raw.mal_id ?? defaults.malId ?? "",
    anilistId: raw.anilistId ?? defaults.anilistId ?? "",
    name,
    nativeName: String(raw.nativeName || raw?.nameData?.native || "").trim(),
    role: String(raw.role || defaults.role || "").trim(),
    imageUrl: String(raw.imageUrl || raw?.images?.jpg?.image_url || raw?.image?.large || raw?.image?.medium || "").trim(),
    source: String(raw.source || defaults.source || "").trim(),
    priority: Number((raw.priority ?? defaults.priority ?? creatorRolePriority(raw.role || defaults.role)) || 0)
  };
}

function mergePeople(groups, limit = 8) {
  const byKey = new Map();
  for (const raw of (Array.isArray(groups) ? groups.flat(Infinity) : [])) {
    const person = normalizePerson(raw);
    if (!person) continue;
    const key = personNameKey(person.name) || personNameKey(person.nativeName) || `id:${person.source}:${person.id}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...person, sources: textList([person.source]) });
      continue;
    }
    current.malId ||= person.malId;
    current.anilistId ||= person.anilistId;
    current.id ||= person.id;
    current.nativeName ||= person.nativeName;
    current.imageUrl ||= person.imageUrl;
    if (person.priority > current.priority) {
      current.role = person.role || current.role;
      current.priority = person.priority;
    }
    current.sources = [...new Set([...(current.sources || []), person.source].filter(Boolean))];
    current.source = current.sources.join(" + ");
  }
  return [...byKey.values()]
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.name.localeCompare(b.name, "fr"))
    .slice(0, limit);
}

function parseJikanAnimeStaff(json) {
  const people = [];
  for (const row of Array.isArray(json?.data) ? json.data : []) {
    const rawPositions = Array.isArray(row?.positions)
      ? row.positions
      : [row?.positions, row?.position, row?.role];
    const positions = textList(rawPositions);
    for (const role of positions) {
      const priority = creatorRolePriority(role);
      if (!priority) continue;
      people.push(normalizePerson({
        id: row?.person?.mal_id,
        malId: row?.person?.mal_id,
        name: row?.person?.name,
        role,
        imageUrl: row?.person?.images?.jpg?.image_url,
        source: "Jikan",
        priority
      }));
    }
  }
  return mergePeople(people, 10);
}

function parseJikanVoiceActors(json) {
  const people = [];
  for (const character of Array.isArray(json?.data) ? json.data : []) {
    const charPriority = String(character?.role || "").toLowerCase() === "main" ? 100 : 55;
    for (const voice of Array.isArray(character?.voice_actors) ? character.voice_actors : []) {
      const language = String(voice?.language || voice?.languageCode || "").toLowerCase();
      if (language && !/japanese|ja-jp|^ja$/.test(language)) continue;
      people.push(normalizePerson({
        id: voice?.person?.mal_id,
        malId: voice?.person?.mal_id,
        name: voice?.person?.name,
        imageUrl: voice?.person?.images?.jpg?.image_url,
        role: character?.character?.name ? `${character.character.name} · ${character.role || ""}` : (character?.role || "Voix japonaise"),
        source: "Jikan",
        priority: charPriority
      }));
    }
  }
  return mergePeople(people, 12);
}

function parseAniListCreators(json) {
  const people = [];
  for (const edge of Array.isArray(json?.data?.Media?.staff?.edges) ? json.data.Media.staff.edges : []) {
    const priority = creatorRolePriority(edge?.role);
    if (!priority) continue;
    people.push(normalizePerson({
      id: edge?.node?.id,
      anilistId: edge?.node?.id,
      name: edge?.node?.name?.userPreferred || edge?.node?.name?.full,
      nativeName: edge?.node?.name?.native,
      imageUrl: edge?.node?.image?.large || edge?.node?.image?.medium,
      role: edge?.role,
      source: "AniList",
      priority
    }));
  }
  return mergePeople(people, 10);
}

function parseAniListVoiceActors(json) {
  const people = [];
  for (const edge of Array.isArray(json?.data?.Media?.characters?.edges) ? json.data.Media.characters.edges : []) {
    const priority = String(edge?.role || "").toUpperCase() === "MAIN" ? 100 : 55;
    for (const voice of Array.isArray(edge?.voiceActors) ? edge.voiceActors : []) {
      people.push(normalizePerson({
        id: voice?.id,
        anilistId: voice?.id,
        name: voice?.name?.userPreferred || voice?.name?.full,
        nativeName: voice?.name?.native,
        imageUrl: voice?.image?.large || voice?.image?.medium,
        role: edge?.node?.name?.full ? `${edge.node.name.full} · ${edge.role || ""}` : (edge?.role || "Voix japonaise"),
        source: "AniList",
        priority
      }));
    }
  }
  return mergePeople(people, 12);
}

function jikanImages(anime) {
  return anime?.images?.webp?.large_image_url || anime?.images?.jpg?.large_image_url || anime?.images?.webp?.image_url || anime?.images?.jpg?.image_url || "";
}

function normalizeWork(raw, defaults = {}) {
  if (!raw) return null;
  const malId = raw.malId ?? raw.mal_id ?? raw?.anime?.mal_id ?? raw?.node?.idMal ?? "";
  const title = String(raw.title || raw?.anime?.title || raw?.node?.title?.english || raw?.node?.title?.romaji || raw?.node?.title?.native || "").trim();
  if (!title) return null;
  return {
    malId: malId === null || malId === undefined ? "" : String(malId),
    title,
    imageUrl: String(raw.imageUrl || jikanImages(raw?.anime || raw) || raw?.node?.coverImage?.extraLarge || raw?.node?.coverImage?.large || raw?.node?.coverImage?.medium || "").trim(),
    role: String(raw.role || raw.position || defaults.role || "").trim(),
    type: String(raw.type || raw?.anime?.type || raw?.node?.format || "").trim(),
    publicScore: raw.publicScore || (raw?.node?.averageScore ? Number(raw.node.averageScore) / 10 : "") || "",
    genres: Array.isArray(raw.genres) ? raw.genres : (Array.isArray(raw?.node?.genres) ? raw.node.genres : []),
    startDate: raw.startDate || (raw?.node?.startDate?.year ? `${raw.node.startDate.year}-${String(raw.node.startDate.month || 1).padStart(2, "0")}-${String(raw.node.startDate.day || 1).padStart(2, "0")}` : ""),
    source: String(raw.source || defaults.source || "").trim(),
    creatorName: raw.creatorName || defaults.creatorName || "",
    creatorRole: raw.creatorRole || defaults.creatorRole || "",
    seiyuuName: raw.seiyuuName || defaults.seiyuuName || ""
  };
}

function parseJikanPersonAnime(json, defaults = {}) {
  const rows = Array.isArray(json?.data?.anime)
    ? json.data.anime
    : (Array.isArray(json?.data?.animeography)
        ? json.data.animeography
        : (Array.isArray(json?.data) ? json.data : []));
  return rows.map(row => {
    const role = String(row?.position || row?.role || defaults.creatorRole || "").trim();
    // /people/{id}/anime contient toute la carrière de la personne. Pour la
    // section « même créateur », écarter ses rôles sans rapport (son, CGI,
    // production, etc.) afin de ne proposer que des œuvres réellement liées à
    // son travail d'auteur ou de direction créative.
    if (role && !creatorRolePriority(role)) return null;
    return normalizeWork({
      anime: row?.anime || row,
      role,
      source: "Jikan",
      ...defaults
    }, defaults);
  }).filter(Boolean);
}

function parseJikanPersonVoices(json, defaults = {}) {
  const rows = Array.isArray(json?.data?.voices)
    ? json.data.voices
    : (Array.isArray(json?.data?.voice_acting_roles)
        ? json.data.voice_acting_roles
        : (Array.isArray(json?.data) ? json.data : []));
  return rows.map(row => normalizeWork({
    anime: row?.anime || row,
    role: row?.character?.name || row?.role || "",
    source: "Jikan",
    ...defaults
  }, defaults)).filter(Boolean);
}

function isAniListAnimeNode(node) {
  const mediaType = String(node?.type || "").trim().toUpperCase();
  return !mediaType || mediaType === "ANIME";
}

function parseAniListStaffMedia(json, defaults = {}) {
  const edges = Array.isArray(json?.data?.Staff?.staffMedia?.edges) ? json.data.Staff.staffMedia.edges : [];
  return edges.map(edge => {
    if (!isAniListAnimeNode(edge?.node)) return null;
    const role = String(edge?.staffRole || defaults.creatorRole || "").trim();
    if (role && !creatorRolePriority(role)) return null;
    return normalizeWork({ node: edge?.node, role, source: "AniList", ...defaults }, defaults);
  }).filter(Boolean);
}

function parseAniListCharacterMedia(json, defaults = {}) {
  const edges = Array.isArray(json?.data?.Staff?.characterMedia?.edges) ? json.data.Staff.characterMedia.edges : [];
  return edges
    .filter(edge => isAniListAnimeNode(edge?.node))
    .map(edge => normalizeWork({ node: edge?.node, role: edge?.characterRole || "", source: "AniList", ...defaults }, defaults))
    .filter(Boolean);
}

/**
 * Secours AniList pour les voix : Staff.characters renvoie les personnages
 * doublés et, sur chaque arête, les médias concernés. Ce chemin est utile si
 * characterMedia est momentanément indisponible ou renvoie une connexion vide.
 */
function parseAniListStaffCharacters(json, defaults = {}) {
  const edges = Array.isArray(json?.data?.Staff?.characters?.edges) ? json.data.Staff.characters.edges : [];
  const works = [];
  for (const edge of edges) {
    const characterName = String(edge?.node?.name?.full || edge?.node?.name?.userPreferred || "").trim();
    const role = [characterName, edge?.role].filter(Boolean).join(" · ");
    for (const media of Array.isArray(edge?.media) ? edge.media : []) {
      if (!isAniListAnimeNode(media)) continue;
      const work = normalizeWork({ node: media, role, source: "AniList", ...defaults }, defaults);
      if (work) works.push(work);
    }
  }
  return works;
}

function mergeWorks(groups, options = {}) {
  const limit = Number(options.limit || 24);
  const excludedIds = new Set([...(options.excludeMalIds || [])].map(String));
  const excludedTitles = new Set([...(options.excludeTitles || [])].map(normalizePersonName));
  const byKey = new Map();
  for (const raw of (Array.isArray(groups) ? groups.flat(Infinity) : [])) {
    const work = normalizeWork(raw);
    if (!work) continue;
    const titleKey = normalizePersonName(work.title);
    if ((work.malId && excludedIds.has(String(work.malId))) || (titleKey && excludedTitles.has(titleKey))) continue;
    const key = work.malId ? `mal:${work.malId}` : `title:${titleKey}`;
    if (!key || key.endsWith(":")) continue;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...work, sources: textList([work.source]) });
      continue;
    }
    for (const field of ["imageUrl", "type", "publicScore", "startDate", "role", "creatorName", "creatorRole", "seiyuuName"]) current[field] ||= work[field];
    if ((!current.genres || !current.genres.length) && work.genres?.length) current.genres = work.genres;
    current.sources = [...new Set([...(current.sources || []), work.source].filter(Boolean))];
    current.source = current.sources.join(" + ");
  }
  return [...byKey.values()]
    .sort((a, b) => Number(b.publicScore || 0) - Number(a.publicScore || 0) || String(b.startDate || "").localeCompare(String(a.startDate || "")))
    .slice(0, limit);
}

module.exports = {
  creatorRolePriority,
  mergePeople,
  mergeWorks,
  normalizePersonName,
  personNameKey,
  normalizeWork,
  parseAniListCharacterMedia,
  parseAniListStaffCharacters,
  parseAniListCreators,
  parseAniListStaffMedia,
  parseAniListVoiceActors,
  parseJikanAnimeStaff,
  parseJikanPersonAnime,
  parseJikanPersonVoices,
  parseJikanVoiceActors
};
