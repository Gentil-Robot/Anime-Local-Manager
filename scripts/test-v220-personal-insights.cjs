'use strict';
const assert=require('node:assert/strict');
const M=require('../public/v220-personal-insights-model');
const library=[
 {id:1,title:'Frieren',score:9,status:'Completed',startDate:'2024-01-05',completedOn:'2026-04-10',watchEvents:[{id:'a',date:'2026-04-04',episodes:2},{id:'b',date:'2026-04-06',episodes:1}]},
 {id:2,title:'Vinland',score:10,status:'Watching',startDate:'2023-01-01',watchEvents:[{id:'c',date:'2025-03-15',episodes:4}]},
 {id:3,title:'Unrated',score:'',status:'Plan to Watch',startDate:'2022-07-10'},
 {id:4,title:'Another',score:0,status:'Completed',completedOn:'2026-02-31'},
 {id:5,title:'Finished',score:'8',status:'Completed',completedOn:'2025-01-01',watchEvents:[{id:'bad',date:'2026-02-30',episodes:5}]}
];
assert.equal(M.score(''),null);assert.equal(M.score(0),null);assert.equal(M.score(10),10);assert.equal(M.score(8.5),null);
const board=M.scoreLanes(library);
assert.equal(board.total,5);assert.equal(board.rated,3);assert.equal(board.unrated,2);
assert.equal(board.lanes.find(row=>row.score===9).items[0].anime,library[0]);
assert.deepEqual(M.scoreGallery(library).map(a=>a.id),[2,1,5]);
assert.deepEqual(M.scoreGallery(library,'9').map(a=>a.id),[1]);
assert.deepEqual(M.scoreGallery(library,'unrated').map(a=>a.id),[4,3]);
assert.equal(M.scoreGallery(Array.from({length:150},(_,i)=>({id:i+1,title:'Anime '+i,score:10})), '10').length,150,'No hidden poster cap');
assert.equal(library[0].watchEvents.length,2,'Analysis must never change original personal data');
console.log('OK V2.2 personal insights: 1–10 scores, unrated separation, read-only local score selectors.');
