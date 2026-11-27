# ALM V2.2.0 — recette VM après retour utilisateur du 27 novembre 2026

Préversion de développement. Ne pas publier avant la validation des tests Windows et de la recette interactive. La V2.1.3 publique et ses données ne sont pas modifiées.

## Mise à jour des sources de la VM

Fermer ALM, puis ouvrir PowerShell dans le clone de test. Vérifier que le dossier est propre avec git status. Utiliser git pull --ff-only, git lfs pull puis npm.cmd ci si les dépendances sont à réinstaller. Démarrer avec ALM_TEST_PROFILE=1 et npm.cmd run app dans la même fenêtre. Ne pas connecter un compte communautaire de production. Les sources et les écrans affichent désormais 2.2.0 ; le profil de test est sélectionné automatiquement pour les sources candidates, y compris sans variable d'environnement.

Pour l'installateur distinct VM TEST : [PR #9](https://github.com/Gentil-Robot/Anime-Local-Manager/pull/9), contrôle GitHub Actions, artefact ALM-2.2.0-VM-TEST après réussite de verify et vm-preview-installer. Vérifier le SHA-256 et VM-TEST-REPORT.json. Les mises à jour automatiques restent désactivées dans le paquet VM.

## Lot 1 — Cockpit, navigation et identité ALM

- ALM Cockpit, au-dessus d'Animés, est l'unique emplacement des bandeaux « Épisodes récemment diffusés », « Reprenez votre visionnage » et « Suites absentes de ma bibliothèque ». Les listes Animés et En cours conservent leurs fonctions existantes.
- Vérifier le menu, le fil d'Ariane, les flèches de défilement sur fenêtre large et étroite, le retour arrière et avant. Cliquer une carte pour ouvrir la fiche détaillée ALM et naviguer entre les fiches de la même rangée.
- Les suites utilisent le catalogue local vérifié, avec illustration si une URL fiable existe, sinon le logo ALM. Une suite n'est ajoutée qu'après confirmation. Une jaquette non possédée peut nécessiter un accès au fournisseur autorisé ; aucune aspiration massive.

## Lot 2 — Import des fichiers et reconnaissance

- Ouvrir Importer, puis « Associer mes fichiers » à côté des onglets de listes. Aucune page Mes fichiers indépendante.
- Choisir un dossier PC, disque externe ou NAS. Tester les conventions S01E03, 02x05, Anime - 12, E07, 03, noms avec groupe et résolution, sous-dossiers Saison 2. Une série ambiguë doit rester à confirmer.
- La recherche utilise les titres personnels et alternatifs, puis le catalogue local embarqué. Corriger le titre via la recherche et choisir la fiche par nom, saison et identifiant. Modifier saison et épisode manuellement avant de confirmer. Si la fiche n'est pas dans la collection, un ajout à À voir est proposé uniquement sur confirmation.
- Relancer ALM et retrouver les associations. Dissocier puis associer de nouveau pour corriger une association existante. Aucun fichier vidéo ne doit être déplacé, modifié, partagé ou téléchargé.

## Lot 3 — Progression et disponibilité locale

- Dans En cours, les fiches indiquent le prochain épisode et proposent le fichier associé, ou l'import de fichiers si absent. La lecture via le lecteur du système ne marque jamais un épisode comme vu.
- Dans Saisons, vérifier l'affichage des diffusions confirmées connues des sept derniers jours, du statut vu/non vu et du statut d'association. Cliquer « Vérifier les fichiers locaux » : uniquement les associations ciblées sont contrôlées sur disque/NAS. Les associations non vérifiées ne sont pas des preuves de possession.
- Retirer un fichier, déconnecter le NAS, tester un fichier en double ou un lien symbolique. L'ouverture doit échouer de façon explicite ; aucune progression ne doit être changée. Le contrôle est borné et peut s'arrêter en cas de délai trop long.
- Les numéros manquants sont les écarts entre épisodes associés, pas une affirmation que toute vidéo est absente.

## Lot 4 — Jaquettes, hors connexion et retour aux écrans originaux

