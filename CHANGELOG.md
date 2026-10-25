# Journal des versions — Anime Local Manager

## V2.0.0 Bêta stable — candidate validée le 25 octobre 2026

**Statut : prépublication en préparation, pas encore diffusée dans les releases GitHub.**
Version technique : `2.0.0` ; canal de mise à jour : `beta`.

### Nouveautés candidates

- Catalogue local hors ligne de 30 430 animés et gestion des bibliothèques, saisons et épisodes.
- Import XML et CSV BetaSeries ; sauvegarde et restauration de la bibliothèque.
- Anime DNA, classement, calendrier, actualités, recommandations et Mes souvenirs.
- Communauté facultative : comptes, amis, bibliothèques partagées et recommandations entre utilisateurs.
- Filtres d'âge, règles de confidentialité et suppression de compte.
- Interface multilingue : FR, EN, ES, DE, JA, PT-BR, ZH-CN.
- Installateur Windows NSIS x64 (pas de version portable).

### Contrôles déjà effectués

- 151/151 suites de tests automatisés Windows : réussies.
- Audits npm production/outillage : zéro vulnérabilité signalée à la date du rapport.
- Construction de l'installateur NSIS x64 : réussie.
- Deux démarrages de l'application empaquetée, avec import, persistance, sauvegarde et catalogue : réussis.

### Points à clore avant téléchargement public

- Installation, mise à jour et désinstallation réelles sur VM Windows vierge.
- Actualisation des composants de sécurité Electron/Node embarqués.
- Signature de l'installateur et vérification des mises à jour.
- Synchronisation du site et contrôles des conditions d'utilisation des sources tierces.

**Le rapport Windows qualifie la compilation de `passed-with-limitations`, non d'installation NSIS validée.**
La version 2.0.0 sera une **prépublication GitHub**, et la release V1 restera disponible.

## V1 — 26 mai 2026

Première version publique avec import XML, bibliothèque locale, récupération des informations et images, nouvelles saisons et sauvegardes JSON.

[Voir la release V1](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v1.0).
