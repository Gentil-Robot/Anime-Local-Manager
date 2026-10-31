# Recette de sortie : Anime Local Manager V2.0.0 Bêta stable

**Date du controle : 25 octobre 2026.** **Statut : NON PRET a la diffusion publique.** Le code source est une **candidate de recette**, et non un installateur valide ou une release de production. Aucun deployement distant, envoi d'email, installation Windows ou suppression de donnees reelles n'a ete effectue dans cette passe.

## 1. Base exacte et decision de perimetre

- Base : `Anime-Local-Manager-Beta82-Correctif-Partage-Age-2026-10-25-COMPLET.zip`, explicitement validee par l'utilisateur.
- SHA-256 du ZIP d'origine : `f5d1296ed71403e293c1228dd8e8d4f3daa41ef7f3e64a9cd551caa88cd7c57f`, taille 237151370 octets.
- Catalogue complet, video karaoke, medias, traductions, donnees de demonstration necessaires, fonctions de souvenirs, partage selon l'age, corrections pagination et transparence : **conserves**.
- Aucun identifiant d'application, appId, profil, cle de coffre, format de sauvegarde ou ancienne migration n'a ete change pour la renumerotation.
- Aucun nettoyage de table Supabase, de bibliotheque ou de stockage de comptes. Les dependances directes et le binaire Electron sont restes sur les memes versions.

## 2. Version visible et identite technique

| Element | Valeur candidate | Precaution |
|---|---|---|
| Titre public | `Anime Local Manager V2.0.0 Bêta stable` | L'orthographe affichee dans le code est **Bêta stable**. |
| Version technique | `2.0.0` | SemVer numerique sans V ni libelle |
| Canal de distribution ALM | `beta` | `release-version.json` et logiques de selection |
| Tag GitHub cible | `v2.0.0` | **Obligatoirement `prerelease=true`**, jamais release stable silencieuse |
| Installeur x64 cible | `Anime-Local-Manager-2.0.0-Beta-Stable-Setup-x64.exe` | Non construit ici |
| Archive complete | `Anime-Local-Manager-2.0.0-Beta-Stable-COMPLET.zip` | Sources et medias, pas un installateur executable |
| Format historique de sauvegarde | `2.0.0-beta.82` | A ne pas remplacer arbitrairement ; conservation / restauration |
| Windows appId | `fr.gentilrobot.animelocalmanager` | Inchange : identite Windows et donnees de profils |

Source unique : `release-version.json`, avec `node scripts/sync-release-version.cjs` et `--check`. Les miroirs du site, metadata npm, build NSIS et Edge sont harmonises sur **2.0.0**. Les codes des anciennes betas, leurs notes et leurs tests restent dans l'historique. Les noms de fichiers internes (betaXX.css/js) ne sont pas une version affichee.

Attention : en SemVer, `2.0.0` est superieur a `2.0.0-beta.82`, mais `2.0.0-beta.83` serait **inferieur** a `2.0.0`. Pour une prochaine prerelease, utiliser une base numerique superieure, p. ex. `2.0.1-beta.1`, en fonction de la strategie choisie. Le canal stable configure volontairement par un ancien utilisateur n'est pas converti a beta sans son choix. Aucun flux GitHub/NSIS n'a ete publie.

## 3. Modifications du code de cette candidate

1. Centralisation de la version et des labels, harmonisation de `package.json`, `package-lock.json`, `public/index.html`, des pages et scripts du site, `main.js`, `server.js`, API `supabase/functions/alm-public/release.ts`, manifestes et scripts BAT.
2. Verification explicite du canal **beta** lors de la detection et de la selection de l'installateur `2.0.0`; une release GitHub `prerelease=false` est refusee pour cette version. Une prerelease n'est pas imposee aux personnes restes sur le canal stable.
3. Reprise des anciennes installations et donnees : **appId, productName, GUID/profile paths et BACKUP_VERSION inchanges**. Seule la version affichee evolue.
4. Les User-Agent HTTP annonces par les appels BetaSeries, Tvmaze, RSS/articles et le lecteur d'images d'actualites utilisent desormais la version technique centralisee au lieu d'anciennes betas.
5. Adaptation des tests BetaSeries isolant une portion de serveur pour fournir la configuration publique dans leur harnais, sans retirer leurs assertions de limite de temps, taille, redirection et cle.
6. Ajout d'un test `scripts/test-release-v200.cjs` dans le plan de verification (151 suites), qui protege notamment le canal et le nom d'artefact ; conservation de tous les tests des anciennes betas.
7. Le script Windows de controle anterieurement nomme `Verifier Beta82 Windows.bat` est remplace par `Verifier V2.0.0 Beta Stable Windows.bat` ; les references historiques restent archivees dans l'ancienne documentation.

**Aucun ajout majeur de fonction, aucune modification de catalogue, des carnets, des choix de partage ou de l'interface communautaire de fond.**

## 4. Tests et preuves (executions de cette candidate uniquement)

