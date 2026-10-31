'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const ids=Array.from({length:4},(_,i)=>'82000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
const [A,B,C,D]=ids;
const migration='20261025060253_alm_beta82_delete_confirmation.sql';
(async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{\"alm_charter_accepted\":true,\"alm_charter_version\":\"2026-10-18\"}');create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now(),refreshed_at timestamp,not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;");
  const directory=path.join(__dirname,'../supabase/migrations');
  for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.sql')&&n!==migration).sort())await db.exec(fs.readFileSync(path.join(directory,name),'utf8'));
  const privileges=async()=> (await db.query("select n.nspname,p.proname,p.prosecdef,p.proconfig,p.proacl::text,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') auth_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='alm_private' and p.proname='delete_account' or n.nspname='public' and p.proname='alm_delete_account' order by 1,2")).rows;
  const beforePrivileges=await privileges();
  await db.exec(fs.readFileSync(path.join(directory,migration),'utf8'));
  assert.deepEqual(await privileges(),beforePrivileges,'The fix must preserve the wrapper, definer isolation and grants');
  assert(beforePrivileges.every(p=>p.anon_execute===false&&p.auth_execute===true));
  for(const [index,id] of ids.entries()){
   const email='deletion-fixture-'+index+'@example.invalid';
   await db.query('insert into auth.users(id,email) values($1,$2)',[id,email]);
   await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);
   await db.query('insert into public.alm_profiles(id,handle,display_name) values($1,$2,$2)',[id,'deletion_fixture_'+index]);
   await db.query("insert into public.alm_library(owner_id,mal_id,title,status) values($1,1,'Fixture','Completed')",[id]);
   await db.query('insert into alm_private.newsletter(id,email,unsubscribe_hash) values($1,$2,$3)',[id,email,String(index+1).repeat(64)]);
  }
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[C]);
  await db.query("update auth.sessions set created_at=now()-interval '1 day' where id=$1",[D]);
  const actor=async(id,session=id,role='authenticated')=>{
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:session})]);
   await db.exec('set role '+role);
  };
  const snapshot=async()=>{
   await db.exec('reset role');const state={};
   for(const [table,key] of [['auth.users','id'],['auth.sessions','id'],['public.alm_profiles','id'],['public.alm_library','owner_id,mal_id'],['alm_private.newsletter','id'],['alm_private.account_charter','user_id']])state[table]=(await db.query('select * from '+table+' order by '+key)).rows;
   return state;
  };
  const initial=await snapshot();
  for(const confirmation of [null,'','WRONG','delete',' DELETE ','DELETE\n']){
   await actor(A);await assert.rejects(db.query('select public.alm_delete_account($1)',[confirmation]),/INVALID_INPUT/);
   assert.deepEqual(await snapshot(),initial,'Rejected confirmation must not change either fixture account or related rows');
  }
  await actor(A,null);await assert.rejects(db.query("select public.alm_delete_account('DELETE')"),/SESSION_EXPIRED/);
  await actor(A,B);await assert.rejects(db.query("select public.alm_delete_account('DELETE')"),/SESSION_EXPIRED/);
  await actor(C);await assert.rejects(db.query("select public.alm_delete_account('DELETE')"),/SESSION_EXPIRED/);
  await actor(D);await assert.rejects(db.query("select public.alm_delete_account('DELETE')"),/REAUTH_REQUIRED/);
  await actor(null,null,'anon');await assert.rejects(db.query("select public.alm_delete_account('DELETE')"),/permission denied/);
  assert.deepEqual(await snapshot(),initial,'Invalid or old sessions and anonymous callers must preserve all fixtures');
  await actor(A);await db.query("select public.alm_delete_account('DELETE')");
  const deleted=await snapshot();
  for(const [table,rows] of Object.entries(initial))assert.deepEqual(deleted[table],rows.filter(r=>(r.user_id||r.owner_id||r.id)!==A),'Explicit confirmation removes only the authenticated account and its related rows: '+table);
  await actor(A);await assert.rejects(db.query("select public.alm_delete_account('DELETE')"),/SESSION_EXPIRED/);
  console.log('OK Beta82 deletion confirmation: NULL and invalid confirmations preserve all data; active confirmed recent session and exact DELETE required; anonymous and foreign-session denial; only own account removed; grants and search_path preserved.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
