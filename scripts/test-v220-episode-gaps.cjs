'use strict';
const assert=require('node:assert/strict');
const {find}=require('../public/v220-episode-gaps');
const collection=[
 {malId:10,title:'Series A',status:'Watching',episodesSeen:5,episodesTotal:13},
 {malId:20,title:'Series B',status:'Completed',episodesSeen:12,episodesTotal:12},
 {malId:30,title:'Series C',status:'Watching',episodesSeen:0}
];
const gaps=find(collection,[
 {malId:10,episodes:[5,7,8,10,10]},
 {malId:20,episodes:[1,2,3]},
 {malId:30,episodes:[4]},
 {malId:999,episodes:[2,5]}
]);
assert.equal(gaps.length,1);
assert.deepEqual(gaps[0].missing,[6,9]);
assert.equal(gaps[0].title,'Series A');
assert.deepEqual(find(collection,[{malId:10,episodes:[10]}]),[],'One linked episode cannot prove gaps');
assert.deepEqual(find(collection,[{malId:10,episodes:[1,3,5,7,9,11,13]}],{maxMissing:2})[0].missing,[2,4]);
assert.equal(find(collection,[{malId:10,episodes:[1,3,5,7,9,11,13]}],{maxMissing:2})[0].truncated,true);
assert.deepEqual(find([],[]),[]);
console.log('OK V2.2 episode gap detector: gaps only between linked episodes, bounded and no network dependency.');
