-- ALM community v1. Apply once after a Supabase project is provisioned.
-- All mutations enter private, uid-scoped functions; public wrappers are invokers.
begin;
create schema if not exists alm_private;
revoke all on schema alm_private from public, anon;
grant usage on schema alm_private to authenticated;
create table public.alm_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 handle text not null unique check(handle ~ '^[a-z0-9_]{3,24}$'),
 display_name text not null check(length(display_name) between 1 and 60),
 bio text not null default '' check(length(bio)<=240),
 avatar text not null default 'aster' check(avatar in ('aster','moon','star','robot')),
 banner text not null default 'garden' check(banner in ('garden','library','path')),
 accent text not null default 'violet' check(accent in ('violet','blue','green')),
 visibility text not null default 'private' check(visibility in ('private','friends')),
 allow_requests boolean not null default true,
 share_library boolean not null default false, share_favorites boolean not null default false,
 share_watching boolean not null default false, share_dna boolean not null default false,
 share_activity boolean not null default false,
 featured integer[] not null default '{}' check(cardinality(featured)<=5),
 updated_at timestamptz not null default now()
);
create table public.alm_friendships (
 id uuid primary key default gen_random_uuid(),
 requester uuid not null references auth.users(id) on delete cascade,
 recipient uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','blocked')),
 blocked_by uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 check(requester<>recipient),check((status='blocked' and blocked_by in (requester,recipient)) or (status<>'blocked' and blocked_by is null))
);
create unique index alm_friend_pair on public.alm_friendships(least(requester,recipient),greatest(requester,recipient));
create index alm_friend_recipient on public.alm_friendships(recipient,status);
create index alm_friend_requester on public.alm_friendships(requester,status);
create table public.alm_library (
 owner_id uuid not null references auth.users(id) on delete cascade,
 mal_id integer not null check(mal_id>0),title text not null check(length(title) between 1 and 300),
 image_url text not null default '' check(length(image_url)<=700 and (image_url='' or image_url ~ '^https://(cdn\.myanimelist\.net|s4\.anilist\.co)/')),
 status text not null check(status in ('Watching','Completed','Plan to Watch','On-Hold','Dropped')),
 score numeric not null default 0 check(score between 0 and 10),
 episodes_seen integer not null default 0 check(episodes_seen between 0 and 100000),
 episodes_total integer not null default 0 check(episodes_total between 0 and 100000),
 genres text[] not null default '{}' check(cardinality(genres)<=20),
 studios text[] not null default '{}' check(cardinality(studios)<=20),
 favorite boolean not null default false,primary key(owner_id,mal_id)
);
create table public.alm_dna(owner_id uuid primary key references auth.users(id) on delete cascade,data jsonb not null check(jsonb_typeof(data)='array' and jsonb_array_length(data)<=12));
create table public.alm_activity(owner_id uuid primary key references auth.users(id) on delete cascade,data jsonb not null check(jsonb_typeof(data)='array' and jsonb_array_length(data)<=366));
create table public.alm_recommendations (
 id uuid primary key default gen_random_uuid(),
 sender uuid not null references auth.users(id) on delete cascade,
 recipient uuid not null references auth.users(id) on delete cascade,
 anime jsonb not null, message text not null default '' check(length(message)<=500),
 created_at timestamptz not null default now(),read_at timestamptz,check(sender<>recipient)
);
create index alm_recipient_created on public.alm_recommendations(recipient,created_at desc);
create index alm_sender_created on public.alm_recommendations(sender,created_at desc);
create table alm_private.actions(actor uuid not null references auth.users(id) on delete cascade,kind text not null,created_at timestamptz not null default now());
create index alm_actions_actor on alm_private.actions(actor,kind,created_at);
alter table alm_private.actions enable row level security;
create function alm_private.friends(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.alm_friendships f where f.status='accepted' and ((f.requester=auth.uid() and f.recipient=p_owner) or(f.recipient=auth.uid() and f.requester=p_owner)));
$$;
create function alm_private.can_view(p_owner uuid,p_section text default 'profile') returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (p_owner=auth.uid() or exists(
 select 1 from public.alm_profiles p where p.id=p_owner and p.visibility='friends' and alm_private.friends(p_owner)
 and case p_section when 'profile' then true when 'library' then p.share_library when 'favorites' then p.share_favorites when 'watching' then p.share_watching when 'dna' then p.share_dna when 'activity' then p.share_activity else false end));
