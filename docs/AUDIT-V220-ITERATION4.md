# V2.2.0 — Revue technique ciblée, quatrième itération

## Modifications et limites
- Cockpit : le tri recalculait les dates d'historique pour chaque comparaison ; calcul une fois par fiche. Les événements de rendu rapprochés sont regroupés. Le défilement et les statuts restent inchangés.
- Import : rafraîchissements de résumés sérialisés ; recherche de fiches par Map au lieu d'un find sur la collection pour chaque carte. La vérification de plusieurs épisodes lit une seule fois le fichier d'associations. Énumération de répertoires bornée, avec tampon de 64 entrées.
- Nettoyage ciblé : labels inutilisés, garde d'initialisation jamais positionnée, rafraîchissement superflu et observateur DNA libéré. Aucun retrait massif de fonctions historiques.
- Sécurité : un seul scan IPC à la fois, contrôles racine/chemins, cohérence du hash d'identité persistée et des plages d'épisodes, limite/expiration des identités autorisant le chargement des affiches. Le cache existant valide HTTPS, les hôtes autorisés, les redirections, les adresses IP, le format et la taille, avec limitations de concurrence. Les noms de vidéos ne sont pas transmis aux CDN.
- Revue des protections existantes : requêtes loopback, cookie de session HttpOnly/SameSite, CSP, isolation et sandbox Electron, IPC de la fenêtre principale uniquement. Ces protections ne prouvent pas l'absence de failles.
- Risques à traiter avant publication : 6 alertes modérées de développement déjà documentées, CI précédente en échec, contrôle réel des jaquettes, performances natives Windows/Linux sur profils synthétiques, chemins NAS et concurrence filesystem, parcours MFA/révocation et mise à jour native. L'examen des nouvelles surfaces ne remplace pas un audit exhaustif des services externes, ni un test d'intrusion autorisé. Pas de déploiement, pas de publication.

## Vérification
Exécuter scripts/test-v220-performance-security.cjs, les tests locaux médias, les tests UI et npm run verify. Les benchmarks historiques dans scripts/performance restent disponibles pour mesures comparatives sur profils synthétiques. Aucune mesure de RAM en production n'est revendiquée. Ne pas exécuter ces outils sur un profil personnel.
