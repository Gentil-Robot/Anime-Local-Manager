-- Device names are labels, never authentication or authorisation claims.
create table alm_private.session_devices(
 session_id uuid primary key references auth.sessions(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 device_name text not null check(char_length(device_name) between 1 and 80),
 platform text not null check(platform in('win32','linux','darwin','web','other'))
);
alter table alm_private.session_devices enable row level security;
revoke all on alm_private.session_devices from public,anon,authenticated;
create index alm_session_devices_owner on alm_private.session_devices(owner_id);
create function alm_private.register_device(p_name text,p_platform text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();sid uuid:=(auth.jwt()->>'session_id')::uuid;n text;
begin
 n:=left(btrim(regexp_replace(coalesce(p_name,''),'[[:cntrl:]]','','g')),80);
 if n='' or p_platform not in('win32','linux','darwin','web','other') then raise exception 'INVALID_INPUT';end if;
 insert into alm_private.session_devices(session_id,owner_id,device_name,platform) values(sid,u,n,p_platform)
 on conflict(session_id) do update set device_name=excluded.device_name,platform=excluded.platform where alm_private.session_devices.owner_id=u;
end;$$;
create or replace function alm_private.sessions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'created_at',s.created_at,'last_seen',coalesce(s.refreshed_at,s.created_at::timestamp),'current',s.id::text=auth.jwt()->>'session_id','device_name',d.device_name,'platform',d.platform) order by s.created_at desc),'[]')
 from auth.sessions s left join alm_private.session_devices d on d.session_id=s.id and d.owner_id=s.user_id
 where s.user_id=alm_private.require_actor() and (s.not_after is null or s.not_after>now());
$$;
create function alm_private.revoke_session(p_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();n integer;begin
 if p_session::text=auth.jwt()->>'session_id' then raise exception 'INVALID_INPUT';end if;
 delete from auth.sessions where id=p_session and user_id=u;get diagnostics n=row_count;
 if n<>1 then raise exception 'SESSION_UNAVAILABLE';end if;
end;$$;
create function public.alm_register_device(p_name text,p_platform text) returns void language sql security invoker set search_path='' as $$select alm_private.register_device(p_name,p_platform)$$;
create function public.alm_revoke_session(p_session uuid) returns void language sql security invoker set search_path='' as $$select alm_private.revoke_session(p_session)$$;
revoke all on function alm_private.register_device(text,text),alm_private.revoke_session(uuid) from public,anon;
revoke all on function public.alm_register_device(text,text),public.alm_revoke_session(uuid) from public,anon;
grant execute on function alm_private.register_device(text,text),alm_private.revoke_session(uuid),public.alm_register_device(text,text),public.alm_revoke_session(uuid) to authenticated;
-- Store a public cover URL only; no library progress or personal scores are copied.
create or replace function alm_private.recommend_v59(p_recipient uuid,p_anime jsonb,p_message text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();v uuid;cover text:=coalesce(p_anime->>'image_url','');begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 if not alm_private.friends(p_recipient) then raise exception 'FRIEND_REQUIRED';end if;
 if (select count(*) from public.alm_recommendations where sender=u and created_at>now()-interval '1 day')>=20 then raise exception 'RATE_LIMIT';end if;
 if (p_anime->>'mal_id')::integer<1 or length(p_anime->>'title') not between 1 and 300 then raise exception 'ANIME_INVALID';end if;
 if char_length(cover)>2048 or cover!~'^https://(cdn[.]myanimelist[.]net|s4[.]anilist[.]co)/[A-Za-z0-9/_%+.,:;=~-]+$' then cover:='';end if;
 insert into public.alm_recommendations(sender,recipient,anime,message) values(u,p_recipient,jsonb_build_object('mal_id',(p_anime->>'mal_id')::integer,'title',p_anime->>'title','image_url',cover),p_message) returning id into v;return v;end;$$;
