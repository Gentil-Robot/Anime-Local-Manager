# Préparation de la branche de secours — 5 novembre 2026

Base : `bc3028343d27b96efeaf63c97aa994612eee0569`, branche `publication/v2.0.0-beta-stable`.
Branche de travail : `secours/catalogue-independant`.

## Périmètre livré

- Profil de test distinct et port local 3143 ; aucun accès automatique aux données du profil stable.
- Pas de connexion à un fournisseur depuis le prototype : fetch direct, transports texte et images, workers CSV et politique CSP du navigateur sont verrouillés sur le fonctionnement local.
- Aucun seed automatique depuis les anciens snapshots, caches Jikan ou bibliothèque personnelle vers le catalogue de remplacement.
- Catalogue séparé du stockage personnel ; identifiant `alm:wd:Q…`, provenance et révision lorsqu’elle est disponible. Aucun faux identifiant MAL.
- Un ajout Wikidata ne fusionne pas avec un import MAL ou une fiche manuelle homonyme. Une correspondance de titre n’est pas une preuve d’identité de saison.
- Mise à jour locale : validation stricte des champs, limite de taille, SHA-256, fichier immuable nommé par son empreinte et commit atomique du manifeste courant. Une mise à jour échouée laisse la version précédente disponible.
- Verrou d’écriture exclusif ; rollback vérifié de la dernière version disponible. Après un arrêt brutal pendant une écriture, un verrou résiduel doit être examiné puis retiré hors exécution avant une nouvelle mise à jour. Le lancement et la lecture n’effacent aucun verrou.
- Construction d’installateur bloquée par le hook existant. Le prototype n’a aucun canal de publication et ne doit pas être fusionné automatiquement dans la bêta stable.

## Échantillon et provenance

Trois entités exportées depuis `https://www.wikidata.org/wiki/Special:EntityData/Q….json` le 5 novembre 2026. Seuls les champs structurés autorisés par le convertisseur sont repris. Les exports bruts ne sont pas distribués ; leurs identifiants, révisions et l’empreinte de l’export de travail sont dans `data/independent-catalogue/provenance.json`.

| Entité | Fiche de l’échantillon | Révision source |
| --- | --- | --- |
| Q155653 | Le Voyage de Chihiro | 2564728230 |
| Q12500134 | Naruto Shippūden | 2561617564 |
| Q25929253 | Naruto | 2563677391 |

La requête SPARQL fournie est limitée à 100 entités ; son téléchargement a expiré pendant la préparation. Les trois exports d’entités, eux, ont été récupérés et convertis. Le convertisseur de résultats SPARQL est testé avec des données synthétiques. Aucune extrapolation de couverture vers 30 430 fiches n’est faite.

Les libellés de franchise, de série, de film et de saison doivent être distingués avant une généralisation. Les nombres d’épisodes peuvent concerner une série entière. Les valeurs contradictoires sont omises. Les images, résumés et notes publiques ne sont pas repris.

## Sources examinées

| Source | Constat documentaire | Décision pour ce prototype |
| --- | --- | --- |
| [Wikidata Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) | Données structurées annoncées sous CC0 ; autres espaces de texte avec une licence distincte | Petit export de faits uniquement |
| [anime-offline-database README](https://github.com/manami-project/anime-offline-database/blob/master/README.md) | Agrégation de plusieurs fournisseurs, fichiers distribués en releases | Pas d’import ; couverture et provenance à auditer |
| [anime-offline-database LICENSE](https://github.com/manami-project/anime-offline-database/blob/master/LICENSE) | ODbL pour la base et DbCL pour les contenus ; portée et obligations à examiner par champ | Pas de validation globale des jaquettes ou des contenus amont |
| [Wikimedia Commons Licensing](https://commons.wikimedia.org/wiki/Commons:Licensing) | Chaque fichier doit être examiné avec ses conditions et son attribution | Aucune image incluse ou téléchargée |

Ces observations documentent des choix techniques de préparation ; elles ne déclarent pas le catalogue historique ou les contenus amont autorisés à la redistribution.

## Avant de rendre cette alternative publiable

1. Mesurer la couverture réelle et vérifier les licences/provenances de chaque source envisagée, notamment les éventuels contenus ODbL/DbCL et leurs mises à jour.
2. Résoudre explicitement les correspondances série/saison/film et les anciennes références personnelles ; ne pas déduire des identités par simple ressemblance de titre.
3. Intégrer le catalogue indépendant dans les écrans habituels (recherche, saisons, détails, recommandations, import) et traduire l’interface expérimentale actuellement en français. Le bandeau est disponible dans les sept langues.
4. Compléter les tests de lecture/restauration des anciennes sauvegardes et la recette graphique dans un navigateur rendu et Electron. L’essai actuel d’interface utilise jsdom ; le téléchargement de Chromium n’a pas fourni d’archive exploitable dans l’environnement de préparation.
5. Refaire les essais d’installation Windows et Linux avant de lever le blocage de construction. Aucun EXE/AppImage/DEB de secours n’a été créé ou testé.
6. Selon les réponses d’AniList et MyAnimeList, décider séparément du devenir des anciennes archives, releases, objets Git/LFS et copies publiques. La suppression à la tête de cette branche ne les retire pas de l’historique. Aucun historique public n’a été réécrit.

Les migrations SQL communautaires, les services déployés, le site Vercel et la bêta stable ne sont pas modifiés par ce travail. La préparation d’une branche ne constitue pas une publication ni une migration de données.
