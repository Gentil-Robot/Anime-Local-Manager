# Anime Local Manager V2.0.0 Bêta stable

**Version technique :** `2.0.0` · **Canal de diffusion :** `beta` · **Statut public :** Bêta stable, toujours en phase de recette.

**Base de travail :** Beta82 « Correctif-Partage-Age » explicitement validée le 25 octobre 2026. Les identifiants Windows, emplacements de données, le format des sauvegardes et les migrations historiques sont conservés. Cette archive **ne déploie rien** sur Vercel, Supabase, Cloudflare ou Resend.

**Installateur cible :** `Anime-Local-Manager-2.0.0-Beta-Stable-Setup-x64.exe` (non inclus tant que sa construction et sa recette NSIS sous Windows ne sont pas effectuées). **Code source intégral :** `Anime-Local-Manager-2.0.0-Beta-Stable-COMPLET.zip`.

**Important :** l'identifiant de version nu `2.0.0` se compare comme une version finale par SemVer. La publication doit impérativement être une **prépublication GitHub** et les mises à jour doivent rester sur le canal bêta explicitement configuré. Les utilisateurs conservant volontairement le canal stable ne recevront pas une prépublication. Voir `docs/RECETTE-V200-BETA-STABLE-2026-10-25.md`.

---

## Contribuer a la V2.0.0 (code open source)

Le code ALM est disponible sous licence **MIT**. Pour contribuer, lire [CONTRIBUTING.md](CONTRIBUTING.md) et [SECURITY.md](SECURITY.md). Le chantier de publication du code V2 est decrit dans [docs/PUBLICATION-OPEN-SOURCE-V2.md](docs/PUBLICATION-OPEN-SOURCE-V2.md). La recette de securite **Electron 45.2.1** et les etapes de publication sont decrites dans [docs/ELECTRON-45.2.1-RECETTE-ET-PUBLICATION.md](docs/ELECTRON-45.2.1-RECETTE-ET-PUBLICATION.md). La signature gratuite potentielle est documentee dans [docs/SIGNPATH-OPEN-SOURCE.md](docs/SIGNPATH-OPEN-SOURCE.md) : **aucune signature n'est encore active**.

> La grosse video originale est suivie par **Git LFS**. Avant de cloner, installer Git LFS ; `git lfs pull` permet de recuperer le vrai fichier pour les builds hors ligne. Les workflows de verification incluent l'option `lfs: true`.
>
> Publication du code et publication d'un installateur sont deux operations distinctes. La compilation du 26 octobre 2026 et les 151 suites de tests concernaient **Electron 45.0.0** et demeurent une reference historique. **La candidate actuelle utilise Electron 45.2.1 (Node embarque 24.22.1) ; son nouvel installateur doit etre recompile et revalide sous Windows avant publication.** La signature reste a organiser. Le site public et les services heberges ne sont pas deployes par ces instructions.

---

## Harmonisation des affichages de publication — 25 octobre 2026

La **version actuelle reste `2.0.0`**, sous le nom **« Anime Local Manager V2.0.0 Bêta stable »** et sur le **canal bêta**. La console de recette présente désormais les **151 tests** sous des libellés fonctionnels et avec des compteurs ; les anciens `test-betaXX` restent uniquement des noms techniques nécessaires au diagnostic et à la traçabilité. Les diagnostics communautaires ont également été alignés sur les métadonnées de version.

La procédure Windows utilise toujours `Publier Installateur Windows.bat` ; aucune migration de données ni aucun service distant n’est modifié par cette harmonisation. Voir [docs/HARMONISATION-AFFICHAGE-PUBLICATION-V200-2026-10-25.md](docs/HARMONISATION-AFFICHAGE-PUBLICATION-V200-2026-10-25.md).

Les références aux anciennes bêtas **plus bas** décrivent les versions historiques et non la version du produit actuellement livré.

---

## Correctif partage et âge — 25 octobre 2026

Le formulaire **Modifier mon profil** applique désormais la même règle que **Mon compte** : exclusion obligatoire avant 18 ans, choix activable ou désactivable pour un majeur ayant enregistré son attestation. Le choix est conservé entre les deux écrans. La bibliothèque locale reste intacte.

Cette passe comprend **32 contrôles navigateur** et **10 suites ciblées**, tous réussis. Le détail et les preuves figurent dans **[docs/CORRECTIF-PARTAGE-AGE-2026-10-25.txt](docs/CORRECTIF-PARTAGE-AGE-2026-10-25.txt)**. Les textes sont adaptés dans les sept langues et les fichiers partagés du site sont synchronisés. Ce correctif ne nécessite aucune nouvelle migration SQL.

La version reste **2.0.0-beta.82**. Les corrections précédentes de pagination, de transparence et de nom du compte sont conservées. Les sections suivantes décrivent leurs propres livraisons et résultats historiques ; aucun déploiement de production n’est effectué par la création de cette archive.

---

## Correctif pagination et transparence — 25 octobre 2026

Cette archive ajoute à la dernière candidate Beta82 le retour en haut lors des changements de page et un fond légèrement transparent pour le bloc compte. Version conservée : **2.0.0-beta.82**.

La recette de cette passe comprend **33 contrôles de pagination**, **54 contrôles navigateur existants** et **12 suites ciblées**, tous réussis. Le détail, les preuves avant/après et le périmètre des vérifications sont dans **[docs/CORRECTIF-UI-PAGINATION-2026-10-25.txt](docs/CORRECTIF-UI-PAGINATION-2026-10-25.txt)**.

Les rapports ci-dessous décrivent les archives précédentes. Leurs résultats d’audit restent conservés comme historique ; les contrôles propres au présent correctif sont identifiés séparément.

---

## Candidate de sortie — contrôle complet du 25 octobre 2026

Cette candidate reprend **la Beta82 UX validée**, conserve la version **2.0.0-beta.82**, et affiche uniquement le nom du compte en bas du menu.

