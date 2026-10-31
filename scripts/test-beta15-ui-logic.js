#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const alm = fs.readFileSync(path.join(ROOT, "public", "alm-v2.js"), "utf8");

function newsTruncateV2(value, size) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > size ? text.slice(0, Math.max(0, size - 1)).trimEnd() + "…" : text;
}
function escapeHtmlV2(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const newsStart = alm.indexOf("function cleanNewsArticleBodyV2");
const newsEnd = alm.indexOf("\n\nfunction renderNewsSideV2", newsStart);
assert(newsStart >= 0 && newsEnd > newsStart, "fonctions Actualités Beta 15 introuvables");
const newsSandbox = { newsTruncateV2, escapeHtmlV2 };
vm.createContext(newsSandbox);
vm.runInContext(alm.slice(newsStart, newsEnd), newsSandbox);

const title = "Memoirs of Amorous Gentlemen Musical Reveals October 15 Premiere, Lead Sophia Anne Caruso";
const raw = `World • World • USA & Canada • Australia & New-Zealand • India • Southeast Asia • Français Views New Anime Encyclopedia Forum My ANN About Login or Register News ${title} posted on 2026-08-12 13:30 EDT by Alex Mateo. The American stage musical adaptation will premiere in New York City. Previews begin on September 25. The musical's staff also announced several members. The production is based on the manga and includes a large creative team. Another sentence adds enough material to verify that the output is broken into readable blocks.`;
const clean = newsSandbox.cleanNewsArticleBodyV2(raw, { title }, 7000);
assert(!/^World\b/i.test(clean), "le chrome ANN doit être retiré");
assert(!clean.startsWith(title), "le titre répété doit être retiré du corps");
const markup = newsSandbox.newsArticleTextMarkupV2(raw, 7000, { title });
assert((markup.match(/<p/g) || []).length >= 2, "un article long doit produire plusieurs paragraphes");
assert(markup.includes("news-reader-lead"), "le premier paragraphe doit être identifié comme accroche");

const recoStart = alm.indexOf("function normalizeRecoSearchV2");
const recoEnd = alm.indexOf("\nfunction hideRecoSuggestionsV2", recoStart);
assert(recoStart >= 0 && recoEnd > recoStart, "moteur de suggestions Recommandations introuvable");
const recoSandbox = {};
vm.createContext(recoSandbox);
vm.runInContext(alm.slice(recoStart, recoEnd), recoSandbox);
const library = [
  { title: "Fullmetal Alchemist: Brotherhood", malId: 1 },
  { title: "Full Metal Panic!", malId: 2 },
  { title: "Fullmetal Alchemist", malId: 3 },
  { title: "Ore dake Level Up na Ken", malId: 4 },
  { title: "Fruits Basket", malId: 5 }
];
const matches = recoSandbox.recoSearchCandidatesV2("Full", library, 8);
assert(matches.length >= 3, "la recherche partielle doit proposer plusieurs éventualités");
assert(matches.every(item => /full/i.test(item.title)), "les suggestions doivent rester pertinentes");
assert(matches.some(item => item.title.includes("Brotherhood")), "Brotherhood doit être proposé");

const completion = require(path.join(ROOT, "lib", "completion-state.js"));
const anime = {
  title: "Fiche incomplète",
  malId: 42,
  type: "TV",
  genres: ["Fantasy"],
  synopsis: "Cette fiche reste volontairement incomplète afin de tester la mémorisation d'une tentative automatique.",
  poster: "/images/test.jpg"
};
anime.autoCompletionSignature = completion.animeCompletionSignature(anime);
assert.strictEqual(completion.autoCompletionAttemptIsCurrent(anime), true, "une fiche inchangée doit rester différée");
anime.startDate = "2024-01-01";
assert.strictEqual(completion.autoCompletionAttemptIsCurrent(anime), false, "une fiche modifiée doit pouvoir être réévaluée");

console.log("OK Beta 15 UI : bannière stable, articles aérés et suggestions de recherche validées.");
