# Anime Local Manager — branche de secours

**Prototype expérimental hors ligne, préparé depuis la V2 validée.**

Cette branche prépare une alternative pendant l’attente des réponses d’AniList et de MyAnimeList. Elle utilise un **profil séparé**, un petit catalogue Wikidata et le moteur local d’ALM. **Elle ne remplace pas encore le catalogue de 30 430 fiches et ne doit pas être publiée comme une nouvelle bêta stable.**

La V2 de référence reste sur [`publication/v2.0.0-beta-stable`](https://github.com/Gentil-Robot/Anime-Local-Manager/tree/publication/v2.0.0-beta-stable). Aucun déploiement, aucune migration de production et aucune modification d’historique Git ne sont nécessaires pour tester cette branche.

## Ce qui est préparé

| Élément | État de cette branche |
| --- | --- |
| Bibliothèque, statuts, épisodes, notes et souvenirs | Moteur local conservé ; essais dans un profil de test |
| Imports personnels XML et sauvegardes locales | Conservés ; identifiants externes gardés comme références |
| Catalogue de remplacement | **3 fiches réelles Wikidata**, échantillon d’intégration uniquement |
| Identité des fiches | `alm:wd:Q…` ; aucune association automatique par titre avec MAL |
| Mise à jour du catalogue | Import local explicite, version, SHA-256, remplacement atomique et rollback |
| Images, résumés et classements publics du nouveau catalogue | Absents |
| AniList, MAL, Jikan, Kitsu, TMDB et autres services distants | Réseau désactivé dans ce prototype, y compris actualités et communauté |
| Installateur et mise à jour de l’application | Construction bloquée ; mise à jour et planification système désactivées |

Les anciens snapshots SQL MAL, leurs copies de récupération et les seeds de catalogue concernés sont retirés de la tête de cette branche. **Ils restent dans les anciennes branches, les commits, les archives et les éventuels assets publiés** : cette préparation n’est pas une purge de l’historique ni une validation de tous les contenus tiers du projet.

## Tester le prototype

Node.js 22.12 ou plus récent ; dépendances identiques à la V2.

```sh
npm ci
npm run verify:rescue
npm start
```

Ouvrir [http://127.0.0.1:3143](http://127.0.0.1:3143), puis le lien **Tester le catalogue expérimental** dans le bandeau. L’échantillon permet une recherche locale et l’ajout à la bibliothèque de test. La couverture par saison n’est pas validée : aucun rapprochement automatique avec les imports n’est effectué.

- Depuis les sources : le profil local par défaut est `.rescue-profile/`, ignoré par Git et les manifestes.
- Avec `npm run app` : le profil Electron est `anime-local-manager-secours`, distinct de celui de la V2. Les tâches système et l’installation de mises à jour restent désactivées.
- Les essais automatisés utilisent des répertoires temporaires. `ALM_DATA_DIR` et `ALM_IMAGES_DIR` sont réservés aux profils de test explicitement choisis ; ne pas les faire pointer vers les données de l’installation habituelle.

La recherche habituelle, les saisons et la communauté ne bénéficient pas encore du nouveau catalogue. La page expérimentale est un premier parcours séparé, pas une intégration complète dans tous les écrans ALM.

## Préparer ou restaurer un catalogue local

Le script accepte un export JSON du Query Service Wikidata ou un export `Special:EntityData`. Il conserve uniquement les identifiants Wikidata, les libellés dans les langues prises en charge, les nombres d’épisodes non ambigus et les révisions disponibles. Il ignore images, descriptions, scores et identifiants MAL.

Une [requête SPARQL limitée](scripts/independent-catalogue.wikidata.rq) est fournie pour poursuivre l’étude. L’accès au Query Service n’est pas requis au lancement d’ALM. L’échantillon inclus provient de trois exports d’entités dont les révisions sont consignées dans [provenance.json](data/independent-catalogue/provenance.json).

```sh
npm run catalogue:prepare -- --input export-wikidata.json --version 2026-11-05.2
npm run catalogue:status
npm run catalogue:rollback
```

Ces commandes ciblent le profil utilisé par `npm start`. Pour un autre profil de test, ajouter `--directory CHEMIN_DU_PROFIL/data/independent-catalogue`. Une version déjà utilisée avec un contenu différent, une baisse de plus de 10 % du nombre de fiches ou une empreinte invalide sont refusées. Le rollback explicite peut restaurer la version précédente même si le fichier courant est corrompu. Aucun téléchargement automatique de catalogue n’est activé.

## Sources et limites de validation

Le code ALM reste sous [licence MIT](LICENSE). Les données structurées de Wikidata sont annoncées sous **CC0** par [sa politique de licence](https://www.wikidata.org/wiki/Wikidata:Licensing). Cela ne transforme pas les jaquettes ou les textes provenant d’autres sites en contenus librement réutilisables.

`anime-offline-database` reste une **piste d’étude non importée**. Le projet agrège plusieurs fournisseurs ; sa licence ODbL/DbCL, les obligations de redistribution et la provenance des champs demandent une vérification séparée. Kitsu et TMDB ne sont pas activés comme remplaçants par défaut. Voir [l’état de préparation et les sources examinées](docs/BRANCHE-SECOURS.md).

`npm run verify:rescue` couvre la provenance, les identités, la recherche multilingue, les écritures interrompues, la corruption, le rollback, le blocage réseau et un parcours local avec notes/import XML/redémarrage. Un essai DOM vérifie la recherche et l’ajout dans l’interface expérimentale. **Ce ne sont ni la recette complète de la V2, ni une validation d’installateur Windows/Linux.**
