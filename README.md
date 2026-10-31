# Anime Local Manager

**Votre bibliothèque d'animés, vos saisons et vos souvenirs, au même endroit.**

Anime Local Manager (ALM) est une application **locale, gratuite et open source (MIT)** pour organiser sa collection d'animés sous Windows et Linux. La bibliothèque reste locale par défaut ; la communauté est facultative.

[**Site officiel**](https://animelocalmanager.com/) · [**Téléchargements GitHub**](https://github.com/Gentil-Robot/Anime-Local-Manager/releases) · [**Discord**](https://discord.gg/9KJ8MqhKh7) · [**Notes de la V2**](docs/RELEASE-NOTES-V2.0.0-BETA.md)

## V2.0.0 Bêta stable

**État au 31 octobre 2026 : candidate Windows validée, publication publique en préparation.** Cette branche contient les sources de la V2 ; la branche `main` conserve encore la V1, jusqu'à la fusion contrôlée.

- **153/153 suites de tests réussies** sur GitHub Actions pour le commit `6c2c350` (avant mise à jour de ce README).
- Installateur **Windows NSIS x64** compilé ; essais de démarrage et de persistance réussis sur le runner Windows.
- Audit des dépendances de production : **0 alerte** ; **15 alertes modérées** connues dans l'outillage de compilation.
- Electron **45.2.1** ; Node.js **22.23.4** recommandé pour construire le projet.

### Télécharger la V2

**Release officielle prévue : `v2.0.0`, marquée « pre-release » (bêta).**

- [**Lien direct vers Anime Local Manager V2.0.0 Bêta stable**](https://github.com/Gentil-Robot/Anime-Local-Manager/releases/tag/v2.0.0) — **à venir : ce lien ne sera actif qu'après publication de la release.**
- [**Page officielle des releases**](https://github.com/Gentil-Robot/Anime-Local-Manager/releases) — la V1 y reste accessible d'ici là.
- [**Suivi de validation et de publication de la V2**](https://github.com/Gentil-Robot/Anime-Local-Manager/pull/2) — pull request de revue, non encore fusionnée.

Le fichier Windows attendu est `Anime-Local-Manager-2.0.0-Beta-Stable-Setup-x64.exe`. Lorsqu'il sera publié, téléchargez-le **uniquement depuis la release officielle** et comparez son SHA-256 à l'empreinte annoncée sur cette release. **L'installateur n'est pas signé numériquement** : Windows SmartScreen peut afficher un avertissement.

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

### Historique et dossiers techniques

Le projet conserve ses notes de conception et de recette dans `docs/`, notamment :

- [Préparation de la publication open source](docs/PUBLICATION-OPEN-SOURCE-V2.md)
- [Recette Electron 45.2.1](docs/ELECTRON-45.2.1-RECETTE-ET-PUBLICATION.md)
- [Harmonisation des affichages](docs/HARMONISATION-AFFICHAGE-PUBLICATION-V200-2026-10-25.md)
- [Profilage et sécurité Beta82](docs/BETA82-PROFILAGE-SECURITE-2026-10-24.md)
- [Recette historique Beta82](docs/BETA82-RECETTE-PREPUBLICATION.md)
- [Correctifs UX](docs/CORRECTIF-UX-2026-10-24.md)
- [Revue prépublication](docs/RELEASE-CHECKUP-2026-10-25.md)

---

**Gentil Robot** · [animelocalmanager.com](https://animelocalmanager.com/) · *物語が息づく場所* — Là où les histoires prennent vie.
