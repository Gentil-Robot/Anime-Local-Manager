-- Optional MFA with server-owned factor trust, live session checks and one-use
-- authorizations. No TOTP secret, password or bearer token is stored here.
begin;

create table alm_private.account_security (
 user_id uuid primary key references auth.users(id) on delete cascade,
 mfa_required boolean not null default false,
 updated_at timestamptz not null default now()
);
create table alm_private.trusted_mfa_factors (
 factor_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 approved_at timestamptz not null default now()
);
create index alm_trusted_factors_owner on alm_private.trusted_mfa_factors(user_id);
create table alm_private.sensitive_authorizations (
 id uuid primary key default gen_random_uuid(),
 actor uuid not null references auth.users(id) on delete cascade,
 origin_session uuid not null,
 action text not null check(action in ('delete','revoke','revoke-session','mfa-enroll','mfa-disable','mfa-remove')),
 target uuid,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 approved_session uuid,
 approved_at timestamptz,
 used_at timestamptz,
 completed_at timestamptz
);
create index alm_sensitive_actor_time on alm_private.sensitive_authorizations(actor,created_at);
alter table alm_private.account_security enable row level security;
alter table alm_private.trusted_mfa_factors enable row level security;
alter table alm_private.sensitive_authorizations enable row level security;
revoke all on alm_private.account_security,alm_private.trusted_mfa_factors,alm_private.sensitive_authorizations from public,anon,authenticated;

-- Preserve factors already verified before deployment. Subsequent factors must
-- be explicitly approved after password + the existing trusted factor.
insert into alm_private.trusted_mfa_factors(factor_id,user_id)
 select id,user_id from auth.mfa_factors where status='verified';
insert into alm_private.account_security(user_id,mfa_required)
 select distinct user_id,true from alm_private.trusted_mfa_factors;

create function alm_private.session_actor() returns uuid
language sql stable security definer set search_path='' as $$
 select u.id from auth.users u join auth.sessions s on s.user_id=u.id
 where u.id=auth.uid() and u.email_confirmed_at is not null
 and s.id::text=auth.jwt()->>'session_id'
 and (s.not_after is null or s.not_after>now());
$$;

create or replace function alm_private.active_actor() returns uuid
language sql stable security definer set search_path='' as $$
 select u from (select alm_private.session_actor() u) actor
 where u is not null and (
  not coalesce((select a.mfa_required from alm_private.account_security a where a.user_id=u),false)
  or (
   auth.jwt()->>'aal'='aal2'
   and exists(
    select 1 from auth.sessions s
    join alm_private.trusted_mfa_factors t on t.factor_id=s.factor_id and t.user_id=s.user_id
    join auth.mfa_factors f on f.id=t.factor_id and f.user_id=t.user_id and f.status='verified'
    where s.id::text=auth.jwt()->>'session_id' and s.user_id=u and s.aal='aal2'
   )
  )
 );
$$;

create or replace function alm_private.require_actor(p_recent boolean default false) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=alm_private.active_actor();begin
 if u is null then
  if alm_private.session_actor() is not null then raise exception 'MFA_REQUIRED';end if;
  raise exception 'SESSION_EXPIRED';
 end if;
 if p_recent and not exists(select 1 from auth.sessions where user_id=u
  and id::text=auth.jwt()->>'session_id' and created_at>now()-interval '5 minutes') then
  raise exception 'REAUTH_REQUIRED';
 end if;
 return u;
end;$$;

create function alm_private.security_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=alm_private.session_actor();required boolean;factors jsonb;begin
 if u is null then raise exception 'SESSION_EXPIRED';end if;
 select coalesce(a.mfa_required,false) into required from alm_private.account_security a where a.user_id=u;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',left(coalesce(f.friendly_name,'Authenticator'),80),'type',f.factor_type)
  order by t.approved_at),'[]'::jsonb) into factors
 from alm_private.trusted_mfa_factors t join auth.mfa_factors f on f.id=t.factor_id
 where t.user_id=u and f.user_id=u and f.status='verified';
 return jsonb_build_object('version',1,'enabled',coalesce(required,false),
  'required',coalesce(required,false) and alm_private.active_actor() is null,
  'locked',coalesce(required,false) and jsonb_array_length(factors)=0,
  'factors',factors,'currentLevel',case when auth.jwt()->>'aal'='aal2' then 'aal2' else 'aal1' end);
