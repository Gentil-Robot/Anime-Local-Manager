# Supabase — schéma, migrations et sécurité ALM

Ce répertoire contient le **code serveur** de la communauté Anime Local Manager (ALM). Il appartient aux sources de la **V2.0.0 Bêta stable**, même si les migrations les plus anciennes portent des noms `beta60`, `beta61`, `beta82`, etc.

## Que contiennent les dossiers ?

- `migrations/` : **historique ordonné** des changements de schéma PostgreSQL (tables, fonctions, politiques RLS, droits). Les noms et horodatages doivent rester stables pour correspondre à l'historique des migrations déjà appliquées.
- `tests/` : requêtes de contrôle. À exécuter de préférence sur un environnement isolé.
- `functions/` : fonctions Edge Supabase.
- `email-templates/` : modèles d'e-mails et outils de génération.

## Pourquoi laisser les fichiers SQL publics ?

ALM est publié avec ses sources. Les instructions SQL décrivent le schéma communautaire et ses contrôles d'accès ; **elles ne sont pas des mots de passe ni des données utilisateurs**. Leur présence sur GitHub ne déclenche **aucune exécution** dans Supabase par elle-même. Une migration ne change une base que lorsqu'elle est appliquée par un outil ou une opération de déploiement ayant les permissions nécessaires.

**Précautions :**

- Ne jamais déposer de mot de passe, `service_role` secret, clé Resend, jeton ou clé privée dans ce dossier.
- Ne pas effacer, renommer ou rejouer arbitrairement les migrations historiques `betaXX` : elles restent nécessaires à la traçabilité et à la reconstruction d'un environnement.
- Ne pas copier-coller toute la série de migrations dans l'éditeur SQL d'une **production existante**.
- Les migrations peuvent *définir* des fonctions de gestion de compte, notamment une suppression de compte volontaire. La simple définition d'une fonction `DELETE` **n'exécute pas** cette suppression.
- Vérifier toute modification de `SECURITY DEFINER`, RLS, `GRANT` ou `ALTER DEFAULT PRIVILEGES` avant déploiement.

## Dernière correction de sécurité

La migration [`20261111193057_alm_security_privacy_acl.sql`](migrations/20261111193057_alm_security_privacy_acl.sql) a été appliquée le **11 novembre 2026**. Elle restreint l'accès aux fiches des utilisateurs bloquants et durcit les droits par défaut des futures tables créées par le rôle `postgres`. [Compte rendu des tests et limites](../docs/security/ALM_PRIVACY_ACL_VERIFICATION_2026-11-11.md).

Le fichier [`docs/security/rollback_blocked_profile_privacy_20261111.sql`](../docs/security/rollback_blocked_profile_privacy_20261111.sql) est conservé **uniquement pour une récupération d'urgence** : l'exécuter restaurerait l'ancien comportement moins confidentiel. Il ne doit pas être exécuté dans une installation normale.

La distinction est importante : `beta82` nomme une **étape du développement**, tandis que `2.0.0` est la **version publique du logiciel**.
