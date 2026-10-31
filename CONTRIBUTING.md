# Contribuer a Anime Local Manager

Merci de contribuer a **Anime Local Manager V2.0.0 Beta stable** !

## Avant de commencer

- Ouvrez une issue pour les changements importants et expliquez l'impact utilisateur.
- Proposez une pull request vers `main` depuis une branche dediee ; ne poussez pas directement en production.
- Respectez la licence MIT du **code**. Les donnees des fournisseurs, les illustrations et les medias peuvent relever d'autres droits. Consultez `README.md` et les notices tierces.
- N'ajoutez jamais de donnees personnelles reelles, secret API, jeton, cle privee, fichier `.env`, base de donnees utilisateur ou certificat au depot.
- Ne modifiez aucun service heberge (Supabase, Vercel, Cloudflare, Resend) depuis un test ou une contribution sans accord explicite du responsable du projet.

## Environnement

- Node.js : version exacte dans `.node-version` (actuellement `22.23.4`).
- Windows x64 pour la recette et le seul installateur officiellement publie (NSIS).
- Git LFS pour `public/assets/alm-clip-complet-1080p.mp4` (clip original conserve sans perte).

```powershell
git lfs install
npm ci
node scripts/check-source-files.js
node scripts/audit-publication.cjs
node scripts/verify-project.js
```

L'application depuis les sources : consultez les instructions de lancement dans `README.md`.
Ne publiez jamais un EXE sans l'avoir teste sur une VM Windows propre.

## Le manifeste des sources

`SOURCE-MANIFEST.json` stocke les SHA-256 des fichiers de la livraison. **Apres toute modification**, utilisez :

```powershell
node scripts/refresh-release-manifests.cjs
node scripts/check-source-files.js
```

Si la modification concerne une page du site communautaire, assurez-vous que le manifeste du site a egalement ete regenere. Une modification de ce manifeste n'est pas un deploiement.

## Controles et revue

Les PR doivent inclure : une description, les tests realises, les impacts sur les donnees / l'offline / les langues, et des captures pour les changements visuels. Les modifications de sauvegarde, migration, authentification, API ou build necessitent une revue renforcee et des tests de non-regression.

Consultez `SECURITY.md` pour signaler les failles sans les divulguer publiquement.
