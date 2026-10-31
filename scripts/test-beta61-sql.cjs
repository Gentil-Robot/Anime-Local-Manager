'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
// Actual PostgreSQL engine in WASM, not a policy string matcher.
const {PGlite}=require(process.env.ALM_PGLITE_MODULE||'@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261013192520_alm_community.sql'),'utf8');
const A='00000000-0000-0000-0000-000000000001',B='00000000-0000-0000-0000-000000000002',C='00000000-0000-0000-0000-000000000003';
(async()=>{const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{\"alm_charter_accepted\":true,\"alm_charter_version\":\"2026-10-18\"}');create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now(),refreshed_at timestamp,not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await db.query('insert into auth.users(id) values($1),($2),($3)',[A,B,C]);await db.exec(sql);await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261013192931_alm_community_hardening.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261014180211_alm_beta60_identity_security.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261014183409_alm_beta60_minimal_payload.sql'),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261016173601_alm_beta61_community_workspace.sql'),'utf8'));await db.query('insert into auth.sessions(id,user_id) values($1,$1),($2,$2),($3,$3)',[A,B,C]);const actor=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:id})]);await db.exec('set role authenticated');};
 const publish=async(handle,sharing=false)=>db.query('select public.alm_publish_profile($1,$2,$3,$4)',[{handle,display_name:handle,visibility:sharing?'friends':'private',share_library:false,share_favorites:sharing,share_dna:false,share_activity:false},[{mal_id:1,title:'Shared favorite',status:'Completed',score:9,favorite:true,genres:['Fantasy']},{mal_id:2,title:'Hidden private',status:'Watching',score:7,genres:['Drama']}],[],[{date:'2026-10-12',episodes:2}]]);
 await actor(A);await publish('alice');await actor(B);await publish('bob',true);await actor(C);await publish('charlie');
 await actor(A);assert.equal((await db.query('select * from public.alm_profiles where id=$1',[B])).rows.length,0);assert.equal((await db.query('select * from public.alm_library where owner_id=$1',[B])).rows.length,0);
 const fid=(await db.query("select public.alm_request_friend_v2('bob#0001') result")).rows[0].result.id;
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
 await actor(B);await publish('bob',true);await db.query('select public.alm_friend_action($1,$2)',[fid,'block']);await actor(A);assert.equal((await db.query('select * from public.alm_profiles where id=$1',[B])).rows.length,0);await assert.rejects(db.query('select public.alm_friend_action($1,$2)',[fid,'remove']),/ACTION_DENIED/);assert.equal((await db.query("select public.alm_request_friend_v2('Bob#0001') result")).rows[0].result.code,'PROFILE_UNAVAILABLE');
 await actor(null);await assert.rejects(db.query('select public.alm_withdraw_profile()'),/SESSION_EXPIRED/);await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from public.alm_profiles'),/permission denied/);await assert.rejects(db.query('select public.alm_withdraw_profile()'),/permission denied/);

 // The same nickname is allowed and the database assigns unique numbers.
 await actor(C);const tag1=(await db.query('select public.alm_save_identity($1) p',[{display_name:'Shared Nick',avatar:'aster',banner:'garden',accent:'violet'}])).rows[0].p;
 await actor(A);const tag2=(await db.query('select public.alm_save_identity($1) p',[{display_name:'shared nick',avatar:'aster',banner:'garden',accent:'violet'}])).rows[0].p;
 assert.equal(tag1.discriminator,1);assert.equal(tag2.discriminator,2);
 const sqlText="A'); DROP TABLE public.alm_profiles; --";
 await db.query('select public.alm_save_identity($1)',[{display_name:sqlText,avatar:'aster',banner:'garden',accent:'violet'}]);
 assert.equal((await db.query('select count(*) n from public.alm_profiles')).rows[0].n,1);
 // Custom raster avatar and immediate revocation of an existing shared snapshot.
 await actor(C);const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
 const profile={display_name:'Shared Nick',avatar:'aster',avatar_image:image,banner:'garden',accent:'violet',visibility:'friends',share_library:true,share_dna:true,share_activity:true};
 await db.query('select public.alm_publish_profile($1,$2,$3,$4)',[profile,[{mal_id:30,title:'Filter fixture',status:'Completed',type:'TV',year:2024,start_date:'2024-01-12',public_score:8.2,rank:40,genres:['Fantasy']}],[],[]]);
 const stored=(await db.query('select * from public.alm_library where owner_id=$1',[C])).rows[0];assert.equal(stored.type,'TV');assert.equal(stored.year,2024);assert.equal(Number(stored.public_score),8.2);
 assert.equal((await db.query('select avatar_image from public.alm_profiles where id=$1',[C])).rows[0].avatar_image,image);
 await assert.rejects(db.query('select public.alm_save_identity($1)',[{...profile,avatar_image:'data:image/svg+xml;base64,PHN2Zz4='}]),/check constraint/);
 await assert.rejects(db.query('select public.alm_save_identity($1)',[{...profile,avatar_image:'data:image/png;base64,'+'A'.repeat(66000)}]),/check constraint/);
 await actor(A);const privacyFriend=(await db.query("select public.alm_request_friend_v2('shared nick#0001') result")).rows[0].result.id;
 await actor(C);await db.query('select public.alm_friend_action($1,$2)',[privacyFriend,'accept']);await actor(A);
 assert.equal((await db.query('select count(*) n from public.alm_library where owner_id=$1',[C])).rows[0].n,1);
 await actor(C);await db.query('select public.alm_save_identity($1)',[{...profile,visibility:'private'}]);
 assert.equal((await db.query('select count(*) n from public.alm_library where owner_id=$1',[C])).rows[0].n,1);
 await actor(A);assert.equal((await db.query('select count(*) n from public.alm_library where owner_id=$1',[C])).rows[0].n,0);
 await db.exec('reset role;set role supabase_auth_admin');
 const overrides=fs.readFileSync(path.join(__dirname,'../data/disposable-email-overrides.txt'),'utf8').trim().split(/\s+/);
 for(const domain of overrides)assert((await db.query('select alm_private.before_user_created($1) r',[{user:{email:'audit@'+domain}}])).rows[0].r.error,domain);
 for(const domain of ['sub.1xp.fr','1XP.FR.','a.b.yopmail.com'])assert((await db.query('select alm_private.before_user_created($1) r',[{user:{email:'audit@'+domain}}])).rows[0].r.error,domain);
 for(const domain of ['gmail.com','outlook.com','proton.me','yopmail.com.example.org'])assert.deepEqual((await db.query('select alm_private.before_user_created($1) r',[{user:{email:'audit@'+domain}}])).rows[0].r,{},domain);
 await db.exec('reset role');
 // Failed searches are committed and throttled, not rolled back with an exception.
 const D='00000000-0000-0000-0000-000000000004';await db.exec('reset role');await db.query('insert into auth.users(id,email) values($1,$2)',[D,'fixture@invalid.test']);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[D]);await actor(D);
 for(let i=0;i<5;i++)assert.equal((await db.query('select public.alm_request_friend_v2($1) r',["missing');drop table t;--"])).rows[0].r.code,'PROFILE_UNAVAILABLE');
 assert.equal((await db.query("select public.alm_request_friend_v2('missing') r")).rows[0].r.code,'RATE_LIMIT');
 await db.exec('reset role');assert.equal((await db.query('select count(*) n from alm_private.actions where actor=$1 and kind=$2',[D,'friend'])).rows[0].n,5);
 // A revoked session cannot read or mutate community data even with an unexpired JWT.
 const other='10000000-0000-0000-0000-000000000001';await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[other,A]);await actor(A);await db.query('select public.alm_revoke_other_sessions()');
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:A,session_id:other})]);assert.equal((await db.query('select * from public.alm_profiles')).rows.length,0);await assert.rejects(db.query("select public.alm_request_friend_v2('bob#0001')"),/SESSION_EXPIRED/);
 await actor(A);await db.exec('reset role');await db.query("update auth.sessions set created_at=now()-interval '1 day' where id=$1",[A]);await actor(A);await assert.rejects(db.query("select public.alm_delete_account('DELETE')"),/REAUTH_REQUIRED/);
 await db.exec('reset role');await db.query('update auth.sessions set created_at=now() where id=$1',[A]);await actor(A);await assert.rejects(db.query("select public.alm_delete_account('WRONG')"),/INVALID_INPUT/);
 await db.query("select public.alm_delete_account('DELETE')");await db.exec('reset role');assert.equal((await db.query('select * from auth.users where id=$1',[A])).rows.length,0);assert.equal((await db.query('select * from public.alm_profiles where id=$1',[A])).rows.length,0);assert.equal((await db.query('select * from auth.sessions where user_id=$1',[A])).rows.length,0);
 // Auth hook works under its own non-superuser role; disposable mail is rejected.
 await db.exec('set role supabase_auth_admin');const rejected=(await db.query('select alm_private.before_user_created($1) r',[{user:{email:'test@yopmail.com'}}])).rows[0].r;assert.equal(rejected.error.message,'ALM_EMAIL_DOMAIN');assert.deepEqual((await db.query('select alm_private.before_user_created($1) r',[{user:{email:'test@example.org'}}])).rows[0].r,{});await db.exec('reset role');
 // Public-form storage has no client access; only the service role can create subscriptions.
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from alm_private.newsletter'),/permission denied/);await assert.rejects(db.query('select public.alm_claim_public_action($1,$2)',['a'.repeat(64),'newsletter']),/permission denied/);await db.exec('reset role;set role service_role');
 const id='20000000-0000-0000-0000-000000000001',hash='a'.repeat(64),unsub='b'.repeat(64);assert.equal((await db.query('select public.alm_newsletter_prepare($1,$2,$3,$4,$5) id',['test@example.org','fr',hash,unsub,id])).rows[0].id,id);assert.equal((await db.query('select public.alm_newsletter_action($1,$2) ok',[hash,'confirm'])).rows[0].ok,true);assert.equal((await db.query('select public.alm_newsletter_action($1,$2) ok',[hash,'confirm'])).rows[0].ok,false);assert.equal((await db.query('select public.alm_newsletter_action($1,$2) ok',[unsub,'unsubscribe'])).rows[0].ok,true);
 for(let i=0;i<3;i++)assert.equal((await db.query('select public.alm_claim_public_action($1,$2) ok',[hash,'contact'])).rows[0].ok,true);assert.equal((await db.query('select public.alm_claim_public_action($1,$2) ok',[hash,'contact'])).rows[0].ok,false);
 console.log('OK Beta61 hardening: SQL payload remains data, failed searches counted, same-name numbering, session revocation, recent-auth deletion, auth hook, private newsletter, one-time confirmation and durable quotas.');
 console.log('OK Beta61 PostgreSQL: private-by-default, no direct writes, accepted friendships, section privacy, recipient-only acceptance, outsider isolation, recommendation whitelisting, withdrawal, blocking and anonymous denial.');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
