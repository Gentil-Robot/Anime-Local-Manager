"use strict";

const recoPeople = require("./recommendation-people");

// AniList limite ces connexions à 25 éléments par page. La pagination se base
// exclusivement sur hasNextPage : total/lastPage ne sont pas assez fiables.
const STAFF_MEDIA_QUERY = `
  query StaffAnime($id: Int!, $page: Int!) {
    Staff(id: $id) {
      staffMedia(type: ANIME, page: $page, perPage: 25, sort: [POPULARITY_DESC]) {
        pageInfo { hasNextPage currentPage }
        edges {
          staffRole
          node {
            idMal type format averageScore genres
            title { romaji english native }
            coverImage { extraLarge large medium }
            startDate { year month day }
          }
        }
      }
    }
  }
`;

const CHARACTER_MEDIA_QUERY = `
  query VoiceAnime($id: Int!, $page: Int!) {
    Staff(id: $id) {
      characterMedia(page: $page, perPage: 25, sort: [POPULARITY_DESC]) {
        pageInfo { hasNextPage currentPage }
        edges {
          characterRole
          node {
            idMal type format averageScore genres
            title { romaji english native }
            coverImage { extraLarge large medium }
            startDate { year month day }
          }
        }
      }
    }
  }
`;

// Secours indépendant : Staff.characters expose les personnages doublés et,
// sur chaque arête, les médias associés. Ce chemin évite un résultat vide si
// characterMedia est momentanément indisponible.
const STAFF_CHARACTERS_QUERY = `
  query VoiceCharacters($id: Int!, $page: Int!) {
    Staff(id: $id) {
      characters(page: $page, perPage: 25) {
        pageInfo { hasNextPage currentPage }
        edges {
          role
          node { name { full userPreferred } }
          media {
            idMal type format averageScore genres
            title { romaji english native }
            coverImage { extraLarge large medium }
            startDate { year month day }
          }
        }
      }
    }
  }
`;

async function fetchConnectionPages({ request, personId, query, connectionName, parser, defaults, maxPages, limit }) {
  if (typeof request !== "function") throw new TypeError("request AniList manquante");
  const groups = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const json = await request(query, { id: Number(personId), page });
    if (!json?.data?.Staff) throw new Error("Personne AniList introuvable");
    groups.push(parser(json, defaults));
    if (json.data.Staff?.[connectionName]?.pageInfo?.hasNextPage !== true) break;
  }
  return recoPeople.mergeWorks(groups, { limit });
}

async function fetchStaffFilmography({ request, personId, kind, defaults = {} }) {
  const id = Number(personId);
  if (!Number.isFinite(id) || id < 1) return [];

  if (kind === "creator") {
    return fetchConnectionPages({
      request,
      personId: id,
      query: STAFF_MEDIA_QUERY,
      connectionName: "staffMedia",
      parser: recoPeople.parseAniListStaffMedia,
      defaults,
      maxPages: 2,
      limit: 50
    });
  }

  const errors = [];
  try {
    const primary = await fetchConnectionPages({
      request,
      personId: id,
      query: CHARACTER_MEDIA_QUERY,
      connectionName: "characterMedia",
      parser: recoPeople.parseAniListCharacterMedia,
      defaults,
      maxPages: 4,
      limit: 90
    });
    if (primary.length) return primary;
  } catch (error) {
    errors.push(`characterMedia: ${error?.message || error}`);
  }

  try {
    const fallback = await fetchConnectionPages({
      request,
      personId: id,
      query: STAFF_CHARACTERS_QUERY,
      connectionName: "characters",
      parser: recoPeople.parseAniListStaffCharacters,
      defaults,
      maxPages: 4,
      limit: 90
    });
    if (fallback.length) return fallback;
  } catch (error) {
    errors.push(`characters: ${error?.message || error}`);
  }

  if (errors.length) throw new Error([...new Set(errors)].join(" ; "));
  return [];
}

module.exports = {
  CHARACTER_MEDIA_QUERY,
  STAFF_CHARACTERS_QUERY,
  STAFF_MEDIA_QUERY,
  fetchConnectionPages,
  fetchStaffFilmography
};
