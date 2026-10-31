# Anime Local Manager V2.0.0 — Bêta stable

**Canal : bêta publique.** Anime Local Manager est un gestionnaire local d'animés open source, sous licence MIT.

## Points forts

- Bibliothèque personnelle, progression des épisodes, statuts et favoris, avec stockage local et sauvegardes.
- Recherche et filtres, bouton **Réinitialiser**, recommandations et suivi des saisons.
- Anime DNA, Mes souvenirs, dictionnaire de 161 termes, actualités et calendrier.
- Import de listes BetaSeries / XML et catalogue hors ligne de **30 430 fiches**.
- Communauté facultative (amis, recommandations, confidentialité et restrictions d'âge).
- **7 langues** : français, anglais, espagnol, allemand, japonais, portugais brésilien, chinois simplifié.
- Installateur **Windows NSIS x64** ; les distributions Linux restent un chantier séparé.

## Sécurité et limites connues

- Electron **45.2.1** (moteur Node.js embarqué corrigé) ; Node.js **22.23.4** pour construire la version Windows.
- Les tests et l'audit npm de production doivent être exécutés sur la version exacte distribuée.
- Des alertes `npm audit` modérées peuvent persister dans les dépendances de **compilation**, notamment `minimatch` via `electron-builder` ; suivre les mises à jour du projet amont.
- **Installateur non signé numériquement** : un avertissement Windows SmartScreen est possible. Ne télécharger que depuis la release officielle GitHub et vérifier l'empreinte SHA-256 publiée.
- Les données de bibliothèque restent locales par défaut. Les fonctions communautaires nécessitent un compte volontaire.

## Installation

Télécharger `Anime-Local-Manager-2.0.0-Beta-Stable-Setup-x64.exe` dans les *assets* de cette release, vérifier son empreinte SHA-256, puis exécuter l'installateur sous Windows. La maintenance planifiée Windows est activable volontairement dans les réglages.

Le code source est disponible dans le dépôt [Gentil-Robot/Anime-Local-Manager](https://github.com/Gentil-Robot/Anime-Local-Manager).

---

### English summary

Anime Local Manager 2.0.0 is an open-source (MIT) **Windows x64 beta** for managing a personal anime library locally, discovering seasons and recommendations, importing lists, tracking memories, and optionally sharing selected information with friends. It supports seven languages, an offline catalog of 30,430 titles, local backups, and opt-in scheduled maintenance. The installer is currently unsigned and may trigger SmartScreen warnings. Verify the SHA-256 published with the installer. Production npm dependencies and native Windows installer testing are checked before release; some moderate build-tool-only advisories remain documented.
