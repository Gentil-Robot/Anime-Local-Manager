# ALM V2.2.0 — recette VM après retour utilisateur du 27 novembre 2026

Préversion de développement. Ne pas publier avant la validation des tests Windows et de la recette interactive. La V2.1.3 publique et ses données ne sont pas modifiées.

## Mise à jour des sources de la VM

Fermer ALM, puis ouvrir PowerShell dans le clone de test. Vérifier que le dossier est propre avec git status. Utiliser git pull --ff-only, git lfs pull puis npm.cmd ci si les dépendances sont à réinstaller. Démarrer avec ALM_TEST_PROFILE=1 et npm.cmd run app dans la même fenêtre. Ne pas connecter un compte communautaire de production. Le numéro affiché depuis les sources peut rester 2.1.3 : la branche contient le développement 2.2.0.

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

Le script scripts/test-v220-review.cjs vérifie la structure, l'absence de pages dupliquées, le routage, le pipeline d'images, les API et la syntaxe. Les suites de reconnaissance, de stockage, d'intégration, de bandeaux et de notes sont adaptées à cette organisation. La CI complète comprend 179 suites. Une inspection visuelle réelle sur la VM reste nécessaire : les tests DOM ne remplacent pas la validation de rendu Electron.

Les chemins absolus restent dans le profil local. Le catalogue et le cache ne sont pas redistribués au-delà des droits de leurs fournisseurs. Aucun code ou visuel de Seanime ou AnimeList n'a été copié. Les lots ont été développés séparément ; le contrôle est une suite de tests distincte, pas un agent IA autonome.

## Lot 5 — Veille sécurité du 27 novembre

- La PR cible exclusivement release/v2.2.0, jamais release/v2.1.3. Aucun paquet VM n'est publié automatiquement.
- La résolution npm d'Electron 45.5.0 se fait dans une tâche en lecture seule avec le registre officiel, comparaison de l'intégrité dist.integrity et production d'un delta du lockfile à examiner avant intégration. Un artefact de résolution n'est pas un installateur validé.
- Le contrôle security-review part d'une autre extraction et vérifie les versions réellement exécutées (Node hôte, Electron, Node embarqué, Chromium), puis les parcours natifs moteur/MFA/mise à jour et les fournisseurs réseau sur fixtures. L'inventaire de points TLS/HTTP2/Jikan est un signal de revue, pas une preuve de vulnérabilité.
- Le paquet VM n'est accepté qu'après vérification du runtime du binaire décompressé et du binaire réellement installé. La recette interactive PC/NAS et la recette Linux restent obligatoires avant publication.
