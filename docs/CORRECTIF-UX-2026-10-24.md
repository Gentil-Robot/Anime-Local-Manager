# ALM — correctif UX du 24 octobre 2026

## Référence de cette livraison

- **Version conservée :** V2.0.0 Beta stable — `2.0.0-beta.82`.
- **Archive de départ :** `Anime-Local-Manager-Beta82-Correctif-Publication-Test-Beta73-2026-10-24-COMPLET(1).zip`.
- **SHA-256 de cette archive :** `dd952f40e06cb9436d0bd0a89c9ab47aeed30bb2c87e5172b6fc70cae5f316d4`.
- **Périmètre :** souvenirs, pagination, commandes des cartes, identité et interactions communautaires, puis les deux nettoyages demandés dans l'import XML et les outils de bibliothèque.

L'archive est complète. Elle comprend le catalogue embarqué, les médias déjà présents, les scripts de construction et les contrôles. Les dépendances et leur fichier verrouillé conservent leurs versions. Les sources `main.js`, `preload.js`, `server.js` et `db.js` restent identiques à celles de l'archive reçue.

## Modifications livrées

| Zone | Comportement |
| --- | --- |
| Mes souvenirs | Recherche dans les titres et le contenu, filtres par statut, type de souvenir, carnet, genre, année de sortie et année du choix annuel ; bouton de réinitialisation. |
| Cartes souvenirs | Jaquette et titre cliquables ouvrant la fiche anime partagée par les autres pages ; bouton distinct **Ouvrir le carnet** ; indication de l'origine et aperçu du contenu. |
| Annotations automatiques | Masquées par défaut lorsqu'un modèle généré par ALM est reconnu avec suffisamment de certitude ; case **Afficher aussi les annotations automatiques** pour les retrouver. |
| Pagination | Respect du masquage HTML malgré les styles ; absence de flèches pour une liste vide ou tenant sur une page ; états de page recalculés après filtre. |
| Longues bibliothèques | Un seul modèle de pagination, présenté en haut et en bas lorsque la hauteur de la liste justifie ces deux positions ; une seule présentation pour une courte dernière page. |
| Navigation verticale | Un contrôleur par surface de lecture ; priorité à la fenêtre ou au lecteur ouvert ; absence de commandes sur une zone sans défilement ou dans une direction déjà épuisée. |
| Boutons des cartes | **Recommander à un ami** avant **Supprimer**, avec une grille de trois lignes pour les cartes simples et multi-saisons ; maintien de l'accès aux saisons. |
| Animés en commun | Titre et compteur réunis dans un bouton accessible, avec survol/focus ; ouverture de la liste existante ; suppression de **Voir tous nos animés en commun**. |
| Bas du menu | Entrée de compte déplacée au bas du menu : **L'espace {pseudo}** et identifiant réel. Le nom n'est pas codé en dur. |
| Outils de la bibliothèque | Raccourci **Nouvelles saisons** supprimé. La page reste accessible dans le menu latéral. |
| Import XML | GIF conservé ; légende **Anime Local Manager** supprimée. Le texte alternatif de l'image reste disponible pour l'accessibilité. |

### Souvenirs et protection du contenu

Cette page utilise une projection locale en lecture seule de `/api/notebook`, enrichie avec la jaquette et les champs nécessaires aux filtres. Aucun changement du format enregistré n'est requis. Les filtres ne relancent pas de récupération des carnets.

Les notes originales restent intégralement dans le carnet, les sauvegardes et les exports. Le masquage ne supprime aucune phrase. Les textes ambigus tels que **Saison 1** et **Saison 2** restent visibles. Une annotation de suite doit notamment correspondre à un titre connu et à un marqueur approprié pour être reconnue comme automatique. La recherche et les compteurs portent sur le contenu sélectionné ; le compteur des annotations masquées respecte aussi la recherche.

Les cartes affichent au plus 600 caractères par extrait et trois éléments initiaux par catégorie. Le carnet donne accès au texte complet et aux autres éléments. La page rend au plus **24 cartes** à la fois. Les caractères spéciaux sont échappés et les URL des images sont contrôlées.

Le tri **Sorties récentes / anciennes** utilise la date de sortie de l'animé. Une date de création de souvenir absente n'est pas inventée. L'année de sortie et l'année du choix annuel disposent de filtres distincts. Les dates inconnues sont placées à la fin. L'ancien statut `On Hold` reste reconnu comme **En pause**, sans réécrire sa valeur dans les données.

