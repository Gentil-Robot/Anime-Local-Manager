# Revue du code ALM 2.1.0 — 13 novembre 2026

Périmètre : différences des sources 2.0.0 du 13 novembre (MFA déployé, Electron 45.3.1), correctif indépendant de récupération du mot de passe, métadonnées 2.1.0 et publication Windows. Cette revue ne constitue pas une certification ni un contrôle exhaustif de tous les composants historiques.

## Corrections vérifiées

| Point | Comportement corrigé | Vérification |
|---|---|---|
| Canaux de mise à jour concurrents | Caches et requêtes séparés ; un retour bêta tardif ne remplace pas l'état stable choisi | Scénario asynchrone avec réponse retardée |
| Rafraîchissement réseau en échec | L'ancien installateur proposé est retiré de l'état disponible | Audit de la réponse après échec forcé |
| Actions sensibles | Preuve récente et RPC à usage unique dans la même file d'authentification | Déconnexion demandée pendant l'action bloquée puis exécutée après elle |
| Fermeture pendant création du moteur | Le processus tardif est terminé avant toute reconnexion | Création différée puis fermeture du superviseur |
| Rafraîchissement de compte | Un calcul de bibliothèque au lieu de deux pour un compte connecté | Comptage des lectures sur le parcours HTTP réel |
| Mise à jour depuis 2.0.0 | Nom générique de l'installateur 2.1.0 conforme au contrat de l'ancien updater | Sélection d'un asset avec taille, URL et SHA-256 valides |
| Récupération du mot de passe | Intégration du correctif de formulaire dédié, sans perdre le contrôle MFA | Recette de lien vérifié, lien invalide, MFA et soumission |

Le format historique des sauvegardes `2.0.0-beta.82`, l'appId, les identifiants des migrations déjà appliquées et le canal bêta sont conservés. Aucune nouvelle migration de base n'est nécessaire pour ces corrections.

## Contrôles de sécurité

- Règles de session et MFA : vérification de la session dans `auth.sessions`, facteur approuvé côté serveur, preuves sensibles limitées à une action et une session, accès anonymes refusés et tables privées sans droits directs.
- Electron : séparation du rendu et du moteur, sandbox, isolation de contexte, absence d'intégration Node dans le rendu, arrêt du premier moteur avant démarrage d'un nouveau.
- Publication : dépendances verrouillées, scan des fichiers livrés, manifestes SHA-256, contrôle du rapport Windows contre les sources et le binaire, référence GitHub résolue en commit avant publication. La publication refuse un rapport incomplet ou une release existante.
- Audit hébergé du 13 novembre : avertissement de protection des mots de passe compromis non activée ; les informations « RLS sans politique » concernent les tables privées volontairement fermées aux clients. Les index MFA récents sont conservés malgré l'information « pas encore utilisé ».

## Validation

Les 162 suites locales et les deux recettes natives passent ; les preuves sont dans [verification-v210-20261113](verification-v210-20261113/). L’audit npm de production ne signale aucune alerte ; six alertes modérées concernent l’outillage. L’accord explicite de publication sur le dépôt public Gentil-Robot/Anime-Local-Manager a été reçu le 13 novembre 2026 ; la recette Windows doit réussir avant publication de l’installateur. Les résultats effectifs sont fournis dans les rapports joints à cette révision et dans `release-check.json` pour le binaire. La publication automatisée ne s'exécute qu'après les suites du projet, les essais natifs Electron et l'installation NSIS sur le runner Windows.

Les tests MFA utilisent des comptes fictifs ; l'activation avec le compte réel a été confirmée par l'utilisateur avant cette revue. Ils ne prouvent pas tous les comportements de récupération chez le fournisseur. La perte de tous les authentificateurs reste une limite connue. Les alertes modérées de compilation et la sauvegarde distante complète des comptes restent à distinguer de la validation du code livré.

## Références techniques

- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/auth/sessions
- https://www.electronjs.org/docs/latest/tutorial/security

## Recette Windows : nettoyage du profil de test

Le premier passage Windows valide les 162 suites, la construction NSIS, l’installation, la persistance et les assertions de reprise du moteur. La recette native était ensuite bloquée par la suppression de son propre profil Chromium avant la fermeture d’Electron (`EPERM`). Le pilote Node supprime désormais le dossier temporaire après la fin du processus Electron, avec des tentatives bornées pour les verrous transitoires Windows. Les assertions fonctionnelles et les conditions de publication sont conservées. Le second passage Windows doit confirmer aussi le parcours MFA avant publication.
