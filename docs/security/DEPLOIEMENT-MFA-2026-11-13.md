# Déploiement du service MFA — 13 novembre 2026

Le service communautaire et les pages de compte d’animelocalmanager.com ont été alignés sur la candidate Electron 45.3.1, après autorisation de l’utilisateur et sauvegarde préalable du site et du schéma.

## Incident corrigé

La candidate appelait `alm_security_state`, absente du service hébergé. Les journaux montraient des réponses HTTP 404/PGRST202, masquées à l’écran par un message réseau générique. La migration attendue est maintenant présente. Les appels anonymes aux nouvelles fonctions répondent HTTP 401/42501 (refus d’autorisation), sans erreur de fonction absente.

## Sauvegarde préalable

`ALM-Sauvegarde-Avant-MFA-20261113.zip`, 6 415 440 octets, SHA-256 `bd45d3daa990982aab00d23dfc9d9d705fb3cdcfa12b2762687fa9b41d4a1681`.

Cette sauvegarde contient les 91 fichiers statiques du site précédent, ses références source Vercel, 67 définitions de fonctions, les sept règles d’accès préexistantes, droits et autres métadonnées de schéma, l’historique des 13 migrations et un script de retour arrière protégé. Elle ne contient aucune ligne de compte, mot de passe, jeton ou secret TOTP. Ce n’est pas une sauvegarde complète des données Supabase. L’export complet de données Auth a été refusé par le contrôle automatique ; cette sauvegarde couvre le code et le schéma que le déploiement modifie.

L’API visitor-locale reste conservée par son déploiement précédent et sa référence source ; ses octets complets n’ont pas été exportés. Aucun retour arrière n’a été exécuté. Après utilisation du MFA, corriger en avant : ne pas rétablir des règles qui retireraient sa protection.

## Déploiement réalisé

- Migration hébergée : `20261113084819_alm_optional_mfa_session_security`.
- SQL SHA-256 : `965e2beb226772be6c4198143b0819d018a38bebc0d2164be2210d94c0166f52`.
- Le contenu SQL est identique au candidat `20261112081334` ; le fichier local a été renommé pour correspondre à l’historique réel, sans modifier manuellement cet historique.
- Projet Supabase : `duzwwoyqproxpytmfzdx`.
- Projet Vercel : `prj_Oc8zZ0FmmgvftzLs0EZhcWwsCmrF`, équipe `alm-b8a5`.
- Préversion vérifiée : `dpl_GbPKnDvTCDBKojaMytsddMDvK2dP`.
- Production READY : `dpl_9r4jvT1hrYgkmsLhf5QVYxKxGYXX`, domaine `animelocalmanager.com`.
- Production précédente conservée : `dpl_5cuxcfpUya5us6aRGZqBAgAR6Npq`.

La migration crée trois tables privées, ajoute les fonctions MFA et des gardes de session. Elle ne transforme ni ne supprime les bibliothèques, comptes ou mots de passe existants à son application. Aucun facteur MFA vérifié n’était présent au relevé préalable. Les suppressions et révocations définies dans ses fonctions ne s’exécutent que lors d’une demande ultérieure autorisée.

## Contrôles en production

- Sept nouvelles fonctions publiques : SECURITY INVOKER, chemin de recherche vide, exécution accordée à authenticated et refusée à anon.
- Trois tables privées : RLS activée et lecture directe refusée à anon/authenticated.
- Deux fonctions internes (`session_actor`, `consume_sensitive`) non exécutables directement par les rôles client.
- Six règles de session RESTRICTIVE pour toutes les opérations sur les tables communautaires.
- Les 95 empreintes source du déploiement correspondent à la préversion contrôlée.
- Les 12 fichiers modifiés ont été relus depuis le domaine public : HTTP 200 et octets identiques.
- La page compte affiche l’option « Configurer le MFA après ma connexion » et le texte sur le code demandé après le mot de passe.
- Les fonctions `alm_security_state` et `alm_begin_sensitive` sont présentes dans le cache de l’API et refusent les appels anonymes : HTTP 401/42501.
- Le thème Night Sakura, les images et les autres pages ont été conservés. L’API visitor-locale est réutilisée avec sa source inchangée.

Le contrôle de sécurité conserve l’avertissement préexistant sur la protection des mots de passe compromis, désactivée chez le fournisseur. Les informations « RLS sans politique » concernent les tables privées dont l’accès direct est volontairement refusé. Aucun élargissement de droits n’a été ajouté pour faire disparaître ces informations.

## Limites et reprise

L’enrôlement TOTP, la connexion, la réauthentification et la révocation avec un compte réel contre le fournisseur hébergé restent à essayer. Aucun mot de passe utilisateur n’a été demandé ou lu ; aucun compte de test n’a été créé et aucun email n’a été envoyé.

Dans la candidate déjà installée, fermer et rouvrir l’application, puis réessayer **Mon espace**. Le MFA s’active dans **Mon compte → Sécurité du compte**. Sur le site, recharger la page compte si elle était déjà ouverte.

L’installateur public reste inchangé. La version publique du paquet reste 2.0.0 ; avant publication d’un nouvel installateur, choisir un nouveau numéro détectable par le mécanisme de mise à jour et effectuer la recette Windows/NSIS. Les anciens clients ne fournissent pas les autorisations sensibles nouvelles : leurs actions de suppression/révocation exigent la mise à jour. Les comptes ayant activé le MFA exigent également un client compatible.

Preuves : [contrôles du schéma](../verification-deploiement-mfa-20261113/database-verification.json), [site et API](../verification-deploiement-mfa-20261113/production-verification.json), [empreintes source](../verification-deploiement-mfa-20261113/production-mfa-hashes.json). Les tests précédents sous Electron 45.3.1 et les 160 suites sont documentés dans [la recette Electron](../ELECTRON-45.3.1-RECETTE-2026-11-12.md).
