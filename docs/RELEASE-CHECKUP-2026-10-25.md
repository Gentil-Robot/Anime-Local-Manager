# Anime Local Manager — Beta82, contrôle complet avant sortie

**Revue du 25 octobre 2026 — Europe/Paris.** Version conservée : **2.0.0-beta.82**. Identifiant de candidate : `beta82-checkup-sortie-20261025`.

## 1. Résultat et décision de sortie

Le pied du menu affiche désormais **GentilRobot**, puis **GentilRobot#0004**. Le nom provient toujours du profil connecté ; le préfixe « L’espace » a été retiré de l’application et du site communautaire.

La candidate comporte les corrections de fiabilité et de sécurité décrites ci-dessous. **La validation locale est terminée, mais le feu vert de publication publique reste conditionnel.** Les principaux points ouverts sont le moteur Electron embarqué, l’alignement du site et de la base en production, la recette Windows et les preuves opérationnelles des comptes, des emails et de la restauration distante. Les exigences déjà inscrites au dossier concernant les fournisseurs et la confidentialité sont conservées.

**150 suites sur 150 réussies**, **54 contrôles de navigateur réussis**, sept langues complètes et parcours de **5 000 fiches sur 84 pages**, répété trois fois dans le vrai Electron, avec ordre, recherche et préservation des données vérifiés. L’audit npm exécuté renvoie zéro vulnérabilité ; la réserve sur le moteur embarqué est traitée séparément.

La version Beta82 validée a servi de point de départ exact : archive `Anime-Local-Manager-Beta82-Correctif-UX-Souvenirs-2026-10-24-COMPLET.zip`, SHA-256 `494407e42c74a846cb9c8e8e36b3bf6182384664ab9450020dc95e657ba36b10`. Elle est conservée intacte. Aucun changement de version, aucune mise à jour générale des dépendances et aucune modification de la bibliothèque personnelle de l’utilisateur n’ont été effectués.

## 2. Périmètre réellement examiné

La revue couvre l’application Electron, le preload et les IPC, l’API Express locale, les transports réseau, les imports XML/CSV, les sauvegardes et restaurations locales, le stockage des secrets, les fonctions communautaires, les migrations SQL, la fonction Edge publique, le site et la chaîne de fabrication de l’installateur. Elle combine lecture du code, tests de non-régression, parcours d’interface, mesures sur données fictives et lecture des métadonnées des services réels.

Les contrôles de production sont restés en lecture seule : pas de déploiement, d’envoi d’email, de suppression de compte ou de modification de données réelles. Les tests de suppression et de droits utilisent une base PostgreSQL locale éphémère via PGlite. Les parcours visuels utilisent une bibliothèque de démonstration et des réponses communautaires simulées ; les API locales de bibliothèque, carnets et fiches sont réellement exécutées.

Environnement de vérification : Linux, Node CLI **24.22.1**, npm **11.9.0**. Les tests fonctionnels de navigateur utilisent Chromium **134.0.6998.35** et Playwright **1.51.1**, installés à part du projet. Les essais de moteur, de paquet ASAR et de pagination Electron utilisent le véritable **Electron 45.0.0 / Chromium 156.0.8078.48**. L’exécution sans sandbox nécessaire au banc Electron headless sous root est limitée au test isolé ; le sandbox de l’application demeure activé.

## 3. Corrections intégrées

