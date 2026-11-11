# Anime Local Manager

**Votre bibliothèque d'animés, vos saisons et vos souvenirs, au même endroit.**

Anime Local Manager (ALM) est une application **locale, gratuite et open source (MIT)** pour organiser sa collection d'animés sous Windows et Linux. La bibliothèque reste locale par défaut ; la communauté est facultative.

[**Site officiel**](https://animelocalmanager.com/) · [**Téléchargements GitHub**](https://github.com/Gentil-Robot/Anime-Local-Manager/releases) · [**Discord**](https://discord.gg/9KJ8MqhKh7) · [**Notes de la V2**](docs/RELEASE-NOTES-V2.0.0-BETA.md) · [**Historique technique**](docs/)

## V2.0.0 Bêta stable

**Version publiée sur GitHub le 7 novembre 2026, avec le statut « pre-release » (bêta publique).** Cette branche contient les sources de la V2 ; la branche `main` conserve l'historique de la V1.

### Six mois de travail avant la publication

> **Le mot du créateur :** « J'ai travaillé environ six mois sur la V2 d'Anime Local Manager. J'ai réalisé de nombreuses versions bêta internes, testé des fonctionnalités, corrigé des problèmes et amélioré le logiciel étape par étape. Toutes ces bêtas étaient des versions de travail non publiées. Après cette période de développement, j'ai finalement rendu la **V2.0.0 Bêta stable** accessible au public sur GitHub. »

Les anciennes mentions `Beta 60`, `Beta 81` ou `Beta 82` renvoient à ces étapes internes. Il n'existe pas ici de décompte exhaustif permettant d'affirmer combien de bêtas ont été créées. La version **2.0.0 Bêta stable** est l'aboutissement de ces essais ; malgré son nom, elle reste officiellement publiée sur le **canal bêta**, et non comme version finale stable.

- **153/153 suites de tests réussies** sur GitHub Actions pour le commit `6c2c350` (avant mise à jour de ce README).
- Installateur **Windows NSIS x64** compilé ; essais de démarrage et de persistance réussis sur le runner Windows.
- Audit des dépendances de production : **0 alerte** ; **15 alertes modérées** connues dans l'outillage de compilation.
- Electron **45.2.1** ; Node.js **22.23.4** recommandé pour construire le projet.

### Télécharger la V2

**Release officielle `v2.0.0` publiée le 7 novembre 2026, marquée « pre-release » (bêta publique).**

- [**Télécharger Anime Local Manager V2.0.0 Bêta stable**](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.0.0).
- [**Consulter toutes les releases**](https://github.com/Gentil-Robot/Anime-Local-Manager/releases).

L'installateur Windows est `Anime-Local-Manager-2.0.0-Beta-Stable-Setup-x64.exe`. Téléchargez-le **uniquement depuis la release officielle** et comparez son SHA-256 à l'empreinte annoncée sur cette release. **L'installateur n'est pas signé numériquement** : Windows SmartScreen peut afficher un avertissement.

## Fonctionnalités

- **Bibliothèque personnelle :** fiches, statuts, épisodes, favoris, notes, filtres, sauvegardes et restauration.
- **Imports et catalogue :** listes BetaSeries (CSV) et XML ; **30 430 fiches** de catalogue embarquées pour un fonctionnement local.
- **Découverte :** recherche, recommandations, nouvelles saisons, classement, calendrier et actualités.
- **Anime DNA et Mes souvenirs :** exploration des profils d'animés, historique personnel et carnet de souvenirs.
- **Dictionnaire :** 161 termes illustrés autour de l'animation japonaise.
- **Communauté facultative :** amis, bibliothèques partagées, animés en commun, recommandations et contrôles d'âge et de confidentialité.
- **Sept langues :** français, anglais, espagnol, allemand, japonais, portugais brésilien et chinois simplifié.

## Windows

**Distribution publique ciblée :** installateur NSIS x64 uniquement. La version portable Windows n'est plus proposée.

Pour compiler les sources sous Windows, installer Node.js `22.23.4`, npm 10+, Git et Git LFS, puis :

```powershell
npm ci
npm run verify
```

Lancer ensuite `Publier Installateur Windows.bat` pour les vérifications et la construction ; `REPRENDRE_BUILD_WINDOWS.bat` permet de reprendre une construction interrompue. Les fichiers de sortie et le rapport `release-check.json` sont produits dans `dist/`. La compilation ne publie pas automatiquement de release GitHub.

## Linux

Les sources fonctionnent aussi sur Linux. Les paquets **AppImage** et **DEB** sont prévus, mais leur publication binaire doit faire l'objet d'une validation distincte de la recette Windows.

Après installation de Node.js 22+, npm et Git LFS :

```bash
git lfs pull
npm ci
npm run app
```

La construction Linux peut se lancer avec `bash "Creer App Linux.sh"`. Elle produit les livrables dans `dist/` si l'environnement est compatible.

## Développement et contributions

```bash
npm ci
npm run app             # application Electron
npm run verify          # vérification du projet
npm run build:community # génération locale des fichiers du site communautaire
```

Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour contribuer, [SECURITY.md](SECURITY.md) pour signaler un problème de sécurité et [LICENSE](LICENSE) pour la licence MIT du code. **Les contenus tiers, métadonnées et jaquettes conservent leurs conditions de licence propres.** La publication du code ou la compilation ne déploie pas Vercel, Supabase, Cloudflare ou Resend.

### Sauvegardes et Confidentialité

Les données principales restent sur l'ordinateur de l'utilisateur. Faites une sauvegarde avant toute migration importante. Les fonctionnalités de communauté demandent une activation volontaire et appliquent les restrictions de partage et d'âge.

### Documentation et historique technique

Les anciennes itérations et les correctifs de développement sont conservés dans le dossier [`docs/`](docs/) à des fins de traçabilité, mais **V2.0.0 Bêta stable** est la version présentée publiquement. Les noms historiques des scripts de test et des migrations Supabase sont conservés pour garantir leur compatibilité et leur suivi.

- [Notes de version V2.0.0](docs/RELEASE-NOTES-V2.0.0-BETA.md)
- [Préparation de la publication open source](docs/PUBLICATION-OPEN-SOURCE-V2.md)
- [Recette technique et publication Electron](docs/ELECTRON-45.2.1-RECETTE-ET-PUBLICATION.md)
- [Documentation et archives de développement](docs/)

---

**Gentil Robot** · [animelocalmanager.com](https://animelocalmanager.com/) · *物語が息づく場所* — Là où les histoires prennent vie.
