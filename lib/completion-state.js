"use strict";

function hasDisplayImage(anime) {
  return Boolean(String(anime?.poster || anime?.imageUrl || "").trim());
}

// Empreinte stable des champs qui déterminent si une fiche mérite une nouvelle
// tentative de complétion. Ce n'est pas un hash de sécurité : elle sert
// uniquement à éviter qu'une fiche inchangée et déjà tentée fasse réapparaître
// la bannière à chaque navigation.
function animeCompletionSignature(anime) {
  const genres = Array.isArray(anime?.genres)
    ? anime.genres.map(value => String(value || "").trim().toLowerCase()).filter(Boolean).sort()
    : [];
  const synopsis = String(anime?.synopsis || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return JSON.stringify({
    title: String(anime?.title || "").trim().toLowerCase(),
    malId: String(anime?.malId || ""),
    anilistId: String(anime?.anilistId || ""),
    verifiedAnime: anime?.verifiedAnime === true,
    mediaKind: String(anime?.mediaKind || "").toLowerCase(),
    type: String(anime?.type || anime?.format || "").trim().toLowerCase(),
    startDate: String(anime?.startDate || anime?.year || "").trim(),
    endDate: String(anime?.endDate || "").trim(),
    episodesTotal: String(anime?.episodesTotal || anime?.episodes || "").trim(),
    importedProgress: String(anime?.betaseriesEpisode||''),
    unallocated: Number(anime?.unallocatedEpisodes)||0,
    progressResolution: anime?.progressResolution?.fingerprint||'',
    provisionalSeason: Number(anime?.manualSeasonNumber||anime?.betaseriesSeason)||0,
    genres,
    synopsisSize: synopsis.length,
    image: hasDisplayImage(anime) ? 1 : 0
  });
}

function autoCompletionAttemptIsCurrent(anime) {
  const stored = String(anime?.autoCompletionSignature || "");
  return Boolean(stored && stored === animeCompletionSignature(anime));
}

module.exports = {
  animeCompletionSignature,
  autoCompletionAttemptIsCurrent
};
