'use strict';
// Test-only bootstrap: actual server/SQLite/utility process, captured public
// provider responses. This file is not included in the installed application.
const responses=require('./fixtures/tvmaze-captured-20261009.json').responses;
const realFetch=global.fetch;
global.fetch=async(url,options={})=>{
 const value=String(url);
 if(value.startsWith('http://127.0.0.1:'))return realFetch(url,options);
 if(value.startsWith('https://api.tvmaze.com/')){
  const route=value.replace('https://api.tvmaze.com/','');if(!(route in responses))throw Error('Unprovided TVmaze fixture');
  return new Response(JSON.stringify(responses[route]),{status:200,headers:{'Content-Type':'application/json'}});
 }
 if(value==='https://graphql.anilist.co'){
  const query=JSON.parse(options.body).query,data={};
  for(const match of query.matchAll(/(a\d+):Media\((id|idMal):(\d+)/g)){const id=Number(match[3]);data[match[1]]={id:900000+id,idMal:id};}
  for(const match of query.matchAll(/(a\d+):Page/g))data[match[1]]={airingSchedules:[]};
  if(query.includes('pageInfo'))data.Page={pageInfo:{hasNextPage:false},airingSchedules:[]};
  return new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});
 }
 throw Error('Offline test transport');
};
require('../lib/server-host');
