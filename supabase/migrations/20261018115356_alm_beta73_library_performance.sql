-- Compute session/friend/section permissions once per statement, not once per anime.
-- This is an InitPlan, not a cross-request cache: revocation still applies immediately.
create function alm_private.library_access()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=alm_private.active_actor(); viewer_adult boolean; result jsonb;
begin
 if u is null then return '{}'::jsonb; end if;
 viewer_adult:=alm_private.adult_sharing(u);
 select coalesce(jsonb_object_agg(p.id::text,jsonb_build_object(
  'library',p.id=u or p.share_library,
  'favorites',p.id=u or p.share_favorites,
  'watching',p.id=u or p.share_watching,
  'featured',p.featured,
  'adult',viewer_adult and alm_private.adult_sharing(p.id)
 )),'{}'::jsonb) into result
 from public.alm_profiles p
 where (p.id=u or p.id in(
  select case when f.requester=u then f.recipient else f.requester end
  from public.alm_friendships f where f.status='accepted' and u in(f.requester,f.recipient)
 )) and alm_private.can_view(p.id,'profile');
 return result;
end;
$$;

create function alm_private.library_row_allowed(p_owner uuid,p_mal integer,p_status text,p_favorite boolean,p_genres text[],p_access jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(
  ((g->>'library')::boolean or p_favorite and (g->>'favorites')::boolean
   or p_status='Watching' and (g->>'watching')::boolean
   or (g->'featured') @> to_jsonb(array[p_mal]))
  and (alm_private.content_item_allowed(jsonb_build_object('mal_id',p_mal,'genres',p_genres))
   or (g->>'adult')::boolean and alm_private.content_adult(jsonb_build_object('mal_id',p_mal))),false)
 from (select p_access->p_owner::text as g) access;
$$;
revoke all on function alm_private.library_access(),alm_private.library_row_allowed(uuid,integer,text,boolean,text[],jsonb) from public,anon;
grant execute on function alm_private.library_access(),alm_private.library_row_allowed(uuid,integer,text,boolean,text[],jsonb) to authenticated;
alter policy library_read on public.alm_library using(
 alm_private.library_row_allowed(owner_id,mal_id,status,favorite,genres,(select alm_private.library_access()))
);
