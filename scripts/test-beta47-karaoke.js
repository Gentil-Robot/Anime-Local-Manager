'use strict';
const assert=require('node:assert/strict'),song=require('../public/karaoke/song.json'),old=require('./fixtures/karaoke/song.beta46-backup.json'),clock=require('../public/karaoke-clock');
const lines=song.sections.flatMap(section=>section.lines),before=old.sections.flatMap(section=>section.lines);
assert.equal(song.globalOffsetMs,0);assert.equal(lines.length,48);assert.equal(lines.reduce((sum,line)=>sum+line.jaUnits.length,0),270);
for(const [index,line] of lines.entries()){
 for(const key of ['ja','romaji','fr','translations'])assert.deepEqual(line[key],key==='romaji'&&line.id==='R01'?before[index][key].replace('ashita','asu'):before[index][key]);
 for(const [number,unit]of line.jaUnits.entries()){
  const roman=line.romajiUnits[number];assert.equal(roman.start,unit.start);assert.equal(roman.end,unit.end);
  for(const row of [unit,roman]){
   assert(row.progressCurve.length>=2);assert.equal(row.progressCurve[0].time,row.start);assert.equal(row.progressCurve.at(-1).time,row.end);assert.equal(row.progressCurve[0].position,0);assert.equal(row.progressCurve.at(-1).position,1);
   let time=-Infinity,position=0;for(const point of row.progressCurve){assert(point.time>=time&&point.position>=position&&point.position<=1);time=point.time;position=point.position;}
   let previous=0;for(let n=0;n<=200;n++){const progress=clock.unitProgress(row,row.start+(row.end-row.start)*n/200);assert(progress>=previous-.00001&&progress<=1);previous=progress;}
  }
 }
}
console.log('OK karaoke: 48 original lyric lines and translations remain intact; 270 paired words and their acoustic curves advance monotonically');
const hold={start:0,end:4,progressCurve:[{time:0,position:0},{time:1,position:.5},{time:3,position:.5},{time:4,position:1}]};
assert.equal(clock.unitProgress(hold,2),.5);assert.equal(clock.unitProgress(hold,2.8),.5);assert.equal(clock.unitProgress(hold,3.5),.75);
const l18=lines.find(line=>line.id==='L18');assert.equal(clock.unitState(l18.jaUnits,102.1).index,-1);assert.equal(clock.unitState(l18.jaUnits,102.1).pastCount,3);assert.equal(clock.unitState(l18.jaUnits,102.35).index,3);
const l11=lines.find(line=>line.id==='L11');assert.equal(clock.unitState(l11.jaUnits,72.2).index,-1);assert.equal(clock.unitState(l11.jaUnits,72.2).pastCount,3);
console.log('OK karaoke: silence holds colour, actual inter-word pauses have no active word, and the following word starts independently');
for(const time of [60,138,90,224,13.8,102.1,192.5,0,220.9,74.9]){
 const state=clock.state(lines,time);if(state.singing){const fresh=clock.unitState(lines[state.index].jaUnits,time);assert.equal(state.unit.index,fresh.index);assert.equal(state.unit.pastCount,fresh.pastCount);}else assert.equal(state.unit.index,-1);
}
assert.equal(clock.unitProgress({start:1,end:3},2),.5);
console.log('OK karaoke: repeated forward/backward seeks and instrumental gaps are deterministic; old timelines still use their linear fallback');