- Dans Anime DNA, vérifier la distribution de notes et le volet des affiches : les titres identifiés sans poster utilisent le cache privé ALM et les métadonnées déjà présentes. Les images locales fournies restent prioritaires. Si aucune source autorisée n'existe, un substitut visuel ALM reste nécessaire.
- Couper Internet et relancer ALM. Catalogue embarqué, progression, notes et associations doivent rester consultables. Les images déjà présentes localement restent utilisables, mais aucune image non téléchargée ou fichier NAS déconnecté ne peut être garanti.
- Mes souvenirs doit retrouver l'ancien écran, sans chronologie ajoutée. Le calendrier/historique existant reste intact. Les sept langues doivent fonctionner.

## Contrôle indépendant

Le script scripts/test-v220-review.cjs vérifie la structure, l'absence de pages dupliquées, le routage, le pipeline d'images, les API et la syntaxe. Les suites de reconnaissance, de stockage, d'intégration, de bandeaux et de notes sont adaptées à cette organisation. La CI complète comprend 180 suites. Une inspection visuelle réelle sur la VM reste nécessaire : les tests DOM ne remplacent pas la validation de rendu Electron.

Les chemins absolus restent dans le profil local. Le catalogue et le cache ne sont pas redistribués au-delà des droits de leurs fournisseurs. Aucun code ou visuel de Seanime ou AnimeList n'a été copié. Les lots ont été développés séparément ; le contrôle est une suite de tests distincte, pas un agent IA autonome.

## Lot 5 — Veille sécurité du 27 novembre

- La PR cible exclusivement release/v2.2.0, jamais release/v2.1.3. Aucun paquet VM n'est publié automatiquement.
- La résolution npm d'Electron 45.5.0 se fait dans une tâche en lecture seule avec le registre officiel, comparaison de l'intégrité dist.integrity et production d'un delta du lockfile à examiner avant intégration. Un artefact de résolution n'est pas un installateur validé.
- Le contrôle security-review part d'une autre extraction et vérifie les versions réellement exécutées (Node hôte, Electron, Node embarqué, Chromium), puis les parcours natifs moteur/MFA/mise à jour et les fournisseurs réseau sur fixtures. L'inventaire de points TLS/HTTP2/Jikan est un signal de revue, pas une preuve de vulnérabilité.
- Le paquet VM n'est accepté qu'après vérification du runtime du binaire décompressé et du binaire réellement installé. La recette interactive PC/NAS et la recette Linux restent obligatoires avant publication.

### Résolution de dépendances

Electron 45.5.0 (publication officielle du 24 novembre), Node embarqué 24.22.3 et Chromium 156.0.8078.109. Le job npm 140534797258 a résolu le lockfile avec npm et vérifié dist.integrity. Seuls la déclaration racine et le paquet Electron changent. SHA-256 du lockfile généré : 428b3392567166add6ba703fbe367c1a6560971e81e2693c76473c839382fa83. Le contrôle du lockfile commité est bloquant. L'audit npm, les 180 suites, les parcours natifs et la reconstruction doivent encore confirmer cette mise à niveau. Aucun paquet de production n'est publié.

### Isolation de publication et Linux

Les workflows de la branche candidate ne publient aucune release et ne disposent pas de jeton d'écriture ni de secrets de signature. Les commandes de publication manuelle sont suspendues. La branche publique 2.1.3 conserve ses propres scripts. Les deux chemins de création du planificateur et d'identité Windows sont neutralisés dans l'aperçu VM avec contrôle de leur nombre avant construction. Le build Linux utilise une identité de paquet distincte, construit AppImage et DEB, teste l'AppImage en mode extract-and-run et installe/désinstalle le DEB seulement sur un runner jetable. Le test de la version utilisateur sur Linux reste à faire sur une VM dédiée. Un nouveau contrôle d'isolation rejoint le plan (180 suites).

### Version harmonisée et audit de l'outillage

La version candidate 2.2.0 est maintenant déclarée dans release-version.json (releaseCandidate=true), le package/lockfile, les écrans, les manifestes et les contrôles. Les anciens fichiers d'historique, le format de sauvegarde 2.0.0-beta.82 et la version publique précédente 2.1.3 ne sont pas réécrits. Le hook beforePack refuse tout empaquetage de cette candidate avec l'identité de production ; seuls les aperçus VM TEST isolés sont autorisés. La branche de publication publique reste inchangée. Le lockfile a été revérifié par npm avant la seule modification de sa version racine ; la CI doit vérifier la nouvelle empreinte.

