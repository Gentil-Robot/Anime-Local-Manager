'use strict';
/* Activate public download information only after GitHub publishes the v2.0.0 prerelease. */
const fs = require('node:fs');

function updateSection(path, name, lines) {
  const start = '<!-- ALM-V2:' + name + ':START -->';
  const end = '<!-- ALM-V2:' + name + ':END -->';
  const old = fs.readFileSync(path, 'utf8');
  const a = old.indexOf(start);
  const b = old.indexOf(end);
  if (a === -1 || b <= a || old.indexOf(start, a + start.length) !== -1 || old.indexOf(end, b + end.length) !== -1) {
    throw new Error('Section attendue absente ou dupliquee : ' + path + ' ' + name);
  }
  const content = start + '\n' + lines.join('\n') + '\n' + end;
  const revised = old.slice(0, a) + content + old.slice(b + end.length);
  if (revised !== old) fs.writeFileSync(path, revised, 'utf8');
}

const releases = 'https://github.com/Gentil-Robot/Anime-Local-Manager/releases';
const v2 = releases + '/tag/v2.0.0';
const v1 = releases + '/tag/v1.0';

updateSection('README.md', 'STATUS', [
  '**V2.0.0 Bêta stable est désormais disponible en préversion publique GitHub.** La distribution Windows x64 a été validée ; elle reste une bêta et peut contenir des imperfections.'
]);

updateSection('README.md', 'DOWNLOAD', [
  '**Télécharger :** [**Anime Local Manager V2.0.0 Bêta stable — Windows x64**](' + v2 + ').',
  '',
  'Fichiers disponibles sur la release officielle : installateur `Anime-Local-Manager-2.0.0-Beta-Stable-Setup-x64.exe`, rapport `release-check.json` et empreintes `SHA256SUMS.txt`.',
  '',
  '**Sécurité :** l’installateur n’est pas signé numériquement ; Windows SmartScreen peut afficher un avertissement. Téléchargez uniquement depuis la release GitHub officielle et vérifiez le SHA-256 avant installation.',
  '',
  '**Archives :** [Anime Local Manager V1](' + v1 + ') reste disponible.'
]);

updateSection('CHANGELOG.md', 'CHANGELOG-STATUS', [
  '**Statut :** [Anime Local Manager V2.0.0 Bêta stable est publiée en préversion sur GitHub](' + v2 + ') avec son installateur Windows x64, le rapport de recette et les empreintes SHA-256.',
  'Les [sources V2](https://github.com/Gentil-Robot/Anime-Local-Manager/tree/publication/v2.0.0-beta-stable) restent disponibles séparément ; la branche `main` conserve les sources V1 en attendant la fusion contrôlée.'
]);

console.log('README et CHANGELOG prets pour la release publique v2.0.0.');
