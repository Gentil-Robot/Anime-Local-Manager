-- Separate rolling 24-hour quotas, serialized per authenticated actor.
create or replace function alm_private.request_friend_v2(p_identifier text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();v uuid;fid uuid;state text;ident text:=btrim(p_identifier);begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 delete from alm_private.actions where actor=u and created_at<now()-interval '7 days';
 if (select count(*) from alm_private.actions where actor=u and kind='friend' and created_at>now()-interval '24 hours')>=10 then return jsonb_build_object('ok',false,'code','FRIEND_DAILY_LIMIT');end if;
 if (select count(*) from alm_private.actions where actor=u and kind='friend' and created_at>now()-interval '1 minute')>=5 then return jsonb_build_object('ok',false,'code','RATE_LIMIT');end if;
 -- Failed lookups are committed too: returning an error object avoids rollback of the counter.
 insert into alm_private.actions(actor,kind) values(u,'friend');
 if length(ident)>90 then return jsonb_build_object('ok',false,'code','PROFILE_UNAVAILABLE');end if;
 if ident~'^.+#[0-9]{4,10}$' then
  select id into v from public.alm_profiles where name_key=lower(normalize(regexp_replace(ident,'#[0-9]+$',''),NFKC)) and discriminator=substring(ident from '#([0-9]+)$')::bigint and allow_requests;
 elsif ident~'^[0-9a-f-]{36}$' then select id into v from public.alm_profiles where id::text=ident and allow_requests;
 else select id into v from public.alm_profiles where handle=lower(ident) and allow_requests;end if;
 if v is null or v=u then return jsonb_build_object('ok',false,'code','PROFILE_UNAVAILABLE');end if;
 select id,status into fid,state from public.alm_friendships where least(requester,recipient)=least(u,v) and greatest(requester,recipient)=greatest(u,v);
 if state='blocked' then return jsonb_build_object('ok',false,'code','PROFILE_UNAVAILABLE');end if;
 if fid is not null then return jsonb_build_object('ok',true,'id',fid,'already',true);end if;
 insert into public.alm_friendships(requester,recipient) values(u,v) on conflict do nothing returning id into fid;
 if fid is null then select id into fid from public.alm_friendships where least(requester,recipient)=least(u,v) and greatest(requester,recipient)=greatest(u,v);end if;
 return jsonb_build_object('ok',true,'id',fid);
end;$$;

create or replace function alm_private.recommend(p_recipient uuid,p_anime jsonb,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();v uuid;mal integer;
begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 if not alm_private.friends(p_recipient) then raise exception 'PROFILE_UNAVAILABLE';end if;
 if jsonb_typeof(p_anime) is distinct from 'object' or coalesce(p_anime->>'mal_id','')!~'^[1-9][0-9]{0,9}$' or char_length(btrim(coalesce(p_anime->>'title',''))) not between 1 and 300 or char_length(coalesce(p_message,''))>500 then raise exception 'INVALID_INPUT';end if;
 if (p_anime->>'mal_id')::bigint>2147483647 then raise exception 'INVALID_INPUT';end if;
 mal:=(p_anime->>'mal_id')::integer;
 if exists(select 1 from public.alm_recommendations where sender=u and recipient=p_recipient and anime->>'mal_id'=mal::text and created_at>now()-interval '24 hours') then raise exception 'RECOMMEND_DUPLICATE';end if;
 -- Count persisted actions as well as pre-upgrade recommendations. Removing a
 -- received item or deleting its recipient cannot reset the sender's quota.
 if (select count(*) from alm_private.actions where actor=u and kind='recommend' and created_at>now()-interval '24 hours')>=10 or (select count(*) from public.alm_recommendations where sender=u and created_at>now()-interval '24 hours')>=10 then raise exception 'RECOMMEND_DAILY_LIMIT';end if;
 if (select count(*) from alm_private.actions where actor=u and kind='recommend' and created_at>now()-interval '1 minute')>=3 or (select count(*) from public.alm_recommendations where sender=u and created_at>now()-interval '1 minute')>=3 then raise exception 'RATE_LIMIT';end if;
 v:=alm_private.recommend_v59(p_recipient,p_anime,coalesce(p_message,''));
 insert into alm_private.actions(actor,kind) values(u,'recommend');
 return v;
end;$$;
-- Existing invoker RPCs and RLS policies are retained. No profile or library
-- data is deleted and no additional schema is exposed.

-- Automatic synchronization never receives a client profile or permissions.
-- The same actor lock used by save_identity serializes privacy changes with it.
create function alm_private.refresh_shared_profile(p_items jsonb,p_dna jsonb,p_activity jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();p public.alm_profiles;
begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 select * into p from public.alm_profiles where id=u for update;
 if not found or p.visibility<>'friends' then return jsonb_build_object('updated',false,'reason','private');end if;
 perform alm_private.publish_profile(to_jsonb(p),p_items,p_dna,p_activity);
 return jsonb_build_object('updated',true);
end;$$;
revoke all on function alm_private.refresh_shared_profile(jsonb,jsonb,jsonb) from public,anon;
grant execute on function alm_private.refresh_shared_profile(jsonb,jsonb,jsonb) to authenticated;
create function public.alm_refresh_shared_profile(p_items jsonb,p_dna jsonb,p_activity jsonb) returns jsonb
language sql security invoker set search_path='' as $$select alm_private.refresh_shared_profile(p_items,p_dna,p_activity)$$;
revoke all on function public.alm_refresh_shared_profile(jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.alm_refresh_shared_profile(jsonb,jsonb,jsonb) to authenticated;

