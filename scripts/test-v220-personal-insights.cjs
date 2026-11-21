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
assert.equal(M.dateISO('2026-02-30'),'');
assert.equal(M.dateISO('2024-02-29'),'2024-02-29');
assert.equal(M.dateISO('2026-02-29'),'');
assert.equal(M.dateISO('2026-12'),'');
assert.equal(M.score(''),null);assert.equal(M.score(0),null);assert.equal(M.score(10),10);assert.equal(M.score(8.5),null);
const board=M.scoreLanes(library);
assert.equal(board.total,5);assert.equal(board.rated,3);assert.equal(board.unrated,2);
assert.equal(board.lanes.find(row=>row.score===9).items[0].anime,library[0]);
assert.deepEqual(M.years(library),[2026,2025]);
const timeline=M.timeline(library,2026);
assert.equal(timeline.events.length,3,'Watch and completion dates are explicit');
assert.equal(timeline.completed,1);
assert.equal(timeline.episodes,3);
assert.equal(timeline.daysCount,3);
assert.equal(timeline.month[3].events,3);
assert.equal(timeline.month[0].events,0,'Release dates must not become watch dates');
assert.equal(M.timeline(library,2025).episodes,4);
assert.equal(M.timeline(library,2024).eventCount,0,'Never infer historical views from airing dates');
assert.equal(library[0].watchEvents.length,2,'Analysis must never change original personal data');
console.log('OK V2.2 personal insights: 1–10 scores, unrated separation, real dated viewing, no inferred history, offline selectors.');
