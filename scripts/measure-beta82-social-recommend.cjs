'use strict';
// Reproducible CPU-only microbenchmark. No network, accounts, or user data.
const assert=require('node:assert/strict');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
const M=require('../public/community-model');
const N=5000;
const rows=Array.from({length:N},(_,i)=>({malId:i+1,title:'Synthetic Anime '+(i+1),score:8,genres:['Drama','Action'],status:'Completed',watchEvents:[{date:'2026-10-24',episodes:1}],rating:'PG-13'}));
const favorites=M.favoriteState([]),id=N;
const full=()=>{const r=M.ownItems(rows,favorites);M.summary(rows);M.dna(r);M.activity(rows);rows.filter(a=>!M.item(a));return r.find(x=>x.mal_id===id);};
const lean=()=>M.ownItems(rows,favorites).find(x=>x.mal_id===id);
assert.deepEqual(full(),lean(), 'Optimized owner recommendation must keep the same selected item');
function measure(fn){for(let i=0;i<4;i++)fn();const ns=[];for(let i=0;i<31;i++){const t=performance.now();fn();ns.push(performance.now()-t);}ns.sort((a,b)=>a-b);return {n:ns.length,medianMs:+ns[15].toFixed(3),p95Ms:+ns[29].toFixed(3),minMs:+ns[0].toFixed(3),maxMs:+ns[30].toFixed(3)};}
console.log(JSON.stringify({fixture:`${N} synthetic anime, 1 synthetic watch event and 2 genres per entry`,platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()?.[0]?.model||'unknown',metric:'CPU processing only; excludes Supabase and UI latency',beforeFullOwner:measure(full),afterRecommendationOnly:measure(lean),identicalSelectedItem:true},null,2));
