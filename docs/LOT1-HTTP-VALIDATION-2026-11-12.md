# ALM V2.0.0 Bêta stable - Validation du lot 1

Date : 12 novembre 2026. Périmètre : archive fournie par Romain, avec les correctifs de Claude déjà présents.

## Résultat

**154 suites sur 154 réussies**, avec le nouveau test HTTP inscrit dans la validation standard. Durée de la dernière exécution : 297 secondes. Environnement : Linux, Node.js 24.22.1, npm 11.9.0. Le binaire Electron n'a pas été téléchargé pendant l'installation des dépendances.

| Groupe | Suites | Résultat |
| --- | ---: | --- |
| Structure et régressions | 93 | Réussies |
| Interface et karaoké | 8 | Réussies |
| Imports et bibliothèque | 27 | Réussies |
| Données, sauvegardes et sécurité | 14 | Réussies |
| Publication | 12 | Réussies |

`npm audit --audit-level=high` : code de sortie 0 ; six paquets signalés au niveau modéré, aucun au niveau élevé ou critique. La chaîne de compilation autour de `electron-builder` est affectée par l'avis `GHSA-g3hv-75wg-m249` sur `minimatch`. Il ne s'agit pas de six failles indépendantes constatées dans l'application.

`npm audit --omit=dev --audit-level=high` : code de sortie 0, aucune alerte signalée dans les dépendances de production. Cet outil n'audite pas le moteur natif Electron/Chromium et ne constitue pas un audit complet de sécurité.

## Vérifications initiales et obstacles résolus

1. La première exécution de `npm run verify` a échoué sur la vidéo du karaoké : l'archive contenait un pointeur Git LFS de 134 octets à la place du média. Le contrôle d'intégrité des sources échouait également.
2. Le vrai média a été récupéré depuis le commit `9fe5ce3707b49d39195da4362aff809e77f85a08` de la branche publique `publication/v2.0.0-beta-stable`. Ses 162 854 228 octets et son SHA-256 `ae9a33e4d712b1d7d85bfad166d7bb2932093b7ef158eaa2ef6dd995b61ed0b1` correspondent exactement au manifeste original. L'empreinte du média n'a pas été remplacée par celle du pointeur.
3. Le nouveau test HTTP a reproduit une 404 pour `Promise.reject()` sans motif, malgré le correctif de Claude. Le garde de route a été complété pour transmettre une vraie erreur dans ce cas.
4. Une validation complète a ensuite obtenu 147 suites réussies avant d'échouer dans `test-beta68-release.cjs` : deux diagnostics de publication écrits à la même milliseconde utilisaient le même nom. La collision a été reproduite avec une horloge figée, corrigée dans l'outil et conservée comme scénario de régression.
5. La validation complète a été relancée après correction ; les 154 suites sont désormais réussies. Le test des libellés publics `test-release-console.cjs` a également réussi.

## Changements de ce lot

| Fichier | Modification |
| --- | --- |
| `server.js` | Conservation du correctif asynchrone de Claude ; les rejets sans motif et les valeurs réservées `route`/`router` deviennent des erreurs 500 plutôt qu'un passage silencieux à la route suivante. |
| `server.js` | `LIMIT_FILE_SIZE` de Multer répond 413 avec le même code fonctionnel, au lieu d'une erreur interne 500. |
| `scripts/test-v200-http-errors.cjs` | Nouveau test de comportement sur l'application Express et sa base SQLite isolée ; aucun appel à un fournisseur externe. |
| `scripts/verification-plan.json` | Inscription de la nouvelle suite, de 153 à 154 suites sélectionnées. |
| `scripts/verify-project.js` | Libellé public français pour cette nouvelle suite. |
| `scripts/smoke-windows.js` | Suffixe aléatoire sur le nom des diagnostics pour conserver chaque échec. |
| `scripts/test-beta68-release.cjs` | Deux échecs avec une horloge figée conservent leurs deux rapports et leurs contenus respectifs. |
| `public/assets/alm-clip-complet-1080p.mp4` | Restauration du média original exact. |
| `SOURCE-MANIFEST.json` | Régénération avec les empreintes des sources et des preuves de validation. |

