'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const Age=require('../public/community-age'),M=require('../public/community-model'),policy=require('../community/content-policy');
const ids=Array.from({length:9},(_,i)=>'72000000-0000-0000-0000-'+String(i+1).padStart(12,'0')),[A,B,C,D,E,F,G,H,I]=ids;
(async()=>{
 assert.deepEqual(Age.metadata({birthDate:'2000-01-01',ageAttested:true}),{alm_birth_date:'2000-01-01',alm_age_attested:true});
 for(const birthDate of ['', '2025-02-29','2026-02-30','2099-01-01','1899-12-31','<script>'])assert.throws(()=>Age.declaration({birthDate,ageAttested:true}),/AGE_INVALID/);
 for(const ageAttested of [false,'true',1,undefined])assert.throws(()=>Age.declaration({birthDate:'2000-01-01',ageAttested}),/AGE_INVALID/);
 for(const language of Age.languages)for(const text of Object.values(Age.copy[language]))assert(text.trim());
 assert(policy.adult(25));assert(!policy.adult(99999999));
 const mine={profile:M.profile({visibility:'friends',share_library:true,share_dna:true,featured:[1,25]}),items:M.items([{malId:1,title:'Safe',status:'Completed',genres:['Action']},{malId:25,title:'Restricted fixture',status:'Completed',genres:['Ecchi']},{malId:99999999,title:'Unknown'}]),age:{recorded:true,adult:true,excludeAdult:false}};
 assert.deepEqual(M.shared(mine).items.map(i=>i.mal_id),[1,25]);assert.deepEqual(M.shared(mine).profile.featured,[1]);assert(!JSON.stringify(M.shared(mine).dna).includes('Ecchi'));assert(!JSON.stringify(M.shared(mine)).includes('birthDate'));
 for(const age of [{},{recorded:false,adult:true,excludeAdult:false},{recorded:true,adult:false,excludeAdult:false},{recorded:true,adult:true,excludeAdult:true}])assert.deepEqual(M.shared({...mine,age}).items.map(i=>i.mal_id),[1]);
 const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'alm72-age-client-'));let api;
 try{
  let authPayload,published,age={recorded:true,adult:true,excludeAdult:false};const user={id:A,email:'fixture@example.invalid'};
  const client={auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}}),signUp:async input=>{authPayload=input;return {data:{session:null}};},signOut:async()=>({data:{}}),stopAutoRefresh(){}},rpc:async(name,args)=>{
   if(name==='alm_account_age_state')return {data:age};if(name==='alm_set_account_age'){age={...age,excludeAdult:args.p_exclude_adult};return {data:age};}
   if(name==='alm_ensure_identity'||name==='alm_save_identity')return {data:{...args.p_profile,id:A,handle:'age_fixture',discriminator:1}};
   if(name==='alm_register_device')return {data:{}};
   if(name==='alm_publish_profile'){published=args;return {data:null};}throw Error('Unexpected RPC '+name);
  }};
  api=require('../lib/community').createCommunity({directory,config:{url:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_fixture'},clientFactory:()=>client,getAnimes:()=>[{malId:1,title:'Safe',status:'Completed'},{malId:25,title:'Restricted',status:'Completed',genres:['Ecchi']}],encryptionKey:null});
  await assert.rejects(api.auth({mode:'signup',email:user.email,password:'Unique-Fixture-84!'}),/AGE_INVALID/);
  await api.auth({mode:'signup',email:user.email,password:'Unique-Fixture-84!',birthDate:'2000-01-01',ageAttested:true,charterAccepted:true,charterVersion:'2026-10-18'});assert.deepEqual(authPayload.options.data,{alm_birth_date:'2000-01-01',alm_age_attested:true,alm_charter_accepted:true,alm_charter_version:'2026-10-18'});
  await api.saveProfile({display_name:'Fixture',visibility:'friends',share_library:true});await api.publish();assert.deepEqual(published.p_items.map(i=>i.mal_id),[1,25]);assert(!JSON.stringify(published).includes('birthDate'));
  await api.saveAge({excludeAdult:true});await api.publish();assert.deepEqual(published.p_items.map(i=>i.mal_id),[1]);
  assert(!fs.readFileSync(path.join(directory,'community-profile.json'),'utf8').includes('2000-01-01'));await api.logout();assert.equal(api.own().age.recorded,false);
 }finally{await api?.close();fs.rmSync(directory,{recursive:true,force:true});}
 const db=new PGlite();try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{\"alm_charter_accepted\":true,\"alm_charter_version\":\"2026-10-18\"}');create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now(),refreshed_at timestamp,not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
 await require('./sql-mfa-fixture.cjs').install(db);
  const directory=path.join(__dirname,'../supabase/migrations');for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync(path.join(directory,name),'utf8'));
  for(const [i,id]of [A,B,C,D,E,F].entries()){
   await db.query("insert into auth.users(id,raw_user_meta_data) values($1,jsonb_build_object('alm_charter_accepted',true,'alm_charter_version','2026-10-18')||$2::jsonb)",[id,id===D?{}:{alm_birth_date:id===C?'2015-01-01':'2000-01-01',alm_age_attested:true}]);
   await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);await db.query("insert into public.alm_profiles(id,handle,display_name,visibility,share_library,share_dna) values($1,$2,$2,'friends',true,true)",[id,'age_fixture_'+i]);
  }
  for(const id of [B,C,D,E,F])await db.query('insert into public.alm_friendships(requester,recipient,status,blocked_by) values($1,$2,$3,$4)',[A,id,id===F?'blocked':'accepted',id===F?F:null]);
  const actor=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:id})]);await db.exec('set role '+role);};
  const state=async()=> (await db.query('select public.alm_account_age_state() as value')).rows[0].value;
  const set=async(birth=null,attested=false,exclude=true)=>(await db.query('select public.alm_set_account_age($1,$2,$3) as value',[birth,attested,exclude])).rows[0].value;
  await actor(A);assert.deepEqual(await state(),{recorded:true,adult:true,excludeAdult:true});assert.deepEqual(await set(null,false,false),{recorded:true,adult:true,excludeAdult:false});assert(!JSON.stringify(await state()).includes('2000'));
  await assert.rejects(db.query('select * from alm_private.account_age'),/permission denied/);await assert.rejects(db.query('select alm_private.adult_sharing($1)',[B]),/permission denied/);
  await actor(B);await set(null,false,false);
  await actor(C);assert.deepEqual(await set(null,false,false),{recorded:true,adult:false,excludeAdult:true});await assert.rejects(set('2000-01-01',true,false),/AGE_LOCKED/);
  await db.exec('reset role');await db.query('update auth.users set raw_user_meta_data=$1 where id=$2',[{alm_birth_date:'2000-01-01',alm_age_attested:true},C]);await actor(C);assert.equal((await state()).adult,false,'User-editable Auth metadata cannot change the private age record');
  await actor(D);assert.deepEqual(await state(),{recorded:false,adult:false,excludeAdult:true});await assert.rejects(set('2000-01-01',false,false),/AGE_INVALID/);await assert.rejects(set('2026-02-30',true,false),/AGE_INVALID/);
  const profile={display_name:'Age publisher',visibility:'friends',share_library:true,share_dna:true,featured:[1,25]},items=[{mal_id:1,title:'Safe fixture',status:'Completed',genres:['Action']},{mal_id:25,title:'Restricted fixture',status:'Completed',genres:['Ecchi']},{mal_id:99999999,title:'Unknown fixture',status:'Completed'}];
  await actor(A);await db.query('select public.alm_publish_profile($1,$2,$3,$4)',[profile,items,[],[]]);
  const visible=async()=> (await db.query('select mal_id from public.alm_library where owner_id=$1 order by mal_id',[A])).rows.map(r=>r.mal_id);
  assert(JSON.stringify((await db.query('explain (format json) select mal_id from public.alm_library where owner_id=$1',[A])).rows).includes('InitPlan'));
  assert.deepEqual(await visible(),[1,25]);assert.deepEqual((await db.query('select featured from public.alm_profiles where id=$1',[A])).rows[0].featured,[1]);
  assert(!JSON.stringify((await db.query('select data from public.alm_dna where owner_id=$1',[A])).rows).includes('Ecchi'));
  for(const id of [B,C,D,E,F]){await actor(id);assert.deepEqual(await visible(),id===B?[1,25]:id===F?[]:[1]);}
  await actor(A);await db.query('select public.alm_recommend($1,$2,$3)',[B,{mal_id:25,title:'Restricted recommendation'},'']);
  for(const id of [C,D,E])await assert.rejects(db.query('select public.alm_recommend($1,$2,$3)',[id,{mal_id:25,title:'Restricted recommendation'},'']),/CONTENT_NOT_SHARED/);
  await assert.rejects(db.query('select public.alm_recommend($1,$2,$3)',[B,{mal_id:99999999,title:'Unknown'},'']),/CONTENT_NOT_SHARED/);
  await actor(B);assert.equal((await db.query('select count(*)::integer n from public.alm_recommendations')).rows[0].n,1);await set(null,false,true);assert.deepEqual(await visible(),[1]);assert.equal((await db.query('select count(*)::integer n from public.alm_recommendations')).rows[0].n,0,'Recipient opt-out immediately hides historical adult recommendations');
  await actor(A);assert.equal((await db.query('select count(*)::integer n from public.alm_recommendations')).rows[0].n,0);await set(null,false,true);await actor(B);await set(null,false,false);assert.deepEqual(await visible(),[1],'Publisher opt-out immediately hides old shared adult rows');
  await actor(D);await set('2000-01-01',true,false);assert.equal((await state()).adult,true,'Existing accounts can declare once without recreating the account');
  await actor('', 'anon');await assert.rejects(db.query('select public.alm_account_age_state()'),/permission denied/);
  await db.exec('reset role');
  for(const metadata of [{alm_birth_date:'2000-01-01',alm_age_attested:false},{alm_birth_date:'2026-02-30',alm_age_attested:true}])await assert.rejects(db.query("insert into auth.users(id,raw_user_meta_data) values($1,jsonb_build_object('alm_charter_accepted',true,'alm_charter_version','2026-10-18')||$2::jsonb)",[G,metadata]),/AGE_INVALID/);
  const date=(await db.query("select to_char(current_date-interval '18 years','YYYY-MM-DD') as birthday")).rows[0].birthday;
  await db.query("insert into auth.users(id,raw_user_meta_data) values($1,jsonb_build_object('alm_charter_accepted',true,'alm_charter_version','2026-10-18')||$2::jsonb)",[H,{alm_birth_date:date,alm_age_attested:true}]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[H]);await actor(H);assert.equal((await state()).adult,true);
  await db.exec('reset role');await db.query("insert into auth.users(id,raw_user_meta_data) values($1,jsonb_build_object('alm_charter_accepted',true,'alm_charter_version','2026-10-18','alm_birth_date',to_char(current_date-interval '18 years'+interval '1 day','YYYY-MM-DD'),'alm_age_attested',true))",[I]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[I]);await actor(I);assert.equal((await state()).adult,false);
  await db.exec('reset role');await db.query('delete from auth.users where id=$1',[H]);assert.equal((await db.query('select count(*)::integer n from alm_private.account_age where user_id=$1',[H])).rows[0].n,0);
  console.log('OK Beta72 age: private signup declaration, legacy-account completion, birthday boundary, immutable declaration, metadata spoof resistance, safe defaults, mutual adult opt-in, actual library/recommendation RLS, immediate opt-out, unknown-content exclusion, private aggregates, anonymous denial and account-deletion cascade.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