La revue ALM + API corrige les réponses internes tardives après arrêt du moteur, préserve les diagnostics de fin de processus, borne les appels AniList et respecte leurs délais de limitation. Le lecteur de sources publiques refuse la compression Brotli tant que son moteur embarqué ne bénéficie pas du correctif vérifié. Une migration SQL additive renforce la confirmation de suppression de son propre compte ; elle est fournie dans les sources, sans application automatique à Supabase.

Le bilan, les mesures, les preuves et les conditions de publication figurent dans **[docs/RELEASE-CHECKUP-2026-10-25.md](docs/RELEASE-CHECKUP-2026-10-25.md)**. Les rapports datés antérieurs décrivent leurs propres exécutions. La présence d'une archive candidate ne prouve pas une installation Windows ni un déploiement distant.

---

## Correctif UX — souvenirs, pagination et compte — 24 octobre 2026

Cette livraison reprend le ZIP **Beta82 Correctif Publication Test Beta73** fourni le 24 octobre. La version reste **V2.0.0 Beta stable — 2.0.0-beta.82**.

- **Mes souvenirs** : jaquettes et titres ouvrant la fiche anime, accès distinct au carnet, recherche et filtres combinables, tri par titre ou date de sortie. Les annotations automatiques reconnues sont masquées par défaut et réaffichables ; les textes originaux restent dans les carnets, sauvegardes et exports.
- **Navigation** : pagination limitée aux listes qui en ont besoin ; commandes en haut et en bas synchronisées uniquement sur les longues listes. Un seul contrôle vertical actif par zone de lecture, sans reste de la bibliothèque sur les autres pages.
- **Cartes** : Recommander à un ami revient avant Supprimer, y compris après un changement de filtre ou de page ; les contrôles de connexion et de contenu restent appliqués à l'action.
- **Communauté** : titre/compteur Animés en commun cliquable, sans bouton redondant ; identité réelle du compte au bas du menu ; effacement immédiat de l'ancien panneau compte lors d'une déconnexion.
- **Finitions** : légende supprimée sous le GIF XML, raccourci Nouvelles saisons retiré des outils de bibliothèque ; la page reste dans le menu.

Les changements, résultats et limites des vérifications de cette livraison figurent dans **[docs/CORRECTIF-UX-2026-10-24.md](docs/CORRECTIF-UX-2026-10-24.md)**. Les fichiers partagés du site sont synchronisés dans cette archive. Construire l'installateur avec **Publier Installateur Windows.bat**, après extraction complète dans un nouveau dossier.

---

Beta 82 - GAP & UPGRADE (amis, recommandations et jaquettes) - 24/10/2026
-------------------------------------------------------------------------
- Les animes en commun du profil et de la bibliotheque ami utilisent maintenant la meme comparaison : bibliotheque personnelle locale et seulement fiches partagees par l'ami.
- Le cache local de jaquettes controle aussi les hôtes apres redirection, normalise les fragments d'URL et limite leur longueur.
- Une indisponibilite reseau temporaire permet une nouvelle tentative apres 90 secondes (et non 30 minutes) ; les contenus invalides conservent un délai de 30 minutes. Toujours pas de telechargement massif des 30 430 jaquettes.
- Pour recommander un anime possede, le serveur evite de calculer les statistiques et l'activite sans lien avec l'envoi ; les controles d'age, de destinataire et de contenu restent actifs.
- Verification : `node scripts/test-beta82-social-cache-hardening.cjs` et `node scripts/measure-beta82-social-recommend.cjs` ; toute publication Windows passe par le BAT NSIS habituel.
- La copie statique du site communautaire est resynchronisee avec les composants partages de l application (profils, textes, styles et recommandations) et son manifeste SHA-256 est recalcule. Aucun deploiement distant.
- Aucun changement du format des donnees, des composants de securite existants, des API distantes ou du catalogue/karaoke.


### Beta 82 — affiches locales, amis et recommandations (24/10/2026)

- Le profil d'un ami présente une section **Animés en commun** et un onglet avec les mêmes outils de recherche, tri, filtres et navigation par saisons que la bibliothèque partagée. Le calcul utilise les identifiants MAL et uniquement les éléments que cet ami a partagés. La base de données et les RLS sont inchangées.
- Les fiches d'animés autorisées permettent **Recommander à un ami** depuis Bibliothèque, Recherche, Classement, Calendrier et la fenêtre Catalogue : choix d'un ami accepté et message facultatif. Le serveur retrouve les fiches non possédées dans le catalogue MAL local, valide le contenu puis utilise les quotas et permissions existants. Pas de fonction supplémentaire côté Supabase.
- Les affiches **de la bibliothèque locale** issues de CDN connus sont enregistrées progressivement, seulement lorsqu'elles sont affichées : stockage dans le dossier d'images d'ALM, maximum **512 Mio**, téléchargements en parallèle limités à **3**, images existantes et locales conservées, repli sur l'image distante en cas d'erreur. Les 30 430 jaquettes ne sont jamais téléchargées d'un bloc. Le cache d'affiches est jetable et n'est pas inclus dans les données utilisateurs transmises à la communauté.
- Les contrôles de non-régression dédiés sont `scripts/test-beta82-common-profile.cjs`, `scripts/test-beta82-cover-cache.cjs` et `scripts/test-beta82-recommend-catalog.cjs`. La publication Windows reste **NSIS uniquement**.

Passe Beta82 profilage/safeStorage (24 octobre 2026)
-------------------------------------------------
Derniere revision : migrations safeStorage vers l'API Electron 45 asynchrone,
copies des dependances de test dedoublonnees, timing detaille Beta69/Beta71
et preparation Windows. Voir docs/BETA82-PROFILAGE-SECURITE-2026-10-24.md.
La publication se lance toujours avec Publier Installateur Windows.bat.
Windows/NSIS et migration DPAPI reel doivent encore etre verifies sur la VM.