Le correctif de journalisation de `lib/server-host.js` fourni par Claude est conservé. Son comportement est testé en exécutant le module avec une frontière parent fictive, puis en vérifiant qu'un appel de démarrage peut encore répondre après la journalisation. Cela ne démontre pas la récupération d'une opération métier interrompue.

## Couverture du nouveau test HTTP

- Rejets asynchrones sur GET, POST, PUT, PATCH et DELETE, y compris des tableaux imbriqués de gestionnaires.
- Exceptions synchrones et promesses retournées par des fonctions ordinaires.
- Rejets `undefined`, `null`, `false`, `0`, chaîne vide, `route` et `router`.
- Réponses JSON 500 sans détail interne ni champ de pile ; préservation des statuts et codes 4xx déclarés.
- JSON invalide : 400 ; limite de 256 Kio de l'API : 413 ; dépassement de la limite JSON de 20 Mio : 413.
- Multer : 413 au-delà de la limite et succès à la limite ; la route n'est pas exécutée après un rejet d'upload.
- Conservation du comportement de `app.get(setting)`, des gestionnaires d'erreur à quatre arguments et des routes inexistantes en 404.
- Accès à la vraie route de bibliothèque après les erreurs, absence de rejet de promesse non géré dans ces scénarios.

Les routes de test n'existent que dans le processus de test et ne sont pas ajoutées au produit.

## Lecture critique du plan de Claude

Le diagnostic principal sur Express 4 est confirmé : les erreurs asynchrones doivent être transmises à Express. Les réponses du gestionnaire terminal et la validation dans l'application complète étaient donc prioritaires.

La journalisation globale des rejets ne répare ni la tâche qui a échoué ni une éventuelle écriture interrompue. La supervision du moteur et l'information de l'utilisateur en cas d'arrêt restent le prochain sujet de fiabilité, prévu au lot 2.

L'absence de jeton dans `npm start` est confirmée dans cette archive, mais le contrôle d'origine et l'écoute sur la boucle locale existent déjà. Générer un jeton distribué à toute ouverture de la page ne permet pas, à lui seul, d'authentifier les autres programmes exécutés localement.

Les optimisations de performance nécessitent des mesures avant/après. Sur cette archive, le parseur HTML compte 87 scripts externes et 26 feuilles de style dans `public/index.html`, au lieu des 70 et 24 indiqués dans le plan. Le nombre de fichiers n'établit pas à lui seul un ralentissement. Les doublons de métadonnées doivent être étudiés avec leurs chemins de récupération avant suppression.

Les mises à jour proposées, le regroupement des ressources, la refonte Express 5, la signature des mises à jour et la réorganisation de l'application sont des travaux séparés. Les versions disponibles devront être revérifiées au moment de chaque mise à jour.

## Limites et intégration

Cette livraison contient les sources corrigées de l'archive jointe. Elle ne constitue pas une nouvelle version Windows compilée. Les essais natifs Electron, l'installation NSIS et la recette dans une VM Windows restent à exécuter avant diffusion d'un nouvel installateur.

La base est l'archive jointe, pas une fusion avec les branches de sécurité ou de documentation créées ultérieurement sur GitHub. Pour intégrer ce lot à une branche plus récente, utiliser le diff et une fusion ciblée afin de conserver ses autres évolutions.

L'identifiant de l'application, le format de sauvegarde historique et la version publique V2.0.0 sont conservés. Les migrations SQL, les services distants et le site ne sont pas modifiés par ce lot.

## Preuves

- [Rapport détaillé des 154 suites](verification-http-20261112/verification.json)
- [Audit npm complet](verification-http-20261112/npm-audit-complet.json)
- [Audit npm de production](verification-http-20261112/npm-audit-production.json)
- [Diff des changements de code](verification-http-20261112/lot1.diff)

Archive d'entrée SHA-256 : `1fd6167e947b7c69c453dba18e23ded276c1fdbc0ba30fd52452914e6a55cad1`.

Sources primaires consultées : [gestion des erreurs Express 4](https://expressjs.com/en/4x/guide/error-handling/) ; [avis minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249).
