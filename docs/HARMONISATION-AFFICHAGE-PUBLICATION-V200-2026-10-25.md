# Harmonisation des libellés — Anime Local Manager V2.0.0 Bêta stable

**Date :** 25 octobre 2026. **Base :** `Anime-Local-Manager-2.0.0-Beta-Stable-Correctif-Test-Services-2026-10-25-COMPLET.zip` (dernière archive reçue et validée avant cette correction).

## Règle de version (source unique)

- **Version technique :** `2.0.0`, dans `release-version.json`, `package.json` et le lockfile.
- **Appellation visible :** `Anime Local Manager V2.0.0 Bêta stable`, issue des métadonnées existantes.
- **Distribution :** canal `beta`, prépublication GitHub. Ne pas modifier ce canal : il n'est pas identique au qualificatif de présentation « Bêta stable ».
- **Compatibilité :** la mention historique `2.0.0-beta.82` reste requise pour le format de sauvegarde et les comparaisons de mises à jour.

## Changement de la console de publication

Le lanceur de publication et la recette continuent à exécuter **exactement les 151 scripts** du plan `scripts/verification-plan.json`, dans le même ordre fonctionnel et avec les mêmes garde-fous.

La console affiche désormais des intitulés fonctionnels, sans faire passer les anciens noms de fichiers de tests pour des versions du produit. Exemples :

```text
[vérification] Anime Local Manager V2.0.0 Bêta stable · 151 suites
[vérification] Structure et régressions · 90 suites
[publication] V2.0.0 Bêta stable · Structure et régressions · Conformité V2.0.0 Bêta stable (2/90) — en cours, 15 s
[publication] V2.0.0 Bêta stable · Structure et régressions · Imports : contrôle des données (45/90) — en cours, 15 s
[publication] V2.0.0 Bêta stable · Structure et régressions · Stockage : persistance et récupération (61/90) — en cours, 15 s
[vérification] V2.0.0 Bêta stable · 151 suites réussies. Les détails historiques des scénarios restent dans le journal technique.
```

Les positions indiquées correspondent au plan actuel ; les compteurs restent calculés automatiquement lors de chaque exécution. Les noms des scripts (`test-betaXX`), références et éventuels messages historiques sont **conservés uniquement dans les données de traçabilité du journal technique** et dans le champ `test` du rapport JSON. Un nouveau champ `label` permet de rapprocher affichage lisible et identifiant de test. Un test en échec reste bloquant ; le message visible indique le libellé fonctionnel, et la trace complète reste accessible.

Dans le lanceur de vérification manuelle, le raccourci `npm run verify:beta82` (dont le test était déjà inclus dans le plan général) a été remplacé par `npm run release:check`, puis `npm run verify`, sans supprimer aucun contrôle de la recette globale. Les anciens scripts/npm sont conservés pour la rétrocompatibilité et les tests d'historique.

## Diagnostics utilisateurs

- Les chemins local et web de `community-ui-extra.js` ne génèrent plus la mention historique `ALM Beta75`.
- Le diagnostic de secours prend son nom d'application dans `window.ALM_RELEASE.publicName`. En l'absence de métadonnées, il utilise le nom neutre `Anime Local Manager` plutôt qu'un numéro de version erroné.
- Le test d'interface `test-beta61-ui.cjs` vérifie le nom de version issu des métadonnées, et non une ancienne chaîne figée.
- Le journal de réparation locale du serveur affiche la version publique courante ; les fichiers et identifiants de migrations historiques restent inchangés.

## Contrôles inclus

- `scripts/test-release-console.cjs` couvre les **151 libellés**, les messages périodiques, l'absence de numéros historiques dans la console normale, la réussite simulée, l'échec simulé et la conservation des chemins techniques dans les logs et rapports.
- `scripts/test-release-v200.cjs` lance ce contrôle pendant la recette existante de version.
- `scripts/test-beta61-ui.cjs` (avec `jsdom`) vérifie le nom de version dans le diagnostic au cours des parcours communautaires.
- `scripts/refresh-release-manifests.cjs` reconstruit les empreintes SHA-256 du site et des sources ; les modifications sont vérifiées dans le ZIP livré.

**Limites :** la création d'une archive source ne valide ni la fin réelle des 151 suites sur Windows, ni l'installateur NSIS, ni son installation ou sa signature. Les audits npm fournis lors des exécutions précédentes portent sur leurs propres sources et ne constituent pas une recette nouvelle du présent ZIP. Aucun déploiement Vercel, Supabase, Resend ou Cloudflare.