| Sujet | Défaut ou risque observé | Correction et résultat |
| --- | --- | --- |
| Identité en bas du menu | Le libellé ajoutait « L’espace » au nom du profil. | Nom seul dans l’application et le site ; tag conservé ; clé de traduction devenue inutile retirée. |
| Arrêt du moteur | Une callback pouvait répondre à un `utilityProcess` déjà fermé et provoquer un rejet non géré. | Pas de nouveau travail après l’arrêt ; réponse tardive ignorée ; fermeture du canal capturée. Un travail d’écriture déjà commencé termine normalement. |
| Diagnostic d’échec | Le dernier stderr pouvait arriver après `exit`, donnant un diagnostic incomplet. | Drain des flux borné à 250 ms lorsqu’une requête attend une réponse ; code d’échec conservé, données sensibles masquées, écouteurs temporaires retirés. Aucun délai ajouté au démarrage normal. |
| AniList | Les erreurs de quota pouvaient être suivies de nouveaux départs et de tentatives inutiles. | Pause commune dans le processus sur 429 HTTP/GraphQL, 503 avec `Retry-After` et quota épuisé ; délais, volume et annulation bornés ; pas de redirection. |
| BetaSeries | Deux appels portant une clé avaient une lecture non bornée et acceptaient les redirections par défaut. | Délai global de 10 s, corps limité à 2 Mio, aucune redirection ; comportements métier conservés. Aucune fuite réelle n’a été constatée. |
| Sources publiques compressées | Le chemin public acceptait Brotli avec un moteur concerné par un avis de sécurité. | Négociation gzip/deflate ; refus de Brotli et des encodages inconnus avant le décodeur. Atténuation ciblée, sans prétendre corriger tout le moteur. |
| Suppression de son compte | La comparaison SQL `p_confirm <> 'DELETE'` ne refusait pas `NULL`. | Nouvelle migration additive utilisant `IS DISTINCT FROM`. Seul `DELETE` exact passe après les contrôles existants d’identité et de session récente. Correction locale, non déployée. |
| Fabrication Windows | Le binaire Electron pouvait être téléchargé tardivement, après l’empreinte et la copie des dépendances. | Préparation explicite et bornée du binaire avant empreinte ; vérification du fichier, de la plateforme et de la version ; reprise seulement si cohérente. |
| Moteur externe pendant le build | `ELECTRON_OVERRIDE_DIST_PATH` pouvait faire tester un binaire extérieur à celui dont l’empreinte était vérifiée. | Refus explicite de cet override dans la chaîne de publication. Cache Electron respecté ; échec de préparation préserve l’installateur précédent. |
| Chaîne CI et rapport | Une action GitHub restait référencée par tag ; le texte NSIS pouvait laisser croire à une recette déjà exécutée. | Toutes les actions épinglées à des commits complets ; rapport indiquant clairement quand la recette Windows reste à faire. |

Le correctif AniList conserve la cadence CSV préexistante de **2,1 s** et son budget de **6,5 s par requête**. Son plafond interne est de 8 Mio. Certaines enveloppes applicatives imposent un plafond final plus petit, mais peuvent avoir lu jusqu’à 8 Mio avant ce rejet : il ne faut pas annoncer un arrêt physique systématique au plus petit plafond. Chaque worker possède son propre transport ; la pause ne constitue pas un quota global entre tous les processus.

Les régressions du moteur et de la confirmation SQL ont été reproduites sur l’ancien code avec des entrées artificielles. Les nouvelles protections réseau sont testées avec des flux synthétiques, sans payload exploitant et sans clé utilisateur. Les 11 migrations historiques sont inchangées ; la douzième est `supabase/migrations/20261025060253_alm_beta82_delete_confirmation.sql`.

## 4. Résultats de vérification

| Contrôle | Résultat | Portée |
| --- | --- | --- |
| Plan canonique complet | **150 / 150 suites réussies**, 5 min 41 s | Application, imports, sauvegardes, sécurité, SQL et fabrication ; détails par suite dans le journal. |
| Structure et régressions | 90 suites réussies | Sous-ensemble du plan de 150, pas un total supplémentaire. |
| Interface et karaoké | 8 suites réussies | Sous-ensemble du plan de 150, pas un total supplémentaire. |
| Imports et bibliothèque | 27 suites réussies | Sous-ensemble du plan de 150, pas un total supplémentaire. |
| Données, sauvegardes et sécurité | 14 suites réussies | Sous-ensemble du plan de 150, pas un total supplémentaire. |
| Publication | 11 suites réussies | Sous-ensemble du plan de 150, pas un total supplémentaire. |
| Parcours navigateur UX | **31 / 31** | API locale réelle ; compte communautaire simulé. |
| Parcours navigateur communautaire | **23 / 23** | Données fictives, modules et CSS livrés. |
| Langues | **7 langues, 1 095 / 1 095 clés chacune, 0 manquante** | Audit strict des traductions principales. |
| Dépendances npm | **0 vulnérabilité retournée** | 385 dépendances recensées ; ne couvre pas à lui seul les composants internes Electron. |
| Migrations historiques | **11 / 11 identiques** | Correction additive testée localement ; production non modifiée. |
| ASAR et moteur | **Réussis sur Linux** | Vrai electron-builder et vrai moteur ; aucune recette NSIS Windows déduite. |

