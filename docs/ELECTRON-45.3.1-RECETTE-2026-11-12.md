# Electron 45.3.1 — Intégration et recette ALM

Date : 12 novembre 2026. Cette candidate source reprend l’archive MFA/supervision validée précédemment. Aucun installateur Windows, site ou service distant n’est publié par cette mise à jour.

## Changement de moteur

| Composant embarqué | Archive précédente | Nouvelle candidate |
| --- | --- | --- |
| Electron | 45.2.1 | 45.3.1 |
| Node.js | 24.22.1 | 24.22.2 |
| Chromium | 156.0.8078.75 | 156.0.8078.96 |

Ces versions embarquées sont indépendantes du Node installé sur le PC. La contrainte ALM reste `Node >=22.12.0`, npm 10 ou plus. La CI garde son épinglage Node 22.23.4 ; un PC équipé de Node 24 LTS peut aussi construire les sources. Cette livraison ne change pas le numéro public ALM 2.0.0 ni les formats de sauvegarde.

La mise à jour reste dans la branche majeure Electron 45. Les notes officielles intermédiaires ont été relues : mises à jour Node/Chromium, corrections de plantages, puis modification de confiance des intermédiaires RSA eMudhra révoqués en 45.3.1. Le test natif du moteur et celui du rendu sont nécessaires pour vérifier le comportement d’ALM avec ces nouveaux binaires.

## Verrouillage et contrôles

- `package.json` et `package-lock.json` épinglent exactement `45.3.1`, sans plage de version.
- Le test de prépublication vérifie explicitement la version, l’URL du paquet et son intégrité SHA-512 obtenue dans le registre npm : `sha512-1oYau2B4RXF27Df2fzvrFDJoy8AOSVlgS6gklo6wkLZ/QWJemJCJHkY4+uuacvSFUtR8IimiLukLNFoYP0fmjA==`. Cette valeur attendue reste indépendante du verrouillage lu par le test.
- Les tests historiques de prépublication et de chaîne de compilation exigent maintenant 45.3.1. Leurs autres contrôles, dont le sandbox, les origines et le CAPTCHA, sont conservés.
- Le script PowerShell de publication vérifie 45.3.1 dans les sources locales, le rapport natif de l’installateur et le dépôt distant. Ses conditions de publication restent actives.
- La recette native de l’interface vérifie également que le binaire exécuté correspond à la version épinglée. Les résultats enregistrent les versions réellement chargées.
- Le README, les références de recette et la liste des preuves attendues pour Windows suivent cette candidate. Les rapports précédents 45.2.1 restent des preuves historiques.

## Validation

**160 suites sur 160 réussies**, en 385 secondes, avec les nouveaux contrôles de version. Environnement de la suite : Linux, Node.js 24.22.1 installé sur l’hôte, npm 11.9.0. Une installation propre `npm ci` a réussi ; seuls l’épinglage racine et le paquet Electron ont changé dans le verrouillage.

| Groupe | Suites réussies |
| --- | ---: |
| Structure et régressions | 99 |
| Interface et karaoké | 8 |
| Imports et bibliothèque | 27 |
| Données, sauvegardes et sécurité | 14 |
| Publication | 12 |

Deux recettes natives supplémentaires ont réussi avec le **vrai Electron 45.3.1**, son **Node 24.22.2** et son **Chromium 156.0.8078.96** :

- Moteur : arrêt brutal du processus utilitaire, redémarrage sur un autre port, nouveau jeton local, refus de l’ancien jeton et conservation d’une entrée de bibliothèque avec ses notes.
- Interface : option MFA à la connexion, QR code local, ajout de deux authentificateurs, refus d’un code incorrect, connexion par l’appareil de secours, saisie de preuve sensible, sept langues et absence de débordement horizontal à 390 pixels. Le fournisseur Auth est fictif dans cette recette.

`npm audit --audit-level=high` réussit : six alertes modérées dans la chaîne de compilation, aucune élevée ou critique. L’audit des dépendances de production ne signale aucune vulnérabilité. Les six alertes de build restent inchangées ; elles n’ont pas été masquées par une mise à jour forcée.

Les vérifications Windows/NSIS avec cette candidate et les parcours contre Auth hébergé restent à exécuter avant publication. Le code métier du MFA, sa migration SQL et le superviseur sont identiques à l’archive précédente ; cette livraison ne les déploie pas.

Preuves : [suite complète](verification-electron4531-20261112/verification.json), [journal](verification-electron4531-20261112/verification.log), [moteur natif](verification-electron4531-20261112/electron-recovery.json), [interface native](verification-electron4531-20261112/electron-mfa.json), [audit](verification-electron4531-20261112/npm-audit-complet.json), [métadonnées npm](verification-electron4531-20261112/npm-electron-metadata.json), [diff par rapport à l’archive MFA](verification-electron4531-20261112/code.diff).


## Reprise sous Windows

Extraire la nouvelle archive dans un dossier distinct, puis ouvrir PowerShell dans le dossier contenant `package.json`. Exécuter les commandes dans cet ordre et attendre la fin de chacune :

```powershell
npm.cmd ci
npm.cmd ls electron --depth=0
node scripts/check-source-files.js
npm.cmd run verify
```

La version installée doit être `electron@45.3.1`. `npm ci` utilise le verrouillage fourni ; il n’est pas nécessaire de modifier les dépendances à la main ni de régénérer le manifeste de l’archive.

Pour la recette fonctionnelle : `npm.cmd run app`. Deux recettes natives isolées sont aussi disponibles :

```powershell
.\node_modules\.bin\electron.cmd .\scripts\test-v200-engine-native.cjs
.\node_modules\.bin\electron.cmd .\scripts\test-v200-auth-browser.cjs
```

Elles utilisent des profils jetables ; le fournisseur Auth du test d’interface est simulé. Leur réussite ne prouve pas les parcours contre le service Auth hébergé.

Après validation, utiliser `Publier Installateur Windows.bat` pour construire et tester le NSIS. Conserver le rapport `dist/release-check.json` et refaire la recette en VM : démarrage, imports, images, sauvegardes/restauration, arrêt/redémarrage, mise à jour et désinstallation. Le contrôle de version dans un fichier ne remplace pas ces essais.

La publication du MFA reste coordonnée avec la nouvelle application, le module d’authentification du site et la migration SQL décrits dans [la note MFA/supervision](security/MFA-ET-SUPERVISION-2026-11-12.md). Cette mise à jour d’Electron ne déploie pas cette migration et ne réécrit pas la vitrine actuelle du site. Choisir la prochaine version ALM avant une nouvelle publication pour que l’outil de mise à jour puisse la détecter.

## Sources

- [Versions Electron stables](https://releases.electronjs.org/?channel=stable)
- [Electron 45.2.2](https://github.com/electron/electron/releases/tag/v45.2.2)
- [Electron 45.2.3](https://github.com/electron/electron/releases/tag/v45.2.3)
- [Electron 45.3.0](https://github.com/electron/electron/releases/tag/v45.3.0)
- [Electron 45.3.1](https://github.com/electron/electron/releases/tag/v45.3.1)
- [Métadonnées npm exactes](https://registry.npmjs.org/electron/45.3.1)

## Mise à jour du 13 novembre 2026

Le service MFA et le module de compte du site ont depuis été déployés, après sauvegarde du site et du schéma et autorisation. Le contenu métier de cette candidate est inchangé. Voir [le compte rendu du déploiement](security/DEPLOIEMENT-MFA-2026-11-13.md). L’enrôlement avec un compte réel reste à vérifier.