La réinitialisation et le rechargement des options synchronisent aussi les libellés visibles des menus personnalisés. Les menus d'année ne gardent donc plus une ancienne année lorsque le filtre revient à **Toutes les années**.

Les jaquettes éligibles réutilisent le cache local existant et ses limites. Une image gérée qui échoue reste récupérable après une reconnexion ; les délais et plafonds de reprise sont conservés.

### Compte, démarrage et recommandations

Un simple affichage de la bibliothèque ne doit pas invalider la lecture du compte en cours. Les véritables changements de collection demandent une actualisation regroupée. Cette correction couvre le démarrage où la lecture du compte se termine après le premier rendu de la bibliothèque, ainsi que les changements de filtres et de langue.

Les cartes ayant un identifiant MAL valide gardent leur commande de recommandation pendant le chargement du compte ou avant leur publication. L'action propose la connexion si nécessaire. Le choix du destinataire, les limites et les règles de contenu sont toujours vérifiés avant l'envoi. Une soumission répétée ne déclenche pas deux envois et la réponse d'une ancienne fenêtre ne ferme pas une nouvelle fenêtre.

Lors d'un changement de session, l'ancienne identité, les appareils en cache et les commandes du panneau Compte sont effacés immédiatement. Le panneau présente un chargement ou une erreur avec Réessayer ; une réponse périmée ne rétablit pas l'ancien compte.

Le calcul des animés en commun utilise les identifiants MAL des fiches de l'ami déjà accessibles. Le compteur et la bibliothèque utilisent le même regroupement des séries. Aucun texte personnel du carnet n'est ajouté aux échanges communautaires.

### Affichage étroit

À 480 pixels et moins, la bibliothèque affiche ses cartes sur une colonne afin que **Image**, **Recommander à un ami** et **Supprimer** restent lisibles. La bannière de complétion place son action sur une seconde ligne et garde son bouton de fermeture dans l'écran. Le parcours visuel couvre notamment une largeur de 390 pixels.

## Vérification et limites

Les résultats exécutés pour cette livraison sont détaillés dans la section **Résultats de cette exécution** et dans `validation-ux-2026-10-24.json`, accompagnés des rapports de vérification et de navigation. Les essais de navigateur utilisent des profils temporaires et des données fictives ; les interactions communautaires sont simulées, sans envoi réel ni modification d'un compte distant.

La compilation et le lancement natifs de l'installateur Windows NSIS ne sont pas exécutés depuis cet environnement Linux. La validation dans la VM Windows reste distincte des tests du moteur local et du navigateur. Les fichiers partagés du site sont synchronisés dans l'archive ; le site en ligne n'est pas redéployé par cette livraison.

Les anciens tests qui exigeaient les boutons supprimés ont été adaptés aux nouvelles règles. Le contrôle de stockage des actualités conserve ses assertions et dispose du même délai borné de 90 secondes que les autres scénarios lourds : il importe le catalogue complet via SQL.js avant de tester les écritures.

Le test HTTP historique Beta53 a aussi révélé une mesure de durée intermittente : sa limite de six secondes incluait la création du worker et la préparation locale des 30 430 fiches. Le test d'origine a réussi lors de sa reprise isolée. La mesure corrigée démarre à la première requête du fournisseur simulé, horodatée dans le worker ; elle garde la même limite de six secondes et toutes les assertions de classement, d'exclusion et d'import. Aucun budget réseau de l'application n'est augmenté.

## Utilisation sous Windows

1. Extraire toute l'archive dans un **nouveau dossier**.
2. Lancer **Publier Installateur Windows.bat** depuis ce dossier. Il installe les dépendances du projet et exécute ses contrôles avant la construction.
3. Récupérer l'installateur et son rapport dans `dist/`, puis vérifier le résultat dans la VM habituelle.

`Verifier Beta82 Windows.bat` reste un diagnostic facultatif. Aucune installation npm depuis `C:\Windows\System32` n'est nécessaire.

## Recette des tests de navigateur