L'audit npm du 27 novembre a signalé 6 entrées modérées liées à minimatch (CVE-2026-118764 / GHSA-g3hv-75wg-m249) via electron-builder, avec des copies 9.0.9 et 10.2.6 réservées à l'outillage dev. Le correctif amont est minimatch 11.0.1, une migration majeure hors de la plage des versions actuelles ; ne pas forcer de rétrogradation d'electron-builder ni d'override ESM sans preuve de compatibilité. Les globs de build sont des sources contrôlées, jamais des entrées utilisateur. L'audit production distinct est bloquant et la présence des copies affectées dans les dépendances de production est interdite. Le risque résiduel build doit être réévalué avec la première version stable d'electron-builder intégrant le correctif. Sources : https://github.com/advisories/GHSA-g3hv-75wg-m249 et https://github.com/electron-userland/electron-builder/issues/10537.

## Recette des cinq retours VM du 27 novembre — seconde itération

- Navigation : vérifier que le cadran ALM Cockpit est différent de la bibliothèque. Le bandeau contient une illustration originale en SVG de Meow, chat pilote d'un hydravion rouge. Vérifier les animations (hélice, vol, écharpe et nuages), la taille à 100/125/150 % et le réglage d'animations réduites. Aucune vidéo ni ressource distante.
- Anime DNA : toutes les jaquettes notées sont accessibles par les flèches ; clic sur 10, 9, 8, etc. filtre le carrousel sans quitter la page. Reclic ou menu Toutes les notes réinitialise. Le filtre Sans note reste disponible. La fiche doit s'ouvrir avec navigation dans la sélection. Les indicateurs globaux ne changent pas et Mes souvenirs reste inchangé.
- Importer > Associer mes fichiers : les fixtures de noms [EroGaKi-Team]_Ayakashi_04_[5B8549C1].avi, [Kyuu-F] Mugen no Juunin 07 vostfr .avi et [MFF-T]_Malice_Doll_OAV.avi doivent produire Ayakashi/4, Mugen no Juunin/7 et Malice Doll/OAV sans épisode inventé. Choisir explicitement la bonne adaptation (année, type, MAL ID), vérifier les résultats du catalogue local, conserver la sélection si la recherche revient. Pour une OAV complète ou un film, confirmer le mode œuvre complète, qui n'incrémente aucun épisode. Les jaquettes de recherche sont uniquement celles déjà en cache, sinon une indication textuelle reste disponible. Aucun téléchargement de jaquette déclenché par le scan. Tester l'association, l'ouverture, la relance, la dissociation, un nouveau scan, un NAS inaccessible et la reconnexion. Les identifiants de scan empêchent une action retardée de viser un autre dossier.
- Suites absentes : tester les cinq statuts, les confirmations d'épisodes inconnus et l'absence de doublons ; chaque ajout réussi actualise le Cockpit et la bibliothèque.
- Validation : une suite supplémentaire de recette ciblée s'ajoute au plan existant (181 suites), et les tests du retour VM sont rejoués dans la revue séparée. Les contrôles automatiques n'établissent pas à eux seuls la qualité visuelle ou le comportement d'un vrai NAS : recette manuelle nécessaire. Aucune publication.

## Troisième itération VM — 27 novembre

