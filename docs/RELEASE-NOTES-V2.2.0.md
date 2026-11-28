# Anime Local Manager V2.2.0 — candidate non publiée (27 novembre 2026)

**Ne pas publier avant approbation de la recette VM.** La V2.1.3 reste la dernière version publique de référence.

- ALM Cockpit, suivi des diffusions récentes, reprise et suites absentes de la bibliothèque.
- Importer > Associer mes fichiers : reconnaissance locale PC/NAS, correction manuelle, stockage local.
- En cours : prochain épisode et ouverture du fichier associé. La lecture ne modifie pas automatiquement la progression.
- Saisons : vérification explicite des associations ; Anime DNA : pipeline de jaquettes partagé. Mes souvenirs conserve son écran d'origine.
- Mise à jour : progression native, résultat explicite et reprise du moteur ; MFA facultatif et contrôle des sessions.
- Electron 45.5.0, Node.js 24.22.3 et Chromium 156.0.8078.109. Lockfile exact, audit production distinct, contrôles natifs séparés.
- 180 suites prévues, Windows NSIS et Linux AppImage/DEB en aperçu isolé. Les builds doivent encore passer les contrôles sur le dernier commit et être validés en VM.

[Recette complète VM](RECETTE-V220-VM-TEST.md).

Risque résiduel documenté : CVE-2026-118764 dans l'outillage de construction minimatch, hors dépendances de production. Attendre une version stable compatible d'electron-builder ou démontrer la compatibilité d'une remédiation ciblée. Pas de rétrogradation forcée.