Les 31 contrôles du parcours UX couvrent notamment la bibliothèque, Mes souvenirs, les filtres, le retour à la bibliothèque, l’ouverture des fiches et carnets, les boutons, l’import XML et l’affichage mobile à 390 pixels. Les 23 contrôles communautaires couvrent la navigation, l’identité et les interactions des animés en commun. Les contrôles vérifient les éléments visibles et les actions ; ils ne se limitent pas à chercher une chaîne dans le HTML. Les notes et carnets fictifs sont comparés avant/après et restent identiques. Aucun message à un ami n’a été envoyé.

Les 5 nouvelles suites traitent les callbacks du moteur, les encodages publics, le transport AniList, le transport BetaSeries et la confirmation SQL. Les anciennes suites restent dans le plan de vérification ; aucune assertion n’a été supprimée pour faire passer un correctif. Les tests ciblés AniList comptent **14 cas**, BetaSeries **16 cas** et la chaîne de fabrication Beta82 **39 contrôles**.

Une ancienne suite isolée, `test-beta34-runtime.js`, hors du plan canonique actuel, attend encore huit services alors que la base validée en expose neuf avec RSS. Cette attente préexistante n’a pas été modifiée et n’est pas présentée comme une nouvelle régression de la candidate. La recette courante utilise les suites de services plus récentes.

Une première invocation du plan global a été interrompue volontairement avant la recette finale, après une erreur de préparation des manifestes qui supposait à tort que les HTML du site et de l’application devaient tous être identiques. Leur différence existait dans l’archive validée. Les fichiers partagés JS/CSS ont ensuite été comparés correctement, les manifestes reconstruits, puis le plan complet a été relancé. Le résultat annoncé ici correspond à cette dernière exécution complète.

## 5. Performances : mesures et limites

Les mesures utilisent **1 000 puis 5 000 animés fictifs**, avec le catalogue intégré de **30 430 fiches**. Chaque mesure HTTP comporte trois échauffements puis 25 observations ; les statistiques complexes utilisent 12 observations, donc aucun p95 n’est annoncé pour ce petit échantillon. Les lectures de mémoire comparent cinq cycles après GC. Les appels externes sont bloqués pour isoler le coût local.

| Mesure serveur | Beta validée, 1 000 | Candidate, 1 000 | Beta validée, 5 000 | Candidate, 5 000 |
| --- | ---: | ---: | ---: | ---: |
| Bibliothèque, médiane / p95 (ms) | 22,03 / 27,66 | 21,62 / 37,21 | 102,58 / 122,36 | 109,73 / 126,53 |
| Catalogue filtré, médiane / p95 (ms) | 28,66 / 30,96 | 17,46 / 19,23 | 99,80 / 109,71 | 86,60 / 94,07 |
| Statistiques, médiane (ms), n=12 | 20,54 | 17,62 | 84,79 | 84,72 |
| Initialisation sur profil neuf (s) | 3,75 | 3,52 | 4,78 | 3,64 |
| RSS après les cycles (Mio) | 560,44 | 618,06 | 749,02 | 668,86 |
| Heap après GC, dernier cycle (Mio) | 97,60 | 97,55 | 100,15 | 100,24 |
| Blocage maximal de boucle, test de lectures (ms) | 44,66 | 42,70 | 219,15 | 226,89 |

| Interface Electron, 5 000 fiches | Beta validée | Candidate | Observations |
| --- | ---: | ---: | ---: |
| Première page (ms) | 100,9 | 124,5 | 7 |
| Page suivante (ms) | 101,3 | 112,4 | 7 |
| Dernière page + édition (ms) | 296,8 | 321,5 | 7 |
| Parcours des 84 pages (ms) | 14050,2 | 14333,9 | 3 |

Les médianes restent dans le même ordre de grandeur que la beta validée. À 5 000 fiches, la lecture complète de la bibliothèque passe d’environ 103 à 110 ms, le catalogue filtré d’environ 100 à 87 ms et les statistiques restent proches de 85 ms. Le p95 de la bibliothèque à 1 000 fiches est plus dispersé dans cette exécution (37 ms contre 28 ms). Ces variations ne sont pas présentées comme une amélioration uniforme ni comme la preuve d’un défaut nouveau ; les données retournées et leur intégrité sont conservées.

