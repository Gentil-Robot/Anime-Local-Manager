-- New accounts must explicitly accept this version. Existing accounts are untouched.
-- Store the receipt privately, never authorize from editable JWT user_metadata.
create table alm_private.account_charter (
 user_id uuid primary key references auth.users(id) on delete cascade,
 version text not null check(version='2026-10-18'),
 accepted_at timestamptz not null default now()
);
alter table alm_private.account_charter enable row level security;
revoke all on alm_private.account_charter from public,anon,authenticated;

create function alm_private.capture_charter_acceptance()
returns trigger language plpgsql security definer set search_path='' as $$
declare metadata jsonb:=coalesce(to_jsonb(new)->'raw_user_meta_data','{}'::jsonb);
begin
 if metadata->'alm_charter_accepted' is distinct from 'true'::jsonb
    or metadata->>'alm_charter_version' is distinct from '2026-10-18' then
   raise exception 'TERMS_REQUIRED' using errcode='22023';
 end if;
 insert into alm_private.account_charter(user_id,version) values(new.id,'2026-10-18');
 return new;
end;
$$;
revoke all on function alm_private.capture_charter_acceptance() from public,anon,authenticated;
create trigger alm_capture_charter_acceptance after insert on auth.users
 for each row execute function alm_private.capture_charter_acceptance();