Les règles de la seconde itération sont remplacées sur les points suivants :
- Cockpit : la reprise comprend toutes les fiches au statut En cours, sans plafond caché, avec la reprise réelle en premier, puis les animés à commencer (épisode 1) et ceux dont le total est atteint (vérification du statut, aucun épisode fictif). Le compteur doit correspondre aux fiches En cours ; l'ordre et le regroupement de saisons de la bibliothèque peuvent différer. Vérifier un jeu de 10 fiches dont 4 entamées et une bibliothèque de plus de 40 fiches.
- Bandeau : ciel sur toute la largeur disponible, nuages, étoiles, hydravion original, aller-retour, virages et figure ; aucun son ni chargement externe. Vérifier sur 36 secondes et avec animations réduites, dans la VM, à plusieurs facteurs de zoom.
- Anime DNA : suppression du menu Afficher et de la galerie des non-notés (ces fiches restent accessibles dans la bibliothèque). Les deux flèches se trouvent aux extrémités des jaquettes. Le défilement horizontal avance d'une jaquette, sans reconstruire les cartes. Cliquer sur une barre filtre ; recliquer réinitialise. Statistiques générales préservées.
- Import local : zone de jaquette à gauche, double-clic ou Entrée pour ouvrir la fiche locale ; plusieurs résultats dans la galerie de détail. Le scan reste local et les couvertures déjà en cache s'affichent. Les jaquettes absentes peuvent être chargées explicitement par le bouton global ou individuel, via le cache et l'allowlist existants ; seuls les URL publiques des images sont requêtées, jamais les chemins ni noms de vidéos. Les cinq statuts sont proposés pour les nouvelles fiches. Une fiche existante conserve son statut et sa progression. La possession d'un fichier ne marque aucun épisode vu ; Terminé est une déclaration explicite avec la confirmation habituelle si total inconnu.
- Maintenance : les quatre tâches existantes restent présentes. Le traitement Saisons actualise maintenant le cache des diffusions si la tâche est activée et a réussi ; une erreur de source est signalée et rejouée suivant la politique existante. Cockpit et Saisons lisent le cache local lorsqu'ils sont visibles ; Cockpit recharge les suites lors d'un succès récent Saisons/Catalogue détecté. Les réglages de réseau et de notifications restent respectés. Aucun scan planifié de vidéos ou NAS. Ne pas créer de tâche Windows de production depuis la candidate : le profil source et les paquets VM sont volontairement isolés. Le test d'inscription réelle d'une tâche Windows et du fonctionnement application fermée doit être réalisé dans un environnement jetable isolé avant publication.
- 182 suites prévues et contrôle séparé : tests des cinq statuts import, absence de modification d'une fiche existante, navigation des candidats, cache local, galerie et planification. La CI et les essais visuels et OS natifs restent nécessaires.

## Quatrième itération — retouches, performances, nettoyage et sécurité
- Meow : visage redessiné, avion plus petit, trajectoire de 24 s (anciennement 36 s). Contrôler les virages, le zoom et le réglage des animations réduites.
- Les deux galeries du Cockpit disposent de flèches latérales ; défilement d'une carte. Aucun changement de statut.
- Les couvertures des correspondances sélectionnées se chargent automatiquement via le cache borné. Le téléchargement nécessite une identité issue d'une recherche locale récente ou de la bibliothèque ; aucun URL arbitraire, nom de vidéo ni chemin envoyé au fournisseur. Le bouton de rechargement reste disponible. Les images locales existantes sont réutilisées. Une couverture indisponible conserve le placeholder.
- Optimisations : dates de tri calculées une fois par fiche, index de fiches par ID lors du rendu, regroupement des rafraîchissements concurrents, une lecture du fichier d'associations par lot de disponibilité, déconnexion d'observateurs. Les répertoires sont énumérés par blocs, dans la limite du budget d'entrées, et triés ensuite. L'ordre de sélection peut différer pour un répertoire tronqué. Aucun scan automatique.
- Nettoyage : anciennes étiquettes inutilisées, garde d'initialisation inopérante et rafraîchissement de sélecteur redondant. Les fonctions historiques restent en place lorsqu'elles pourraient être appelées indirectement.
- Sécurité : un seul scan simultané ; racines devenues des liens symboliques/jonctions refusées ; validation de l'identité et de la cohérence des associations persistées ; contrôle de l'origine IPC et des images. Ces contrôles ne constituent pas un audit exhaustif des courses filesystem ni de la sécurité communautaire.
- 183 suites prévues. Fixture de 1000 fiches avec 100 événements chacune : au plus 100000 analyses de date ; 12 vérifications de disponibilité = une lecture du fichier ; cache d'images simulé sans requête réelle. Ces mesures de complexité ne quantifient pas la RAM/CPU réelle. Profilage natif et NAS ainsi que téléchargement réel des 3 jaquettes restent à vérifier. Le contrôle PowerShell dispose d'un délai plus large et distingue l'erreur de lancement du résultat du parseur. Les installateurs restent bloqués tant que les suites ne réussissent pas. La CI imprime le nom du script et l'échec pour les fixtures.
