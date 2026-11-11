# Documentation d'Anime Local Manager — V2.0.0 Bêta stable

> **Version actuelle de cette branche : ALM V2.0.0 Bêta stable.**
> Les mentions « Beta 60 », « Beta 81 », « Beta 82 » désignent **des itérations internes antérieures à la V2.0.0**, et non des versions plus récentes du logiciel.

## Comment la V2 est née

La V2 d'Anime Local Manager représente **environ six mois de travail**. Durant cette période, son créateur a réalisé **de très nombreuses versions bêta internes non publiées** afin de développer, tester et améliorer les fonctionnalités du logiciel. Leur nombre exact n'est pas établi ; les mentions « Beta 60 », « Beta 81 », « Beta 82 » sont des **jalons de développement**, et non autant de versions publiques.

Après ces mois de mise au point, la **V2.0.0 Bêta stable** a été publiée sur GitHub le **7 novembre 2026**. Il s'agit de la version publique de la V2, avec un statut GitHub **« pre-release »** : « Bêta stable » n'est pas synonyme de « version finale hors bêta ».

## Par où commencer ?

- [Notes de version V2.0.0 Bêta stable](RELEASE-NOTES-V2.0.0-BETA.md) — présentation de la version distribuée.
- [Publication open source V2](PUBLICATION-OPEN-SOURCE-V2.md) — contexte et préparation de la publication.
- [Compte rendu des contrôles de sécurité du 11 novembre 2026](security/ALM_PRIVACY_ACL_VERIFICATION_2026-11-11.md) — correction des profils bloqués et des permissions Supabase.

Le logiciel distribué porte la version **2.0.0** (canal **Bêta stable**). Les étapes de développement étaient nommées « Beta 60 », « Beta 81 », « Beta 82 », etc. Ce sont des noms **historiques** conservés pour la traçabilité des correctifs, des tests et des évolutions. Certains formats internes de compatibilité utilisent encore `2.0.0-beta.82` : **ne pas les renommer sans migration dédiée**, car cela pourrait perturber la reprise d'anciennes sauvegardes.

## Documents de recette historiques (archives de travail)

Les fichiers ci-dessous restent disponibles comme **preuves datées du développement**, et ne décrivent pas nécessairement l'état actuel du produit :

- [Recette Beta 82 du 23 octobre 2026](BETA82-RECETTE-PREPUBLICATION.md).
- [Profilage et sécurité Beta 82 du 24 octobre 2026](BETA82-PROFILAGE-SECURITE-2026-10-24.md).
- [Recette de sortie V2 candidate du 25 octobre 2026](RECETTE-V200-BETA-STABLE-2026-10-25.md).

Ainsi, une mention **« NON PRÊT à la diffusion publique »** dans une recette du 25 octobre 2026 correspond à la **candidate testée ce jour-là** ; ce n'est **pas** un diagnostic de l'installateur V2.0.0 publié ensuite.

Les autres documents Beta 81/82, journaux de tests, preuves JSON et comptes rendus de correctifs sont conservés pour faciliter les vérifications et la compatibilité. Leur présence n'impose pas de rebaptiser le logiciel ou de relancer ces anciennes étapes.

## SQL et sécurité

Le répertoire [`supabase/`](../supabase/README.md) contient les migrations PostgreSQL, les tests et les fonctions serveur. **La consultation des fichiers `.sql` sur GitHub ne les exécute pas.** En revanche, il ne faut **jamais lancer manuellement une migration historique ou une restauration de sécurité sur une base de production** sans vérification préalable.

Le fichier [`rollback_blocked_profile_privacy_20261111.sql`](security/rollback_blocked_profile_privacy_20261111.sql) est un **retour arrière d'urgence**, qui **réintroduirait volontairement une ancienne faille de confidentialité** s'il était appliqué. Ne pas l'exécuter lors d'une installation normale.

## Branches et versions

- Source de la **V2.0.0 Bêta stable** : `publication/v2.0.0-beta-stable`.
- Version distribuée : [release GitHub v2.0.0](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.0.0).
- Les branches de correctifs (par exemple `security/privacy-acl-hardening-20261111`) servent au développement et à la revue : ce ne sont **pas** de nouvelles versions publiques.
