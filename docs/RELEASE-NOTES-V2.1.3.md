# Anime Local Manager V2.1.3 — Bêta stable

## Maintenance de sécurité

- Electron est verrouillé à **45.3.3**, avec **Node.js 24.22.3** et **Chromium 156.0.8078.100** embarqués. Cette mise à jour intègre les correctifs de sécurité Node.js publiés le 11 novembre 2026.
- Node.js **24.22.3 LTS** est épinglé pour la construction et la CI. Les scripts de publication refusent les versions antérieures aux correctifs dans les branches LTS prises en charge : 22.23.5 et 24.22.3.
- Le contrôle de publication vérifie les versions réellement relevées dans l'application Windows installée, ainsi que la version de Node.js utilisée pour construire le paquet.
- La version affichée, les diagnostics, les scripts Windows et Linux et le nom de l'installateur indiquent **2.1.3**.

La bibliothèque locale, le format des sauvegardes, l'identifiant d'application et les correctifs d'installation/relance de la V2.1.2 restent compatibles. Le canal demeure « Bêta stable » / prerelease GitHub.

## Vérification et distribution

La publication reste conditionnée aux **166 suites**, aux trois parcours natifs Electron et à la recette Windows NSIS : installation, mise à jour avec confirmation du lanceur, fermeture réelle, redémarrage et conservation de la collection. L'installateur attendu est `Anime-Local-Manager-2.1.3-Setup-x64.exe`, accompagné de `release-check.json` et de `SHA256SUMS.txt`.

Une branche de préparation ou une pull request ne constitue pas une release publiée. Les binaires 2.1.2 déjà distribués conservent leur propre moteur jusqu'à l'installation du nouveau paquet. Les distributions AppImage et DEB nécessitent leur validation distincte.

## Base communautaire

La CVE PostgreSQL **CVE-2026-116304** relève de l'infrastructure Supabase. Cette version de l'application ne met pas à niveau PostgreSQL. La préparation et les contrôles en lecture seule sont décrits dans [la procédure Supabase](SUPABASE-SECURITE-2026-11-16.md).

## Sources officielles

- [Electron 45.3.3](https://releases.electronjs.org/release/v45.3.3)
- [Node.js 24.22.3](https://nodejs.org/en/blog/release/v24.22.3)
- [Node.js 22.23.5](https://nodejs.org/en/blog/release/v22.23.5)
- [CVE PostgreSQL](https://www.postgresql.org/support/security/CVE-2026-116304/)

## English

ALM 2.1.3 pins Electron 45.3.3 with embedded Node.js 24.22.3 and Chromium 156.0.8078.100. CI uses Node.js 24.22.3, and release tooling rejects unpatched versions of the supported Node.js LTS branches. Publication requires all 166 suites, native Electron recipes and a real Windows install/update/restart/persistence test. Upgrading the desktop application does not patch the separate Supabase PostgreSQL server.
