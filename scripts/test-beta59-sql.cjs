'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
// Actual PostgreSQL engine in WASM, not a policy string matcher.
const {PGlite}=require(process.env.ALM_PGLITE_MODULE||'@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261013192520_alm_community.sql'),'utf8');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
(async()=>{const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{\"alm_charter_accepted\":true,\"alm_charter_version\":\"2026-10-18\"}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await db.query('insert into auth.users values($1),($2),($3)',[A,B,C]);await db.exec(sql);await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261013192931_alm_community_hardening.sql'),'utf8'));
 const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated');};
 const publish=async(handle,sharing=false)=>db.query('select public.alm_publish_profile($1,$2,$3,$4)',[{handle,display_name:handle,visibility:sharing?'friends':'private',share_library:false,share_favorites:sharing,share_dna:false,share_activity:false},[{mal_id:1,title:'Shared favorite',status:'Completed',score:9,favorite:true,genres:['Fantasy']},{mal_id:2,title:'Hidden private',status:'Watching',score:7,genres:['Drama']}],[],[{date:'2026-10-12',episodes:2}]]);
 await actor(A);await publish('alice');await actor(B);await publish('bob',true);await actor(C);await publish('charlie');
 await actor(A);assert.equal((await db.query('select * from public.alm_profiles where id=$1',[B])).rows.length,0);assert.equal((await db.query('select * from public.alm_library where owner_id=$1',[B])).rows.length,0);
 const fid=(await db.query("select public.alm_request_friend('bob') id")).rows[0].id;
 await assert.rejects(db.query('select public.alm_friend_action($1,$2)',[fid,'accept']),/ACTION_DENIED/);
 await actor(C);await assert.rejects(db.query('select public.alm_friend_action($1,$2)',[fid,'accept']),/NOT_FOUND/);
 await actor(B);await db.query('select public.alm_friend_action($1,$2)',[fid,'accept']);await actor(A);
 assert.equal((await db.query('select * from public.alm_profiles where id=$1',[B])).rows.length,1);
 assert.deepEqual((await db.query('select mal_id from public.alm_library where owner_id=$1',[B])).rows.map(r=>r.mal_id),[1]);
 assert.equal((await db.query('select * from public.alm_dna where owner_id=$1',[B])).rows.length,0);assert.equal((await db.query('select * from public.alm_activity where owner_id=$1',[B])).rows.length,0);
 await assert.rejects(db.query('update public.alm_profiles set visibility=$1 where id=$2',['friends',B]),/permission denied/);
 const rec=(await db.query('select public.alm_recommend($1,$2,$3) id',[B,{mal_id:1,title:'Great show',secret:'remove me'},'A recommendation'])).rows[0].id;
 await actor(B);const received=(await db.query('select * from public.alm_recommendations where id=$1',[rec])).rows[0];assert(!received.anime.secret);await db.query('select public.alm_read_recommendation($1)',[rec]);
 await actor(C);assert.equal((await db.query('select * from public.alm_recommendations')).rows.length,0);
 await actor(B);await db.query('select public.alm_publish_profile($1,$2,$3,$4)',[{handle:'bob',display_name:'Bob',visibility:'friends',featured:[2]},[{mal_id:1,title:'Private',status:'Completed',genres:[]},{mal_id:2,title:'Showcase',status:'Watching',genres:[]}],[],[]]);await actor(A);assert.deepEqual((await db.query('select mal_id from public.alm_library where owner_id=$1',[B])).rows.map(r=>r.mal_id),[2]);await actor(B);await db.query('select public.alm_withdraw_profile()');await actor(A);assert.equal((await db.query('select * from public.alm_library where owner_id=$1',[B])).rows.length,0);
 await actor(B);await publish('bob',true);await db.query('select public.alm_friend_action($1,$2)',[fid,'block']);await actor(A);assert.equal((await db.query('select * from public.alm_profiles where id=$1',[B])).rows.length,0);await assert.rejects(db.query('select public.alm_friend_action($1,$2)',[fid,'remove']),/ACTION_DENIED/);await assert.rejects(db.query("select public.alm_request_friend('bob')"),/PROFILE_UNAVAILABLE/);
 await actor(null);await assert.rejects(db.query('select public.alm_withdraw_profile()'),/AUTH_REQUIRED/);await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.alm_profiles'),/permission denied/);await assert.rejects(db.query('select public.alm_withdraw_profile()'),/permission denied/);
 console.log('OK Beta59 PostgreSQL: private-by-default, no direct writes, accepted friendships, section privacy, recipient-only acceptance, outsider isolation, recommendation whitelisting, withdrawal, blocking and anonymous denial.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