Correctif ciblé de sécurité npm — 24/10/2026
--------------------------------------------
Cette révision conserve toutes les optimisations de la Beta 82 précédente.
Elle corrige uniquement les dépendances signalées par l'audit npm
(body-parser 1.20.9, multer 2.5.0, fast-uri 3.1.9,
undici 7.30.1 et 6.29.1). Aucun audit n'est désactivé.
Lire `docs/BETA82-RECETTE-PREPUBLICATION.md`.
Construire normalement avec `Publier Installateur Windows.bat`.
La compilation NSIS native et les nouvelles alertes npm sont à contrôler sur Windows.

Nouvelle bêta 82 — 2.0.0-beta.82 — correctifs de prépublication de la bêta 81 validée (23/10/2026)
=========================================================
Cette livraison corrige uniquement la Beta81 Reprise80 validée. Extraire
Beta82-Reprise81 dans un nouveau dossier, sans remplacer les fichiers utilisateur. Le détail de la référence, des fonctions,
des tâches planifiées et de la recette Windows se trouve dans
`docs/Beta81-Reprise80-et-VM.txt`.

- Animes en commun avec l’ami choisi : identifiants partagés, regroupement existant,
  détail exact des saisons, mêmes cartes/filtres/tris ; aucune nouvelle table.
- Filtres sur les propositions chargées dans Nouvelles saisons ; actions groupées
  limitées aux propositions visibles ; sélections conservées entre les filtres.
- Bloc du site centré et adaptable dans À propos, GIF conservé.
- Maintenance : propriété et dossier de la tâche vérifiés, désactivation Windows
  conservée, résultat explicite, reprise après interruption et diagnostic sans secret.
- Electron 45.0.0 etait la version verrouillee lors de la validation Beta82 ; la candidate open source est mise a jour en 45.2.1 le 31 octobre 2026, avec nouvelle recette requise.

Les nouveautés abandonnées TMDB/JustWatch, Où regarder, pays/plateformes, avatars
sociaux et partage de souvenirs ne sont pas réintroduites. Le carnet présent
avant la bêta 80 est conservé. Aucun déploiement ou effacement de compte/donnée
personnelle. La recette Windows native reste à exécuter sur VM.

# Anime Local Manager — Bêta 82 (correctifs de prépublication)

**Version : `2.0.0-beta.82` — V2.0.0 Beta stable.**

ALM organise ta bibliothèque d’animés sur ton ordinateur : imports, épisodes, notes, nouvelles saisons, actualités et recommandations. La communauté est facultative. L’interface propose le français, l’anglais, l’espagnol, l’allemand, le japonais, le portugais brésilien et le chinois simplifié.