Le heap après GC reste stable sur les cinq cycles : environ **97,75 → 97,55 Mio** à 1 000 fiches et **100,42 → 100,24 Mio** à 5 000. Cela n’a pas montré de croissance persistante dans ce scénario court ; ce n’est pas un essai d’endurance de plusieurs jours. Le RSS du processus serveur au terme du banc intensif reste significatif, environ **618 et 669 Mio** ; il ne représente ni une fenêtre au repos ni la somme des processus Electron. Les lectures répétées de 5 000 fiches peuvent bloquer la boucle jusqu’à **227 ms** dans cette mesure. Réduire la reconstruction et le transfert complets de grosses collections demeure une piste de performance mesurable pour une évolution ultérieure, sans retirer des éléments ou introduire une refonte tardive dans cette candidate.

La mesure de pagination exerce réellement l’interface Electron : passages sur la première et la page suivante, accès à la dernière fiche et à sa fenêtre d’édition, recherche globale et parcours de toutes les pages. Elle ne crée pas artificiellement 5 000 cartes simultanées dans le DOM. Les temps sont ceux de cette machine Linux headless et de ces données ; ils ne prédisent pas un PC Windows précis ni le délai d’une API externe.

Aucun pourcentage global d’accélération n’est revendiqué. Le gain certain des correctifs est comportemental : moins de départs inutiles pendant un refus fournisseur, limites réseau explicites, absence de réponse à un moteur mort et préparation déterministe du binaire. Une seule comparaison de mesures, sensible à la charge de la machine, ne suffit pas à promettre un gain universel.

Deux optimisations apparentes ont été écartées après vérification. Limiter le calendrier à 120 fiches aurait perdu la fin de la collection tout en marquant l’ensemble comme actualisé ; la complétude imposée par les tests est conservée. L’index Supabase signalé inutilisé est lié au propriétaire et à une clé étrangère ; le faible trafic observé ne justifie pas sa suppression. Le suivi des anciens événements de quota reste un sujet de rétention à traiter selon une politique explicite, sans purge improvisée.

## 6. Sécurité de l’application et de l’API locale

| Surface | Protection constatée et conservée |
| --- | --- |
| Electron | `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true` ; refus des permissions et webviews non prévues ; navigation externe limitée aux protocoles HTTP/HTTPS. |
| IPC | API de preload limitée ; contrôle du WebContents, de la frame principale et de l’origine ; taille du presse-papiers bornée. |
| Serveur local | Écoute `127.0.0.1`, Host/port contrôlés, Origin et Fetch Metadata vérifiés, jeton de session par lancement Electron, cookie HttpOnly/SameSite Strict, comparaison constante. |
| Rendu | CSP sans `unsafe-eval` ni scripts inline, `nosniff`, refus d’encadrement, échappement des champs personnels dans les chemins inspectés. |
| Réseau public | Rejet des adresses locales/réservées IPv4/IPv6, DNS validé et épinglé au socket, contrôle des redirections, limites de durée et de volume. |
| Imports | Métadonnées SQL lues comme données littérales ; aucune exécution du SQL reçu ; pas de résolution d’entités externes XML ; limitation des fichiers et décompressions. |
| Exports | Préservation des champs personnels et neutralisation des préfixes de formules CSV. |
| Secrets | Coffre OS, refus de `basic_text`, pas de recréation silencieuse d’une clé perdue, configuration chiffrée AES-256-GCM, pas de token communautaire dans l’export général. |
| Sauvegardes | Chiffrement authentifié, scrypt, écritures atomiques, validation avant restauration, copie de récupération et rollback en cas d’échec. |
| Mises à jour | Dépôt et hôtes limités, nom/taille/digest contrôlés, empreinte revérifiée avant lancement ; protection du signataire lorsque la distribution est signée. |

Un scan de **543 fichiers texte du manifeste** n’a trouvé aucun des formats recherchés de clé privée, token GitHub, secret Stripe/Resend, clé Supabase secrète ou JWT `service_role`. Il n’a pas lu les variables d’environnement et ne constitue pas une garantie sur tous les formats possibles. Le paquet ne contient ni profils de test, ni secrets, ni dépendances installées.

### Réserve principale : le moteur Electron réellement livré

| Composant du binaire exécuté | Version observée |
| --- | --- |
| Electron | 45.0.0 |
| Node embarqué | 24.22.0 |
| Chromium embarqué | 156.0.8078.48 |
| Brotli embarqué | 1.2.0 |
| Undici embarqué | 7.29.1 |

