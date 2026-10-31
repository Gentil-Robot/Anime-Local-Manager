'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const server = read('server.js');
const client = read('public/alm-v2.js');
const css = read('public/style.css');
const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
const source = server.slice(server.indexOf('let ownedCoverIndex=new Map()'), server.indexOf('app.post(\'/api/cover-cache/reconnect\''));
assert(source.includes('function ownedCoverSource(id)'), 'Owned cache source is present');
const canonical = 'https://cdn.myanimelist.net/images/anime/12/345.jpg';
const metadata = 'https://cdn.myanimelist.net/images/anime/99/123.jpg';
const rows = [{ malId: 1001, poster: '', imageUrl: '' }, {malId: 1002, poster: canonical}, {malId: 1003, poster:'https://evil.example/image.jpg'}];
const queries = [];
const allowed = raw => /^https:\/\/cdn\.myanimelist\.net\/images\//.test(String(raw || '')) ? String(raw) : '';
const context = { Map, Number, Date, readAnimes: () => rows, albumCovers: {safeSource: allowed}, db: {getMetadataByMalId: id => {queries.push(id); return id === 1001 ? {imageUrl: metadata} : {imageUrl: 'https://evil.example/hello.jpg'};}} };
vm.createContext(context);
vm.runInContext(source, context);
assert.equal(vm.runInContext('ownedCoverSource(1001)', context), metadata, 'Missing library poster should use trusted embedded metadata');
assert.equal(vm.runInContext('ownedCoverSource(1001)', context), metadata, 'Metadata result should be memoized');
assert.equal(queries.filter(id=>id===1001).length, 1, 'Metadata should only be read once per cache interval');
assert.equal(vm.runInContext('ownedCoverSource(1002)', context), canonical, 'Existing library poster takes priority');
assert.equal(vm.runInContext('ownedCoverSource(1003)', context), '', 'Unsafe metadata and original sources are rejected');
assert.equal(vm.runInContext('ownedCoverSource(9999)', context), '', 'Non-library IDs are never eligible for metadata fallback');
assert(!queries.includes(9999), 'Non-library IDs should not query metadata');
const begin = client.indexOf('function dnaProgressThumbV2(anime, kind)');
const end = client.indexOf('function renderDnaExtras(animes)', begin);
assert(begin>=0&&end>begin, 'DNA cover helper present');
const renderBegin = end;
const renderEnd = client.indexOf('let _auditCache', renderBegin);
assert(renderEnd>renderBegin, 'DNA panel renderer present');
const blocks = {};
for (const id of ['dnaAlmostDone','dnaWatchingList']) blocks[id] = {innerHTML:''};
const browser = {Number, escapeHtmlV2: htmlEscape, safeUrlV2: raw => /^(https?:\/\/|\/)/.test(String(raw||'')) ? String(raw) : '#', document: {getElementById:id=>blocks[id]||null}};
vm.createContext(browser);
vm.runInContext(client.slice(begin,renderEnd), browser);
const mk = (obj) => Object.assign({status:'Watching', episodesSeen:10, episodesTotal:12, score:0},obj);
const animes = [
 mk({malId:1001,title:'Titre très long de démonstration qui doit être visible en entier quand il y a de la place',poster:''}),
 mk({malId:1002,title:'Autre anime',poster:canonical,episodesSeen:11}),
 mk({title:'Anime non identifié',poster:'',episodesSeen:1}),
 mk({malId:1003,title:'Poster manuel local',poster:'/images/manual-photo.png',episodesSeen:8})
];
vm.runInContext('renderDnaExtras', browser)(animes);
assert(blocks.dnaAlmostDone.innerHTML.includes('Titre très long de démonstration qui doit être visible en entier quand il y a de la place'), 'No arbitrary truncation in almost finished section');
assert(blocks.dnaWatchingList.innerHTML.includes('Titre très long de démonstration qui doit être visible en entier quand il y a de la place'), 'No arbitrary truncation in watching section');
for(const id of ['dnaAlmostDone','dnaWatchingList']){
 const markup = blocks[id].innerHTML;
 assert(markup.includes('/api/cover-cache/1001'), 'Missing identified poster should use the managed cache: '+id);
 assert(markup.includes('/api/cover-cache/1002'), 'Known CDN poster should use the managed cache: '+id);
 assert(markup.includes('/images/manual-photo.png'), 'User supplied local poster should remain unchanged: '+id);
 assert(markup.includes('data-alm-managed-cover="1"'), 'Cached posters get the retry marker: '+id);
 assert(!markup.includes('src="#"'), 'Invalid URLs should never be rendered: '+id);
 assert(markup.includes('🎌'), 'Fallback remains available: '+id);
}
assert(!blocks.dnaWatchingList.innerHTML.includes('/api/cover-cache/undefined'), 'Anime without MAL ID is not fetched');
assert(css.includes('#dnaPage .dna-almost-thumb img[hidden]') && css.includes('#dnaPage .dna-watch-thumb img[hidden]'), 'Image error placeholder remains visible');
assert(!/\.slice\(0,\s*(24|30)\)/.test(client.slice(renderBegin, renderEnd)), 'DNA titles should not be hard-truncated');
console.log('OK Anime DNA: local cached artwork, safe metadata fallback, library-only scope, custom covers, full titles and stable placeholders.');
