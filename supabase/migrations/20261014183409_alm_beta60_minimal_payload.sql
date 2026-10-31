-- Enforce minimal collection data on the server, independently of client filtering.
begin;
create or replace function alm_private.publish_profile(p_profile jsonb,p_items jsonb,p_dna jsonb,p_activity jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.alm_profiles;u uuid:=alm_private.require_actor();filtered jsonb;visible boolean:=coalesce(p_profile->>'visibility'='friends',false);begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>20000 or pg_column_size(p_items)>8000000 then raise exception 'PAYLOAD_LIMIT';end if;
 if (select count(*) from alm_private.actions where actor=u and kind='publish' and created_at>now()-interval '1 minute')>=3 or (select count(*) from alm_private.actions where actor=u and kind='publish' and created_at>now()-interval '1 day')>=100 then raise exception 'RATE_LIMIT';end if;
 insert into alm_private.actions(actor,kind) values(u,'publish');p:=alm_private.save_identity(p_profile);
 select coalesce(jsonb_agg(i),'[]') into filtered from jsonb_array_elements(p_items) i where visible and (
  coalesce((p_profile->>'share_library')::boolean,false)
  or coalesce((p_profile->>'share_favorites')::boolean,false) and coalesce((i->>'favorite')::boolean,false)
  or coalesce((p_profile->>'share_watching')::boolean,false) and i->>'status'='Watching'
  or coalesce(p_profile->'featured','[]') @> jsonb_build_array((i->>'mal_id')::integer));
 perform alm_private.publish_snapshot_v59(p_profile||jsonb_build_object('handle',p.handle),filtered,
  case when visible and coalesce((p_profile->>'share_dna')::boolean,false) then p_dna else '[]' end,
  case when visible and coalesce((p_profile->>'share_activity')::boolean,false) then p_activity else '[]' end);
end;$$;
revoke execute on function alm_private.publish_profile(jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function alm_private.publish_profile(jsonb,jsonb,jsonb,jsonb) to authenticated;
commit;
