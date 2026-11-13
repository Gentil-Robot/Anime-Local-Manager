'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {PGlite} = require('@electric-sql/pglite');
const {install} = require('./sql-mfa-fixture.cjs');

async function main() {
 const db = new PGlite();
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
   create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),
    raw_user_meta_data jsonb default '{"alm_charter_accepted":true,"alm_charter_version":"2026-10-18"}');
   create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,
    created_at timestamptz default clock_timestamp(),refreshed_at timestamp,not_after timestamptz);
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;
   grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
  await install(db);
  const directory = path.join(__dirname, '../supabase/migrations');
  for (const file of fs.readdirSync(directory).filter(n=>n.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(directory,file),'utf8'));
  const A=randomUUID(),B=randomUUID(),C=randomUUID();
  for (const id of [A,B,C]) await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@example.invalid']);
  async function session(user,{factor=null,level='aal1',method='password'}={}) {
   const id=randomUUID();await db.exec('reset role');
   await db.query('insert into auth.sessions(id,user_id,factor_id,aal) values($1,$2,$3,$4)',[id,user,factor,level]);
   await db.query('insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,$2)',[id,method]);return id;
  }
  async function actor(user,id,aal='aal1',role='authenticated') {
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
   await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:id,aal})]);
   await db.exec('set role '+role);
  }
  const rpc=async(name,args=[])=> (await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') r',args)).rows[0].r;
  const factor=async(user,name)=>{const id=randomUUID();await db.exec('reset role');await db.query("insert into auth.mfa_factors(id,user_id,friendly_name,status) values($1,$2,$3,'verified')",[id,user,name]);return id;};
  const setFactor=async(id,f)=>{await db.exec('reset role');await db.query("update auth.sessions set factor_id=$2,aal='aal2' where id=$1",[id,f]);};
  async function freshProof(user,origin,action,{target=null,mfa=null}={}) {
   await actor(user,origin,mfa?'aal2':'aal1');const challenge=await rpc('alm_begin_sensitive',[action,target]);
   const next=await session(user,{factor:mfa,level:mfa?'aal2':'aal1'});
   await actor(user,next,mfa?'aal2':'aal1');await rpc('alm_approve_sensitive',[challenge.id]);return next;
  }
  let sA=await session(A),sB=await session(B);
  await actor(A,sA);await rpc('alm_save_identity',[{display_name:'Fictional Alice',handle:'fictional_alice'}]);
  await actor(B,sB);await rpc('alm_save_identity',[{display_name:'Fictional Bob',handle:'fictional_bob'}]);
  assert.equal((await rpc('alm_security_state')).enabled,false,'MFA is optional');
  await actor(A,sA);assert.equal((await db.query('select * from public.alm_profiles')).rows.length,1,'Owner isolation remains');
  await assert.rejects(db.query('select * from alm_private.account_security'),/permission denied/);
  await assert.rejects(db.query("select alm_private.consume_sensitive('delete',null,true)"),/permission denied/);

  const oldOther=await session(A);await actor(A,sA);
  const challenge=await rpc('alm_begin_sensitive',['mfa-enroll',null]);
  await assert.rejects(rpc('alm_approve_sensitive',[challenge.id]),/REAUTH_REQUIRED/);
  await actor(A,oldOther,'aal2');await assert.rejects(rpc('alm_approve_sensitive',[challenge.id]),/REAUTH_REQUIRED/);
  await actor(B,sB);await assert.rejects(rpc('alm_approve_sensitive',[challenge.id]),/REAUTH_REQUIRED/);
  const oauth=await session(A,{method:'oauth'});await actor(A,oauth);await assert.rejects(rpc('alm_approve_sensitive',[challenge.id]),/REAUTH_REQUIRED/);
  sA=await session(A);await actor(A,sA);await rpc('alm_approve_sensitive',[challenge.id]);
  const primary=await factor(A,'Primary');await setFactor(sA,primary);
  await actor(A,sA);await assert.rejects(rpc('alm_confirm_mfa_enrollment',[primary]),/MFA_REQUIRED/);
  await actor(A,sA,'aal2');let state=await rpc('alm_confirm_mfa_enrollment',[primary]);
  assert.equal(state.enabled,true);assert.equal(state.required,false);assert.equal(state.factors.length,1);
  await assert.rejects(rpc('alm_confirm_mfa_enrollment',[primary]),/REAUTH_REQUIRED/);
  await actor(A,oldOther);await assert.rejects(rpc('alm_ensure_identity',[{}]),/SESSION_EXPIRED/);
  assert.equal((await db.query('select * from public.alm_profiles')).rows.length,0,'Revoked JWT cannot even read its own profile');

  const pending=await session(A);await actor(A,pending);state=await rpc('alm_security_state');
  assert.equal(state.required,true);
  await assert.rejects(rpc('alm_ensure_identity',[{}]),/MFA_REQUIRED/);
  for (const table of ['alm_profiles','alm_library','alm_dna','alm_activity','alm_friendships','alm_recommendations']) {
   assert.equal((await db.query('select * from public.'+table)).rows.length,0,'AAL1 is denied: '+table);
  }
  const untrusted=await factor(A,'Unapproved factor');await setFactor(pending,untrusted);await actor(A,pending,'aal2');
  await assert.rejects(rpc('alm_confirm_mfa_enrollment',[untrusted]),/REAUTH_REQUIRED/);
  await assert.rejects(rpc('alm_ensure_identity',[{}]),/MFA_REQUIRED/,'Native AAL2 from an unapproved factor is insufficient');
  await db.exec('reset role');await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data||'{\"mfa_required\":false,\"aal\":\"aal2\"}'::jsonb where id=$1",[A]);
  await actor(A,pending,'aal2');assert.equal((await rpc('alm_security_state')).required,true,'Editable user metadata is not authorization');

  sA=await freshProof(A,sA,'mfa-enroll',{mfa:primary});
  const backup=await factor(A,'Backup');await setFactor(sA,backup);await actor(A,sA,'aal2');
  state=await rpc('alm_confirm_mfa_enrollment',[backup]);assert.equal(state.factors.length,2);
  const target=await session(A);sA=await freshProof(A,sA,'revoke-session',{target,mfa:backup});
  await assert.rejects(rpc('alm_revoke_session',[sB]),/SESSION_UNAVAILABLE/);
  await rpc('alm_revoke_session',[target]);
  await actor(A,target);await assert.rejects(rpc('alm_sessions'),/SESSION_EXPIRED/);
  await actor(A,sA,'aal2');
  const another=await session(A);sA=await freshProof(A,sA,'revoke',{mfa:backup});
  await rpc('alm_revoke_other_sessions');await assert.rejects(rpc('alm_revoke_other_sessions'),/REAUTH_REQUIRED/,'Proof is one-use');
  await actor(A,another);await assert.rejects(rpc('alm_sessions'),/SESSION_EXPIRED/);

  sA=await freshProof(A,sA,'mfa-remove',{target:primary,mfa:backup});
  await rpc('alm_authorize_factor_change',['mfa-remove',primary]);
  await assert.rejects(rpc('alm_finish_factor_change',['mfa-remove',primary]),/MFA_CHANGE_INCOMPLETE/);
  await db.exec('reset role');await db.query('delete from auth.mfa_factors where id=$1',[primary]);
  await actor(A,sA,'aal2');await rpc('alm_finish_factor_change',['mfa-remove',primary]);
  assert.equal((await rpc('alm_security_state')).factors.length,1);
  await assert.rejects(rpc('alm_authorize_factor_change',['mfa-remove',backup]),/MFA_LAST_FACTOR/);

  // Out-of-band factor removal cannot silently turn off ALM's server policy.
  await db.exec('reset role');await db.query('delete from auth.mfa_factors where id=$1',[backup]);
  await actor(A,sA,'aal2');state=await rpc('alm_security_state');assert.equal(state.locked,true);
  await assert.rejects(rpc('alm_ensure_identity',[{}]),/MFA_REQUIRED/);
  assert.equal((await db.query('select * from public.alm_profiles')).rows.length,0);
  // Restore the fictional backup as fixture owner to exercise explicit disable.
  await db.exec('reset role');await db.query("insert into auth.mfa_factors(id,user_id,friendly_name,status) values($1,$2,'Backup','verified')",[backup,A]);
  sA=await freshProof(A,sA,'mfa-disable',{mfa:backup});
  await rpc('alm_authorize_factor_change',['mfa-disable',null]);
  await assert.rejects(rpc('alm_finish_factor_change',['mfa-disable',null]),/MFA_CHANGE_INCOMPLETE/);
  assert.equal((await rpc('alm_security_state')).enabled,true,'Failed provider removal keeps MFA required');
  await db.exec('reset role');await db.query('delete from auth.mfa_factors where user_id=$1',[A]);
  await db.query("update auth.sessions set factor_id=null,aal='aal1' where id=$1",[sA]);
  await actor(A,sA);await rpc('alm_finish_factor_change',['mfa-disable',null]);
  state=await rpc('alm_security_state');assert.equal(state.enabled,false);assert.equal(state.required,false);
  assert.equal((await db.query('select * from public.alm_profiles')).rows.length,1);
  await assert.rejects(rpc('alm_finish_factor_change',['mfa-disable',null]),/REAUTH_REQUIRED/);

  const logout=await session(A);await actor(A,logout);await rpc('alm_logout_session');
  await assert.rejects(rpc('alm_security_state'),/SESSION_EXPIRED/);
  sA=await freshProof(A,sA,'delete');
  await assert.rejects(rpc('alm_delete_account',[null]),/INVALID_INPUT/);
  await rpc('alm_delete_account',['DELETE']);
  await assert.rejects(rpc('alm_ensure_identity',[{}]),/SESSION_EXPIRED/);
  await actor(B,sB);assert.equal((await db.query('select * from public.alm_profiles')).rows.length,1,'Another account is preserved');
  await actor(null,null,'aal1','anon');
  for (const name of ['alm_security_state','alm_logout_session']) await assert.rejects(rpc(name),/permission denied/);
  const sC=await session(C);await actor(C,sC);
  for(let n=0;n<12;n++) await rpc('alm_begin_sensitive',['revoke',null]);
  await assert.rejects(rpc('alm_begin_sensitive',['revoke',null]),/RATE_LIMIT/);
  console.log('OK V2 Auth SQL: optional MFA, trusted primary/backup, stolen AAL1/AAL2 rejection, fresh password session proof, one-use action/target grants, real revocation, no metadata bypass, safe factor changes, logout and deletion isolation.');
 } finally {await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
