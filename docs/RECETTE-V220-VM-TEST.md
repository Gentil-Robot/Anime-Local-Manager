# ALM 2.2.0 — recette de test sur machine virtuelle Windows

**Préversion privée de test**, issue de `release/v2.1.3`, non publiée comme release officielle.

## Télécharger

Ouvrir la [PR #9](https://github.com/Gentil-Robot/Anime-Local-Manager/pull/9), puis son contrôle GitHub Actions « ALM - controle des sources (PR) ». Après **réussite** de `verify` et `vm-preview-installer`, télécharger l'artefact `ALM-2.2.0-VM-TEST-<sha>` dans la page du workflow. Décompresser l'archive GitHub, vérifier le SHA-256 du fichier `.exe` avec `VM-TEST-REPORT.json`, puis lancer `Anime-Local-Manager-2.2.0-VM-TEST-x64.exe` sur la VM.

Si le contrôle est rouge ou si l'artefact n'existe pas, **ne pas considérer le paquet comme prêt**. La compilation peut échouer ; seule une sortie CI marquée `verified-vm-preview` autorise la recette.

## Protection de la version actuelle

- Identité Windows séparée : `fr.gentilrobot.animelocalmanager.vmtest`.
- Nom visible : `Anime Local Manager VM Test`.
- Dossier utilisateur propre à cette application ; les bibliothèques et caches de la 2.1.3 ne sont pas écrasés.
- Mise à jour automatique et planificateur de tâches désactivés dans le paquet VM.
- Pas de déploiement Supabase, Vercel, Cloudflare ou Resend. **Éviter de se connecter avec un compte communautaire de production pendant les essais**.
- Installation non signée possible : SmartScreen peut afficher un avertissement. Vérifier le fichier et sa provenance ; ne pas contourner les protections sans les comprendre.

## Scénarios à tester

1. **Démarrage** : vérifier la mention « V2.2.0 VM TEST », démarrage Electron, catalogue local, ouverture de la bibliothèque sans réseau.
2. **Mes fichiers** : bouton « Choisir un dossier », sélectionner un dossier de fichiers `.mkv` ou `.mp4`. Tester un chemin local puis un dossier partagé NAS/UNC. Vérifier le nombre de fichiers, un nom reconnu, un inconnu et les limites d'analyse.
3. **Associations locales** : sélectionner une proposition fiable puis « Associer ». Vérifier que l'indication « Fichier local associé » apparaît pour un animé **En cours**. Relancer l'application et réouvrir le dossier : l'association doit être toujours présente. Tester « Dissocier ».
4. **Saisons** : aller dans la page **Saisons** existante. Le bloc « Suites absentes de ma bibliothèque » doit afficher les suites du catalogue local qui correspondent à une relation vérifiée et ne sont pas déjà présentes. Cliquer « Ajouter à À voir », confirmer et vérifier la nouvelle fiche.
5. **Hors connexion** : retirer l'accès Internet sur la VM, relancer ALM, vérifier qu'« En cours », « Mes fichiers » et la recherche locale des suites fonctionnent dans les limites des ressources déjà présentes.
6. **Mise à jour** : le script de suivi natif Windows V2.2.0 est inclus dans le code, mais l'**auto-updater est volontairement désactivé dans le paquet VM** pour éviter de toucher à la version stable. Les tests CI NSIS vérifient l'installation et le remplacement en mode sans interface. L'affichage interactif réel de la barre de progression pendant une mise à jour devra être validé avec une recette spécifique, sous contrôle, avant distribution publique.
7. **Désinstallation** : supprimer l'application **VM Test** uniquement. Vérifier que la V2.1.3 et ses données restent intactes.

## Limites connues du prototype

- Le scan utilise la boîte de dialogue native et **ne suit pas les liens symboliques** ; il lit noms et métadonnées de fichiers, jamais le contenu des vidéos.
- Association par titre conservatrice ; les titres ambigus ne sont pas associés automatiquement.
- Les chemins d'association sont enregistrés **sur le PC uniquement**, pas dans Supabase ni dans les sauvegardes.
- Les suggestions de suites proviennent d'un sous-ensemble borné de la bibliothèque et des relations déjà vérifiées. Elles peuvent être incomplètes.
- Les jaquettes tierces hors ligne **ne sont pas étendues** sans validation de leurs droits.
- La fenêtre de progression visible reste à valider dans une VM Windows interactive en situation de mise à jour.

Signaler avec la version du système, la description de l'action, le message exact et, si possible, une capture écran **sans chemins NAS ou données personnelles**.

## Bandes horizontales « Épisodes diffusés » / « Reprenez votre visionnage » (essai VM)

Les deux bandeaux sont une évolution des pages **Animés** et **En cours** existantes : **pas de nouveau Cockpit**. Apparence créée pour ALM, sans code ni images copiés de tiers. La liste verticale complète et ses filtres restent accessibles plus bas.

1. Créer ou importer des fiches avec statut **En cours** et progression partielle (par ex. 4/12 épisodes). Ouvrir **Animés**, puis **En cours** : « Reprenez votre visionnage » montre « Épisode 5 », le niveau d'avancement et une jaquette s'il y en a une. Les cartes sont défilables au clavier, à la souris ou avec les flèches.
2. Cliquer sur une carte : le formulaire de suivi **existant** s'ouvre. **Aucun épisode n'est marqué comme vu automatiquement** ; aucune lecture vidéo ou plateforme externe ne démarre.
3. « Épisodes récemment diffusés » affiche uniquement les diffusions **confirmées, non estimées, au cours des sept derniers jours**, dont le numéro est supérieur aux épisodes déjà vus. Source : **état de diffusion local déjà suivi par ALM** (lecture du cache sans contacter de fournisseur pendant l'affichage). Le bouton ↻ lance, **sur action volontaire**, la vérification prévue dans ALM, qui peut contacter AniList ou ses solutions de repli. (\`GET /api/airing\`) ; le badge \`NOUVEAU +N\` représente ce nombre réel parmi les diffusions connues, **pas** le nombre d'épisodes disponibles sur un service de streaming. Si le suivi ne contient aucune diffusion récente, un message explicite s'affiche, sans données inventées.
4. Modifier la progression dans la fiche, puis revenir dans « En cours » : les deux bandeaux doivent se mettre à jour. Une série terminée doit disparaître du bandeau de reprise. Une série sans épisode vu ne doit pas prétendre être « à reprendre ».
5. Vérifier les sept langues FR, EN, ES, DE, JA, PT-BR, ZH-CN, l'usage sans Internet (données déjà locales), le défilement au clavier et le masque des bandeaux dans « À voir » et les autres services.
6. Les images sont tirées des jaquettes **déjà référencées dans la bibliothèque ALM**, en réutilisant la route de cache local existante lorsqu'elle est applicable. Aucune aspiration ou redistribution nouvelle d'images tierces n'est effectuée.

**Limites :** les images ne sont pas des captures de scènes vidéo et ALM n'est pas un lecteur de streaming ; seul le bouton de vérification peut lancer une recherche réseau bornée par le moteur de diffusion déjà présent dans ALM.


## Upgrade V2.2.0 : quatre améliorations locales et deux vues enrichies

L'objectif est d'améliorer les services **déjà existants**. Seanime sert de référence pour la continuité entre collection, fichiers et progression. AnimeList (cwh555/AnimeList) sert de référence fonctionnelle pour les regroupements par notes et la présentation chronologique. Aucun code, composant ni visuel tiers n'est copié.

### Recette « Mes fichiers »

1. Choisir un dossier avec plusieurs conventions de nommage : Frieren S01E04.mkv ; Vinland Saga 02x05.mp4 ; [Groupe] Frieren - 12 [1080p].mkv ; Frieren/Season 2/Episode 08.mkv ; fichiers sans numéro connu.
2. Confirmer que les titres alternatifs et numéros de saison servent à **proposer** les correspondances. Deux saisons portant un nom identique sans saison claire doivent imposer une sélection manuelle. Aucune association sans clic volontaire.
3. Associer E11 puis E13 et vérifier dans **Saisons** que E12 apparaît parmi les **épisodes non associés**, sans annoncer à tort que le fichier est introuvable sur le disque.
4. Relancer l'application hors connexion : dans « Mes fichiers », les associations précédentes doivent être visibles sans rescanner un dossier. Le bouton d'ouverture d'un fichier utilise le lecteur défini par l'OS et ne marque aucun épisode comme vu. Un NAS déconnecté doit afficher une indisponibilité explicite.
5. Tester les raccourcis de navigation « En cours » et « Saisons », les sept langues et la manipulation au clavier.

### Recette « Anime DNA » : explorer mes notes

1. Ajouter dans la bibliothèque quelques animés notés 10/10, 9/10 et 6/10 ainsi que des animés **sans note**.
2. Ouvrir **Anime DNA**, puis le volet « Explorer mes notes avec leurs affiches » sous « Distribution de tes notes ». Les notes de **1 à 10** doivent être regroupées séparément, les non-notés dans leur propre catégorie.
3. Choisir une note dans le filtre. Cliquer sur une affiche : la fiche de l'animé existante s'ouvre. **Aucune note n'est changée par le tableau** ; pas de glisser-déposer modifiant les données à cette étape.

### Recette « Mes souvenirs » : chronologie réelle

1. Renseigner volontairement une « Date de ce visionnage » (pour au moins deux épisodes), puis une « Date de fin de visionnage » sur un animé terminé.
2. Ouvrir **Mes souvenirs**. La « Chronologie de visionnage » se trouve en haut de la page, sans seconde page indépendante. Sélectionner l'année, cliquer sur une date ou un mois, puis alterner « Frise temporelle » et « Historique ».
3. Vérifier que la date de sortie / diffusion d'un animé **ne crée jamais un événement de visionnage**. Un animé terminé sans « Date de fin de visionnage » renseignée ne doit pas être placé arbitrairement.
4. Couper Internet : les dates personnelles, les notes et les images locales déjà disponibles restent utilisables. Les pochettes CDN non mises en cache peuvent laisser apparaître un fond de repli.

### Confidentialité, droit d'auteur et compatibilité

Les noms et chemins absolus des médias sont sauvegardés dans le profil **local**, jamais transmis à la communauté. Les associations enregistrées ne déplacent ni ne modifient les vidéos. Les dates et notes proviennent des champs personnels existants de la bibliothèque, sans récupération réseau et sans inférence historique. Les images de tiers sont soumises à leurs droits : les nouvelles vues réutilisent le cache privé déjà présent et ne réalisent aucune collecte massive. AnimeList est publié sous MIT, Seanime sous GPLv3 ; ces deux projets sont uniquement des références de comportement, sans réutilisation de code ou d'illustrations.

Les nouveaux tests sont intégrés au plan de vérification et doivent tous réussir avant qu'un nouvel installateur « V2.2.0 VM TEST » soit considéré comme utilisable. La 2.1.3 publique reste intacte.