Environnement courant : Linux, `node v22.16.0`, alors que `.node-version` exige `22.23.4` pour la publication validee. L'installation `npm ci` n'a pas abouti (reseau indisponible), et une tentative `npm ci --offline` a ete refusee (archive npm `yocto-queue` absente). Les modules `express`, `sql.js`, `@supabase/supabase-js`, `jsdom`, `@electric-sql/pglite`, `electron` et `electron-builder` n'etaient pas presents. Le lock a pu etre verifie localement avec `npm install --package-lock-only --offline --ignore-scripts` ; cela ne prouve pas le succes de `npm ci`.

Reussites locales, sous reserve de leur perimetre :

- `scripts/test-release-v200.cjs` : identite version, selection du canal GitHub, fenetre, manifestes et assets simules.
- `scripts/test-release-watch.js` : comparaisons de versions.
- `scripts/test-beta82-prepublication.cjs` : principaux verrous de build et securite.
- `scripts/test-beta82-build-security.cjs` : empreintes / versions examinees du lockfile (pas un audit distant actualise).
- `scripts/test-beta82-public-encoding.cjs` : refus d'encodages non pris en charge sur le chemin de lecture public.
- `scripts/test-beta82-engine-callbacks.cjs` : fermeture du moteur et messages tardifs.
- `scripts/test-beta82-betaseries-network.cjs` : 16 assertions de transport **simule**, cles et bornes.
- `scripts/test-beta82-account-teardown.cjs` : nettoyage de session et UI apres fermeture.
- `scripts/test-beta82-ux6.cjs` : detection statique du correctif UX souvenirs.
- `scripts/test-source-files.js` : resistance aux modifications/absences fictives du manifeste.
- `scripts/audit-locales.js` : audit statique des traductions ; pas une recette de rendu sur 7 postes.
- `scripts/sync-release-version.cjs --check` et `scripts/test-release-v200.cjs` : coherence de la source de verite.

Le passage statique du plan de base `scripts/test-beta-stable.js` a reussi **80 controles sur 86** : les six echecs restants sont exactement des imports manquants de `@supabase/supabase-js`, pas des assertions metier invalidees. Le correctif CRLF pour les quatre lanceurs Windows a ete verifie par `scripts/test-build-windows-retry.js`.

Les tests `test-beta82-delete-confirmation.cjs`, `test-beta82-community-navigation.cjs`, `test-beta82-memories-filters.cjs` et `test-beta82-card-actions.cjs` ont ete **impossibles a executer** ici, faute de modules PGlite/jsdom. Le test global `scripts/test-beta-stable.js` et le plan `scripts/verify-project.js` s'arretent egalement sur des dependances non disponibles. La serie de 151 tests **n'est pas declaree validee**. Les 150 suites passees dans la beta precedente ne constituent pas une preuve nouvelle pour l'archive 2.0.0.

Aucun vrai binaire Electron empaquete ni installateur Windows NSIS n'a ete produit ou lance pendant cette recette. Les captures de 2026-10-25 et les anciens bancs de performance de Beta82 sont des references historiques, non des nouvelles mesures de cette version technique. Aucun gain chiffre n'est annonce.

## 5. Securite du moteur et controles non conclus

- Electron reste fixe a **45.0.0**, dont la note de version indique Node integre **24.22.0**. Node a livre la version **24.22.1** le 21 octobre 2026 avec des correctifs de securite, dont Brotli, TLS, DNS et HTTP. L'audit npm des dependances n'est pas une preuve de correction de ce moteur. Il faut un binaire Electron avec correctifs verifies / retroports documentes et une recette complete de cette version precise, **avant de diffuser publiquement**.
- Blocage de Brotli sur un chemin reseau public = attenuation partielle, **pas** un correctif global d'Electron/Undici.
- Les controles IPC/preload/sandbox, fichiers locaux, quotas reseaux, sauvegardes et RGPD sont herites de la Beta82 ; aucune certification de securite nouvelle du binaire distribue n'est possible ici.
- Le statut du chiffrement `safeStorage` et des donnees deja chiffrees doit etre confirme sur Windows **avec migration reelle** ; les warnings GPU et SQLite doivent etre qualifies en execution reelle.
- Source Node : <https://nodejs.org/en/blog/vulnerability/october-2026-security-releases>. Version Electron : <https://releases.electronjs.org/release/v45.0.0>.

## 6. Services distants : lecture seule, pas de promotion

**Supabase ALM Community** : projet sain, 12 migrations presentes, dont `20261025060253_alm_beta82_delete_confirmation`, deja appliquee et validee lors de la precedente intervention. Aucune nouvelle migration n'est necessaire pour modifier la version affichee. Les avis de securite indiquent 9 tables `alm_private` avec RLS mais sans politiques accessibles (intention de non exposition a confirmer dans le contexte des roles) et l'option `Leaked Password Protection` inactive. Aucun role ou utilisateur reel n'a ete modifie ici.

**Vercel** : projet `anime-local-manager`, derniere production observee **19 octobre 2026**, READY. La livraison de la nouvelle source `2.0.0` **n'a pas ete deployee** ; le site public peut donc encore afficher une version anterieure. Synchroniser le site et la fonction Edge avec les sources **seulement apres la recette** et verifier le manifeste reel. Pas de migration distante additionnelle de version.

