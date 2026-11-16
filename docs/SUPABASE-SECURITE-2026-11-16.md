# Supabase ALM Community — préparation sécurité du 16 novembre 2026

## État constaté

Contrôles effectués en lecture seule le 16 novembre 2026 :

| Point | Résultat |
| --- | --- |
| Projet | ALM Community (`duzwwoyqproxpytmfzdx`, région eu-west-3) |
| PostgreSQL interrogé par SQL | 17.11 (`server_version_num = 170011`) |
| Build Supabase annoncé | 17.11.0.003 |
| Correctif amont de CVE-2026-116304 pour la branche 17 | 17.12 |
| Rétroportage du correctif dans le build installé | Non confirmé |
| Offre Supabase | Free |
| Protection des mots de passe compromis | Désactivée ; option disponible à partir de Pro |
| Disponibilité du correctif dans le tableau de bord | Non vérifiée : connexion au tableau de bord nécessaire |
| Mise à niveau de la base effectuée pendant cette préparation | Non |

La CVE concerne l'exécution de requêtes par un utilisateur de base de données. Un compte communautaire ALM ne donne pas automatiquement un accès SQL arbitraire. L'exploitabilité à travers les seules API ALM n'a pas été démontrée. Les politiques RLS et le MFA ne remplacent pas le correctif du moteur PostgreSQL.

## Séquence de mise à niveau

1. Ouvrir [Infrastructure](https://supabase.com/dashboard/project/duzwwoyqproxpytmfzdx/settings/infrastructure) et relever la version proposée. Cibler un build Supabase contenant PostgreSQL **17.12 ou un correctif ultérieur de la même branche**, ou une confirmation explicite du rétroportage de cette CVE par Supabase. Ne pas considérer une simple augmentation du suffixe Supabase comme une preuve du correctif.
2. Si aucun build corrigé n'est proposé, demander à Supabase la disponibilité du correctif pour ce projet. Ne pas mettre en pause/restaurer la production à l'aveugle et ne pas lancer un changement de version majeure uniquement pour ce correctif.
3. Avant l'opération, conserver une sauvegarde récente, protégée et récupérable hors du dépôt. Vérifier qu'elle couvre les données communautaires, les schémas privés et Auth et que la procédure de restauration est exploitable. Les migrations SQL du dépôt ne constituent pas une sauvegarde des comptes ni de leurs données. Ne pas copier de dump ou de secret dans GitHub.
4. Prévoir une fenêtre d'indisponibilité des comptes, du partage et des services communautaires. La bibliothèque locale reste utilisable hors ligne. Relever le compte et la session de test à utiliser sans enregistrer leurs secrets dans les rapports.
5. Effectuer la mise à niveau avec le mécanisme officiel Supabase, après validation de la sauvegarde et du créneau. La connexion au tableau de bord est requise : le connecteur disponible ne fournit pas de commande de mise à niveau PostgreSQL.
6. Exécuter le diagnostic [en lecture seule](../ops/postgres-security-check.sql). Confirmer `server_version_num >= 170012` dans la branche 17, ou archiver la confirmation Supabase d'un rétroportage. Relancer les conseillers santé et sécurité ; leur absence d'alerte ne prouve pas, à elle seule, que cette CVE est corrigée.
7. Avec les comptes de test existants, vérifier connexion, MFA, profil, amis, partage et lecture des bibliothèques, notifications et révocation de session. Tester un lien de récupération uniquement si l'envoi d'un e-mail de test a été décidé ; ne pas modifier le mot de passe du compte principal pour cette recette. Contrôler les erreurs et la disponibilité avant de clore la maintenance.

## Protection des mots de passe compromis

L'organisation est sur **Free**. L'option de comparaison avec les mots de passe compromis nécessite **Pro ou supérieur**. Aucun changement d'abonnement payant n'a été effectué. Si l'offre change, activer cette protection dans les réglages Auth et vérifier avec un compte de test qu'un mot de passe compromis est refusé, sans envoyer le mot de passe actuel du compte principal à un outil de test.

Les notifications informatives « RLS enabled, no policy » sur les tables `alm_private` ne doivent pas être supprimées en ajoutant des politiques permissives. L'absence de politique peut être volontaire pour empêcher l'accès direct à ces tables.

## Références

- [CVE-2026-116304 — PostgreSQL](https://www.postgresql.org/support/security/CVE-2026-116304/)
- [Mise à niveau Supabase et indisponibilité](https://supabase.com/docs/guides/platform/upgrading)
- [Sécurité des mots de passe et condition Pro](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
