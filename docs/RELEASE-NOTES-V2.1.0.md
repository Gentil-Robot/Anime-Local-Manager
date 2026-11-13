# Anime Local Manager V2.1.0 — Bêta stable

## Nouveautés

- MFA facultatif par application TOTP, QR code créé localement, ajout et retrait d'authentificateurs et appareil de secours.
- Mot de passe et code MFA actuel exigés avant les opérations sensibles ; autorisation serveur à usage unique, liée à la session et à l'action.
- Vérification de la session côté base et révocation des appareils, même avant expiration de leur jeton d'accès.
- Surveillance du moteur local, alerte native en cas de panne ou de blocage et redémarrage contrôlé ; les opérations interrompues ne sont pas rejouées automatiquement.
- Réinitialisation du mot de passe : formulaire dédié visible dès l'ouverture du lien vérifié, gestion des liens expirés et vérification MFA si nécessaire.
- Interfaces MFA et supervision dans les sept langues d'ALM.

## Corrections et performances

- Un seul calcul de bibliothèque par rafraîchissement du compte connecté.
- Vérifications de mise à jour et caches séparés pour les canaux stable et bêta ; une erreur réseau retire l'ancienne proposition d'installation.
- La réauthentification et l'exécution sensible restent dans la même file, afin qu'une déconnexion concurrente ne remplace pas leur session.
- Un moteur créé après le début de fermeture est arrêté avant de reconnecter l'interface.
- Installateur nommé `Anime-Local-Manager-2.1.0-Setup-x64.exe`, compatible avec le programme de mise à jour de la V2.0.0.

## Installation et sécurité

Windows NSIS x64, Electron 45.3.1 (Node.js 24.22.2 et Chromium 156.0.8078.96). La bibliothèque locale, le format de sauvegarde existant et les identifiants d'application sont conservés. Une sauvegarde avant mise à jour reste recommandée.

Le MFA concerne le compte communautaire et reste facultatif. Ajouter un appareil de secours avant de retirer l'ancien téléphone. La perte de tous les authentificateurs ne dispose pas actuellement de réinitialisation automatique.

La migration MFA et les contrôles de session ont été déployés le 13 novembre 2026. Ils ne doivent pas être rejoués manuellement sur le même projet. Les versions 2.0.0 existantes ne savent pas effectuer les nouvelles réauthentifications sensibles et doivent être actualisées pour ces opérations.

La publication exige la réussite des 162 suites, des essais natifs Electron et de la recette réelle de l'installateur Windows ; le rapport `release-check.json` et `SHA256SUMS.txt` accompagnent le binaire. L'installateur est non signé sauf indication contraire dans ce rapport. Les alertes modérées de l'outillage de compilation sont distinguées de l'audit de production.

## English

ALM 2.1.0 adds optional TOTP MFA with a backup authenticator, server-verified sensitive actions, live session revocation and supervised local-engine recovery. Password recovery now opens a dedicated verified form. Update-channel checks are isolated, account refresh avoids duplicate library calculations and shutdown handles late engine creation. Windows x64 NSIS, seven languages, Electron 45.3.1. Local libraries remain available offline. This is a public beta; verify the published SHA-256 before installing.
