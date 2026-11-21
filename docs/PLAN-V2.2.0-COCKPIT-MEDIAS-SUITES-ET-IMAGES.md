# ALM 2.2.0 — trois priorités et images hors ligne

Base source : release/v2.1.3, commit de7760550697bb0186a3486467e79ffa077133c1.
Statut : fondations expérimentales ; aucune version 2.2.0 distribuée.

## Priorité 1 — ALM Cockpit

Tableau de bord configurable avec blocs « En cours », « À venir », « Suites à ne pas manquer » et « Amis ». Reprendre les moteurs déjà présents dans ALM plutôt que recréer progression, calendrier ou communauté. Visibilité, ordre et préférences sauvegardés uniquement dans le profil local. Seven locales must remain supported: FR, EN, ES, DE, JA, PT-BR, ZH-CN. Contrôler clavier, lecteur d'écran, confidentialité, mineurs, absence de connexion et de compte.

## Priorité 2 — Bibliothèque vidéo PC / NAS

L'utilisateur choisit explicitement un dossier local ou réseau dans la boîte de dialogue native. Inventaire uniquement des noms et métadonnées de fichiers vidéo en lecture seule ; pas de téléchargement, pas de lecture du contenu, pas de partage des chemins avec une API distante. Ne pas suivre les liens symboliques et limiter le nombre d'entrées, la profondeur, le temps et les résultats. Associations film/anime/épisodes proposées, jamais imposées ; les noms ambigus demandent confirmation. Prévoir les essais Windows/UNC, NAS inaccessible, Linux, réanalyse et annulation.

Première brique de développement : lib/local-media-index.js, testée avec scripts/test-v220-local-media-index.cjs.
L'intégration à l'interface, la sélection sécurisée des dossiers et les associations restent à développer.

## Priorité 3 — Suites à ne pas manquer

Se baser sur les relations vérifiées de lib/local-season-links.js et sur le moteur existant nextVerifiedLocalSeason. Ne suggérer que les suites absentes de la bibliothèque. Différencier saisons, parties et films ; ne jamais ajouter une série ou avancer la progression sans validation explicite. Utiliser d'abord les données locales, sans nouveaux appels massifs à AniList.

Première brique : lib/sequel-watchlist.js, testée avec scripts/test-v220-sequel-watchlist.cjs.
Restent à développer : service local, affichage dans Cockpit et tests de liens ambigus.

## Images conservées hors ligne — règle de droit et conception

La 2.1.3 intègre déjà lib/cover-cache.js : stockage à la demande dans le répertoire utilisateur, limité à 512 Mio, pour certaines images de la bibliothèque ; un cache expiré est revalidé ou expulsé. Il ne garantit pas la conservation illimitée de chaque image.

Objectif V2.2 : images personnelles conservées durablement, suppression sur demande, source et attribution affichables, et fichiers externes cachés durablement uniquement lorsque leur licence ou une autorisation explicite le permet. Un fond ALM original remplace les images absentes. Aucun paquet de 30 430 jaquettes tierces intégré à l'installateur.

- Korbo : selon ses mentions légales, les images proviennent entre autres de TMDB et restent la propriété de leurs titulaires ; ne pas scraper/cacher depuis Korbo sans autorisation appropriée.
- Shiru : licence GPLv3 applicable au code, pas une autorisation générale de réutiliser des jaquettes tierces. Pas de reprise de code ou d'images.
- AniList : interdit la collecte massive, l'usage d'API comme stockage et certains trackers concurrents ; solliciter une autorisation pour le cas ALM.
- TMDB : respecter les crédits officiels, vérifier les droits et les conditions d'un cache persistant avant tout développement.
- MyAnimeList et autres sources : ne pas présumer que les images peuvent être téléchargées en masse ou redistribuées.

Sources : https://korbo.fr/mentions-legales ; https://docs.anilist.co/guide/terms-of-use ; https://developer.themoviedb.org/docs/faq ; https://github.com/RockinChaos/Shiru/blob/master/LICENSE ; https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000024423362/

## Préconditions de publication

Conserver le mode sans compilation native, les sauvegardes et les contrôles d'âge ; valider les sept langues ; tester un redémarrage sans Internet ; exécuter npm run verify et une recette d'installation Windows isolée ; ne jamais modifier la release v2.1.3 ni redistribuer d'images tierces non autorisées.

## Mise a jour Windows : progres visible et resultat independant d'ALM

Exigence 2.2.0 : l'installation declenchee depuis ALM doit afficher un suivi **independant de la fenetre Electron**. Le suivi est lance et confirme **avant** qu'ALM ne se ferme. Si Windows refuse de lancer ou d'afficher cette fenetre, ALM reste ouvert et conserve le fichier d'installation pour une tentative ulterieure.

Phases reelles : attente de fermeture, verification du SHA-256, installation silencieuse NSIS (barre animee **indeterminee**, aucun pourcentage trompeur), verification de l'executable et de sa version, resultat **reussite ou echec**. Le suivi reste visible jusqu'a la fermeture volontaire de la fenetre, meme si ALM ne redemarre pas.

Un echec du redemarrage ne doit **pas** devenir un faux echec d'installation. L'installateur doit retourner un code de sortie nul et sa cible/version doivent etre verifiees avant la confirmation de reussite. Les erreurs sont conservees dans `update-error.log`, l'installateur n'est pas efface en cas d'echec et les sept langues sont presentes dans la fenetre native.

Implementation experimentale : `lib/windows-update-progress.js` et integration dans `lib/windows-update-launcher.js` ; tests `scripts/test-v220-update-progress.cjs`, `scripts/test-windows-update-handoff.cjs` et recette Windows `scripts/smoke-update-handoff.cjs` (mode sans interface pour CI automatisee). Le rendu WinForms et l'installation reelle doivent encore etre testes sur un poste Windows interactif ; **aucune v2.2.0 publique a ce stade**.
