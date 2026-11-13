'use strict';
// Provider-owned tables/columns used by the current security migration. These
// are fictional Auth records in PGlite, never writes to the hosted Auth schema.
async function install(db) {
  await db.exec(`
    alter table auth.sessions add column if not exists factor_id uuid;
    alter table auth.sessions add column if not exists aal text default 'aal1';
    create table if not exists auth.mfa_factors (
      id uuid primary key, user_id uuid references auth.users(id) on delete cascade,
      friendly_name text, factor_type text default 'totp', status text default 'unverified',
      created_at timestamptz default clock_timestamp()
    );
    create table if not exists auth.mfa_amr_claims (
      id uuid primary key default gen_random_uuid(),
      session_id uuid references auth.sessions(id) on delete cascade,
      authentication_method text, created_at timestamptz default clock_timestamp()
    );
  `);
}
// Historical tests of older session UI behavior can seed a narrowly-scoped
// authorization as fixture owner. The new security suite exercises the actual
// begin/password-login/approve/consume flow without this shortcut.
async function authorize(db, user, session, action, target = null) {
  await db.exec('reset role');
  await db.query(`insert into alm_private.sensitive_authorizations
    (actor,origin_session,action,target,approved_session,approved_at)
    values($1,$2,$3,$4,$2,clock_timestamp())`, [user, session, action, target]);
  await db.exec('set role authenticated');
}
module.exports = {install, authorize};
