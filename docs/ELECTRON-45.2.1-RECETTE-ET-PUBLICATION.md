# Electron 45.2.1 — Recette et publication GitHub

**Date de preparation :** 31 octobre 2026. **Statut :** SOURCES CANDIDATES, installateur non recompile pour cette version, diffusion binaire non autorisee tant que la recette Windows n'est pas refaite.

## Correctif confirme en amont

- Electron 45.2.1 (stable) : <https://releases.electronjs.org/release/v45.2.1>
- Versions officielles integrees : Chromium 156.0.8078.75, Node 24.22.1.
- Electron est verrouille sans caret dans `package.json`, dans la racine de `package-lock.json` et dans `node_modules/electron` (integrite npm SHA-512).
- L'integrite du tarball npm a ete recoupee dans deux `package-lock.json` publics independants ; **elle doit etre revérifiee lors du `npm ci` reel**.
- Node.js utilise pour *compiler* reste 22.23.4, distinct du Node 24.22.1 embarque dans Electron.
- L'ancienne recette Windows (151 suites, NSIS, VM) du 26 octobre portait sur Electron 45.0.0. Elle n'atteste pas du nouveau binaire.

## Etapes dans l'ordre — publication sure

1. Sur Windows avec Node 22.23.4, dans un dossier fraichement extrait : `node scripts/check-source-files.js` puis `node scripts/audit-publication.cjs`.
2. `npm ci` puis `npm ls electron --depth=0` : la version installee doit etre **45.2.1**, sans divergence du lock.
3. `npm audit --audit-level=high` et `node scripts/verify-project.js` : obtenir le rapport complet des **151 suites** sans erreur.
4. Lancer `Publier Installateur Windows.bat`, qui effectue la compilation NSIS et les verifications natives de l'installateur ; conserver `dist/release-check.json`.
5. Installer l'exe construit en machine virtuelle Windows propre ; verifier demarrage, bibliotheque, import, images, communautaire, sauvegardes/restauration, redemarrage, maintien des donnees, et activation opt-in de la maintenance planifiee. Valider aussi les regles de securite Electron et la version integree.
6. Verifier le SHA-256 de l'exe avec `Get-FileHash .\dist\Anime-Local-Manager-2.0.0-Beta-Stable-Setup-x64.exe -Algorithm SHA256` et rapprocher ce resultat du rapport.
7. Auditer les droits des medias, du catalogue et des assets tiers, la confidentialite et les autres points ouverts de `compliance/release-gates.json`. Le scanner de secrets est une aide et non une garantie exhaustive.
8. **Avant tout push vers GitHub**, verifier Vercel : le projet Vercel du site est actuellement connecte au depot GitHub ALM. Un push sur notre branche peut donc declencher un **deploiement Preview Vercel non voulu**, exactement comme l'echec deja observe. Il faut d'abord deconnecter l'integration Git du projet Vercel ou configurer un filtrage robuste des builds. Le site heberge restera accessible via ses deploiements existants ; la deconnexion arretera seulement la compilation Git automatique.
9. Executer `Preparer-GitHub-V2.ps1` pour preparer un commit local depuis la branche GitHub existante. Une fois Vercel separe et le commit revu, executer `-PublierBranche` pour le push ; cela declenchera le workflow Windows GitHub Actions sur notre branche, **sans publier automatiquement un exe**. Ouvrir une pull request brouillon et etudier les resultats GitHub Actions.
10. Ne pas fusionner sur `main` tant que la connexion Git Vercel n'est pas separee (un push sur main peut declencher un mauvais deploiement du site). Ne publier un GitHub Release `v2.0.0-beta` **pre-release** que lorsque les preuves et la recette sont conformes, avec exe revalide.

## Git LFS

Le fichier `public/assets/alm-clip-complet-1080p.mp4` >100 Mo doit etre gere par Git LFS. `.gitattributes` est configure. Il faut installer Git LFS avant de preparer le commit ; GitHub Actions checkout doit recuperer le vrai media (`lfs: true`).

## Conditions et limitations

- La version GitHub distante est toujours la V1 tant que le script n'a pas ete execute depuis le PC du mainteneur.
- La compilation Windows et le test VM **ne peuvent pas etre declares valides** par un simple changement de version dans le manifeste.
- Pas de signature Windows active ; SignPath Foundation reste une piste a instruire.
- Aucune ecriture Supabase, publication Vercel, Cloudflare, Resend ou migration de donnees n'est requise pour cette mise a jour de dependance.
