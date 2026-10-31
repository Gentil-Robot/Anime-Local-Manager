# Audit des conditions AniList, des métadonnées et des jaquettes — ALM V2.0.0

**Date de l'examen : 31 octobre 2026.** Statut : **analyse réalisée, autorisations de redistribution NON obtenues**. Ce document consigne les observations et actions proposées, sans constituer un avis juridique ni une attestation de conformité.

Projet : [Anime Local Manager](https://animelocalmanager.com/) · [branche V2](https://github.com/Gentil-Robot/Anime-Local-Manager/tree/publication/v2.0.0-beta-stable) · [PR de validation](https://github.com/Gentil-Robot/Anime-Local-Manager/pull/2)

## Conclusions

1. **AniList : autorisation écrite à demander.** Les conditions interdisent l'API dans les services concurrents non complémentaires de listes/suivi d'animés, **y compris pour les métadonnées médias**. ALM possède une bibliothèque et des fonctions de suivi ; son caractère local/gratuit/MIT ne lui donne pas d'exemption. Le seuil de 150 USD/mois pour l'usage commercial n'annule pas cette interdiction.
2. **Catalogue 30 430 fiches : provenance juridique non démontrée.** L'archive embarquée contient un schéma avec identifiants MAL, titres, genres, scores, synopsis et **URL de jaquettes**, mais son manifeste ne précise pas les licences ou autorisations de redistribution, ni les créateurs de chaque donnée. L'usage du format Jikan/MAL dans les scripts ne prouve pas la source exacte de chaque enregistrement.
3. **Jaquettes : pas de collection de 30 430 images binaires dans le paquet, d'après le manifeste source.** L'application conserve des `imageUrl` et télécharge des images dans un **cache local borné pour la bibliothèque de l'utilisateur**. Les droits d'affichage, de téléchargement, de cache et de redistribution restent distincts. Le fait de ne pas empaqueter toutes les images réduit une catégorie de diffusion ; cela ne crée pas une autorisation implicite.
4. **Le catalogue est déjà publié en source.** Les fichiers `data/database/metadata-full.sql.gz` **et** `data/database/metadata-recovery.sql.gz` sont suivis par Git dans la branche V2 **publique**. Le risque de redistribution ne commence donc pas seulement au clic « Publish release ». Le retrait éventuel doit être planifié : supprimer le fichier d'un commit futur ne l'efface pas de l'historique Git et ne doit pas casser les installations existantes.

## Constat technique vérifié dans le dépôt

| Élément | Trace GitHub | Portée |
| --- | --- | --- |
| Snapshot | `data/database/metadata-manifest.json` | 30 430 lignes, archive gzip 7 510 725 octets, générée le 31/08/2026 ; provenance déclarée génériquement, sans licence amont |
| Champs du snapshot | `lib/metadata-sql-data.js` et `scripts/prepare-metadata-seed.js` | `malId`, titres, dates, genres, score, `imageUrl`, `synopsis`, etc. Les colonnes ne démontrent pas que chaque ligne est remplie |
| Publication du snapshot | `package.json` (build.files) et `scripts/prepare-metadata-release.js` | Les métadonnées sont expressément incluses dans le NSIS. Le build refuse par défaut un paquet sans snapshot complet |
| Préservation des données | `scripts/metadata-maintenance.js` | Vérifie/rétablit l'archive locale ; le collecteur public Jikan a été désactivé |
| AniList actif | `lib/anilist-fetch.js`, `lib/calendar-sources.js`, `lib/anilist-staff-filmography.js`, `server.js` | Calendrier, fiches et recommandations liées aux créateurs/seiyuu ; pas d'autorisation déduite des usages techniques |
| Autres fournisseurs actifs | `lib/metadata-providers.js` | MAL officiel si un Client ID est fourni ; repli Kitsu ; chaque fournisseur a ses propres conditions |
| Images en cache | `lib/cover-cache.js` | Origines HTTPS contrôlées (MAL, AniList, TVMaze, Kitsu), cache limité à la collection utilisateur. Aucune licence de l'image n'est consignée dans le cache |
| Autres visuels | `public/assets/` | Logos, fonds, dictionnaire, photos et clip : provenance et droits à inventorier séparément |

Aucun examen exhaustif ligne par ligne du **contenu décompressé** des 30 430 enregistrements n'a été réalisé ici. Les constats portent sur les manifestes et le code de lecture/production. En particulier, **l'origine exacte et les conditions initiales d'acquisition du snapshot ne sont pas prouvées**.

## Sources officielles et analyse des conditions

### AniList

- **Conditions officielles** : https://docs.anilist.co/guide/terms-of-use
- Interdiction : stockage de secours / collecte massive et utilisation dans des services concurrents non complémentaires de suivi/listes, y compris les métadonnées ; revenus autorisés sous un plafond ne signifient pas exemption des autres clauses.
- **Contact indiqué par AniList : `contact@anilist.co`.**
- La documentation historique, non nécessairement en vigueur, mentionnait des exceptions possibles pour des services intégrés à AniList. Il faut demander une **réponse écrite adaptée au fonctionnement réel d'ALM** ; ne pas supposer qu'une synchronisation future rend l'usage autorisé.

**Demande ciblée :** droit d'utiliser AniList pour rechercher une fiche, compléter les créateurs et seiyuu, afficher des calendriers et suggestions dans un logiciel local gratuit et open source, sans synchronisation de compte AniList ni collecte massive. Préciser le caractère optionnel des dons. Demander les limites de cache/durée, images, attribution et les éventuelles conditions d'une exception.

### MyAnimeList / Jikan

- **MyAnimeList — conditions du service :** https://myanimelist.net/about/terms_of_use (consultation directe non aboutie dans cet audit ; vérifier la version intégrale dans un navigateur connecté).
- **API officielle, contrat développeur :** https://myanimelist.net/apiconfig (lecture et approbation par titulaire de l'API ; accès public au contrat pouvant demander une session).
- **Jikan, projet et avertissement :** https://github.com/jikan-me/jikan-rest ; le projet indique ne pas être affilié à MAL et demande de respecter les conditions de MAL. **Sa licence open source concerne son logiciel et ne concède pas à ALM les droits du contenu récupéré**.
- **Support MAL : `support@myanimelist.net`** (adresse publiée dans les conditions de service, également par la fiche officielle de l'application).
- Les contenus du catalogue peuvent relever de droits distincts : bases de données, synopsis rédigés par des tiers, images d'affiches des ayants droit. Ne pas assimiler l'utilisation d'une API de lecture à un droit de fabriquer puis redistribuer une archive locale de 30 430 entrées.

**Demande ciblée :** autorisation expresse sur la redistribution d'une archive hors ligne de 30 430 fiches, avec champs précisément décrits (titres, identifiants, dates, genres, notes, synopsis, liens vers couvertures), et les conditions de cache local/affichage d'images. Si le support n'est pas habilité, demander le **contact de l'équipe droits ou licences des données**.

### Cadre français / européen : droits des bases de données

- **CPI, articles L341-1 à L342-3 :** https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069414/LEGISCTA000006146357/
- La directive **96/9/CE, article 7** permet au producteur d'une base remplissant les conditions légales d'interdire la réutilisation de tout ou partie substantielle. La protection éventuelle de la base est **distincte** de la question de savoir si un nom d'anime ou une date, pris isolément, est protégeable.
- Source : https://www.wipo.int/wipolex/fr/legislation/details/1409

## Solutions envisageables, classées par conservation des fonctions

**A — Autorisations explicites (préférable pour préserver la V2 actuelle)**

1. Demander à AniList la permission correspondant à ses vrais usages dans ALM.
2. Demander à MAL / aux détenteurs pertinents la réutilisation et redistribution du catalogue ; documenter l'origine historique exacte. Les droits des affiches peuvent appartenir aux producteurs/licenciés, pas à MAL ; toute autorisation doit préciser sa portée.
3. Archiver en privé les réponses, les versions des conditions, la date de collecte et les attributions exigées. Mettre à jour `compliance/release-gates.json` une fois les preuves obtenues et la recette répétée.

**B — Reconfigurer les intégrations et assainir les données si refus / absence de permission**

1. Désactiver de façon ciblée les **requêtes AniList** non autorisées et prévoir des fournisseurs ou des données dont l'usage est permis, avec tests de régression sur recommandations/calendrier/saisons.
2. Construire **un nouveau catalogue à partir de sources ouvertes dont on peut démontrer la licence**, sans aspirer l'ancien ensemble pour le présenter comme « réécrit ». Par exemple, les données structurées **Wikidata sont CC0** (https://www.wikidata.org/wiki/Wikidata:Copyright). Ce remplacement ne garantit **ni 30 430 fiches ni le même niveau de précision**, et doit faire l'objet d'un audit de correspondance et de complétude.
3. Pour les descriptions, utiliser seulement les textes rédigés par ALM ou disponibles sous licence compatible, avec attribution et obligations nécessaires ; ne pas copier les synopsis de tiers sans droits.
4. Pour les jaquettes, afficher une vignette générique ou une image sous licence vérifiée ; **Wikimedia Commons impose de contrôler la licence de chaque image individuellement** (https://attribution.wikimedia.org/attribution-signals/license.html). L'URL ou le chargement côté utilisateur ne suffit pas à présumer un droit de copie.
5. Préserver **sans suppression** les bibliothèques personnelles, imports, notes et sauvegardes des utilisateurs. Séparer leur contenu de la base de référence distribuée ; les identifiants et équivalences doivent être migrés de façon testable.

**C — Publication des seuls éléments autorisés**

L'éditeur peut publier du code MIT sans distribuer le snapshot ou utiliser AniList, **mais ce serait une variante fonctionnelle** : sans adaptation, le build actuel refuse les métadonnées absentes et la recherche hors ligne perdrait des résultats. Ne pas activer une telle solution sans test complet et validation explicite du propriétaire du projet.

## Recommandation immédiate

- **Ne pas valider « droits/licences » dans la PR** tant qu'aucune permission ou alternative réellement mise en œuvre n'est démontrée.
- **Ne pas publier la release binaire** contenant le snapshot tant que les droits de redistribution restent indéterminés.
- **Prendre en compte la présence du snapshot dans l'historique Git public** pour toute mesure de réduction de diffusion. Une éventuelle réécriture d'historique comporte des risques et nécessite un plan de conservation/migration ; ne pas faire de force-push improvisé.
- Aucune suppression, bascule de fournisseur, régénération du catalogue, déploiement ni publication n'a été effectuée pendant cette revue.

## Checklist

- [x] Conditions AniList et avertissements Jikan examinés.
- [x] Usages AniList, MAL/Kitsu, snapshot et cache des affiches identifiés dans les sources.
- [x] Enjeu de redistribution de la base historique publique consigné.
- [ ] Réponse écrite d'AniList applicable au projet ou suppression effective de l'usage interdit.
- [ ] Origine et permission de redistribution du snapshot, dont synopsis / URLs / métadonnées ; ou remplacement licite documenté.
- [ ] Justification des images : stockage/affichage/cache, licences et attributions.
- [ ] Audit final des livrables GitHub et tests après tout changement technique.
