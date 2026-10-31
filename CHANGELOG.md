# Journal des versions — Anime Local Manager

## V2.0.0 Bêta stable — candidate en prépublication (31 octobre 2026)

**Statut :** sources de la V2 disponibles sur la [branche de publication](https://github.com/Gentil-Robot/Anime-Local-Manager/tree/publication/v2.0.0-beta-stable). La release V2 n'est **pas encore téléchargeable** sur GitHub. La branche `main` contient toujours les sources V1.

Version technique : `2.0.0` ; canal de mise à jour : `beta`.

### Nouveautés de la V2

- Catalogue local hors ligne de **30 430 animés**, bibliothèques, saisons, épisodes et favoris.
- Import de listes XML et CSV BetaSeries ; sauvegarde et restauration.
- Anime DNA, Mes souvenirs, dictionnaire de **161 termes**, classement, calendrier, actualités et recommandations.
- Communauté facultative : comptes, amis, partage paramétrable des bibliothèques et recommandations.
- Contrôles d'âge, de confidentialité et suppression de compte.
- **7 langues** : FR, EN, ES, DE, JA, PT-BR et ZH-CN.
- Installateur Windows **NSIS x64** ; éditions Linux AppImage et DEB à valider séparément.

### Contrôles documentés

- **153 suites de tests réussies** sur GitHub Actions pour le commit `6c2c350` (31 octobre 2026).
- Installateur Windows compilé avec succès ; essais de lancement et de persistance sur le runner Windows.
- Audit des dépendances de production : **0 alerte** lors de cette validation.
- **15 alertes modérées** connues dans les outils de compilation.
- Electron **45.2.1** ; Node.js **22.23.4** recommandé pour la compilation.

### Avant la release officielle

- Terminer les vérifications de l'installateur NSIS sur Windows, ainsi que les contrôles de la vidéo et du karaoké après installation.
- Confirmer l'intégrité de l'exécutable retenu et publier son empreinte SHA-256.
- Finaliser la revue des droits d'utilisation des contenus tiers et le suivi des alertes d'outillage.
- Publier une **GitHub pre-release** avec installateur et notes vérifiés ; fusionner la V2 vers `main` après revue.

La validation en CI n'implique pas que toutes les vérifications de distribution sur machine réelle soient terminées.

[Notes de version V2](https://github.com/Gentil-Robot/Anime-Local-Manager/blob/publication/v2.0.0-beta-stable/docs/RELEASE-NOTES-V2.0.0-BETA.md) · [Revue de publication](https://github.com/Gentil-Robot/Anime-Local-Manager/pull/2)

## V1 — 26 mai 2026

Première version publique : import XML, bibliothèque locale, récupération d'informations et de jaquettes, suivi des saisons et sauvegardes JSON.

[Télécharger la V1](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v1.0).