$$;
create function alm_private.showcase(p_owner uuid,p_mal integer) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and alm_private.can_view(p_owner) and exists(select 1 from public.alm_profiles p where p.id=p_owner and p_mal=any(p.featured));
$$;
alter table public.alm_profiles enable row level security;
alter table public.alm_friendships enable row level security;
alter table public.alm_library enable row level security;
alter table public.alm_dna enable row level security;
alter table public.alm_activity enable row level security;
alter table public.alm_recommendations enable row level security;
create policy profiles_read on public.alm_profiles for select to authenticated using(alm_private.can_view(id));
create policy friendship_read on public.alm_friendships for select to authenticated using((select auth.uid()) in(requester,recipient));
create policy library_read on public.alm_library for select to authenticated using(alm_private.can_view(owner_id,'library') or favorite and alm_private.can_view(owner_id,'favorites') or status='Watching' and alm_private.can_view(owner_id,'watching') or alm_private.showcase(owner_id,mal_id));
create policy dna_read on public.alm_dna for select to authenticated using(alm_private.can_view(owner_id,'dna'));
create policy activity_read on public.alm_activity for select to authenticated using(alm_private.can_view(owner_id,'activity'));
create policy recommendations_read on public.alm_recommendations for select to authenticated using((select auth.uid()) in(sender,recipient));
revoke all on public.alm_profiles,public.alm_friendships,public.alm_library,public.alm_dna,public.alm_activity,public.alm_recommendations from public,anon,authenticated;
grant select on public.alm_profiles,public.alm_friendships,public.alm_library,public.alm_dna,public.alm_activity,public.alm_recommendations to authenticated;
create function alm_private.publish_profile(p_profile jsonb,p_items jsonb,p_dna jsonb,p_activity jsonb) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); i jsonb; d jsonb; cleaned jsonb;
begin
 if u is null then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>20000 or pg_column_size(p_items)>8000000 then raise exception 'PAYLOAD_LIMIT';end if;
 insert into public.alm_profiles(id,handle,display_name,bio,avatar,banner,accent,visibility,allow_requests,share_library,share_favorites,share_watching,share_dna,share_activity,featured)
 values(u,p_profile->>'handle',p_profile->>'display_name',coalesce(p_profile->>'bio',''),coalesce(p_profile->>'avatar','aster'),coalesce(p_profile->>'banner','garden'),coalesce(p_profile->>'accent','violet'),coalesce(p_profile->>'visibility','private'),coalesce((p_profile->>'allow_requests')::boolean,true),coalesce((p_profile->>'share_library')::boolean,false),coalesce((p_profile->>'share_favorites')::boolean,false),coalesce((p_profile->>'share_watching')::boolean,false),coalesce((p_profile->>'share_dna')::boolean,false),coalesce((p_profile->>'share_activity')::boolean,false),array(select jsonb_array_elements_text(coalesce(p_profile->'featured','[]'))::integer))
 on conflict(id) do update set handle=excluded.handle,display_name=excluded.display_name,bio=excluded.bio,avatar=excluded.avatar,banner=excluded.banner,accent=excluded.accent,visibility=excluded.visibility,allow_requests=excluded.allow_requests,share_library=excluded.share_library,share_favorites=excluded.share_favorites,share_watching=excluded.share_watching,share_dna=excluded.share_dna,share_activity=excluded.share_activity,featured=excluded.featured,updated_at=now();
 delete from public.alm_library where owner_id=u;
 for i in select value from jsonb_array_elements(p_items) loop
  insert into public.alm_library(owner_id,mal_id,title,status,score,episodes_seen,episodes_total,genres,studios,favorite,image_url)
  values(u,(i->>'mal_id')::integer,i->>'title',i->>'status',coalesce((i->>'score')::numeric,0),coalesce((i->>'episodes_seen')::integer,0),coalesce((i->>'episodes_total')::integer,0),array(select left(value,80) from jsonb_array_elements_text(coalesce(i->'genres','[]'))),array(select left(value,80) from jsonb_array_elements_text(coalesce(i->'studios','[]'))),coalesce((i->>'favorite')::boolean,false),coalesce(i->>'image_url',''));
 end loop;
 -- Derive DNA from accepted rows, ignoring arbitrary submitted JSON.
 select coalesce(jsonb_agg(jsonb_build_object('genre',genre,'count',count)),'[]') into cleaned from
 (select g genre,count(*) count from public.alm_library l cross join unnest(l.genres) g where l.owner_id=u and l.status in('Watching','Completed') group by g order by count(*) desc,g limit 12) q;
 insert into public.alm_dna values(u,cleaned) on conflict(owner_id) do update set data=excluded.data;
 if jsonb_typeof(p_activity)<>'array' or jsonb_array_length(p_activity)>366 then raise exception 'ACTIVITY_LIMIT';end if;
 cleaned:='[]';
 for d in select value from jsonb_array_elements(p_activity) loop
  if (d->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((d->>'date')::date,'YYYY-MM-DD')<>d->>'date' or (d->>'episodes')::integer not between 1 and 100000 then raise exception 'ACTIVITY_INVALID';end if;
  cleaned:=cleaned||jsonb_build_array(jsonb_build_object('date',d->>'date','episodes',(d->>'episodes')::integer));
 end loop;
 insert into public.alm_activity values(u,cleaned) on conflict(owner_id) do update set data=excluded.data;
end;$$;
create function alm_private.withdraw_profile() returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();begin if u is null then raise exception 'AUTH_REQUIRED';end if;perform pg_advisory_xact_lock(hashtext(u::text));update public.alm_profiles set visibility='private',share_library=false,share_favorites=false,share_watching=false,share_dna=false,share_activity=false where id=u;delete from public.alm_library where owner_id=u;delete from public.alm_dna where owner_id=u;delete from public.alm_activity where owner_id=u;end;$$;
create function alm_private.request_friend(p_handle text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();v uuid;fid uuid;state text;begin
 if u is null then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 if (select count(*) from alm_private.actions where actor=u and kind='friend' and created_at>now()-interval '1 day')>=20 then raise exception 'RATE_LIMIT';end if;
 select id into v from public.alm_profiles where handle=p_handle and allow_requests;if v is null or v=u then raise exception 'PROFILE_UNAVAILABLE';end if;
 select id,status into fid,state from public.alm_friendships where least(requester,recipient)=least(u,v) and greatest(requester,recipient)=greatest(u,v);
 if state='blocked' then raise exception 'PROFILE_UNAVAILABLE';end if;if fid is not null then return fid;end if;
 insert into public.alm_friendships(requester,recipient) values(u,v) on conflict do nothing returning id into fid;
 if fid is null then select id into fid from public.alm_friendships where least(requester,recipient)=least(u,v) and greatest(requester,recipient)=greatest(u,v);end if;
 insert into alm_private.actions(actor,kind) values(u,'friend');return fid;
end;$$;
create function alm_private.friend_action(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();f public.alm_friendships;begin
 if u is null then raise exception 'AUTH_REQUIRED';end if;
 select * into f from public.alm_friendships where id=p_id and u in(requester,recipient) for update;if f.id is null then raise exception 'NOT_FOUND';end if;
 if p_action='accept' and f.recipient=u and f.status='pending' then update public.alm_friendships set status='accepted' where id=p_id;
 elsif p_action='block' and (f.status<>'blocked' or f.blocked_by=u) then update public.alm_friendships set status='blocked',blocked_by=u where id=p_id;
 elsif p_action='unblock' and f.status='blocked' and f.blocked_by=u then delete from public.alm_friendships where id=p_id;
 elsif p_action='decline' and f.status='pending' and f.recipient=u or p_action='remove' and f.status<>'blocked' then delete from public.alm_friendships where id=p_id;
 else raise exception 'ACTION_DENIED';end if;
end;$$;
create function alm_private.friend_cards() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();v jsonb;begin
 if u is null then raise exception 'AUTH_REQUIRED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'handle',p.handle,'display_name',p.display_name,'avatar',p.avatar)),'[]') into v from public.alm_profiles p where exists(select 1 from public.alm_friendships f where u in(f.requester,f.recipient) and p.id in(f.requester,f.recipient) and p.id<>u);return v;
end;$$;
create function alm_private.recommend(p_recipient uuid,p_anime jsonb,p_message text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();v uuid;begin if u is null then raise exception 'AUTH_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 if not alm_private.friends(p_recipient) then raise exception 'FRIEND_REQUIRED';end if;
 if (select count(*) from public.alm_recommendations where sender=u and created_at>now()-interval '1 day')>=20 then raise exception 'RATE_LIMIT';end if;
 if (p_anime->>'mal_id')::integer<1 or length(p_anime->>'title') not between 1 and 300 then raise exception 'ANIME_INVALID';end if;
 insert into public.alm_recommendations(sender,recipient,anime,message) values(u,p_recipient,jsonb_build_object('mal_id',(p_anime->>'mal_id')::integer,'title',p_anime->>'title'),p_message) returning id into v;return v;end;$$;
create function alm_private.read_recommendation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;update public.alm_recommendations set read_at=coalesce(read_at,now()) where id=p_id and recipient=auth.uid();end;$$;
-- Privileged routines are not in an exposed schema; revoke default PUBLIC execution.
revoke all on all functions in schema alm_private from public,anon;
grant execute on all functions in schema alm_private to authenticated;
create function public.alm_publish_profile(p_profile jsonb,p_items jsonb,p_dna jsonb,p_activity jsonb) returns void language sql security invoker set search_path='' as $$select alm_private.publish_profile(p_profile,p_items,p_dna,p_activity)$$;
create function public.alm_withdraw_profile() returns void language sql security invoker set search_path='' as $$select alm_private.withdraw_profile()$$;
create function public.alm_request_friend(p_handle text) returns uuid language sql security invoker set search_path='' as $$select alm_private.request_friend(p_handle)$$;
create function public.alm_friend_action(p_id uuid,p_action text) returns void language sql security invoker set search_path='' as $$select alm_private.friend_action(p_id,p_action)$$;
create function public.alm_friend_cards() returns jsonb language sql security invoker set search_path='' as $$select alm_private.friend_cards()$$;
create function public.alm_recommend(p_recipient uuid,p_anime jsonb,p_message text) returns uuid language sql security invoker set search_path='' as $$select alm_private.recommend(p_recipient,p_anime,p_message)$$;
create function public.alm_read_recommendation(p_id uuid) returns void language sql security invoker set search_path='' as $$select alm_private.read_recommendation(p_id)$$;
revoke execute on function public.alm_publish_profile(jsonb,jsonb,jsonb,jsonb),public.alm_withdraw_profile(),public.alm_request_friend(text),public.alm_friend_action(uuid,text),public.alm_friend_cards(),public.alm_recommend(uuid,jsonb,text),public.alm_read_recommendation(uuid) from public,anon;
grant execute on function public.alm_publish_profile(jsonb,jsonb,jsonb,jsonb),public.alm_withdraw_profile(),public.alm_request_friend(text),public.alm_friend_action(uuid,text),public.alm_friend_cards(),public.alm_recommend(uuid,jsonb,text),public.alm_read_recommendation(uuid) to authenticated;
commit;

