#!/usr/bin/env node
'use strict';
// Timing/data consistency, not a claim of exact vocal alignment.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),clock=require('../public/karaoke-clock');
const root=path.resolve(__dirname,'..'),read=name=>JSON.parse(fs.readFileSync(path.join(root,name==='song.json'?'public/karaoke':'scripts/fixtures/karaoke',name),'utf8'));
const song=read('song.json'),source=read('song.suno-source.json'),lines=song.sections.flatMap(s=>s.lines),original=source.sections.flatMap(s=>s.lines);
assert.equal(lines.length,48);assert.equal(song.reviewStatus,'audio-recalibrated-word-timing-approximate');assert(song.duration>225&&song.duration<226);
const archived=read('song.beta37-backup.json').sections.flatMap(s=>s.lines);
original.forEach((l,i)=>Object.keys(l).forEach(key=>assert.deepEqual(archived[i][key],l[key])));
assert.deepEqual(song.restoredLines,['R01','R02','R03','R04','R05']);
assert(lines[clock.state(lines,29).index].ja.includes('また明日'));
const plain=x=>x.replace(/[\s\p{P}]/gu,'');let end=0;
for(let i=0;i<lines.length;i++){
 const l=lines[i];const supplied=original.find(x=>x.id===l.id);if(supplied)for(const key of ['ja','romaji','fr','translations'])assert.deepEqual(l[key],supplied[key]);
 assert(l.start>=end&&l.end>l.start&&l.end<=song.duration);end=l.end;
 assert.deepEqual(l.jaUnits,l.words);assert.deepEqual(l.translationUnits,l.localizedWords);
 for(const lang of ['ja','fr','en','es','de','pt-BR','zh-CN']){
  const units=lang==='ja'?l.jaUnits:l.translationUnits[lang],text=lang==='ja'?l.ja:l.translations[lang];assert(units.length&&text);assert.equal(plain(units.map(u=>u.text).join('')),plain(text));
  let stop=l.start;for(const u of units){assert(u.start>=stop-.001&&u.end>u.start&&u.end<=l.end+.001);stop=u.end;}
 }
 assert.equal(l.romajiUnits.length,l.jaUnits.length);assert.equal(l.romajiUnits.map(u=>u.text).join(''),l.romaji);l.romajiUnits.forEach((u,n)=>{assert.equal(u.start,l.jaUnits[n].start);assert.equal(u.end,l.jaUnits[n].end);});
}
for(let n=0;n<=22516;n++){const t=n/100,s=clock.state(lines,t);assert(s.progress>=0&&s.progress<=1);assert(s.unit.progress>=0&&s.unit.progress<=1);if(s.singing)assert(t>=lines[s.index].start&&t<lines[s.index].end);}
console.log('OK: 48 audio-recalibrated lyric lines, five restored phrases, seven languages, 22517 timeline positions and original archived. Intra-line timing remains approximate.');
