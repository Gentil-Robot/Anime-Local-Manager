# Plan d'amélioration — Anime Local Manager V2.0.0 Bêta stable

> À coller tel quel dans ChatGPT (ou Codex) avec le dépôt ouvert. Audit réalisé le 11/11/2026 sur l'archive `Anime-Local-Manager-publication-v2.0.0-beta-stable`.

## Rôle et contexte

Tu es développeur senior Node.js / Electron. Tu travailles sur **Anime Local Manager** : application Electron 45 (fenêtre sandboxée + moteur Express 4 dans un `utilityProcess`, lié à `127.0.0.1`), base SQLite via sql.js, volet communautaire Supabase facultatif.

Repères :

| Élément | Fichier | Taille |
|---|---|---|
| Processus principal Electron | `main.js`, `preload.js` | 25 Ko |
| Moteur HTTP (141 routes, dont 82 `async`) | `server.js` | 13 500 lignes, 623 Ko |
| Couche données | `db.js`, `lib/sqlite-disk.js` | 1 777 lignes |
| Modules métier | `lib/*.js` (≈ 75 fichiers) | — |
| Interface | `public/` : 91 JS (1,84 Mo), 29 CSS (514 Ko), `index.html` | — |
| Tests | `scripts/test-*.js|cjs` (≈ 250 scripts), lancés par `npm run verify` | — |

## Règles obligatoires à chaque étape

1. **Un lot = une branche = un seul sujet.** Pas de refactorisation mêlée à une correction.
2. **Avant de modifier une ligne**, cherche les tests qui lisent le texte source : `grep -rn "<extrait>" scripts/`. Beaucoup de tests font des `assert.match(read('server.js'), /.../)` ; adapte-les dans le même lot.
3. **Après chaque lot**, dans cet ordre :
   - `node scripts/refresh-release-manifests.cjs` (tout fichier est épinglé par SHA-256 dans `SOURCE-MANIFEST.json` ; sans cela `npm run build` et la CI échouent) ;
   - `node scripts/check-source-files.js` ;
   - `npm run verify` ;
   - `npm audit --audit-level=high`.
4. Ne crée **aucun fichier parasite** à la racine (il serait absorbé par le manifeste).
5. Ne touche ni au format des sauvegardes (`BACKUP_VERSION = "2.0.0-beta.82"`), ni à `appId`, ni au dossier `userData`.
6. Les versions d'Electron sont **vérifiées par un test** (`scripts/test-beta82-prepublication.cjs` : version, URL `resolved`, `integrity`). Toute montée de version passe par la mise à jour de ce test.
7. Réponds en français, donne pour chaque lot : fichiers touchés, diff, tests ajoutés, résultat de `npm run verify`.

## Déjà fait (ne pas refaire, mais à couvrir par des tests — lot 1)

Trois fichiers ont été modifiés et `SOURCE-MANIFEST.json` mis à jour pour eux :

- `server.js`, juste après `const app = express();` : chaque gestionnaire de route (`get/post/put/patch/delete`) est enveloppé pour transmettre une promesse rejetée à `next(error)`. Avant : une route `async` qui rejetait laissait la requête sans réponse et produisait une `unhandledRejection` (arrêt du moteur sous Node 22).
- `server.js`, juste avant `module.exports` : gestionnaire d'erreurs final qui répond en JSON (`{error, code}`) en conservant le statut HTTP (400, 413, 500…). Avant : page HTML Express par défaut, avec trace de pile hors `NODE_ENV=production`.
- `lib/server-host.js` : `process.on('unhandledRejection')` qui journalise au lieu d'arrêter le moteur.

Vérifié hors projet avec Express 4.22.3 et Multer 2.5.0 (route async rejetée → 500 JSON, corps trop gros → 413, JSON invalide → 400, 404 inchangé). **Non vérifié : la suite `npm run verify` complète.**

---

## Priorité 0 — Fiabilité et sécurité

