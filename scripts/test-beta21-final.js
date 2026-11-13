#!/usr/bin/env node
"use strict";
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname,'..');
const read = rel => fs.readFileSync(path.join(ROOT,rel),'utf8');
const pkg = JSON.parse(read('package.json'));
const css = read('public/style.css');
// Historical timeline regression. The supplied Beta37 timeline is tested separately.
const song = JSON.parse(read('scripts/fixtures/karaoke/song.beta36-backup.json'));
const lines = song.sections.flatMap(s => s.lines || []);
assert.strictEqual(pkg.version,'2.1.1');
assert(css.includes('grid-template-columns: minmax(320px, 360px) minmax(0, 1fr);'));
assert(css.includes('.csv-results-panel:not(.is-empty)'));
assert(css.includes('min-height: min(74vh, 820px);'));
assert(fs.existsSync(path.join(ROOT,'scripts/fixtures/karaoke/song.beta20-backup.json')));
assert.strictEqual(lines.length,42);
assert(lines.some(l => l.ja === 'ひとつの知らせが' && l.end === 98.55));
assert(!lines.some(l => l.ja === 'ひとつの知らせが　夜を駆ける'));
assert(!lines.some(l => l.ja === 'あの物語'));
for (const ja of ['僕の図書館','[Bokoru ?] とともに','[心の世界に ?]','ひとつとして……','消えないように……']) {
  assert(lines.some(l => l.ja === ja), `missing restored line ${ja}`);
}
assert(!lines.some(l => ['数えきれない物語……','まだ見ぬ世界へ……'].includes(l.ja)));
console.log('OK régressions Beta 21 conservées dans la Beta 23.');
