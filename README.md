# Anime Local Manager

**Votre bibliothèque d'animés, vos saisons et vos souvenirs, au même endroit.**

Anime Local Manager (ALM) est une application **locale, gratuite et open source (MIT)** pour organiser sa collection d'animés sous Windows et Linux. La bibliothèque reste locale par défaut ; la communauté est facultative.

[**Site officiel**](https://animelocalmanager.com/) · [**Téléchargements GitHub**](https://github.com/Gentil-Robot/Anime-Local-Manager/releases) · [**Discord**](https://discord.gg/9KJ8MqhKh7) · [**Notes de la V2.1.0**](docs/RELEASE-NOTES-V2.1.0.md) · [**Historique technique**](docs/)

## V2.1.0 Bêta stable

La V2.1.0 ajoute le **MFA facultatif** par application d'authentification, avec un second appareil de secours, la réauthentification des opérations sensibles et la révocation des sessions. Elle supervise le moteur local et propose un redémarrage contrôlé en cas de panne. La bibliothèque reste utilisable hors connexion.

**Electron 45.3.1**, Node.js **24.22.2** et Chromium **156.0.8078.96** embarqués ; Node.js **24.22.2 LTS** épinglé pour la compilation. La vérification complète comporte **162 suites**, complétées par les essais natifs Electron et la recette de l'installateur Windows en CI.

La V2 représente environ **six mois de travail**, avec de nombreuses bêtas de développement non publiées. La première **V2.0.0 Bêta stable** a été rendue publique le **7 novembre 2026**. Les fichiers et numéros des anciennes bêtas restent dans l'historique technique.

### Télécharger

- [Release V2.1.0](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.1.0) — installateur, rapport Windows et empreinte SHA-256 après réussite de la publication.
- [Toutes les releases](https://github.com/Gentil-Robot/Anime-Local-Manager/releases), dont la [V2.0.0](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.0.0).

L'installateur attendu est `Anime-Local-Manager-2.1.0-Setup-x64.exe`. Ce nom permet aussi à la V2.0.0 de télécharger la mise à jour intégrée. Le canal reste **bêta publique**, avec la release GitHub marquée « pre-release ». Téléchargez depuis la release officielle et comparez l'empreinte dans `SHA256SUMS.txt` ; l'installateur non signé peut provoquer un avertissement Windows SmartScreen.

Consultez les [notes de version 2.1.0](docs/RELEASE-NOTES-V2.1.0.md) et la [revue du code](docs/REVUE-V2.1.0-2026-11-13.md).

## Fonctionnalités

- **Bibliothèque personnelle :** fiches, statuts, épisodes, favoris, notes, filtres, sauvegardes et restauration.
- **Imports et catalogue :** listes BetaSeries (CSV) et XML ; **30 430 fiches** de catalogue embarquées pour un fonctionnement local.
- **Découverte :** recherche, recommandations, nouvelles saisons, classement, calendrier et actualités.
- **Anime DNA et Mes souvenirs :** exploration des profils d'animés, historique personnel et carnet de souvenirs.
- **Dictionnaire :** 162 termes illustrés autour de l'animation japonaise.
- **Communauté facultative :** amis, bibliothèques partagées, animés en commun, recommandations et contrôles d'âge et de confidentialité.
- **Sept langues :** français, anglais, espagnol, allemand, japonais, portugais brésilien et chinois simplifié.

## Windows

**Distribution publique ciblée :** installateur NSIS x64 uniquement. La version portable Windows n'est plus proposée.

Pour compiler les sources sous Windows, installer Node.js `24.22.2` LTS (version épinglée en CI), npm 10+, Git et Git LFS, puis :

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

Les anciennes itérations et les correctifs de développement sont conservés dans le dossier [`docs/`](docs/) à des fins de traçabilité, mais **V2.1.0 Bêta stable** est la version préparée ici. Les noms historiques des scripts de test et des migrations Supabase sont conservés pour garantir leur compatibilité et leur suivi.

- [Notes de version V2.0.0](docs/RELEASE-NOTES-V2.0.0-BETA.md)
- [Préparation de la publication open source](docs/PUBLICATION-OPEN-SOURCE-V2.md)
- [Recette technique Electron actuelle](docs/ELECTRON-45.3.1-RECETTE-2026-11-12.md)
- [Documentation et archives de développement](docs/)

---

**Gentil Robot** · [animelocalmanager.com](https://animelocalmanager.com/) · *物語が息づく場所* — Là où les histoires prennent vie.