### Lot 1 — Tests des correctifs ci-dessus
- Lancer `npm run verify` ; corriger tout test textuel cassé par les lignes ajoutées.
- Ajouter `scripts/test-v200-http-errors.cjs` : route async rejetée → 500 JSON `ALM_INTERNAL_ERROR` ; corps > limite → 413 ; JSON invalide → 400 ; aucune trace de pile dans la réponse. L'inscrire dans `scripts/verify-project.js`.
- Décider si un fichier trop volumineux (Multer `LIMIT_FILE_SIZE`) doit répondre 413 au lieu de 500 (statut laissé inchangé pour l'instant).

### Lot 2 — Supervision du moteur local
- Constat : `lib/server-process.js` rejette les appels en attente quand le `utilityProcess` s'arrête, mais `main.js` n'est jamais prévenu après le démarrage. Si le moteur tombe en cours de session, l'interface reste ouverte et toutes les requêtes échouent en silence.
- À faire : exposer un rappel `onExit(code, détail)` dans `createServerProcess` ; dans `main.js`, afficher un message clair et proposer « Redémarrer le moteur » (relancer `startServer`, recharger `activeServerOrigin`), avec une limite de tentatives.
- Critère : tuer le moteur à la main → message visible en moins de 2 s, redémarrage fonctionnel, base intacte.

### Lot 3 — Mises à jour de dépendances (une par commit)
| Paquet | Épinglé | Disponible (npm, 11/11/2026) | Remarque |
|---|---|---|---|
| electron | 45.2.1 | 45.3.0 | Correctif dans la même branche majeure ; mettre à jour le test d'épinglage |
| electron-builder | 26.16.1 | 26.18.0 | Revérifier ensuite `npm audit` |
| @supabase/supabase-js | 2.117.3 | 2.119.0 | Mineure |
| sql.js | 1.14.2 | 1.16.0 | Retester migrations, index FTS5 trigram, `lib/sqlite-disk.js` |
| jsdom (dev) | 26.1.0 | 31.0.0 | Majeure, tests d'interface uniquement |
| @electric-sql/pglite (dev) | 0.3.14 | 0.5.16 | Tests SQL Supabase |
| express | 4.22.3 | 5.3.0 | **Majeure : lot 9 séparé** |

- `npm audit` signale aujourd'hui **6 vulnérabilités modérées** (minimatch, GHSA-g3hv-75wg-m249) via `@electron/universal` → `app-builder-lib` → `electron-builder`. Outillage de build uniquement. **Ne pas lancer `npm audit fix --force`** (il rétrograderait electron-builder en 24.13.3) ; préférer la montée de version ou un `overrides` ciblé.

### Lot 4 — Authenticité des mises à jour et signature
- `SECURITY.md` indique que la signature de l'installateur n'est pas terminée ; le workflow `windows-installer.yml` prévoit déjà `CSC_LINK`.
- `lib/integrated-updater.js` valide l'URL, la taille et un condensat SHA-256 fournis par la même source GitHub que le binaire ; `lib/windows-signature.js` compare le signataire à celui de l'exécutable en place. À vérifier : comportement exact quand l'exécutable en place n'est pas signé.
- À faire : manifeste de version signé (Ed25519, clé publique embarquée dans l'application, clé privée hors dépôt) vérifié avant toute installation ; refus explicite si la signature Authenticode attendue manque.

### Lot 5 — Durcissement de l'API locale et de la CSP
- Jeton de session : il n'existe que si `ALM_SESSION_TOKEN` est défini (mode Electron). En `npm start`, l'API n'a aucun jeton. → Générer toujours un jeton au démarrage.
- Le cookie est remis à tout `GET /` : il protège contre les sites tiers (avec `lib/local-security.js`), pas contre un autre programme local. → L'écrire noir sur blanc dans `SECURITY.md` (modèle de menace).
- CSP (`server.js`, intergiciel après `localRequestGuard`) : `style-src 'unsafe-inline'`, `img-src https:` très large, URL du projet Supabase écrite en dur alors que `community-config.json` existe. → Dériver l'URL de la configuration ; restreindre `img-src` aux hôtes réellement utilisés ou tout faire passer par le cache d'images local ; supprimer les styles en ligne puis retirer `'unsafe-inline'`.
- `public/app.js` contient 27 affectations `innerHTML` : vérifier que chaque valeur externe est échappée ; viser `require-trusted-types-for 'script'`.

---

## Priorité 1 — Performance

### Lot 6 — Moteur HTTP
- `server.js`, intergiciel `app.use('/api', …)` de contrôle de taille : il re-sérialise (`JSON.stringify`) chaque corps, y compris les routes volumineuses (jusqu'à 20 Mo), avant de tester si la route est exemptée. → Tester `bulk` d'abord, ou mesurer la taille brute via l'option `verify` de `express.json`.
- Lectures/écritures disque synchrones dans des routes (82 appels `*Sync` dans `server.js`), notamment vers les lignes 7548, 10574-10575, 11113, 11190, 13033 (numérotation d'origine ; +16 lignes après le correctif). → `fs/promises` ou cache mémoire avec invalidation.
- `GET /api/cover-cache/:malId` répond `Cache-Control: private, no-store` : chaque jaquette est relue à chaque affichage. → `ETag` + `max-age` (vérifier d'abord pourquoi `no-store` a été choisi : un test le protège peut-être).
- `express.static` sans politique de cache explicite.
- Mesurer avant/après avec `scripts/measure-engine.js` et `scripts/performance/`.

### Lot 7 — Chargement de l'interface
- `public/index.html` charge **70 balises `<script>`** (une seule en `defer`/`async`/module) et **24 feuilles de style**, non minifiées, dont des couches empilées `beta37.js` … `beta57.js`.
- `esbuild` est déjà en devDependency. → Produire 2 ou 3 bundles minifiés (noyau, communauté, karaoké) en respectant l'ordre actuel, chargés en `defer` ; idem pour le CSS. Garder les sources lisibles dans le dépôt, générer au build.
- Critère : même rendu (tests `verify:visual`, tests UI jsdom), temps jusqu'à l'affichage de la bibliothèque mesuré avant/après.

### Lot 8 — Poids de l'archive (251 Mo de sources, dont 51,6 Mo dans `public/assets`)
- Doublons exacts (même SHA-256 dans le manifeste) :
  - `data/database/metadata-full.sql.gz` = `metadata-recovery.sql.gz` (7,5 Mo chacun) ;
  - `public/gentil_robot_logo.png` = `public/assets/gentil-robot-logo.png` (0,9 Mo) ;
  - `build/icons/512x512.png` = `public/assets/anime-local-manager-taskbar.png`.
- Fonds d'écran livrés en PNG **et** en JPG 4K/QHD/FHD (≈ 2,5 Mo par PNG) ; `terms-atlas-1..3.png` (2,9 à 3,5 Mo). → WebP/AVIF, une seule source par image.
- `scripts/fixtures/karaoke/song.beta36|37|46-backup.json` (≈ 1,35 Mo), 22 fichiers `.log` sous `docs/`, `supabase/.temp/cli-latest` : à sortir du dépôt ou à archiver à part.

---

## Priorité 2 — Maintenabilité

### Lot 9 — Express 5
- Après les lots 1 à 3. Points d'attention : syntaxe des chemins (path-to-regexp), `req.query` en lecture seule, comportement de `express.static`.
- Express 5 transmet nativement les promesses rejetées : **retirer alors l'enveloppe ajoutée après `const app = express();`**, garder le gestionnaire d'erreurs final.

### Lot 10 — Découpage de `server.js`
- 13 500 lignes et 141 routes dans un fichier. Extraire par domaine vers `routes/` (bibliothèque, import CSV/BetaSeries, actualités, recommandations, sauvegardes, métadonnées, diagnostics), en commençant par les fonctions pures déjà exposées dans `module.exports.__test`.
- Un domaine par lot, sans changement de comportement, `module.exports` inchangé.

### Lot 11 — Outillage qualité
- Aucun linter ni formateur dans `devDependencies` ; beaucoup de modules `lib/` sont écrits en lignes très denses. → ESLint (règles `no-floating-promises` équivalentes, `no-unused-vars`) + Prettier, appliqués dossier par dossier.
- `// @ts-check` + JSDoc sur `lib/`, puis `tsc --noEmit --checkJs` en CI.
- Tests : regrouper les ≈ 250 scripts `test-betaNN-*` par domaine sous `node --test`, remplacer progressivement les assertions sur le texte source par des tests de comportement, mesurer la couverture (`c8`).
- `scripts/refresh-release-manifests.cjs` contient `releaseId` et l'empreinte de référence en dur → les lire depuis `release-version.json`.

### Lot 12 — Finitions
- `main.js` : commentaire « Electron 30 » périmé ; `writeWindowState` écrit sans `atomicJson` ; `readDisplayPreferences()` relit le disque à chaque appel (F11, `did-finish-load`) → cache mémoire ; titre « Choisir un dossier » et messages `dialog.showErrorBox` en français en dur.
- i18n : `public/locales/fr.json` fait 12 Ko contre 84 à 96 Ko pour les autres langues → le français est en dur dans le code. Extraire les chaînes, contrôler avec `npm run audit:locales`.
- CI : ajouter un job Linux (AppImage/deb), une analyse CodeQL, Dependabot ou Renovate, et un SBOM joint aux versions.

---

## Ordre conseillé

1 → 2 → 3 → 5 → 6 → 4 → 7 → 8 → 9 → 10 → 11 → 12.

Commence par le **lot 1** : lance `npm run verify`, rapporte le résultat brut, puis propose le diff du test à ajouter. N'entame pas le lot suivant sans validation.
