# Anime Local Manager V2.1.2 — Bêta stable

## Installation des mises à jour sous Windows

- ALM attend la confirmation du lanceur Windows avant de se fermer. La création d’un processus seule ne vaut plus confirmation.
- Un journal est ouvert dès la tentative, y compris pour les erreurs de démarrage de PowerShell. L’échec est affiché dans ALM, qui reste ouvert si le lanceur n’a pas confirmé son démarrage.
- Le lanceur vérifie l’intégrité du fichier, attend la fermeture d’ALM, installe la mise à jour puis relance explicitement l’application. Le code de sortie de l’installateur est contrôlé.
- Le téléchargement et son état restent disponibles après un échec. Le bouton d’installation permet de réessayer volontairement ; une fermeture ordinaire ne répète pas automatiquement une installation échouée.
- Les chemins contenant des espaces et des caractères accentués sont couverts par la recette Windows.

Les messages d’échec sont disponibles dans les sept langues. Les notifications Stable/Bêta et le canal « Versions stables et bêtas » par défaut restent disponibles.

## Vérification avant publication

La publication exige les 165 suites, les trois parcours natifs Electron et la recette NSIS. Cette dernière teste désormais la séquence complète : confirmation du lanceur, sortie réelle du processus parent, installation, redémarrage automatique d’ALM installé, import et persistance après un second lancement. Le résultat figure dans `smoke.updater` du rapport `release-check.json`.

## Installation

Installateur Windows x64 : `Anime-Local-Manager-2.1.2-Setup-x64.exe`. Les versions déjà installées qui rencontrent le problème de lancement automatique doivent installer ce fichier manuellement une fois. La collection et les réglages sont conservés.

Les dépendances, le format de sauvegarde et l’identifiant de l’application restent inchangés. Les versions publiées 2.1.0 et 2.1.1 restent accessibles avec leurs propres installateurs et rapports.

## English

ALM 2.1.2 requires a positive acknowledgement from its Windows update helper before closing. Startup failures keep ALM open and retain the downloaded installer for a deliberate retry. The helper checks the installer exit code and explicitly restarts ALM. Publication requires 165 suites and a real Windows close/install/restart/persistence test. Older installations affected by the launch issue need one manual installation of 2.1.2.