**GitHub** : consultation du depot `Gentil-Robot/Anime-Local-Manager`, **0 execution GitHub Actions retournee** par l'API lors de cette inspection. Aucun run Windows ni EXE teste ne peut etre atteste. La presence du YAML et d'un cache n'est pas une preuve de build. Le workflow sur `--ci` est configure pour la recette de l'installateur ; a verifier sur son artefact reel.

**Resend / Cloudflare** : presence dans l'architecture, aucun nouvel email a un destinataire reel, aucun changement distant. Les droits, quotas et conditions des offres gratuites, Turnstile, SMTP et la restauration a blanc doivent etre reverifies par une recette operationnelle complete.

## 7. Licences, medias, juridique

L'API AniList a des conditions d'utilisation interdisant certains usages concurrents de listes/suivis d'animes. Le consentement fournisseur et les droits sur les visuels/donnees redistribues sont a **justifier pour l'usage reel d'ALM**, meme si l'application offre des dons facultatifs. Voir <https://docs.anilist.co/guide/terms-of-use>. Les mentions d'editeur, conservation RGPD, sous-traitance et exercice des droits doivent egalement etre cloturees par le responsable du produit. Une archive propre n'implique pas cette validation.

## 8. Nettoyage et preservation

Retrait **prouve** : un lanceur Windows dont le nom faisait reference a Beta82 a ete renomme, et ses references **actives** mises a jour ; son contenu fonctionnel et la documentation historique restent disponibles. Les dossiers locaux temporaires `node_modules`, `.release-work` et `dist` ne sont **pas** distribues comme sources et ne seront pas integres dans le manifeste.

Non supprimes faute de preuve d'absence d'usage : anciens scripts de test, adaptateurs d'import et de sauvegarde, fichiers `betaXX.js/css` encore charges par l'interface, anciennes migrations, icones/musique, utilisateurs et tables distantes, dependances transitives. Un grep sans appel n'est pas une preuve suffisante. Aucun index Supabase n'a ete supprime. L'objectif est de preserver tous les parcours fonctionnels peu frequents jusqu'a leur verification sur le binaire Windows.

Effets mesurables : version simplifiee, un lanceur renomme et fichiers de controle ajoutes. Les temps d'execution reseau, la RAM et la taille reelle du NSIS ne peuvent pas etre mesures sans recompilation et dependances. Aucune optimisation performance fictive annoncee.

## 9. Mise a jour, sauvegarde et retour arriere

1. Sauvegarder les donnees locales, notes et carnets, parametres et sessions selon les procedures existantes. Exporter une copie protegee et verifier sa restauration sur environnement de test.
2. Sur une VM Windows propre avec compte standard, extraire la livraison complete ; utiliser la version Node indiquee dans `.node-version`, puis `npm ci` et `Publier Installateur Windows.bat`. Le script doit verifier les dependances, construire NSIS, lancer la verification et enregistrer les rapports.
3. Exiger le resultat positif de `scripts/check-windows-artifacts.js`, puis tester **l'EXE installe**, pas seulement `win-unpacked`, avec chemins espaces/accents, profils existants, taches planifiees, maintenance, reseau hors ligne, import, sauvegarde/restauration, comptes, mise a jour et desinstallation.
4. Verifier le mode de signature Authenticode. **Aucun certificat payant n'a ete active** ; sans signature, notifier les avertissements Windows et l'absence d'authentification de l'editeur. Le SHA-256 prouve une integrite comparee a une reference authentique, **pas** l'identite de l'editeur.
5. Pour GitHub Releases, creer `v2.0.0` uniquement avec l'option **Pre-release** et l'EXE du build valide. Verifier sa taille, son SHA-256, ses permissions et son nom avant de publier un flux. Ne pas creer un tag avec `prerelease=false` ni passer automatiquement le canal stable.
6. En cas de probleme, ne pas supprimer la bibliotheque locale : revenir a l'ancienne candidate et restaurer **une copie de sauvegarde validee** si les formats/migrations le requierent. Toute migration destructive devra etre accompagnee d'une procedure et d'une sauvegarde independantes.

## 10. Conditions bloquantes et avis

**Avis : NON PRET A PUBLIER** au 25 octobre 2026. Manquent les preuves d'execution totale des 151 suites, un `npm ci` et audit npm actualise, l'installateur NSIS natif sur Windows propre et son test de mise a jour depuis Beta82, un binaire Electron dont les correctifs de securite sont etablis, l'alignement du site public et sa recette apres deploiement, les parcours Auth/SMTP/CAPTCHA, la restauration distante testee, la verification des droits AniList/medias et les validations editeur/RGPD. Les corrections livrees sont **des sources candidates a recette**, pas une publication du produit.

Toute modification ulterieure du code, des dependances ou de l'environnement de build exige des tests nouveaux et un manifeste SHA-256 regenere ; les anciens rapports restent de l'historique, pas de nouvelles preuves.