[Site ALM](https://animelocalmanager.com/) · [Code source et téléchargements](https://github.com/Gentil-Robot/Anime-Local-Manager)

## Créer l’installateur Windows

Cette archive contient les sources ; elle ne contient pas d’EXE déjà compilé.

Pour créer l’EXE, le seul lancement nécessaire est `Publier Installateur Windows.bat` : il exécute les contrôles lui-même. `Verifier Beta82 Windows.bat` reste un diagnostic facultatif, sans installateur. La recette détaillée est dans `docs/BETA82-RECETTE-PREPUBLICATION.md`. Aucun service distant n’est déployé par cette archive.

1. Extraire toute l’archive dans un nouveau dossier.
2. Installer Node.js **22.12 minimum** et npm **10 minimum**. La version de construction conseillée est indiquée dans `.node-version`.
3. Lancer **`Publier Installateur Windows.bat`**.
4. Récupérer l’installateur `Anime-Local-Manager-2.0.0-beta.82-Setup-x64.exe` et son rapport `release-check.json` dans `dist/`.

Le bouton habituel **`Publier Installateur Windows.bat`** reprend automatiquement les étapes déjà vérifiées pour les mêmes sources, dépendances et outils. `REPRENDRE_BUILD_WINDOWS.bat` reste disponible et utilise le même moteur. Les audits et essais natifs du livrable restent obligatoires.

Sous Windows, l’espace de compilation est choisi automatiquement dans un chemin court du profil utilisateur, en priorité `%LOCALAPPDATA%\ALM\b\...`. Aucun déplacement du projet, nouveau lanceur, modification du registre ou droit administrateur n’est requis pour cette sélection. Le dossier source conserve `dist/` et `logs/` ; `.release-work/workspace.json` indique l’emplacement du cache. Une erreur de construction conserve les preuves et l’ancien installateur. Ne pas supprimer ce cache avant une reprise.

Le correctif de promotion finale évite aussi `fs.mkdtempSync` dans un chemin de source profond. Le livrable et son rapport sont toujours copiés vers le dossier `dist/` d’origine avec retour arrière en cas d’échec.

Les entrées NSIS sont contrôlées avant les tests longs. Le nettoyage des essais Electron attend l’arrêt de leur processus enfant et utilise des tentatives bornées ; une erreur persistante n’est jamais ignorée. Le nouveau contrôle `test-beta82-build.cjs` porte le plan à **129 suites**, sans retirer les 128 précédentes.

La Bêta 71 corrige les dépendances manquantes au démarrage (`body-parser` notamment). La préparation copie les dépendances installées dans le dossier de construction : un lien ou une jonction vers le dossier d’origine faisait perdre des dépendances indirectes à npm et electron-builder. La copie est vérifiée par empreintes ; une reprise avec une copie modifiée ou un ancien lien reconstruit cette étape.

Le contrôle du paquet vérifie les empreintes ASAR, les imports locaux et les dépendances de production déclarées, y compris leurs dépendances indirectes. Un manque bloque la préparation avant la création de l’installateur. Un test utilise réellement electron-builder avec l’ancien lien, vérifie le rejet du paquet incomplet, puis construit le paquet corrigé et lance son moteur avec Electron : catalogue de 30 430 fiches, import, sauvegarde et persistance après un second lancement.

Le contrôle complet de l’EXE Windows reste obligatoire lors de la publication. En cas d’échec, son code de sortie, l’étape atteinte et les journaux Electron sont conservés dans `logs/smoke-diagnostics/`. Joindre le fichier JSON indiqué dans le journal. Le profil de test est isolé ; aucune base utilisateur n’est copiée dans ce rapport. Les erreurs du moteur masquent les secrets.

Windows utilise uniquement l’installateur NSIS. La signature de l’installateur nécessite un certificat du mainteneur. Le workflow `.github/workflows/windows-installer.yml` permet aussi de construire et tester sur un runner Windows neuf.

## Lancer depuis les sources

Depuis la racine du dossier :

```bash
npm ci
npm run app
```

`LANCER_ALM_WINDOWS.bat` ouvre également l’application sous Windows. Pour le mode navigateur, utiliser `npm start`, puis ouvrir `http://127.0.0.1:3123`. Le mode navigateur et l’application Electron peuvent utiliser des dossiers de données différents.

## Linux

Après installation de Node.js et npm :

```bash
bash "Creer App Linux.sh"
```

Les paquets **AppImage** et **DEB** sont créés dans `dist/`. Rendre l’AppImage exécutable avant son lancement ; sans FUSE, essayer son option `--appimage-extract-and-run`. Le lancement depuis les sources utilise les mêmes commandes npm que sous Windows.

## Sauvegardes et catalogue

- Exporter une sauvegarde depuis **Réglages → Sauvegardes** avant une mise à jour importante. Une sauvegarde peut contenir des clés personnelles de services : la garder privée.
- Les données de l’application installée restent dans son dossier utilisateur. Ne pas supprimer ce dossier lors d’une mise à jour ; conserver aussi les images locales.
- Le catalogue de **30 430 fiches** est embarqué. Le premier lancement et la construction n’exigent pas de téléchargement de catalogue depuis Jikan.
- `npm run metadata:restore` contrôle et restaure le catalogue local si nécessaire ; cette commande ne rend pas ses données plus récentes. Les nouvelles saisons se vérifient dans ALM.

Les imports MyAnimeList XML, BetaSeries CSV et sauvegardes ALM sont disponibles dans l’application. Après un import, examiner les écarts signalés dans **Contrôle anime**.

## Confidentialité, compte et partage

La connexion ne publie pas automatiquement ta bibliothèque. Dans **Réglages → Mon compte**, choisir les rubriques autorisées puis **Mettre à jour mon partage**. Seuls les amis acceptés voient les rubriques partagées. Les notes privées, chemins locaux et clés API sont exclus.

**Retirer les données partagées** efface la copie communautaire ; **Supprimer mon compte** supprime le compte et ses données communautaires après réauthentification. Ces actions ne suppriment pas ta bibliothèque locale. La suppression du compte retire aussi la newsletter liée à cette adresse ; une désinscription séparée reste possible depuis les emails.

À l’inscription, la date de naissance et une attestation sur l’honneur sont demandées. Elles restent privées. Un ancien compte peut compléter cette déclaration dans **Réglages → Mon compte → Âge et partage**, sans recréer le compte. La date enregistrée ne peut pas être remplacée depuis le client ; une erreur se corrige via le contact. La date et l’attestation sont supprimées avec le compte. Il s’agit d’une déclaration, sans contrôle d’identité.

Les contenus adultes sont exclus pour les mineurs et les comptes sans déclaration. Les majeurs peuvent garder cette exclusion ou la désactiver. Un contenu adulte n’est accessible qu’entre amis acceptés, majeurs et ayant tous deux désactivé l’exclusion. Le serveur contrôle les bibliothèques, recommandations et lectures directes, y compris les données déjà publiées. Les fiches non classées restent privées. Les éléments mis en avant et graphiques partagés restent limités aux contenus accessibles à tous. Après un changement de choix, **Mettre à jour mon partage** publie les nouvelles rubriques autorisées ; le retrait d’une autorisation est appliqué immédiatement par le serveur.

Les messages ALM présentent le français, puis l’anglais. Après une inscription, vérifier également le dossier spam. Un avatar importé est recadré et réduit ; un GIF devient une image fixe.

La politique de confidentialité, les mentions légales et le formulaire de contact sont accessibles dans ALM et sur le site. Le lien Discord est facultatif ; aucune liste de membres n’est chargée à l’ouverture.

Pour recommander un animé, se connecter puis cliquer sur **Recommander à un ami**, entre **MAL** et **Supprimer** sur une fiche de la bibliothèque. Choisir un ami accepté et, si souhaité, ajouter un message. La cloche rassemble les alertes du calendrier en bleu et les demandes/recommandations de la communauté en violet.

La bibliothèque d’un ami présente des fiches compactes comme le Classement. Cliquer sur une fiche ou sur un animé recommandé ouvre la même fenêtre de détails que dans En cours, avec le choix du statut d’ajout. Fermer cette fenêtre conserve les filtres. Consulter une recommandation ne la marque pas comme traitée.

Les quotas serveur sont séparés : **10 demandes d’amis** et **10 recommandations** sur 24 h glissantes. Les tentatives d’ajout infructueuses comptent dans la limite des demandes. Un même animé ne peut être recommandé au même ami qu’une fois par 24 h.

Après le premier partage explicite, la mise à jour automatique des rubriques autorisées est activée : au lancement puis toutes les cinq minutes, seulement si les données ont changé. Elle peut être désactivée dans **Mon compte** ; un profil privé suspend les envois.

Les cinq statuts de visionnage sont disponibles dans les formulaires, fiches et recommandations, dans les sept langues. Les bibliothèques partagées reprennent les filtres compacts et les compteurs de la bibliothèque locale ; les années sont triées de la plus récente à la plus ancienne, avec le nombre de fiches. Les compteurs portent uniquement sur les données partagées et accessibles.

La page **Amis** permet de rechercher par nom ou identifiant et de trier A–Z, Z–A, ajout récent ou ancien. Cliquer sur le nom ou l’avatar d’un ami ouvre son profil. Les demandes en attente restent disponibles dans les notifications.

La ligne d’identifiant et d’état de partage ouvre **Réglages → Mon compte** par double-clic, Entrée ou Espace, depuis les pages communauté. Le bouton **Copier mon identifiant** et le double-clic sur l’identifiant dans les réglages permettent toujours de le copier. L’état est rafraîchi automatiquement, sans réinitialiser les filtres ; une réponse ancienne ne peut plus remplacer un état plus récent. Le statut « à jour » correspond aux données effectivement publiées ; une modification survenue pendant un envoi reste à publier. Le formulaire d’ajout et de modification défile dans sa zone centrale, avec les actions et les flèches fixes en bas.

Les favoris du profil comprennent les notes de **9 ou 10/10**, plus les ajouts manuels. Retirer un favori reste prioritaire même après un changement de note ; un ajout manuel reste favori si sa note descend. Ces choix ne modifient ni les notes ni les autorisations de partage.

Les séries partagées utilisent des cartes avec jaquette, progression cumulée et **Voir les saisons**. La fenêtre ne contient que les saisons accessibles après filtrage. Une fiche ouvre le détail habituel ; ajouter un animé ne copie ni la note ni la progression de l’ami.

Les cinq compteurs de communauté sont affichés sur une ligne sur grand écran dans Amis, le profil et sa bibliothèque. **Bibliothèque d’un ami** affiche uniquement les deux compteurs globaux de bibliothèques accessibles et d’animés qu’elles partagent. Les totaux excluent les données privées, les demandes non acceptées, les blocages et les contenus filtrés. Le même animé présent dans deux bibliothèques compte deux fois. Une indisponibilité affiche « — » plutôt qu’un faux zéro. Les statistiques de bibliothèque incluent **En pause**, entre Terminés et En cours ; cliquer dessus filtre la liste.

**Exclure les contenus adultes de mon partage** est activé par défaut et obligatoire pour les mineurs et les comptes sans déclaration d’âge. Un majeur peut le désactiver ; un contenu adulte reste réservé à deux amis acceptés, majeurs et ayant tous deux désactivé l’exclusion. Une fiche non classée reste privée. Le catalogue livré identifie les contenus admissibles sans appel réseau supplémentaire. Les migrations du dépôt appliquent ce filtrage aux lectures, publications, favoris, vitrine et recommandations. Les bibliothèques locales restent complètes. Cette classification dépend des métadonnées : elle ne constitue ni une vérification d’identité ni une modération automatique des avatars ou des textes libres.

Pour le maintien de cette politique, `npm run community:content-check` vérifie les identifiants autorisés contre le snapshot embarqué. Toute évolution du catalogue demande une nouvelle validation de la politique et une migration de la liste côté serveur ; les nouveaux identifiants restent privés entre-temps. Le filtre est défini par la migration `20261017211127_alm_beta66_content_policy`, complétée par les migrations suivantes. Vérifier leur application sur le service ciblé avant publication.

Dans **À propos**, la bannière GIF est affichée en petit format sous le clip ; les quatre fonds d’écran restent à droite sur grand écran.

## Carnet personnel et souvenirs

**Mon carnet** est accessible depuis les cartes de la bibliothèque et les fiches d’animés déjà présents dans ta collection, y compris dans la recherche, les classements et les fenêtres de détail. Il réutilise tes notes existantes. Les paragraphes sont conservés ; la note sur 10 reste facultative.

Dans la même fenêtre, écrire ses impressions, ajouter un **épisode marquant** (numéro, titre, commentaire et note facultative), puis choisir un **animé ou épisode de l’année**. Les épisodes restent attachés à leur fiche et à leur saison ; ces souvenirs ne changent pas la progression. L’année est celle de ton choix, indépendamment de la date de sortie. Un choix par catégorie et par année est possible : remplacer un choix déjà enregistré demande confirmation. Enregistrer valide toute la fenêtre ; Annuler conserve l’état précédent. Une modification concurrente est signalée et le brouillon reste affiché.

**Outils de la bibliothèque → Mes souvenirs** regroupe les commentaires, épisodes marquants et choix annuels, avec recherche, filtres et accès direct au carnet. Ces informations restent locales, sont incluses dans les sauvegardes JSON et chiffrées, et ne sont jamais envoyées sur le profil communautaire. Les exports lisibles contiennent aussi ces informations privées : les vérifier avant de les partager.

## Importer et exporter des listes personnelles

Le troisième onglet **Importer → Importer une liste libre**, ou le raccourci des outils, accepte un copier-coller depuis Word ou Excel, ou un fichier TXT, CSV ou TSV. Un titre par ligne suffit ; les colonnes titre, commentaire, note et statut sont aussi prises en charge. Détection des en-têtes, choix du séparateur et numéros de colonnes permettent d’adapter sa liste. Word et Excel s’utilisent par copier-coller ; les fichiers DOCX et XLSX ne s’ouvrent pas directement dans cet outil.

L’analyse utilise le catalogue local, sans requête réseau. Vérifier les correspondances avant de sélectionner les lignes à importer. Les titres ambigus demandent un choix ; un titre absent peut être conservé manuellement. Les doublons déjà dans la bibliothèque sont laissés intacts, même si la liste contient d’autres commentaires ou notes. Un animé déclaré terminé dont le nombre d’épisodes est inconnu demande confirmation ; aucun total n’est inventé. Après import, **Annuler cet import** retire les ajouts encore inchangés pendant dix minutes et conserve les fiches modifiées depuis.

Limites par analyse : **500 lignes et 500 000 caractères**, fichier de 1 Mo maximum ; l’analyse expire après vingt minutes. Une fiche accepte un commentaire principal de 50 000 caractères, jusqu’à 300 épisodes marquants et 300 choix annuels, avec des textes bornés. Les notes d’épisodes vont de 1 à 10 ou restent vides. Les limites et les validations sont appliquées côté serveur local.

**Outils de la bibliothèque → Exporter une liste lisible** propose un CSV UTF-8 avec séparateur point-virgule pour Excel et un carnet HTML autonome, imprimable depuis un navigateur. L’export utilise la langue de l’interface, inclut toute la bibliothèque et n’exécute pas les textes saisis. Ces formats servent à la lecture ; conserver la sauvegarde JSON ou chiffrée pour restaurer toutes les données dans ALM.

Le carnet et l’import libre utilisent les confirmations internes d’ALM. Après une confirmation ou un choix de dossier, le clavier retrouve la fenêtre de l’application ; les champs récupèrent aussi le focus au clic. L’import libre reste dans la même fenêtre que MyAnimeList et BetaSeries, avec navigation au clavier entre les trois onglets et conservation du brouillon lors d’un changement d’onglet.

Dans **À propos**, la vidéo et le GIF sont regroupés dans la colonne de gauche, face aux quatre wallpapers. Le bloc de budget a été retiré.

## Diagnostic et sessions

**Envoyer mon diagnostic** est disponible dans Mon compte, Stockage et intégrité et Mises à jour. Il prépare le formulaire « Signaler un problème » avec un aperçu et une case pour retirer le rapport. Aucun envoi n’a lieu avant validation du formulaire. Tous ces boutons préparent le même rapport : stockage, intégrité, catalogue, langues, sources, karaoké, versions des dépendances, derniers contrôles des services, maintenance et planification. La partie compte est ajoutée uniquement si un compte est connecté. Le rapport contient uniquement des versions, compteurs, états et codes d’erreur ; il exclut les secrets, emails, noms des ordinateurs, chemins, titres et notes. Le message saisi reste à vérifier par son auteur.

Le formulaire est limité côté serveur à **3 envois par adresse et par heure**, avec un plafond de **30 sur 24 heures pour le service**. CAPTCHA, validation des entrées et destinataire fixe sont conservés.

**Mes sessions** affiche le nom du PC de l’application et permet de déconnecter un appareil choisi. Un navigateur ne peut pas lire le nom du PC ; les anciens appareils ne seront identifiés qu’après leur prochaine connexion avec cette version. Le nom est un libellé privé, jamais une preuve d’identité.

Les libellés de sessions, la déconnexion ciblée et les jaquettes nécessitent les migrations correspondantes sur le serveur ciblé. Le formulaire prévoit un diagnostic filtré. Le client vérifie cette capacité et bloque l’envoi du rapport si le serveur est trop ancien ; le contact sans rapport reste disponible. Ces dispositions dans les sources ne prouvent pas la configuration effectivement déployée.

## Tâches planifiées

Dans **Réglages → Mises à jour**, activer la maintenance, choisir les tâches et leurs intervalles, puis enregistrer. Elles sont désactivées par défaut.

La planification système nécessite l’application installée. Sous Windows, la tâche est exécutée dans la session de l’utilisateur, sans mot de passe Windows enregistré ni élévation ; ALM vérifie son enregistrement et affiche son état. La tâche Windows est rangée dans le dossier **ALM** du planificateur. Une ancienne tâche reconnue est déplacée lors du prochain lancement avec la maintenance activée. Depuis les sources, les travaux automatiques fonctionnent seulement pendant qu’ALM est ouvert. La restriction aux connexions non limitées reporte les tâches si le coût réseau est inconnu.

Pour vérifier Windows : installer la nouvelle version NSIS, activer la maintenance puis cliquer sur Enregistrer. Dans le Planificateur, ouvrir **Bibliothèque du Planificateur de tâches → ALM**. Si rien n’apparaît, utiliser **Réparer la planification Windows**. Un refus de Windows affiche un code précis (permissions, service, définition ou délai) ; joindre le diagnostic au contact quand le service de diagnostic est activé. La vérification relit la tâche, son exécutable, son utilisateur et ses arguments. Ne pas saisir de mot de passe Windows dans ALM.

L’enregistrement des réglages reste possible pendant une maintenance. Le travail en cours utilise sa configuration de départ et les prochains travaux utilisent les préférences enregistrées.

`--maintenance` lance le même exécutable sans fenêtre, exécute les travaux activés dont l’échéance est arrivée, puis quitte. Il respecte les restrictions réseau et les intervalles. Une mise à jour NSIS remplace l’exécutable et ses ressources au même emplacement ; la tâche utilise ensuite cette version. Au lancement, ALM vérifie l’enregistrement et rétablit la tâche si la maintenance est activée.

## Vérifier une modification

```bash
npm run verify
```

Ce contrôle couvre les imports, la bibliothèque, les sauvegardes, la communauté, les protections d’accès et la chaîne de publication. `npm run verify:beta75` contrôle les statuts par animé, leur validation et leur enregistrement. `npm run verify:beta74` contrôle les correspondances de l’import libre, les jaquettes, la fiche partagée avec Recherche, les recherches concurrentes, les sept langues et la conservation des choix. Les contrôles d’âge et de formulaire restent inclus dans la vérification générale. Les tests utilisent des données isolées ; leurs références sont dans `scripts/fixtures/`.

Les contrôles de dépendances sont disponibles avec `npm run audit:dependencies`. Ne pas appliquer automatiquement une correction forcée qui change les versions majeures.

## Maintenir le site et les emails

```bash
npm run build:community
```

Le site statique à déployer est généré dans `community/site/`. Les fichiers partagés viennent de `public/` et la configuration publique vient de `community-config.json`.

Les migrations SQL ont une seule copie dans `supabase/migrations/`. Le client nécessite les migrations jusqu’à `20261018115617_alm_beta73_charter.sql`, dans leur ordre : sessions, jaquettes, limites sociales, classification des contenus, déclaration d’âge, index et charte. Leur présence dans le dépôt ne prouve pas leur application au serveur. Vérifier le schéma et les politiques réellement déployés avant une publication. La déclaration d’âge est privée ; l’exclusion des contenus adultes est obligatoire avant 18 ans et pour les comptes sans déclaration.

La fonction des formulaires est dans `supabase/functions/alm-public/`. Conserver les secrets Resend, Turnstile et le destinataire de contact dans l’environnement serveur. La configuration publique contient uniquement les paramètres publics et la clé Supabase publishable ; ne jamais y ajouter une clé `service_role` ou un mot de passe SMTP.

Pour modifier les modèles d’emails de compte, éditer `supabase/email-templates/catalogue.json`, puis exécuter :

```bash
node supabase/email-templates/build.cjs
```

Les modèles générés utilisent les liens sécurisés Supabase. Leur génération n’envoie aucun message et ne modifie pas les réglages du service.

## Avant une diffusion

- Vérifier que le backend a reçu toutes les migrations du dépôt jusqu’à la Bêta 73 avant de publier la communauté complète.
- Contrôler les alertes de sécurité et l’état réel de la [protection contre les mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) sur le projet ciblé ; vérifier sa disponibilité sur l’offre active.
- Construire et essayer l’installateur sur la VM Windows : lancement, sauvegarde, presse-papiers, avatar, vidéo, enregistrement et exécution des tâches planifiées.
- Tester réellement inscription, confirmation du compte, partage entre deux comptes, newsletter et désinscription. Une livraison par le prestataire ne garantit pas l’arrivée dans la boîte principale Gmail.
- Compléter la vérification des renseignements d’éditeur auprès de l’hébergeur et appliquer les durées de conservation annoncées dans la politique de confidentialité.

Les mentions de confidentialité suivent les informations à fournir décrites par la [CNIL](https://www.cnil.fr/fr/informer-les-personnes) ; elles doivent rester cohérentes avec le fonctionnement réel et les renseignements de l’éditeur.

Les fichiers `before-beta29-integrity.json`, `before-beta45-animes.sqlite` et `before-beta55-catalogue.json` du dossier utilisateur sont des copies de récupération prises avant des migrations. `beta55-catalogue-report.json` décrit les corrections du catalogue. Ils ne sont pas chargés comme bibliothèque active ; les conserver pour pouvoir revenir sur une ancienne migration.

## Licence et ressources

Le code est distribué sous licence **MIT**, fournie dans `LICENSE`. Les logos et illustrations ALM proviennent des ressources approuvées du projet ; les planches du dictionnaire et la bannière sont des créations du projet. Les affiches, données, musiques et autres contenus tiers restent soumis aux droits de leurs auteurs et aux conditions de leurs sources. Conserver les notices de licence des bibliothèques embarquées.

## Avatars

Les nouvelles images de profil sont limitées à **2 Mo avant conversion**. ALM les recadre, retire les métadonnées et les compresse en une image de **256 px maximum et 32 Kio maximum** avant envoi. Les anciens avatars restent lisibles ; aucun effacement automatique. Le plafond serveur historique reste de 65 536 caractères encodés. Le format compact est envoyé dans le profil ; aucun fichier original n’est hébergé.

### Beta 75

- Dans l’import libre, chaque animé possède son propre menu **Statut** : Terminé, En pause, En cours, À voir ou Abandonné. Le statut initial vient du fichier ou du choix par défaut. Les changements restent dans l’aperçu jusqu’à la validation de l’import, même après une recherche, une ouverture de fiche, un changement d’onglet ou de langue. Les fiches déjà présentes restent intactes.
- Le serveur valide chaque statut et applique les règles de progression et la confirmation des épisodes inconnus au statut réellement choisi.

### Beta 74

- Import libre : propositions avec jaquettes, titre, format et année ; choix explicite et fiche détaillée identique à Recherche. Cliquer sur une jaquette ouvre la fiche sans importer.
- La liste source se replie après analyse et reste modifiable ; une seule zone défile et les actions restent en bas. Un compteur indique les lignes sélectionnées.
- Les recherches gardent la correspondance choisie, n’immobilisent pas les autres lignes et ignorent les réponses devenues obsolètes. Jaquette absente : visuel de remplacement. Tous les nouveaux libellés existent dans les sept langues.
- Adresse du site centrée et habillée dans À propos, sous la vidéo, à côté du GIF ; les quatre wallpapers sont conservés. Version du menu issue de la même valeur que la version générale.

### Communauté et site

- Inscription visible sur le site ; charte et conditions en sept langues, acceptation obligatoire et datée côté serveur pour les nouveaux comptes. Les anciens comptes restent utilisables. Mettre ALM à jour pour créer un nouveau compte.
- Flèches de défilement bornées à leur taille normale sur toutes les pages ; liens vers le site dans À propos.
- Chargement communautaire visible dès le clic, lectures identiques mutualisées et courtes vérifications de session pour un même jeton. Les droits sont contrôlés par Supabase à chaque requête ; les règles d’âge et d’amitié sont conservées.

## Corrections des services — 21 octobre 2026

Référence : archive Bêta 78 SHA-256 655bdbedf917984e6da4f825a96625514c6e9bcee2134250fc4e2c34345281fa.

- Le site est reconstruit depuis les sources corrigées de la Bêta 78, notamment la reprise du chargement Turnstile après erreur.
- Le marqueur de version de la fonction alm-public est généré depuis package.json lors du build du site, puis comparé au manifeste du site par un test isolé.
- Aucun changement de schéma, clé, offre, règle Auth ou politique DMARC.
- Aucun installateur Windows ou binaire desktop de cette version n’est produit dans cette passe.

La publication distante et sa validation sont décrites dans le rapport des services, avec les identifiants et empreintes observés. La version de package seule ne constitue pas une preuve de déploiement.

## Performances — Bêta 80

Les requêtes paramétrées de lecture SQLite réutilisent au plus 128 plans préparés, sans cache des résultats ni report des écritures. Le filtre du catalogue « hors bibliothèque » utilise un index sur la valeur numérique de l’identifiant et deux recherches séparées ; les règles de correspondance sont conservées. Les lectures HTTP sans enrichissement évitent une copie de référence inutilisée. Les listes utilisent des index par identifiant. Le navigateur évite le calcul de mise en page des cartes hors écran, tout en conservant leurs contenus et actions. La traduction des ajouts DOM évite de comparer chaque racine avec toutes les autres.

Les mesures reproductibles et leurs limites sont décrites dans `scripts/performance/README.txt`. Les protections Electron, les transactions SQLite, les sauvegardes et le format des données restent actifs. Avant une mise à jour, conserver une sauvegarde ALM. Pour revenir à la Bêta 79, réinstaller les sources ou le paquet antérieur et conserver le même profil ; le nouvel index SQLite est compatible avec l’ancienne version. Aucun service hébergé n’est modifié par cette livraison.

La bibliothèque présente 60 cartes par page. La recherche, les filtres, les tris et les compteurs portent toujours sur toute la bibliothèque. Les commandes Première / Précédente / Suivante / Dernière sont disponibles au-dessus et au-dessous des cartes. **Tout afficher** conserve la vue complète ; ce mode peut être lent avec plusieurs milliers de fiches. **Afficher par pages** rétablit l’affichage borné. Le choix d’affichage reste en mémoire pour la session, sans modifier les données.


## Beta82 — vérification avant publication (23/10/2026)

- **Mise a jour du 31 octobre 2026 :** Electron est maintenant verrouille sur **45.2.1** dans `package.json` et `package-lock.json` (Node embarque : **24.22.1**). Cette indication remplace la version d'origine de la recette Beta82 ; les journaux historiques ne sont pas modifies.
- Pour les commandes npm, **se placer dans le dossier ALM** : `cd /d C:\chemin\vers\Anime-Local-Manager-Beta82-Reprise81-Prepublication`. Ne jamais lancer `npm install` depuis `C:\Windows\System32`.
- `.nvmrc` et `.node-version` pointent sur Node.js **22.23.4** pour les outils de publication ; Node 22.12 reste le minimum historique.
- Le formulaire distant accepte explicitement les ports loopback **3123 à 3143** (maximum des replis gérés par `server.js`). Les origines étrangères restent refusées. Après correction, déployer la fonction Edge ET les sources du site de même version ensemble, puis valider avec Turnstile réel.
- Lancer directement `Publier Installateur Windows.bat` sur Windows ; la vérification est intégrée. La validation du `.exe` et de la restauration distante n’est pas fournie par l’archive seule.
- **Droits AniList / médias, plan Hobby, responsable RGPD, sauvegarde distante et licence** : les pièces externes prévues dans `compliance/release-gates.json` restent nécessaires ; aucune conformité juridique n’est supposée acquise. Ne pas annoncer « prêt pour diffusion générale » avant clôture.
- **Attention :** la préparation de l’archive n’a déclenché aucun déploiement public, aucun envoi d’email et aucune écriture dans la base distante.

## Passe GAP & UPGRADE du 24 octobre 2026 — correctifs locaux et reproductibilite

Cette revision est construite exclusivement sur l'archive Beta 82 optimisee et corrigee du 24 octobre
(SHA-256 : `6898a9441421915d1070f56cd28e9ac924e7221eabcf93342ce68fa3fc19bfc0`).
Elle conserve le clip, le catalogue, la bibliotheque, les sept langues, l'installateur NSIS
x64, les 131 tests anterieurs, les controles de securite et les services existants.

- Upload des affiches locales : ecriture asynchrone dans un fichier temporaire unique,
  publication par renommage, verification des doublons et controle des symlinks.
  Aucune ecriture partielle n'est annoncee comme succes ; une erreur de stockage
  renvoie un code neutre et un message localise dans les sept langues.
- Node.js pour construire ALM : `.node-version` et `.nvmrc` conseillent maintenant
  **22.23.4** (correctifs de securite du 21/10/2026). Le minimum de compatibilite
  `>=22.12.0`, les dependances de projet et l'Electron embarque ne changent pas.
- Deux tests ajoutes : `scripts/test-gap82-local-images.cjs` et
  `scripts/test-gap82-toolchain.cjs`. Le plan contient desormais **133 suites**.
- Mesure reproductible hors reseau :
  `node scripts/performance/bench-gap82-upload.cjs` ; ce banc mesure uniquement
  le temps synchrone de retour de la route et le temps jusqu'a confirmation
  de l'ecriture, avec des images fictives de 7 Mio. Ce n'est pas un test
  Electron, HTTP ni une comparaison complete de la duree d'un import.

Les services de production (Supabase, Vercel, Cloudflare, Resend), la base de donnees
et les migrations ne sont pas modifies par cette livraison. Pour un verdict de
publication, lancer `Publier Installateur Windows.bat` avec les dependances npm
verrouillees, les audits et NSIS sur Windows ; les succes du banc Linux ne
remplacent pas ces controles. Voir le rapport externe GAP & UPGRADE pour les
mesures, limites, protections et la methode de retour arriere.

### Fiabilisation des jaquettes — reprise réseau

Le cache des jaquettes de la bibliothèque conserve son quota de 512 Mio et
ses trois téléchargements simultanés. Les erreurs HTTP sont distinguées :
429 et 503 peuvent imposer une attente `Retry-After` à l'ensemble du CDN,
404 et formats invalides ne sont pas relancés rapidement, les erreurs réseau
temporaires suivent un délai croissant (90 s initialement, maximum 15 min).
Seules les images visibles dont le cache a échoué sont retentées après un
retour de connexion, progressivement et par la route HTTP locale. Aucun
téléchargement direct de secours ne contourne la file du cache.
Les jaquettes déjà téléchargées restent utilisables hors ligne.

