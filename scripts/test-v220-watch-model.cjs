'use strict';
const assert=require('node:assert/strict');
const M=require('../public/v220-watch-model');
const now=1763740800000;
const records=[
 {id:1,malId:99,title:'Anime A',status:'Watching',episodesSeen:'2',episodesTotal:'12',poster:'https://s4.anilist.co/file.jpg'},
 {id:2,malId:98,title:'Anime B',status:'Watching',episodesSeen:'0',episodesTotal:'12'},
 {id:3,title:'Anime C',status:'Completed',episodesSeen:'12',episodesTotal:'12'},
 {id:4,malId:96,title:'Anime D',status:'Watching',episodesSeen:'11',episodesTotal:'11'},
 {id:5,malId:95,title:'Anime E',status:'Watching',episodesSeen:'3',episodesTotal:'0'}
];
assert.deepEqual(M.resumeRows(records).map(x=>x.id),[5,1],'No progress? No false resume. Completed? Skip.');
assert.equal(M.resumeRows(records)[0].next,4);
const sec=Math.floor(now/1000);
const airing={items:[
 {animeId:1,episode:3,airingAt:sec-60,source:'AniList'},
 {animeId:1,episode:4,airingAt:sec-30,source:'AniList'},
 {animeId:1,episode:4,airingAt:sec-30,source:'AniList'}, // duplicate from fallback
 {animeId:1,episode:5,airingAt:sec+600,source:'AniList'}, // not yet aired
 {animeId:1,episode:6,airingAt:sec-60,estimated:true}, // uncertain fallback
 {animeId:1,episode:2,airingAt:sec-60}, // already watched
 {animeId:2,episode:1,airingAt:sec-50},
 {animeId:3,episode:13,airingAt:sec-40}, // completed
 {animeId:1,episode:7,airingAt:sec-8*86400}, // too old
 {animeId:4,episode:12,airingAt:sec-20}, // series "Watching" with full progress
]};
const recent=M.newEpisodeRows(records,airing,now);
assert.equal(recent.length,3);
assert.deepEqual(recent.map(x=>x.id),[4,1,2]);
assert.equal(recent.find(x=>x.id===1).count,2);
assert.equal(recent.find(x=>x.id===1).highestEpisode,4);
assert.equal(M.newEpisodeRows(records,{items:airing.items.slice(3,6)},now).length,0);
assert.deepEqual(M.newEpisodeRows(records,{items:[]},now),[]);
assert.deepEqual(M.resumeRows([]),[]);
assert(!('episode' in records[0]),'Selectors must not mutate original anime');
console.log('OK 2.2 watch rails selectors: verified broadcasts, deduplication, expiry, empty status, progress and future safeguards.');