L’audit npm renvoie **zéro vulnérabilité connue dans son résultat**, mais ce résultat ne ferme pas les avis concernant les composants internes du moteur. Node 24.22.1, publié le 21 octobre 2026, contient des correctifs de sécurité absents des versions constatées ci-dessus. Les branches stables Electron 44.9.3 et 43.8.3 examinées annoncent elles aussi Node 24.22.0 : aucune alternative stable corrigée, ni preuve officielle de rétroportage applicable, n’a été établie pendant cette revue.

- **CVE-2026-111497 — Brotli** : la correction locale empêche le chemin `public-fetch` d’appeler le décodeur Brotli. D’autres appels `global.fetch` vers des fournisseurs fixes subsistent ; l’atténuation ne couvre pas le moteur entier.
- **CVE-2026-109869 / GHSA-xjj6-f33q-929c — Undici** : l’avis vise un arrêt du processus sur certaines réponses malveillantes avec des encodages excessifs. Undici 7.29.1 est concerné ; la correction indiquée est 7.30.1. Le traitement d’une exception applicative ne remplace pas le correctif du moteur.
- **CVE-2026-87018 / GHSA-qrxm-fqhp-jwvm — TLS 1.2** : l’avis vise certaines renégociations de certificat ; TLS 1.3 n’utilise pas ce mécanisme. Les hôtes fixes réduisent les possibilités d’exposition sans établir l’absence du défaut.

Les autres avis Node ont été confrontés aux chemins applicatifs : pas d’appel `dns.resolve*`/`dns.reverse`, de SEA, de snapshot personnalisé, de `zlib.ZipFile` ou du Permission Model Node trouvé dans ALM ; les clients publics normalisent les URL et utilisent `agent:false`. Ces constats bornent l’applicabilité observée sans certifier les bibliothèques internes. Le blocage eMudhra déjà rétroporté dans Electron 45 n’est pas classé comme absent.

**Condition de clôture :** moteur stable officiellement corrigé, ou preuve officielle de rétroportage sur le binaire retenu, puis reprise des vérifications de paquet et Windows. Mettre à jour le Node de développement ou ajouter un paquet npm Undici ne remplace pas le Node/Undici embarqué. Les dépendances n’ont pas été déplacées arbitrairement vers une préversion ou une ancienne branche.

