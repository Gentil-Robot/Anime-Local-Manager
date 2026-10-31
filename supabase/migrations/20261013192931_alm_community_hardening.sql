begin;
-- The dashboard's event-trigger helper needs no API execution privileges.
do $$ begin
 if to_regprocedure('public.rls_auto_enable()') is not null then
  execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
 end if;
end $$;
-- Private rate-limit history is not exposed through the Data API.
alter table alm_private.actions add column id bigint generated always as identity primary key;
create index alm_friend_blocked_by on public.alm_friendships(blocked_by);
create or replace function alm_private.request_friend(p_handle text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();v uuid;fid uuid;state text;begin
 if u is null then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 delete from alm_private.actions where actor=u and created_at<now()-interval '7 days';
 if (select count(*) from alm_private.actions where actor=u and kind='friend' and created_at>now()-interval '1 day')>=20 then raise exception 'RATE_LIMIT';end if;
 select id into v from public.alm_profiles where handle=p_handle and allow_requests;if v is null or v=u then raise exception 'PROFILE_UNAVAILABLE';end if;
 select id,status into fid,state from public.alm_friendships where least(requester,recipient)=least(u,v) and greatest(requester,recipient)=greatest(u,v);
 if state='blocked' then raise exception 'PROFILE_UNAVAILABLE';end if;if fid is not null then return fid;end if;
 insert into public.alm_friendships(requester,recipient) values(u,v) on conflict do nothing returning id into fid;
 if fid is null then select id into fid from public.alm_friendships where least(requester,recipient)=least(u,v) and greatest(requester,recipient)=greatest(u,v);end if;
 insert into alm_private.actions(actor,kind) values(u,'friend');return fid;
end;$$;
commit;

