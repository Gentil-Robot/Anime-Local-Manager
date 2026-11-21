# ALM 2.2.0 — évolution des services existants, nouveaux outils et images hors ligne

Base source : release/v2.1.3, commit de7760550697bb0186a3486467e79ffa077133c1.
Statut : fondations expérimentales ; aucune version 2.2.0 distribuée.

## Priorité 1 — Amélioration des services ALM existants (sans page « Mon Cockpit »)

**Décision de conception du 21 novembre 2026 : NE PAS créer de nouvel accueil « Cockpit », ni reproduire la bibliothèque, les statistiques ou les amis dans une page concurrente.** L'utilisateur souhaite une évolution des services déjà présents : chaque fonction va dans sa rubrique naturelle ; une page nouvelle n'est permise que pour un service réellement inédit.

- **Animés / Ma bibliothèque** : enrichir les fiches et statistiques déjà présentes ; conserver filtres, regroupements de saisons et gestion de collection, sans doubler le contenu dans un tableau de bord.
- **En cours** : action rapide « Épisode suivant / Marquer vu », progression et disponibilité du fichier vidéo local si l'utilisateur l'a associé ; ne jamais lancer une lecture ni modifier le compteur sans action de l'utilisateur.
- **À voir** : les nouveaux titres sont ajoutés seulement sur confirmation depuis une suggestion (pas de synchronisation forcée).
- **Saisons** : nouveau bloc « Suites à ne pas manquer » adossé au calendrier et aux saisons, avec filtres « Absentes de ma bibliothèque », « Prévues » et « Vérification nécessaire ». Le moteur relationnel existant reste la source d'autorité.
- **Recommandations** : garder les recommandations éditoriales/découverte ici ; une suggestion de suite peut renvoyer vers sa fiche dans « Saisons », sans recréer le même moteur.
- **Mon espace / Amis** : améliorer le service communautaire actuel là où il existe, avec ses contrôles de confidentialité, pas une copie dans une page d'accueil supplémentaire.
- **Réglages / Mises à jour / Stockage** : conserver ici les options des caches hors ligne et le suivi des mises à jour ; seule la fenêtre de suivi Windows doit être externe quand ALM est fermé.

Principes : préserver la navigation et les habitudes de la 2.1.3 ; réutiliser les composants, données et API internes ; faire une mise à niveau progressive, traduite dans les sept langues (FR, EN, ES, DE, JA, PT-BR, ZH-CN), accessible au clavier et fonctionnelle hors ligne quand les données sont locales.

## Priorité 2 — Nouvelle page « Mes fichiers » (vidéothèque PC / NAS)

Ce service n'existe pas encore dans ALM : créer **une page dédiée « Mes fichiers »**, accessible depuis la navigation de la bibliothèque, sans nouveau Cockpit. L'utilisateur choisit explicitement un dossier local ou réseau dans la boîte de dialogue native. Inventaire uniquement des noms et métadonnées de fichiers vidéo en lecture seule ; pas de téléchargement, pas de lecture du contenu, pas de partage des chemins avec une API distante. Ne pas suivre les liens symboliques et limiter le nombre d'entrées, la profondeur, le temps et les résultats. Associations film/anime/épisodes proposées, jamais imposées ; les noms ambigus demandent confirmation. Prévoir les essais Windows/UNC, NAS inaccessible, Linux, réanalyse et annulation.

Première brique de développement : lib/local-media-index.js, testée avec scripts/test-v220-local-media-index.cjs.
L'intégration à la nouvelle page « Mes fichiers », la sélection sécurisée des dossiers et les associations restent à développer. Les fiches existantes d'« En cours » peuvent afficher un lien vers le fichier déjà associé, mais ne doivent pas dupliquer la gestion des dossiers.

## Priorité 3 — Suites à ne pas manquer

Se baser sur les relations vérifiées de lib/local-season-links.js et sur le moteur existant nextVerifiedLocalSeason. Ne suggérer que les suites absentes de la bibliothèque. Différencier saisons, parties et films ; ne jamais ajouter une série ou avancer la progression sans validation explicite. Utiliser d'abord les données locales, sans nouveaux appels massifs à AniList.

Première brique : lib/sequel-watchlist.js, testée avec scripts/test-v220-sequel-watchlist.cjs.
Restent à développer : service local, intégration dans la page **Saisons** existante, liens ciblés depuis **Recommandations** et tests de relations ambiguës. **Aucune nouvelle page « Mes suites » / « Cockpit ».**

## Répartition fonctionnelle cible — exemple

| Service 2.1.3 conservé | Amélioration 2.2.0 | Nouvelle page ? |
| --- | --- | --- |
| Animés / Ma bibliothèque | Statistiques et jaquettes locales enrichies, lien vers les médias associés | Non |
| En cours | « Épisode suivant », progression simplifiée, disponibilité locale de l'épisode | Non |
| À voir | Ajout confirmé depuis les suggestions de suites et de découverte | Non |
| Saisons | « Suites à ne pas manquer » et affichage des nouvelles saisons absentes | Non |
| Recommandations | Meilleure navigation vers les fiches et saisons pertinentes | Non |
| Mon espace / Amis | Améliorations communautaires dans l'espace existant | Non |
| Réglages / Stockage | Gestion des images locales et cache hors ligne | Non |
| Réglages / Mises à jour | Statut, diagnostic ; fenêtre Windows native persistante après fermeture d'ALM | Non (fenêtre système externe) |
| **Mes fichiers** | Scanner de dossiers PC/NAS et associations en lecture seule | **Oui : service véritablement inédit** |

Exemple de parcours : dans **En cours**, l'utilisateur voit un animé à 12/24 épisodes et peut marquer le 13 vu ; s'il a associé une vidéo, ALM affiche « Fichier disponible ». Dans **Saisons**, un animé terminé peut afficher « Saison 2 trouvée — absente de ma bibliothèque » et proposer « Ajouter à À voir ». Dans **Mes fichiers**, l'utilisateur sélectionne son dossier NAS et confirme manuellement les correspondances incertaines.

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
