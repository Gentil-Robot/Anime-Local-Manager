"use strict";

/**
 * Classification prudente des entrées provenant de catalogues mixtes
 * (BetaSeries, CSV personnels, etc.).
 *
 * Règle centrale : une source généraliste ne confirme jamais, à elle seule,
 * qu'un titre est un anime. La metadata locale, MyAnimeList/Jikan et AniList
 * constituent les preuves positives. TVMaze sert de preuve de série TV et les
 * conflits restent à valider manuellement.
 */

const ANIME_TYPES = new Set([
  "", "tv", "tv short", "movie", "film", "ova", "ona", "special",
  "tv special", "music", "pv", "cm", "unknown"
]);

const ANIME_SOURCE_RE = /(?:^|[^a-z])(?:localmetadata|metadata|jikan|myanimelist|mal|anilist)(?:$|[^a-z])/i;
const TV_SOURCE_RE = /(?:^|[^a-z])(?:tvmaze|tvdb|imdb|betaseries)(?:$|[^a-z])/i;

function normalizeMediaTitle(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\b(?:the|a|an|le|la|les|un|une|des)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleWords(value) {
  return normalizeMediaTitle(value).split(" ").filter(Boolean);
}

function titleSimilarity(a, b) {
  const aa = normalizeMediaTitle(a);
  const bb = normalizeMediaTitle(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 100;
  if ((aa.includes(bb) || bb.includes(aa)) && Math.min(aa.length, bb.length) >= 5) {
    const short=aa.length<bb.length?aa:bb,long=aa.length<bb.length?bb:aa;
    const coverage=short.split(' ').length/long.split(' ').length;
    // A common noun inside a long title is not identity evidence (Blood,
    // Reincarnation). Preserve useful full-root/subtitle matches.
    if(short.split(' ').length>=2&&coverage>=0.6)return 92;
  }

  const aw = new Set(titleWords(a).filter(word => word.length > 1));
  const bw = new Set(titleWords(b).filter(word => word.length > 1));
  if (!aw.size || !bw.size) return 0;
  let common = 0;
  for (const word of aw) if (bw.has(word)) common += 1;
  const precision = common / Math.max(aw.size, bw.size);
  const coverage = common / Math.min(aw.size, bw.size);
  return Math.round((precision * 0.7 + coverage * 0.3) * 100);
}

function candidateTitles(found) {
  if (!found || typeof found !== "object") return [];
  return [
    found.officialTitle,
    // `title` often echoes the imported query, rather than a source title.
    // Do not let that echo turn a partial subtitle match into an exact identity.
    ...(found.officialTitle ? [] : [found.title]),
    found.name,
    found.englishTitle,
    found.titleEn,
    found.romajiTitle,
    found.titleRomaji,
    found.title_english,
    found.title_japanese,
    ...(Array.isArray(found.synonyms) ? found.synonyms : [])
  ].map(value => String(value || "").trim()).filter(Boolean);
}

function candidateTitleScore(query, found) {
  const declared = Number(found?.matchingScore || 0);
  const calculated = candidateTitles(found).reduce(
    (best, title) => Math.max(best, titleSimilarity(query, title)),
    0
  );
  // Le score déclaré par une source/couche de cache n'est jamais une preuve en soi.
  // Il peut avoir été calculé sur une autre variante de titre et produisait des faux
  // 100 % (ex. Avatar -> Quanzhi Gaoshou Specials). On ne l'autorise à améliorer
  // le score que légèrement lorsque le titre courant est déjà réellement proche.
  if (!calculated) return 0;
  if (!Number.isFinite(declared) || declared <= calculated) return calculated;
  return calculated;
}

function extractYear(value) {
  const match = String(value || "").match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
  return match ? Number(match[1]) : 0;
}

function mediaYear(found) {
  return extractYear(found?.startDate || found?.premiered || found?.year || found?.seasonYear || "");
}

function minimumAnimeScore(title) {
  const normalized = normalizeMediaTitle(title);
  const words = normalized.split(" ").filter(Boolean);
  if (!normalized) return 100;
  if (/^\d{1,4}$/.test(normalized)) return 100;
  if (normalized.length <= 3) return 100;
  if (words.length === 1 && normalized.length <= 6) return 94;
  if (extractYear(title)) return 84;
  if (words.length <= 2) return 78;
  return 70;
}

function isAnimeType(value) {
  return ANIME_TYPES.has(String(value || "").trim().toLowerCase());
}

function hasStableAnimeId(found) {
  return Boolean(
    Number(found?.malId || found?.mal_id || found?.idMal || 0) > 0 ||
    Number(found?.anilistId || found?.aniListId || found?.idAniList || 0) > 0
  );
}

function isAnimeAuthority(found) {
  const source = String(found?.source || "");
  if (ANIME_SOURCE_RE.test(source)) return true;
  if (hasStableAnimeId(found)) return true;
  if (found?.verifiedAnime === true || found?.mediaKind === "anime") return true;
  if (found?.aliasSource === "manual") return true;
  return false;
}

function tvDescriptor(found) {
  return [
    found?.type,
    found?.language,
    ...(Array.isArray(found?.genres) ? found.genres : [])
  ].join(" ").toLowerCase();
}

function tvLooksAnimated(found) {
  return /\b(?:anime|animation|animated)\b/i.test(tvDescriptor(found));
}

function tvLooksJapaneseAnimation(found) {
  if (!tvLooksAnimated(found)) return false;
  const country = String(
    found?.network?.country?.code ||
    found?.webChannel?.country?.code ||
    found?.country?.code ||
    found?.country || ""
  ).toUpperCase();
  const language = String(found?.language || "").toLowerCase();
  return country === "JP" || /japanese|japonais/.test(language);
}

function animeEvidence(title, found) {
  if (!found) return {
    present: false, strong: false, exact: false, score: 0, source: "", year: 0,
    reason: "Aucune correspondance dans une base anime."
  };
  const score = candidateTitleScore(title, found);
  const source = String(found.source || "Source anime").trim();
  const authoritative = isAnimeAuthority(found);
  const validType = isAnimeType(found.type || found.format) && !/^(music|pv|cm|unknown)$/i.test(found.type || found.format || '');
  const required = minimumAnimeScore(title);
  const query = normalizeMediaTitle(title);
  const titles = candidateTitles(found).map(normalizeMediaTitle);
  const exactTitle = titles.includes(query);
  const subtitleOnly = found.aliasSource !== 'manual' && !exactTitle && titles.some(value => value.startsWith(query + ' ')) && /movie|film|ona|special|ova/i.test(found.type || found.format || '');
  const exact = !subtitleOnly && score >= (required >= 100 ? 100 : 96);
  const slots=require('./season-identity').titleSlot;
  const sourceSlot=slots(title),targetSlot=slots(found.officialTitle||found.title);
  const slotConflict=!!(sourceSlot.season&&targetSlot.season&&sourceSlot.season!==targetSlot.season);
  const strong = authoritative && validType && score >= required && !subtitleOnly && !slotConflict;
  const probable = authoritative && validType && score >= Math.max(55, required - 10);
  return {
    present: true,
    strong,
    probable,
    exact,
    score,
    required,
    source,
    year: mediaYear(found),
    authoritative,
    validType,
    subtitleOnly,
    slotConflict,
    malId: String(found.malId || found.mal_id || ""),
    reason: strong
      ? `Correspondance anime confirmée par ${source} (${score} %).`
      : `Correspondance anime insuffisante via ${source || "une source"} (${score} %, seuil ${required} %).`
  };
}

function tvEvidence(title, found) {
  if (!found) return {
    present: false, strong: false, exact: false, score: 0, source: "", year: 0,
    animated: false, japaneseAnimation: false
  };
  const score = candidateTitleScore(title, found);
  const source = String(found.source || "TVMaze").trim();
  const sourceLooksTv = TV_SOURCE_RE.test(source) || found.nonAnimeFallback === true;
  const exactThreshold = /^\d{1,4}$/.test(normalizeMediaTitle(title)) ? 100 : 96;
  const animated = tvLooksAnimated(found);
  const japaneseAnimation = tvLooksJapaneseAnimation(found);
  return {
    present: true,
    strong: sourceLooksTv && score >= 86,
    exact: sourceLooksTv && score >= exactThreshold,
    score,
    source,
    year: mediaYear(found),
    animated,
    japaneseAnimation,
    reason: sourceLooksTv
      ? `Série TV correspondante détectée via ${source} (${score} %).`
      : `Correspondance TV incertaine via ${source} (${score} %).`
  };
}

function buildEvidenceList(anime, tv) {
  const list = [];
  if (anime.present) list.push({
    kind: "anime", source: anime.source, score: anime.score,
    strong: anime.strong, year: anime.year || null
  });
  if (tv.present) list.push({
    kind: "tv", source: tv.source, score: tv.score,
    strong: tv.strong, year: tv.year || null, animated: tv.animated
  });
  return list;
}

function classifyImportCandidate({ title, animeFound = null, tvFound = null } = {}) {
  const query = String(title || "").trim();
  if (!query) return {
    classification: "ignored",
    reason: "Titre vide : entrée ignorée.",
    score: 0,
    confidence: 100,
    evidence: []
  };

  const anime = animeEvidence(query, animeFound);
  const tv = tvEvidence(query, tvFound);
  const queryYear = extractYear(query);
  const evidence = buildEvidenceList(anime, tv);

  if (anime.strong && tv.strong) {
    const animeYearMatches = Boolean(queryYear && anime.year === queryYear);
    const tvYearMatches = Boolean(queryYear && tv.year === queryYear);

    if (tvYearMatches && !animeYearMatches && !tv.animated) {
      return {
        classification: "non_anime",
        reason: `Le millésime ${queryYear} correspond à la série TV détectée, pas à la fiche anime.`,
        score: tv.score,
        confidence: tv.score,
        evidence,
        conflict: true
      };
    }
    if (animeYearMatches && !tvYearMatches) {
      return {
        classification: "anime",
        reason: `Anime confirmé : l’année ${queryYear} correspond à la fiche anime.`,
        score: anime.score,
        confidence: anime.score,
        evidence
      };
    }

    // TVMaze catalogue aussi des anime. Lorsque la base spécialisée confirme
    // précisément l'œuvre et que la fiche généraliste est elle-même marquée
    // animée, il ne s'agit pas d'un conflit live action : les deux sources se
    // corroborent. Sans cette règle, des titres courts comme « One Piece »
    // étaient inutilement envoyés en quarantaine.
    if (tv.animated && anime.exact) {
      return {
        classification: "anime",
        reason: `${anime.reason} La correspondance TV décrit également une œuvre animée.`,
        score: anime.score,
        confidence: anime.score,
        evidence
      };
    }
    if (anime.exact && !tv.exact) {
      return { classification: "anime", reason: anime.reason, score: anime.score, confidence: anime.score, evidence };
    }
    if (tv.exact && !anime.exact && !tv.animated) {
      return {
        classification: "non_anime",
        reason: `${tv.reason} La correspondance anime est moins précise.`,
        score: tv.score,
        confidence: tv.score,
        evidence,
        conflict: true
      };
    }
    if (anime.score >= tv.score + 8) {
      return { classification: "anime", reason: anime.reason, score: anime.score, confidence: anime.score, evidence };
    }
    if (tv.score >= anime.score + 8 && !tv.animated) {
      return {
        classification: "non_anime",
        reason: `${tv.reason} Elle est nettement plus précise que la correspondance anime.`,
        score: tv.score,
        confidence: tv.score,
        evidence,
        conflict: true
      };
    }
    return {
      classification: "review",
      reason: "Titre ambigu : une fiche anime et une série TV correspondent toutes les deux. Vérification manuelle nécessaire.",
      score: Math.max(anime.score, tv.score),
      confidence: Math.max(anime.score, tv.score),
      evidence,
      conflict: true
    };
  }

  if (anime.strong) {
    return { classification: "anime", reason: anime.reason, score: anime.score, confidence: anime.score, evidence };
  }

  if (tv.strong && tv.animated) {
    return {
      classification: "review",
      reason: tv.japaneseAnimation
        ? "Animation japonaise probable, mais aucune fiche anime spécialisée n’a été confirmée. Vérification manuelle nécessaire."
        : "Série animée détectée dans une base généraliste, sans confirmation MAL/AniList. Vérification manuelle nécessaire.",
      score: tv.score,
      confidence: tv.score,
      evidence
    };
  }

  if (tv.strong) {
    return {
      classification: "non_anime",
      reason: `${tv.reason} Aucune correspondance anime assez fiable n’a été trouvée.`,
      score: tv.score,
      confidence: tv.score,
      evidence
    };
  }

  if (anime.probable || anime.present || tv.present) {
    return {
      classification: "review",
      reason: anime.present
        ? anime.reason
        : "Une correspondance existe, mais elle n’est pas assez fiable pour décider automatiquement.",
      score: Math.max(anime.score, tv.score),
      confidence: Math.max(anime.score, tv.score),
      evidence
    };
  }

  return {
    classification: "review",
    reason: "Aucune correspondance fiable : l’entrée reste en quarantaine pour vérification.",
    score: 0,
    confidence: 0,
    evidence: []
  };
}

function normalizedTags(anime) {
  return new Set((Array.isArray(anime?.tags) ? anime.tags : [])
    .map(tag => normalizeMediaTitle(tag))
    .filter(Boolean));
}

function classifyLibraryEntry(anime, metadataMatch = null) {
  const tags = normalizedTags(anime);
  const title = String(anime?.title || "").trim();
  if (!title) return { classification: "ignored", confidence: 100, reason: "Fiche sans titre.", evidence: [] };

  const manualLibraryChoice = anime?.mediaKind === "manual" || anime?.manualLibraryChoice === true ||
    tags.has("conserve manuellement") || tags.has("choix manuel source");
  const userConfirmed = anime?.mediaKind === "anime" || manualLibraryChoice ||
    tags.has("anime confirme") || tags.has("anime verifie") || tags.has("anime confirme manuellement");
  const explicitlyNonAnime = anime?.mediaKind === "non_anime" || anime?.nonAnimeFallback === true ||
    tags.has("hors anime probable") || tags.has("non anime probable") || tags.has("serie tv probable") || tags.has("tvmaze");
  const importedFromMixedCatalog = tags.has("betaseries") || Boolean(anime?.betaseriesId);
  // Un nombre stocké dans `malId` ne suffit pas à prouver qu'il s'agit d'un
  // anime : les anciens imports de catalogues mixtes ont parfois réutilisé un
  // identifiant externe ou associé le mauvais titre. Seule une fiche réellement
  // retrouvée dans la metadata anime locale peut protéger automatiquement
  // l'entrée. Sans correspondance, elle reste contrôlable et réversible.
  const metadataEvidence = animeEvidence(title, metadataMatch || null);

  if (userConfirmed) {
    return {
      classification: "anime",
      confidence: 100,
      reason: manualLibraryChoice
        ? "Conservé volontairement dans la bibliothèque par l’utilisateur."
        : "Conservé comme anime par l’utilisateur.",
      evidence: []
    };
  }

  if (explicitlyNonAnime && metadataEvidence.strong) {
    return {
      classification: "review",
      confidence: 70,
      reason: "Conflit : la fiche est marquée série TV, mais une correspondance anime existe.",
      evidence: [{ kind: "anime", source: metadataEvidence.source, score: metadataEvidence.score }]
    };
  }

  if (explicitlyNonAnime) {
    return {
      classification: "non_anime",
      confidence: 98,
      reason: "Entrée complétée par TVMaze ou déjà marquée « hors anime probable ».",
      evidence: [{ kind: "tv", source: "TVMaze / marqueur local", score: 98 }]
    };
  }

  if (metadataEvidence.strong) {
    return {
      classification: "anime",
      confidence: metadataEvidence.score,
      reason: metadataEvidence.reason,
      evidence: [{ kind: "anime", source: metadataEvidence.source, score: metadataEvidence.score }]
    };
  }

  if (importedFromMixedCatalog) {
    return {
      classification: "review",
      confidence: 55,
      reason: "Import BetaSeries sans correspondance anime confirmée dans la metadata locale : vérification conseillée.",
      evidence: []
    };
  }

  return {
    classification: "anime",
    confidence: 50,
    reason: "Aucun signal suffisant pour classer cette fiche comme série TV.",
    evidence: []
  };
}

function stripNonAnimeMarkers(tags) {
  const blocked = new Set([
    "tvmaze", "hors anime probable", "non anime probable", "serie tv probable",
    "a verifier", "hors anime confirme"
  ]);
  return (Array.isArray(tags) ? tags : []).filter(tag => {
    const normalized = normalizeMediaTitle(tag);
    if (!normalized || blocked.has(normalized)) return false;
    // L'import ajoute parfois un libellé descriptif « TVMaze : Dexter ».
    // Il ne doit pas survivre lorsqu'une personne confirme explicitement que
    // la fiche est bien un anime.
    if (normalized.startsWith("tvmaze ")) return false;
    return true;
  });
}

function markAsConfirmedAnime(anime) {
  const tags = [...new Set([...stripNonAnimeMarkers(anime?.tags), "anime confirmé manuellement"])];
  const copy = { ...(anime || {}), tags, mediaKind: "anime", verifiedAnime: true };
  delete copy.nonAnimeFallback;
  delete copy.manualLibraryChoice;
  return copy;
}

/**
 * Conserve explicitement une fiche provenant d'un catalogue généraliste.
 *
 * Elle reste visible dans la bibliothèque et ne revient plus dans le contrôle
 * anime, mais elle n'est pas transformée en preuve MAL/AniList. Cela évite
 * qu'une série live action choisie volontairement devienne un faux alias anime
 * lors d'un import ultérieur.
 */
function markAsManualLibraryChoice(anime) {
  const tags = [...new Set([
    ...stripNonAnimeMarkers(anime?.tags),
    "conservé manuellement",
    "choix manuel source"
  ])];
  const copy = {
    ...(anime || {}),
    tags,
    mediaKind: "manual",
    manualLibraryChoice: true
  };
  delete copy.verifiedAnime;
  delete copy.nonAnimeFallback;
  return copy;
}

module.exports = {
  ANIME_TYPES,
  animeEvidence,
  candidateTitleScore,
  classifyImportCandidate,
  classifyLibraryEntry,
  extractYear,
  hasStableAnimeId,
  isAnimeAuthority,
  isAnimeType,
  markAsConfirmedAnime,
  markAsManualLibraryChoice,
  mediaYear,
  minimumAnimeScore,
  normalizeMediaTitle,
  stripNonAnimeMarkers,
  titleSimilarity,
  tvEvidence,
  tvLooksAnimated,
  tvLooksJapaneseAnimation
};
