# Anime Local Manager

**Votre bibliothèque d'animés, vos saisons et vos souvenirs, au même endroit.**

Anime Local Manager (ALM) est une application **locale, gratuite et open source (MIT)** pour organiser sa collection d'animés sous Windows et Linux. La bibliothèque reste locale par défaut ; la communauté est facultative.

[**Site officiel**](https://animelocalmanager.com/) · [**Téléchargements GitHub**](https://github.com/Gentil-Robot/Anime-Local-Manager/releases) · [**Discord**](https://discord.gg/9KJ8MqhKh7) · [**Notes de la V2.1.3**](docs/RELEASE-NOTES-V2.1.3.md) · [**Historique technique**](docs/)

## V2.2.0 VM TEST — développement non publié

Cette branche prépare le Cockpit, l'association locale de fichiers, la progression d'installation et les contrôles de sécurité. **Electron 45.5.0**, Node.js embarqué **24.22.3**, Chromium **156.0.8078.109**. Node.js de construction reste épinglé à 24.22.3 LTS. Les 179 suites et les contrôles natifs séparés doivent réussir avant de distribuer un installateur VM isolé. La recette interactive reste obligatoire. [Recette VM](docs/RECETTE-V220-VM-TEST.md).

## V2.1.3 Bêta stable — version publique de référence

La V2.1.3 prépare la **mise à jour de sécurité du moteur Electron et de Node.js**. Les correctifs d’installation, de relance et de nettoyage des installateurs de la V2.1.2 sont conservés, ainsi que les notifications Stable/Bêta, le MFA facultatif et la supervision du moteur.

**Electron 45.3.3**, Node.js **24.22.3** et Chromium **156.0.8078.100** embarqués ; Node.js **24.22.3 LTS** épinglé pour la compilation. La vérification complète comporte **166 suites**, complétées par les essais natifs Electron et la recette de l'installateur Windows en CI.

La V2 représente environ **six mois de travail**, avec de nombreuses bêtas de développement non publiées. La première **V2.0.0 Bêta stable** a été rendue publique le **7 novembre 2026**. Les fichiers et numéros des anciennes bêtas restent dans l'historique technique.

### Télécharger

- [Release publique V2.1.3](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.1.3) — aucune modification dans cette branche.
- [Release publiée V2.1.2](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.1.2) — historique.
- [Toutes les releases](https://github.com/Gentil-Robot/Anime-Local-Manager/releases), dont la [V2.0.0](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.0.0).

L'installateur attendu est `Anime-Local-Manager-2.1.3-Setup-x64.exe`. Ce nom permet aussi à la V2.0.0 de télécharger la mise à jour intégrée. Le canal reste **bêta publique**, avec la release GitHub marquée « pre-release ». Téléchargez depuis la release officielle et comparez l'empreinte dans `SHA256SUMS.txt` ; l'installateur non signé peut provoquer un avertissement Windows SmartScreen.

Consultez les [notes de version 2.1.3](docs/RELEASE-NOTES-V2.1.3.md) et la [revue de la V2.1.0](docs/REVUE-V2.1.0-2026-11-13.md).

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

Pour compiler les sources sous Windows, installer Node.js `24.22.3` LTS (version épinglée en CI), npm 10+, Git et Git LFS, puis :

```powershell
npm ci
npm run verify
```

Lancer ensuite `Publier Installateur Windows.bat` pour les vérifications et la construction ; `REPRENDRE_BUILD_WINDOWS.bat` permet de reprendre une construction interrompue. Les fichiers de sortie et le rapport `release-check.json` sont produits dans `dist/`. La compilation ne publie pas automatiquement de release GitHub.

## Linux

Les sources fonctionnent aussi sur Linux. Les paquets **AppImage** et **DEB** sont prévus, mais leur publication binaire doit faire l'objet d'une validation distincte de la recette Windows.

Après installation de Node.js 24.22.3 LTS (ou 22.23.5+ dans la branche 22), npm et Git LFS :

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

Les anciennes itérations et les correctifs de développement sont conservés dans le dossier [`docs/`](docs/) à des fins de traçabilité, mais **V2.1.3 Bêta stable** est la version préparée ici. Les noms historiques des scripts de test et des migrations Supabase sont conservés pour garantir leur compatibilité et leur suivi.

- [Notes de version V2.0.0](docs/RELEASE-NOTES-V2.0.0-BETA.md)
- [Préparation de la publication open source](docs/PUBLICATION-OPEN-SOURCE-V2.md)
- [Recette technique Electron actuelle](docs/ELECTRON-45.3.3-RECETTE-2026-11-12.md)
- [Documentation et archives de développement](docs/)

---

**Gentil Robot** · [animelocalmanager.com](https://animelocalmanager.com/) · *物語が息づく場所* — Là où les histoires prennent vie.
