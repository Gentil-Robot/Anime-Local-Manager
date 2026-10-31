"use strict";

/**
 * Calcul pur et comparable du radar Anime DNA.
 *
 * Chaque anime ne peut compter qu'une seule fois dans une même famille.
 * L'échelle est absolue : pourcentage de la bibliothèque totale. Les trois
 * axes Action, Fantasy et Aventure utilisent exactement les genres affichés
 * dans les bulles et le Top genres afin que leurs nombres restent identiques.
 */
(function initDnaRadarModule(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ALM_DNA_RADAR = api;
})(typeof window !== "undefined" ? window : globalThis, function dnaRadarFactory() {
  const FAMILIES = Object.freeze([
    Object.freeze({
      key: "action",
      label: "Action",
      primaryGenre: "Action",
      genres: ["Action"],
      description: "Animés possédant le genre Action."
    }),
    Object.freeze({
      key: "fantasy",
      label: "Fantasy",
      primaryGenre: "Fantasy",
      genres: ["Fantasy"],
      description: "Animés possédant le genre Fantasy."
    }),
    Object.freeze({
      key: "adventure",
      label: "Aventure",
      primaryGenre: "Adventure",
      genres: ["Adventure", "Aventure"],
      description: "Animés possédant le genre Adventure / Aventure."
    }),
    Object.freeze({
      key: "emotion",
      label: "Émotion",
      primaryGenre: "Drama",
      genres: ["Drama", "Romance", "Slice of Life", "Tranche de vie"],
      description: "Union de Drame, Romance et Tranche de vie."
    }),
    Object.freeze({
      key: "mystery",
      label: "Mystère",
      primaryGenre: "Mystery",
      genres: ["Mystery", "Suspense", "Psychological", "Horror", "Thriller", "Detective"],
      description: "Union de Mystère, Suspense, Psychologique, Horreur, Thriller et Détective."
    }),
    Object.freeze({
      key: "humor",
      label: "Humour",
      primaryGenre: "Comedy",
      genres: ["Comedy", "Comédie", "Parody", "Parodie", "Gag Humor"],
      description: "Union de Comédie, Parodie et Gag humor."
    })
  ]);

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[’']/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const FAMILY_KEYS = FAMILIES.map(family => ({
    ...family,
    normalizedGenres: new Set(family.genres.map(normalize))
  }));

  function animeGenreSet(anime) {
    const raw = Array.isArray(anime?.genres)
      ? anime.genres
      : String(anime?.genres || "").split(/[,;|]/g);
    return new Set(raw.map(normalize).filter(Boolean));
  }

  function buildAxes(animes) {
    const library = Array.isArray(animes) ? animes.filter(Boolean) : [];
    const total = library.length;
    const counts = new Map(FAMILY_KEYS.map(family => [family.key, 0]));

    for (const anime of library) {
      const genres = animeGenreSet(anime);
      if (!genres.size) continue;
      for (const family of FAMILY_KEYS) {
        const matched = [...family.normalizedGenres].some(genre => genres.has(genre));
        if (matched) counts.set(family.key, (counts.get(family.key) || 0) + 1);
      }
    }

    return FAMILY_KEYS.map(family => {
      const count = counts.get(family.key) || 0;
      const percent = total ? Math.round((count / total) * 100) : 0;
      return {
        key: family.key,
        label: family.label,
        count,
        total,
        percent: Math.max(0, Math.min(100, percent)),
        value: Math.max(0, Math.min(100, percent)),
        primaryGenre: family.primaryGenre,
        description: family.description,
        genres: [...family.genres]
      };
    });
  }

  return { FAMILIES, normalize, animeGenreSet, buildAxes };
});