end;$$;

create function alm_private.begin_sensitive(p_action text,p_target uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();id uuid;begin
 if p_action is null or p_action not in ('delete','revoke','revoke-session','mfa-enroll','mfa-disable','mfa-remove')
  or ((p_action in ('revoke-session','mfa-remove'))<>(p_target is not null)) then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtext('alm-security:'||u::text));
 delete from alm_private.sensitive_authorizations where actor=u and expires_at<now()-interval '1 day';
 if (select count(*) from alm_private.sensitive_authorizations where actor=u and created_at>now()-interval '10 minutes')>=12 then
  raise exception 'RATE_LIMIT';
 end if;
 insert into alm_private.sensitive_authorizations(actor,origin_session,action,target)
  values(u,(auth.jwt()->>'session_id')::uuid,p_action,p_target) returning sensitive_authorizations.id into id;
 return jsonb_build_object('id',id,'expiresIn',300);
end;$$;

create function alm_private.approve_sensitive(p_authorization uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();r alm_private.sensitive_authorizations;s auth.sessions;begin
 select * into r from alm_private.sensitive_authorizations where id=p_authorization and actor=u for update;
 if r.id is null or r.used_at is not null or r.approved_at is not null or r.expires_at<=now() then raise exception 'REAUTH_REQUIRED';end if;
 select * into s from auth.sessions where user_id=u and id::text=auth.jwt()->>'session_id';
 -- A freshly-created session, after the challenge, is required. A refreshed
 -- stolen JWT or an aal2 claim from an earlier login is not a new proof.
 if s.id is null or s.id=r.origin_session or s.created_at is null or s.created_at<r.created_at
  or not exists(select 1 from auth.sessions old where old.id=r.origin_session and old.user_id=u and (old.not_after is null or old.not_after>now()))
  or not exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id
   and a.authentication_method='password' and a.created_at>=r.created_at) then raise exception 'REAUTH_REQUIRED';end if;
 update alm_private.sensitive_authorizations set approved_session=s.id,approved_at=clock_timestamp(),
  expires_at=clock_timestamp()+case when r.action='mfa-enroll' then interval '5 minutes' else interval '2 minutes' end where id=r.id;
 -- The password login replaces this device's old session instead of leaving
 -- an extra valid session behind after each sensitive action.
 delete from auth.sessions where id=r.origin_session and user_id=u;
 return jsonb_build_object('ok',true,'action',r.action);
end;$$;

