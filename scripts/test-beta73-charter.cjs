'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite'),T=require('../public/community-charter');
(async()=>{
 for(const language of T.languages){for(const text of Object.values(T.copy[language]))assert(text?.trim());assert(T.fields(language).includes('required'));assert(!T.fields(language).includes(' checked'));}
 for(const input of [{},{charterAccepted:'true',charterVersion:T.version},{charterAccepted:true,charterVersion:'old'}])assert.throws(()=>T.metadata(input),/TERMS_REQUIRED/);
 const db=new PGlite(),legacy='73000000-0000-0000-0000-000000000001',id='73000000-0000-0000-0000-000000000002';
 try{
  await db.exec("create role anon;create role authenticated;create schema auth;create schema alm_private;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');grant usage on schema alm_private to authenticated,anon;");
  await db.query('insert into auth.users(id) values($1)',[legacy]);
  const folder=path.join(__dirname,'../supabase/migrations'),name=fs.readdirSync(folder).find(n=>n.endsWith('_alm_beta73_charter.sql'));await db.exec(fs.readFileSync(path.join(folder,name),'utf8'));
  for(const metadata of [{},{alm_charter_accepted:false,alm_charter_version:T.version},{alm_charter_accepted:'true',alm_charter_version:T.version},{alm_charter_accepted:true,alm_charter_version:'old'}]){
   await assert.rejects(db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id,metadata]),/TERMS_REQUIRED/);assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[id])).rows[0].n,0);
  }
  await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id,T.metadata({charterAccepted:true,charterVersion:T.version})]);
  const receipt=(await db.query('select * from alm_private.account_charter where user_id=$1',[id])).rows[0];assert.equal(receipt.version,T.version);assert(receipt.accepted_at);
  assert.equal((await db.query('select count(*)::int n from alm_private.account_charter where user_id=$1',[legacy])).rows[0].n,0);
  await db.query("update auth.users set raw_user_meta_data='{}' where id=$1",[id]);assert.deepEqual((await db.query('select * from alm_private.account_charter where user_id=$1',[id])).rows[0],receipt);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from alm_private.account_charter'),/permission denied/);await assert.rejects(db.query('insert into alm_private.account_charter(user_id,version) values($1,$2)',[legacy,T.version]),/permission denied/);await db.exec('reset role');}
  await db.query('delete from auth.users where id=$1',[id]);assert.equal((await db.query('select count(*)::int n from alm_private.account_charter')).rows[0].n,0);
  console.log('OK Beta73 charter: seven languages, exact-version explicit acceptance, signup rollback on refusal, immutable private dated receipt, existing accounts preserved and deletion cascade.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
