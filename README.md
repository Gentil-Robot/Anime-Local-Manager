# Anime Local Manager

**Votre bibliothèque d'animés, vos saisons et vos souvenirs, au même endroit.**

Anime Local Manager (ALM) est une application **gratuite, locale et open source (licence MIT)** pour organiser sa collection d'animés sous Windows et Linux. Votre bibliothèque reste sur votre ordinateur par défaut ; les fonctions communautaires sont facultatives.

[**Site officiel**](https://animelocalmanager.com/) · [**Téléchargements**](https://github.com/Gentil-Robot/Anime-Local-Manager/releases) · [**Discord**](https://discord.gg/9KJ8MqhKh7) · [**Sources de la V2**](https://github.com/Gentil-Robot/Anime-Local-Manager/tree/publication/v2.0.0-beta-stable) · [**Notes de version V2**](https://github.com/Gentil-Robot/Anime-Local-Manager/blob/publication/v2.0.0-beta-stable/docs/RELEASE-NOTES-V2.0.0-BETA.md)

## V2.0.0 Bêta stable

<!-- ALM-V2:STATUS:START -->
**Statut : V2.0.0 Bêta stable validée sous Windows.** La release GitHub et son installateur sont préparés en **brouillon** ; la publication publique attend encore l'activation de la préversion.
<!-- ALM-V2:STATUS:END -->

- **153 suites de tests réussies** sur GitHub Actions pour la révision `6c2c350`.
- **Installateur Windows NSIS x64 compilé**, avec tests de démarrage et de persistance sur le runner de validation. Cela ne remplace pas tous les essais d'installation sur un PC neuf.
- **Electron 45.2.1** ; **Node.js 22.23.4** recommandé pour compiler les sources.
- **Audit des dépendances de production : aucune alerte** lors de la validation citée ; **15 alertes modérées** recensées dans l'outillage de compilation.
- **Linux : sources disponibles** ; paquets AppImage et DEB encore soumis à une validation de distribution distincte.

La branche [`publication/v2.0.0-beta-stable`](https://github.com/Gentil-Robot/Anime-Local-Manager/tree/publication/v2.0.0-beta-stable) contient les **sources V2**. La branche `main` conserve **les sources V1**, en attendant la revue et la fusion de la [pull request de publication](https://github.com/Gentil-Robot/Anime-Local-Manager/pull/2).

## Fonctionnalités de la V2

- **Bibliothèque personnelle :** fiches, progression, épisodes, statuts, favoris, notes, filtres, sauvegarde et restauration.
- **Imports et catalogue hors ligne :** listes BetaSeries (CSV) et XML ; **30 430 fiches** embarquées.
- **Découverte :** recherche, recommandations, saisons et suites, classement, calendrier et actualités.
- **Anime DNA, Mes souvenirs et dictionnaire :** profils d'animés, historique personnel et **161 termes** illustrés.
- **Communauté facultative :** amis, bibliothèques partagées, animés en commun, recommandations et réglages de confidentialité.
- **Protection des utilisateurs :** contrôles d'âge, préférences de partage et procédures de suppression de compte.
- **Sept langues :** français, anglais, espagnol, allemand, japonais, portugais brésilien et chinois simplifié.

## Télécharger Anime Local Manager

<!-- ALM-V2:DOWNLOAD:START -->
**Version actuellement téléchargeable :** [Anime Local Manager V1](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v1.0).

**V2.0.0 Bêta stable :** l'installateur Windows x64, le rapport de validation et son empreinte SHA-256 sont prêts dans le brouillon GitHub. Ils deviendront disponibles sur la [page officielle des téléchargements](https://github.com/Gentil-Robot/Anime-Local-Manager/releases) après publication de la préversion.

**Sécurité du téléchargement :** l'installateur n'est pas signé numériquement et peut entraîner un avertissement Windows SmartScreen. Une fois publié, téléchargez-le uniquement depuis GitHub Releases et comparez son SHA-256 avec `SHA256SUMS.txt`.
<!-- ALM-V2:DOWNLOAD:END -->

Pour tester ou compiler la V2 avant publication, consultez les [instructions de la branche V2](https://github.com/Gentil-Robot/Anime-Local-Manager/blob/publication/v2.0.0-beta-stable/README.md). **Compiler `main` construit encore la V1, pas la V2.**

## Confidentialité, sécurité et contributions

La bibliothèque principale est locale. La communauté nécessite une activation volontaire et respecte les paramètres de partage. Pensez à sauvegarder régulièrement vos données.

Le dépôt V2 inclut les schémas SQL, migrations, fonctions et modèles de courriels Supabase nécessaires au développement open source. **Les secrets serveur doivent rester dans les variables d'environnement et ne doivent jamais être intégrés au dépôt.** Les migrations historiques doivent conserver leurs identifiants d'origine.

- [Contribuer au projet](https://github.com/Gentil-Robot/Anime-Local-Manager/blob/publication/v2.0.0-beta-stable/CONTRIBUTING.md)
- [Signaler une vulnérabilité](https://github.com/Gentil-Robot/Anime-Local-Manager/blob/publication/v2.0.0-beta-stable/SECURITY.md)
- [Historique des versions](CHANGELOG.md) · [Documentation technique de la V2](https://github.com/Gentil-Robot/Anime-Local-Manager/tree/publication/v2.0.0-beta-stable/docs)
- [Licence MIT](LICENSE) — les images, métadonnées et autres contenus tiers restent soumis à leurs licences respectives.

---

**Gentil Robot** · [animelocalmanager.com](https://animelocalmanager.com/) · *物語が息づく場所* — Là où les histoires prennent vie.