Sources primaires : [Node 24.22.1](https://nodejs.org/en/blog/release/v24.22.1), [avis Node du 21 octobre](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), [Electron 45.0.0](https://releases.electronjs.org/release/v45.0.0), [avis Undici encodages](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c), [avis Undici TLS](https://github.com/nodejs/undici/security/advisories/GHSA-qrxm-fqhp-jwvm).

## 7. API distante, base, site et emails

### Supabase

Le projet contrôlé est **ACTIVE_HEALTHY**, PostgreSQL **17.11.0.003**, région eu-west-3, offre **Free**. Les 11 migrations distantes correspondent à l’historique présent dans l’archive ; la nouvelle correction de confirmation SQL constitue la douzième migration locale.

Les **16 tables contrôlées** — 6 publiques et 10 privées — ont la RLS activée. Aucun droit d’écriture directe client sur les tables publiques et aucun accès client direct aux données privées n’ont été trouvés dans le périmètre examiné. Le schéma privé n’est pas exposé via PostgREST. Les **67 fonctions ALM** comprennent 40 fonctions privées `SECURITY DEFINER` avec `search_path` vide et 23 wrappers publics `SECURITY INVOKER` ; aucune fonction ALM n’est exécutable par `anon`. Les contrôles de propriétaire, de session révoquée/récente, de relation d’amitié, de visibilité et d’âge sont présents côté serveur. La revue a également inventorié 73 contraintes, 30 index et 4 triggers applicatifs.

Les neuf informations d’advisor « RLS sans politique » concernent des tables privées volontairement inaccessibles aux clients. Elles ne justifient pas l’ajout de politiques permissives. L’avertissement sur les mots de passe compromis désactivés est réel ; cette fonction est réservée à Pro et au-delà, alors que le projet est Free. Aucun changement d’abonnement n’a été effectué. Voir [documentation Supabase sur les mots de passe](https://supabase.com/docs/guides/auth/password-security).

La migration de suppression ne permet pas de choisir un autre utilisateur : elle corrige uniquement la confirmation de suppression de **son propre compte**. Les rejets sur `NULL`, valeur vide, casse ou espaces incorrects préservent les données ; le contrôle de session récente et les ACL sont maintenus. La migration doit être appliquée puis vérifiée avant publication. Il n’est pas nécessaire de supprimer un compte réel pour contrôler sa définition et ses privilèges.

### Site et fonction Edge

La fonction Edge **`alm-public`, révision 23**, annonce Beta82, est active et ses **quatre fichiers correspondent** aux sources locales. La configuration publique répond avec `ready:true` ; une origine étrangère est refusée. Le mode `verify_jwt:false` est attendu pour ces formulaires publics, qui effectuent leurs contrôles CAPTCHA et quotas dans la fonction.

Le manifeste servi par **animelocalmanager.com** annonce encore **2.0.0-beta.76**, déployée le 19 octobre. Le site doit être aligné sur les sources finales. La présence d’une fonction Edge Beta82 ne prouve pas que l’interface publique l’est également. Les 28 fichiers JS/CSS communs du site et de l’application sont identiques dans la candidate ; les différences HTML intentionnelles sont conservées.

Les agrégats accessibles montrent **1 149 réponses 200/204** sur la fenêtre de 24 heures examinée. Cela décrit le trafic observé, sans constituer un test de montée en charge ni une garantie de disponibilité. La rétention des événements de quota devra être suivie : certains anciens événements ne sont nettoyés qu’au passage d’actions déterminées. Aucune saturation n’a été constatée.

### Turnstile, Resend et DNS

Le widget Turnstile géré référence le domaine public et les origines locales attendues. Le domaine d’envoi **mail.animelocalmanager.com** est vérifié dans Resend, avec SPF/DKIM et les enregistrements d’envoi contrôlés. Les suivis d’ouverture et de clic sont désactivés. Les métadonnées examinées indiquent 8 envois historiques livrés, sans rebond, plainte ou échec ; aucun nouvel email n’a été envoyé pendant cette revue.

Les quotas retournés étaient 100 envois quotidiens, 3 000 mensuels et 10 requêtes API/s ; usage observé : 0 ce jour et 8 sur la période mensuelle. La fonction publique limite déjà les actions quotidiennes et par adresse/type, vérifie le CAPTCHA, utilise la double confirmation et des jetons signés. Ces contrôles ne démontrent pas la configuration effective du SMTP Auth ou le déroulement réel d’une inscription.

DMARC est en `p=none` sur le sous-domaine d’envoi, sans destinataire `rua` ; aucun TXT DMARC n’a été observé à la racine. Le passage à une politique plus stricte nécessite l’inventaire des expéditeurs légitimes et leur alignement. Aucun `reject` automatique n’a été ajouté.

**Restent non attestés :** activation effective de CAPTCHA dans Supabase Auth, politique serveur des mots de passe, configuration SMTP/hook réellement utilisée, inscription/confirmation/récupération et réception d’un nouvel email, restauration distante isolée, capacité sous charge, plans de facturation Vercel/Cloudflare. Le plan Vercel n’est pas déduit d’une ancienne mention ou d’un nom de projet.

Preuves locales : `docs/verification-sortie/api-review-summary.json`, `live-http.json`, `private-schema-exposure.json` et `historical-migrations-unchanged.json`. Elles sont des observations datées, pas des instructions de configuration.

## 8. Fournisseurs, données et exigences déjà ouvertes

AniList reste utilisé pour des métadonnées, équipes et calendrier. Le collecteur massif est déjà désactivé. Les [conditions officielles](https://github.com/AniList/docs/blob/master/docs/guide/terms-of-use.md) couvrent les services concurrents de listes/suivi ; l’exception de revenu ne dispense pas des autres clauses. La preuve des droits correspondant au fonctionnement réel d’ALM et à la redistribution du catalogue/des médias reste demandée dans **ALM-09**. Aucun fournisseur n’a été contacté au nom de l’utilisateur pendant cette revue.

La [documentation de quota AniList](https://github.com/AniList/docs/blob/master/docs/guide/rate-limiting.md) décrit les en-têtes de pause et un débit dégradé à 30 requêtes/minute, contre 90 dans la description nominale. Le nouveau transport respecte les signaux renvoyés ; cela ne constitue pas une autorisation juridique d’usage. Aucun appel actif TMDB/JustWatch n’a été trouvé ; les anciennes mentions ne sont pas assimilées à une intégration exécutée. Jikan public reste désactivé dans la production, malgré des fixtures historiques conservées.

Les points déjà présents sur le public visé, les mineurs, les informations d’éditeur, le contact de confidentialité, les durées de rétention, les demandes de droits, les incidents et les contrats d’hébergement restent des éléments du dossier de sortie. Les tests techniques ne les transforment pas en conformité attestée. Le détail des états figure dans `compliance/release-gates.json`, qui sert de liste de preuves et ne désactive aucune fonction du logiciel.

## 9. Ce qui reste avant la publication

| Priorité | Point ouvert | Condition concrète de clôture |
| --- | --- | --- |
| 1 | Moteur embarqué, ALM-18 | Correctif stable ou rétroportage officiel démontré, puis revalidation du paquet final. |
| 1 | Production, ALM-19 | Appliquer la migration SQL additive, relire garde/ACL, déployer le site et comparer le manifeste public à la livraison. |
| 1 | Windows, ALM-04/05 | NSIS sur machine propre avec compte standard, lancement, coffre DPAPI, maintenance à froid, sauvegarde/restauration, mise à niveau et désinstallation ; conserver l’empreinte de l’EXE testé. Qualifier sa signature réelle. |
| 1 | Droits AniList et médias, ALM-09 | Justificatifs couvrant l’usage, le suivi, le cache, la redistribution et le modèle réel du projet. |
| 2 | Compte et emails, ALM-20 | Vérifier Auth/CAPTCHA/SMTP/redirections et exercer les parcours avec des comptes et destinataires de test prévus. |
| 2 | Restauration distante, ALM-13 | Export chiffré hors site et restauration isolée incluant Auth, droits et traitement des suppressions. |
| 2 | Dossier d’éditeur et hébergement, ALM-11/12/16 | Confirmer public/âge, informations, procédures, plan et accords réellement applicables. |

Les métadonnées GitHub lues pendant la revue indiquent **zéro exécution de workflow** pour le dépôt consulté. Aucun artefact Windows ni certificat Authenticode final n’a été vérifié ici. Les tests Linux du vrai moteur et de l’ASAR, les tests de scripts et les sources de workflow ne doivent pas être présentés comme une installation Windows réussie.

Le suivi DMARC, les statistiques d’index, la rétention technique et les optimisations futures restent distincts des défauts corrigés. Aucune mise à niveau payante, suppression de fonction, purge de données ou publication distante n’a été effectuée pour fermer artificiellement une ligne du dossier.

## 10. Livraison, intégrité et reproduction

L’archive complète conserve les **677 fichiers d’origine**, avec les modifications identifiées, et ajoute **8 fichiers de source/documentation** : un transport, cinq suites, une migration et ce rapport. Les preuves sont ajoutées dans un dossier séparé. `SOURCE-MANIFEST.json` répertorie chaque fichier livré, hors lui-même, avec taille et SHA-256 ; le manifeste du site est également cohérent. La vérification finale du ZIP contrôle les CRC, chaque empreinte et la présence de tous les chemins attendus. `package.json`, `package-lock.json`, `main.js`, `preload.js` et `db.js` restent identiques à la beta validée. L’empreinte de l’archive finale et sa taille sont inscrites dans la copie du rapport fournie séparément afin d’éviter une empreinte circulaire.

Les résultats détaillés sélectionnés se trouvent dans `docs/verification-sortie/`. Le journal canonique conserve les sorties des suites ; les rapports de navigateur et de performance contiennent les assertions et observations. Les profils de données fictives, caches, dépendances installées, captures internes et métadonnées sensibles des fournisseurs sont exclus de la livraison.

Pour reproduire les vérifications applicatives depuis une extraction neuve : `npm ci`, préparation du binaire Electron si nécessaire, puis `npm run verify`. Le parcours Windows existant reste accessible depuis `Verifier Beta82 Windows.bat` et les lanceurs de publication documentés dans le README. Les scripts de mesure sont dans `scripts/performance/` et refusent un profil déjà peuplé qui n’est pas identifié comme fixture. Le rapport décrit l’exécution Linux réalisée ; il ne demande pas d’exécuter des mesures sur la bibliothèque personnelle.

Le code fonctionnel est gelé avant la dernière exécution globale. Après cette exécution, seules la consolidation de ce rapport, l’ajout des preuves et les empreintes de livraison sont permis ; leur liste et la comparaison des sources testées à la livraison sont consignées dans `delivery-integrity.json`. Aucun changement exécutable postérieur aux tests n’est masqué par une simple régénération du manifeste.
