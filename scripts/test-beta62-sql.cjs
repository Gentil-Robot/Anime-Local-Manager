'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
(async()=>{const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{\"alm_charter_accepted\":true,\"alm_charter_version\":\"2026-10-18\"}');create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now(),refreshed_at timestamp,not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 for(const id of [A,B,C]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);}
 const migrations=path.join(__dirname,'../supabase/migrations');for(const name of fs.readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.join(migrations,name),'utf8'));
 const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:id})]);await db.exec('set role authenticated');};
 const profile=name=>({display_name:name,handle:name,visibility:'friends',allow_requests:true,share_library:true,featured:[]});
 for(const [id,name]of [[A,'alice'],[B,'bob'],[C,'charlie']]){await actor(id);await db.query('select public.alm_save_identity($1)',[profile(name)]);}
 await actor(A);const request=(await db.query("select public.alm_request_friend_v2('bob#0001') r")).rows[0].r.id;await actor(B);await db.query("select public.alm_friend_action($1,'accept')",[request]);
 const age=async()=>{await db.exec('reset role');await db.query("update alm_private.actions set created_at=now()-interval '2 minutes' where actor=$1",[A]);await db.query("update public.alm_recommendations set created_at=now()-interval '2 minutes' where sender=$1",[A]);await actor(A);};
 for(let i=0;i<9;i++){await age();assert.equal((await db.query('select public.alm_request_friend_v2($1) r',['missing-'+i])).rows[0].r.code,'PROFILE_UNAVAILABLE');}
 assert.equal((await db.query("select public.alm_request_friend_v2('missing-again') r")).rows[0].r.code,'FRIEND_DAILY_LIMIT');
 await db.exec('reset role');assert.equal((await db.query("select count(*) n from alm_private.actions where actor=$1 and kind='friend'",[A])).rows[0].n,10);await actor(A);
 const safeIds=require('../data/database/community-content-policy.json').allowedIds;
 const recommend=index=>{const id=safeIds[index-1];return db.query('select public.alm_recommend($1,$2,$3) id',[B,{mal_id:id,title:'Anime '+id,secret:'never store this'},'Optional message']);};
 const first=(await recommend(1)).rows[0].id;await assert.rejects(recommend(1),/RECOMMEND_DUPLICATE/);
 await assert.rejects(db.query('select public.alm_recommend($1,$2,$3)',[C,{mal_id:1,title:'Not a friend'},'']),/PROFILE_UNAVAILABLE/);
 await recommend(2);await recommend(3);await assert.rejects(recommend(4),/RATE_LIMIT/);
 for(let id=4;id<=10;id++){await age();await recommend(id);}
 await assert.rejects(recommend(11),/RECOMMEND_DAILY_LIMIT/);
 await actor(B);const received=(await db.query('select * from public.alm_recommendations where id=$1',[first])).rows[0];assert(!received.anime.secret);await db.query('select public.alm_read_recommendation($1)',[first]);
 await actor(A);await assert.rejects(recommend(1),/RECOMMEND_DUPLICATE/);
 await db.exec('reset role');await db.query('delete from public.alm_recommendations where id=$1',[first]);await actor(A);await assert.rejects(recommend(12),/RECOMMEND_DAILY_LIMIT/);
 await db.exec('reset role');await db.query("update alm_private.actions set created_at=now()-interval '25 hours' where actor=$1",[A]);await db.query("update public.alm_recommendations set created_at=now()-interval '25 hours' where sender=$1",[A]);await actor(A);await recommend(12);
 await db.query('select public.alm_publish_profile($1,$2,$3,$4)',[profile('alice'),[{mal_id:80,title:'Original',status:'Completed'}],[],[]]);
 await db.query('select public.alm_save_identity($1)',[{...profile('alice'),visibility:'private'}]);
 assert.equal((await db.query('select public.alm_refresh_shared_profile($1,$2,$3) r',[[{mal_id:99,title:'Do not publish'}],[],[]])).rows[0].r.updated,false);
 assert.equal((await db.query('select visibility from public.alm_profiles where id=$1',[A])).rows[0].visibility,'private');
 assert.deepEqual((await db.query('select mal_id from public.alm_library where owner_id=$1',[A])).rows.map(r=>r.mal_id),[80]);
 await actor(B);assert.equal((await db.query('select * from public.alm_library where owner_id=$1',[A])).rows.length,0);await actor(A);
 await db.query('select public.alm_save_identity($1)',[{...profile('alice'),share_library:false,share_favorites:true}]);
 assert.equal((await db.query('select public.alm_refresh_shared_profile($1,$2,$3) r',[[{mal_id:80,title:'Hidden',status:'Completed',favorite:false},{mal_id:81,title:'Favorite',status:'Completed',favorite:true}],[],[]])).rows[0].r.updated,true);
 assert.equal((await db.query('select share_library from public.alm_profiles where id=$1',[A])).rows[0].share_library,false);
 await actor(B);assert.deepEqual((await db.query('select mal_id from public.alm_library where owner_id=$1',[A])).rows.map(r=>r.mal_id),[81]);
 await db.exec('reset role;set role anon');await assert.rejects(db.query("select public.alm_refresh_shared_profile('[]','[]','[]')"),/permission denied/);
 await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[A]);await actor(A);await assert.rejects(db.query("select public.alm_refresh_shared_profile('[]','[]','[]')"),/SESSION_EXPIRED/);
 console.log('OK Beta62 PostgreSQL: separate rolling quotas, failed searches, burst limits, duplicates, accepted friends, persistent counters, quota expiry, automatic refresh under server permissions, private profiles, section RLS, anonymous denial and revoked sessions.');
 }finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
