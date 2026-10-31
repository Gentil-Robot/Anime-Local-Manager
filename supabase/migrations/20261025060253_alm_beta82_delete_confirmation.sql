-- A NULL confirmation must be rejected before any account or newsletter deletion.
-- CREATE OR REPLACE preserves the existing owner and EXECUTE grants. Keep the
-- recent-session check and derive the target only from the authenticated actor.
create or replace function alm_private.delete_account(p_confirm text)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor(true);begin
 if p_confirm is distinct from 'DELETE' then raise exception 'INVALID_INPUT';end if;
 delete from alm_private.newsletter where email=(select lower(email) from auth.users where id=u);
 delete from auth.users where id=u;
end;$$;