Les deux scénarios supplémentaires sont `scripts/test-beta82-navigation-browser.cjs` et `scripts/test-beta82-ux-browser.cjs`. Ils restent hors de la vérification standard pour ne pas ajouter Playwright aux dépendances de construction. Pour les reproduire dans un environnement de test disposant de Playwright et Chromium, renseigner si nécessaire :

- `ALM_PLAYWRIGHT_MODULE` : chemin du module Playwright de test ; sinon le module `playwright` est recherché normalement.
- `ALM_CHROMIUM` : chemin de l'exécutable Chromium ; sinon le navigateur installé par Playwright est utilisé.
- `ALM_UI_EVIDENCE` : dossier temporaire des résultats visuels.

Les scénarios démarrent des profils isolés, vérifient les éléments effectivement visibles et ferment leurs processus. Les captures utilisées pour le contrôle visuel ne sont pas incluses dans l'archive.

## Documentation consultée

- [MDN — attribut HTML hidden](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/hidden) : interaction entre masquage HTML et règles CSS `display`.
- [MDN — AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) : interruption des lectures et gestion des réponses obsolètes. Une écriture déjà envoyée n'est pas assimilée à une opération annulée.

## Résultats de cette exécution

| Contrôle exécuté | Résultat |
| --- | --- |
| Exécution générale, `node scripts/verify-project.js` | **140 suites réussies**, puis arrêt sur le diagnostic attendu d'une archive ASAR volontairement incomplète. Le rapport conserve cet échec. |
| Reprise du test Electron et quatre suites restantes | **5 suites réussies séparément**, sans modifier leurs sources ni leurs assertions. Chaque suite du plan de 145 a donc réussi ; la validation repose sur plusieurs exécutions. |
| Moteur empaqueté sous Electron 45, Linux | Rejet de l'archive incomplète, import XML, catalogue de 30 430 fiches, sauvegarde et persistance après redémarrage vérifiés. |
| Parcours Chromium de l'application complète | **31 contrôles réussis**, aucune erreur JavaScript ; vrai serveur Express, SQLite et API de carnet, 70 fiches fictives. |
| Navigation et visibilité calculée | **23 contrôles réussis**, aucune erreur JavaScript ; listes longues/courtes/vides, dialogues, lecteur et sept langues. |
| Conservation du contenu | Les 70 notes et carnets restent identiques après le parcours complet ; aucune écriture communautaire. |
| Audit des traductions | **1 095 clés sur 1 095** dans chacune des **7 langues**, aucune clé manquante. Les nouveaux textes et commandes font aussi l'objet de tests dédiés. |
| `npm audit --omit=dev --json` | **0 vulnérabilité signalée dans les dépendances de production** à la date d'exécution. Aucune dépendance n'a été mise à jour. |
| Inspection visuelle | Bibliothèque, import XML, souvenirs, compteur ami ; affichages de 1 440 px et 390 px. Réinitialisation visible des filtres et disposition des cartes confirmées. |
| Miroirs du site | 20 paires de fichiers communautaires et 2 fichiers de navigation verticale identiques. |

Environnement : Linux, Node **24.22.1**, npm **11.9.0**, Chromium **134.0.6998.35**, Electron **45.0.0**. La politique CSP de l'application est conservée. Les réponses de compte communautaire sont simulées et le trafic extérieur est bloqué pendant la recette navigateur. La compilation Windows native reste à effectuer.

**Limite de la validation générale :** un passage unique des 145 suites sans interruption n'a pas été obtenu. Lors du scénario négatif, Electron a bien rejeté l'archive volontairement incomplète, mais le détail d'erreur reçu ne contenait pas le nom du module attendu. Le même test, inchangé, a ensuite réussi ses trois scénarios en isolation. La cause de cet incident intermittent n'a pas été reproduite. Le moteur de production et cette fixture restent identiques à ceux de l'archive reçue.

Preuves incluses : `validation-ux-2026-10-24.json`, puis dans `verification-ux/` le bilan `verification-combined.json`, le rapport général original `verification-project.json` avec son journal, les rapports et journaux des reprises isolées, `tested-source-manifest.json`, `navigation-browser.json`, `parcours-application-browser.json`, `audit-production.json` et `locales.log`. Les sources testées sont identiques entre l'exécution générale et les reprises. Le journal général conserve aussi les avertissements attendus des scénarios d'erreur simulés. Les trois nouvelles suites de régression sont intégrées au plan standard.