create function alm_private.consume_sensitive(p_action text,p_target uuid default null,p_basic boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid;grant_id uuid;begin
 u:=case when p_basic then alm_private.session_actor() else alm_private.require_actor() end;
 if u is null then raise exception 'SESSION_EXPIRED';end if;
 perform pg_advisory_xact_lock(hashtext('alm-security:'||u::text));
 select a.id into grant_id from alm_private.sensitive_authorizations a where a.actor=u
  and a.action=p_action and a.target is not distinct from p_target and a.used_at is null
  and a.approved_session::text=auth.jwt()->>'session_id'
  and a.approved_at is not null and a.expires_at>now()
  order by a.approved_at desc limit 1 for update;
 if grant_id is null then raise exception 'REAUTH_REQUIRED';end if;
 update alm_private.sensitive_authorizations set used_at=clock_timestamp() where sensitive_authorizations.id=grant_id;
 return u;
end;$$;

create function alm_private.confirm_mfa_enrollment(p_factor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.session_actor();begin
 if u is null then raise exception 'SESSION_EXPIRED';end if;
 if auth.jwt()->>'aal' is distinct from 'aal2'
  or not exists(select 1 from auth.mfa_factors f join auth.sessions s on s.factor_id=f.id
   where f.id=p_factor and f.user_id=u and f.status='verified' and f.factor_type='totp'
   and s.id::text=auth.jwt()->>'session_id' and s.user_id=u and s.aal='aal2') then raise exception 'MFA_REQUIRED';end if;
 perform alm_private.consume_sensitive('mfa-enroll',null,true);
 insert into alm_private.trusted_mfa_factors(factor_id,user_id) values(p_factor,u) on conflict(factor_id) do nothing;
 insert into alm_private.account_security(user_id,mfa_required) values(u,true)
  on conflict(user_id) do update set mfa_required=true,updated_at=clock_timestamp();
 -- Any older aal1 token now loses access under the RLS and RPC guards.
 delete from auth.sessions where user_id=u and id::text<>auth.jwt()->>'session_id';
 return alm_private.security_state();
end;$$;

create function alm_private.authorize_factor_change(p_action text,p_factor uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();begin
 if p_action is null or p_action not in ('mfa-disable','mfa-remove') then raise exception 'INVALID_INPUT';end if;
 if p_action='mfa-remove' and (p_factor is null or not exists(select 1 from alm_private.trusted_mfa_factors where user_id=u and factor_id=p_factor)) then raise exception 'INVALID_INPUT';end if;
 if p_action='mfa-remove' and (select count(*) from alm_private.trusted_mfa_factors t join auth.mfa_factors f on f.id=t.factor_id where t.user_id=u and f.user_id=u and f.status='verified')<=1 then raise exception 'MFA_LAST_FACTOR';end if;
 perform alm_private.consume_sensitive(p_action,p_factor);
 delete from auth.sessions where user_id=u and id::text<>auth.jwt()->>'session_id';
 return jsonb_build_object('ok',true);
end;$$;

-- Keep MFA required until the provider has actually removed the factor(s).
-- A failed native unenroll must never silently downgrade account protection.
create function alm_private.finish_factor_change(p_action text,p_factor uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.session_actor();grant_id uuid;begin
 if u is null then raise exception 'SESSION_EXPIRED';end if;
 if p_action is null or p_action not in ('mfa-disable','mfa-remove') then raise exception 'INVALID_INPUT';end if;
 perform pg_advisory_xact_lock(hashtext('alm-security:'||u::text));
 select a.id into grant_id from alm_private.sensitive_authorizations a where a.actor=u
  and a.action=p_action and a.target is not distinct from p_factor and a.used_at is not null
  and a.completed_at is null and a.approved_session::text=auth.jwt()->>'session_id'
  and a.expires_at>now() order by a.used_at desc limit 1 for update;
 if grant_id is null then raise exception 'REAUTH_REQUIRED';end if;
 if exists(select 1 from auth.mfa_factors f where f.user_id=u and f.status='verified'
  and (p_action='mfa-disable' or f.id=p_factor)) then raise exception 'MFA_CHANGE_INCOMPLETE';end if;
 if p_action='mfa-disable' then
  delete from alm_private.trusted_mfa_factors where user_id=u;
  update alm_private.account_security set mfa_required=false,updated_at=clock_timestamp() where user_id=u;
 else delete from alm_private.trusted_mfa_factors where user_id=u and factor_id=p_factor;end if;
 update alm_private.sensitive_authorizations set completed_at=clock_timestamp() where id=grant_id;
 return jsonb_build_object('ok',true);
end;$$;

create or replace function alm_private.revoke_session(p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();begin
 if p_session::text=auth.jwt()->>'session_id' then raise exception 'INVALID_INPUT';end if;
 if not exists(select 1 from auth.sessions where id=p_session and user_id=u) then raise exception 'SESSION_UNAVAILABLE';end if;
 perform alm_private.consume_sensitive('revoke-session',p_session);
 delete from auth.sessions where id=p_session and user_id=u;
end;$$;
create or replace function alm_private.revoke_sessions() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();begin
 perform alm_private.consume_sensitive('revoke');
 delete from auth.sessions where user_id=u and id::text<>auth.jwt()->>'session_id';
end;$$;
create or replace function alm_private.delete_account(p_confirm text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();begin
 if p_confirm is distinct from 'DELETE' then raise exception 'INVALID_INPUT';end if;
 perform alm_private.consume_sensitive('delete');
 delete from alm_private.newsletter where email=(select lower(email) from auth.users where id=u);
 -- Revoke sessions before removing the account, even for schemas whose user
 -- deletion cascade differs from the provider's current default.
 delete from auth.sessions where user_id=u;
 delete from auth.users where id=u;
end;$$;
create function alm_private.logout_session() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.session_actor();begin
 if u is null then raise exception 'SESSION_EXPIRED';end if;
 delete from auth.sessions where user_id=u and id::text=auth.jwt()->>'session_id';
 return jsonb_build_object('ok',true);
end;$$;

create function public.alm_security_state() returns jsonb language sql security invoker set search_path='' as $$select alm_private.security_state()$$;
create function public.alm_begin_sensitive(p_action text,p_target uuid default null) returns jsonb language sql security invoker set search_path='' as $$select alm_private.begin_sensitive(p_action,p_target)$$;
create function public.alm_approve_sensitive(p_authorization uuid) returns jsonb language sql security invoker set search_path='' as $$select alm_private.approve_sensitive(p_authorization)$$;
create function public.alm_confirm_mfa_enrollment(p_factor uuid) returns jsonb language sql security invoker set search_path='' as $$select alm_private.confirm_mfa_enrollment(p_factor)$$;
create function public.alm_authorize_factor_change(p_action text,p_factor uuid default null) returns jsonb language sql security invoker set search_path='' as $$select alm_private.authorize_factor_change(p_action,p_factor)$$;
create function public.alm_finish_factor_change(p_action text,p_factor uuid default null) returns jsonb language sql security invoker set search_path='' as $$select alm_private.finish_factor_change(p_action,p_factor)$$;
create function public.alm_logout_session() returns jsonb language sql security invoker set search_path='' as $$select alm_private.logout_session()$$;

-- A restrictive guard applies to every read/write in addition to the existing
-- ownership, friendship, age and sharing policies. No permissive OR bypass.
do $$declare name text;begin
 foreach name in array array['alm_profiles','alm_library','alm_dna','alm_activity','alm_friendships','alm_recommendations'] loop
  execute format('create policy alm_live_session_guard on public.%I as restrictive for all to authenticated using ((select alm_private.active_actor()) is not null) with check ((select alm_private.active_actor()) is not null)',name);
 end loop;
end;$$;

revoke all on function alm_private.session_actor(),alm_private.security_state(),alm_private.begin_sensitive(text,uuid),alm_private.approve_sensitive(uuid),alm_private.consume_sensitive(text,uuid,boolean),alm_private.confirm_mfa_enrollment(uuid),alm_private.authorize_factor_change(text,uuid),alm_private.finish_factor_change(text,uuid),alm_private.logout_session() from public,anon,authenticated;
grant execute on function alm_private.security_state(),alm_private.begin_sensitive(text,uuid),alm_private.approve_sensitive(uuid),alm_private.confirm_mfa_enrollment(uuid),alm_private.authorize_factor_change(text,uuid),alm_private.finish_factor_change(text,uuid),alm_private.logout_session() to authenticated;
revoke all on function public.alm_security_state(),public.alm_begin_sensitive(text,uuid),public.alm_approve_sensitive(uuid),public.alm_confirm_mfa_enrollment(uuid),public.alm_authorize_factor_change(text,uuid),public.alm_finish_factor_change(text,uuid),public.alm_logout_session() from public,anon;
grant execute on function public.alm_security_state(),public.alm_begin_sensitive(text,uuid),public.alm_approve_sensitive(uuid),public.alm_confirm_mfa_enrollment(uuid),public.alm_authorize_factor_change(text,uuid),public.alm_finish_factor_change(text,uuid),public.alm_logout_session() to authenticated;
commit;
