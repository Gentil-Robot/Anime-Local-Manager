# ALM V2.0.0 Bêta stable — vérifications de publication et droits

**Revue du 31 octobre 2026 — document de suivi, non certificat juridique.**  
Dépôt : https://github.com/Gentil-Robot/Anime-Local-Manager  
Pull request : https://github.com/Gentil-Robot/Anime-Local-Manager/pull/2

## État technique démontré

- **Build Windows validé** : GitHub Actions [41232220268](https://github.com/Gentil-Robot/Anime-Local-Manager/actions/runs/41232220268), commit `6c2c3508042fcd8d5b132ce9dd53e28952d71572`.
- Le journal de ce build constate **153 suites réussies**, un audit de production avec **0 alerte**, **15 alertes modérées** dans l'outillage, la construction NSIS et les essais d'installation sous Windows CI.
- Exécutable retenu : `Anime-Local-Manager-2.0.0-Beta-Stable-Setup-x64.exe`, **363 585 817 octets**, SHA-256 **`8081f774d45cc38e86b05376e9a0b0e6a141e0ec08b8d2d2a787b6e2e00f208f`** (journal du build et digest GitHub de l'asset du brouillon cohérents).
- Workflow de préparation de la release : [41235623558](https://github.com/Gentil-Robot/Anime-Local-Manager/actions/runs/41235623558), **réussi**. Il contrôle la concordance du SHA-256, du rapport `release-check.json` et de la réussite du test NSIS avant de créer la release.
- La **release `v2.0.0` reste en brouillon** avec EXE, `release-check.json` et `SHA256SUMS.txt`. Elle doit conserver `prerelease=true`. Le tag **n'est pas** `v2.0.0-beta` : les métadonnées techniques et les tests de mise à jour ALM attendent `v2.0.0`.
- Retour fonctionnel du mainteneur, le 31 octobre 2026 : « je confirme tout marche ». Ce retour inclut le contexte des tests Windows, vidéo et karaoké ; il n'est pas une preuve indépendante de chaque scénario sur tous les postes.
- Le **build le plus récent** a échoué lors d'une vérification documentaire exigeant les anciens noms Beta82 dans le README (GitHub Actions [41234752423](https://github.com/Gentil-Robot/Anime-Local-Manager/actions/runs/41234752423)). Le test de documentation a été corrigé **sans retirer les archives historiques ni supprimer les contrôles de contenu**, et le manifeste source a été synchronisé. **Attendre le résultat d'un nouveau workflow sur le dernier commit**, avant de considérer la branche courante comme de nouveau validée.

## Revue des licences et des médias — réserves ouvertes

### 1. Logiciel ALM et dépendances

- `LICENSE` : licence MIT pour le code d'ALM.
- `public/THIRD-PARTY-NOTICES.txt` et `community/site/THIRD-PARTY-NOTICES.txt` : notices MIT/0BSD des bibliothèques incluses.
- Ces notices **n'accordent aucun droit automatique** sur les données des fournisseurs, jaquettes, images, paroles, vidéos et enregistrements.

### 2. AniList — autorisation spécifique à documenter

Conditions officielles : https://docs.anilist.co/guide/terms-of-use

Le texte officiel interdit l'utilisation de l'API dans des services concurrents de suivi/listes anime/manga, y compris pour les données médias, et proscrit la collecte de masse. **ALM propose une bibliothèque et un suivi d'animés et consomme l'API AniList** : ce risque nécessite clarification écrite auprès du fournisseur, sans supposer que la gratuité ou les dons y changent quoi que ce soit.

**Action :** obtenir une autorisation applicable au cas d'ALM ou adapter/retirer l'intégration soumise à restriction avant une diffusion qui dépend de cette API. Archiver les termes/échanges pertinents et la décision.

### 3. Catalogue embarqué et jaquettes — chaîne de droits à justifier

Le manifeste `data/database/metadata-manifest.json` décrit **30 430 fiches** redistribuées dans `metadata-full.sql.gz`, à l'intérieur de l'installateur. Il ne donne pas la provenance juridique détaillée ni les licences de chaque source. Le code contient une logique de normalisation de données Jikan/MAL, mais cela ne suffit pas à démontrer les droits de redistribution de cette archive.

**Action :** documenter provenance, date, licence et droit de redistribution des métadonnées (synopsis inclus) ; distinguer liens vers images distantes et images réellement embarquées ; vérifier les droits des visuels tiers et les obligations d'attribution.

### 4. Chanson du karaoké et clip

`scripts/fixtures/karaoke/song.suno-source.json` indique une source musicale issue d'un flux Suno, avec paroles et durée. La vidéo du karaoké est distribuée avec l'installateur via Git LFS / `extraResources`. Les éléments visuels/sons peuvent relever d'autorisations distinctes.

Aide officielle Suno : https://help.suno.com/en/articles/9601665 et https://help.suno.com/en/articles/9601601. **Selon les conditions officielles consultées au 31 octobre 2026**, l'usage commercial est autorisé pour les créations effectuées sous abonnement éligible ; les créations du plan gratuit n'ont pas ces droits. Une souscription ultérieure ne confère pas automatiquement des droits rétroactifs.

**Action :** conserver les preuves de date, plan/conditions lors de la création de la piste, auteur des paroles et provenance du clip/visuels, puis décider de leur diffusion avec la licence appropriée. Ne pas présumer qu'un projet gratuit/open source est automatiquement exempté.

### 5. Visuels originaux et ressources du site

Plusieurs logos, fonds, GIF, affiches et photos sont distribués dans `public/assets` ; l'existence des fichiers n'établit pas leur auteur ni leurs droits.

**Action :** tenir un inventaire des créations propres, des fichiers générés via des services tiers et des éventuels éléments protégés reproduits, avec la licence ou permission applicable. Les photos personnelles ne doivent pas exposer d'informations sensibles.

## Décision conseillée

**Technique :** la release en brouillon possède un installateur Windows dont la cohérence SHA-256 et l'installation en CI ont été démontrées ; la branche courante doit encore retrouver un workflow vert après correction documentaire.

**Droits :** la revue n'est **pas clôturée** en l'absence de preuve sur AniList, le catalogue et les médias. Ce document n'atteste pas leur licéité. Conserver la release en **brouillon** tant que ces points n'ont pas été traités par le responsable du projet.

**Publication :** le tag voulu est `v2.0.0` avec l'option **Pre-release**. La fusion de la PR et les annonces sur le site/Discord/YouTube sont des décisions distinctes.

## Preuves à ajouter avant clôture

- [ ] Dernier GitHub Actions Windows et contrôle de sources : succès sur le commit final.
- [x] EXE `6c2c350` comparé aux preuves CI et au digest GitHub ; SHA-256 concordant.
- [x] Retour positif de recette Windows communiqué par le mainteneur.
- [ ] Conditions et autorisation AniList pour le cas d'utilisation ALM.
- [ ] Provenance et droits de redistribution du catalogue 30 430 fiches / médias.
- [ ] Justificatifs des droits de la piste Suno et du clip.
- [ ] Validation finale des éléments tiers et de la politique de publication.
- [ ] Release `v2.0.0` marquée **Pre-release** et publiée (pas seulement brouillon).
