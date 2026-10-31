-- Beta60: identities without library publication, active-session checks and private public-form storage.
begin;
create table alm_private.name_counters(name_key text primary key,next_code bigint not null);
alter table alm_private.name_counters enable row level security;
alter table public.alm_profiles add column name_key text;
alter table public.alm_profiles add column discriminator bigint;
create unique index alm_profile_tag on public.alm_profiles(name_key,discriminator);
create function alm_private.active_actor() returns uuid language sql stable security definer set search_path='' as $$
 select u.id from auth.users u join auth.sessions s on s.user_id=u.id
 where u.id=auth.uid() and u.email_confirmed_at is not null
 and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now());
$$;
create function alm_private.require_actor(p_recent boolean default false) returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=alm_private.active_actor();begin
 if u is null then raise exception 'SESSION_EXPIRED';end if;
 if p_recent and not exists(select 1 from auth.sessions where user_id=u and id::text=auth.jwt()->>'session_id' and created_at>now()-interval '5 minutes') then raise exception 'REAUTH_REQUIRED';end if;
 return u;
end;$$;
create function alm_private.assign_tag() returns trigger language plpgsql security definer set search_path='' as $$
declare k text:=lower(normalize(btrim(new.display_name),NFKC));begin
 if length(k)<1 or length(k)>60 or new.display_name~'[[:cntrl:]#]' then raise exception 'INVALID_INPUT';end if;
 if tg_op='INSERT' or old.name_key is distinct from k or new.discriminator is null then
  insert into alm_private.name_counters values(k,1) on conflict(name_key) do update set next_code=alm_private.name_counters.next_code+1 returning next_code into new.discriminator;
 else new.discriminator:=old.discriminator;end if;
 new.name_key:=k;return new;
end;$$;
create trigger alm_profile_assign_tag before insert or update on public.alm_profiles for each row execute function alm_private.assign_tag();
update public.alm_profiles set display_name=display_name;
alter table public.alm_profiles alter column name_key set not null;
alter table public.alm_profiles alter column discriminator set not null;
create function alm_private.ensure_identity(p_profile jsonb default '{}') returns public.alm_profiles language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();p public.alm_profiles;h text;n text:=coalesce(nullif(btrim(p_profile->>'display_name'),''),'ALM');begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 select * into p from public.alm_profiles where id=u;
 if p.id is null then
  h:=case when (p_profile->>'handle')~'^[a-z0-9_]{3,24}$' and not exists(select 1 from public.alm_profiles where handle=p_profile->>'handle') then p_profile->>'handle' else 'u_'||replace(u::text,'-','') end;insert into public.alm_profiles(id,handle,display_name) values(u,h,n) returning * into p;
 end if;return p;
end;$$;
-- The machine handle remains an internal stable key, not a user-selected name.
alter table public.alm_profiles drop constraint alm_profiles_handle_check;
alter table public.alm_profiles add constraint alm_profiles_handle_check check(handle~'^[a-z0-9_]{3,40}$');
create function alm_private.save_identity(p_profile jsonb) returns public.alm_profiles language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();p public.alm_profiles;begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 if (select count(*) from alm_private.actions where actor=u and kind='profile' and created_at>now()-interval '1 minute')>=10 then raise exception 'RATE_LIMIT';end if;
 insert into alm_private.actions(actor,kind) values(u,'profile');
 perform alm_private.ensure_identity(p_profile);
 update public.alm_profiles set display_name=coalesce(p_profile->>'display_name','ALM'),bio=left(coalesce(p_profile->>'bio',''),240),avatar=coalesce(p_profile->>'avatar','aster'),banner=coalesce(p_profile->>'banner','garden'),accent=coalesce(p_profile->>'accent','violet'),allow_requests=coalesce((p_profile->>'allow_requests')::boolean,true),updated_at=now() where id=u returning * into p;
 return p;
end;$$;
-- Preserve the proven snapshot writer behind a session-checked entry point.
alter function alm_private.publish_profile(jsonb,jsonb,jsonb,jsonb) rename to publish_snapshot_v59;
create function alm_private.publish_profile(p_profile jsonb,p_items jsonb,p_dna jsonb,p_activity jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.alm_profiles;u uuid:=alm_private.require_actor();begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 if (select count(*) from alm_private.actions where actor=u and kind='publish' and created_at>now()-interval '1 minute')>=3 or (select count(*) from alm_private.actions where actor=u and kind='publish' and created_at>now()-interval '1 day')>=100 then raise exception 'RATE_LIMIT';end if;
 insert into alm_private.actions(actor,kind) values(u,'publish');
 p:=alm_private.save_identity(p_profile);
 perform alm_private.publish_snapshot_v59(p_profile||jsonb_build_object('handle',p.handle),p_items,p_dna,p_activity);
end;$$;
alter function alm_private.withdraw_profile() rename to withdraw_snapshot_v59;
create function alm_private.withdraw_profile() returns void language plpgsql security definer set search_path='' as $$
begin perform alm_private.require_actor();perform alm_private.withdraw_snapshot_v59();end;$$;
alter function alm_private.friend_action(uuid,text) rename to friend_action_v59;
create function alm_private.friend_action(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
begin perform alm_private.require_actor();perform alm_private.friend_action_v59(p_id,p_action);end;$$;
alter function alm_private.recommend(uuid,jsonb,text) rename to recommend_v59;
create function alm_private.recommend(p_recipient uuid,p_anime jsonb,p_message text) returns uuid language plpgsql security definer set search_path='' as $$
begin perform alm_private.require_actor();return alm_private.recommend_v59(p_recipient,p_anime,p_message);end;$$;
alter function alm_private.read_recommendation(uuid) rename to read_recommendation_v59;
create function alm_private.read_recommendation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform alm_private.require_actor();perform alm_private.read_recommendation_v59(p_id);end;$$;
create function alm_private.request_friend_v2(p_identifier text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor();v uuid;fid uuid;state text;ident text:=btrim(p_identifier);begin
 perform pg_advisory_xact_lock(hashtext(u::text));
 delete from alm_private.actions where actor=u and created_at<now()-interval '7 days';
 if (select count(*) from alm_private.actions where actor=u and kind='friend' and created_at>now()-interval '1 day')>=20 or (select count(*) from alm_private.actions where actor=u and kind='friend' and created_at>now()-interval '1 minute')>=5 then return jsonb_build_object('ok',false,'code','RATE_LIMIT');end if;
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
create or replace function alm_private.request_friend(p_handle text) returns uuid language sql security definer set search_path='' as $$select (alm_private.request_friend_v2(p_handle)->>'id')::uuid$$;
create or replace function alm_private.can_view(p_owner uuid,p_section text default 'profile') returns boolean language sql stable security definer set search_path='' as $$
 select alm_private.active_actor() is not null and (p_owner=auth.uid() or exists(select 1 from public.alm_profiles p where p.id=p_owner and p.visibility='friends' and alm_private.friends(p_owner) and case p_section when 'profile' then true when 'library' then p.share_library when 'favorites' then p.share_favorites when 'watching' then p.share_watching when 'dna' then p.share_dna when 'activity' then p.share_activity else false end));
$$;
drop policy friendship_read on public.alm_friendships;
create policy friendship_read on public.alm_friendships for select to authenticated using(alm_private.active_actor() in(requester,recipient));
drop policy recommendations_read on public.alm_recommendations;
create policy recommendations_read on public.alm_recommendations for select to authenticated using(alm_private.active_actor() in(sender,recipient));
create or replace function alm_private.friend_cards() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'handle',p.handle,'display_name',p.display_name,'discriminator',p.discriminator,'avatar',p.avatar)),'[]') from public.alm_profiles p where alm_private.active_actor() is not null and exists(select 1 from public.alm_friendships f where auth.uid() in(f.requester,f.recipient) and p.id in(f.requester,f.recipient) and p.id<>auth.uid());
$$;
create function alm_private.sessions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'created_at',s.created_at,'last_seen',coalesce(s.refreshed_at,s.created_at::timestamp),'current',s.id::text=auth.jwt()->>'session_id') order by s.created_at desc),'[]') from auth.sessions s where s.user_id=alm_private.require_actor() and (s.not_after is null or s.not_after>now());
$$;
create function alm_private.revoke_sessions() returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor(true);begin delete from auth.sessions where user_id=u and id::text<>auth.jwt()->>'session_id';end;$$;
create table alm_private.newsletter(id uuid primary key default gen_random_uuid(),email text not null unique check(length(email)<=254),locale text not null default 'fr',confirmed_at timestamptz,token_hash text unique,token_until timestamptz,unsubscribe_hash text unique not null,created_at timestamptz not null default now());
alter table alm_private.newsletter enable row level security;
create function alm_private.delete_account(p_confirm text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=alm_private.require_actor(true);begin
 if p_confirm<>'DELETE' then raise exception 'INVALID_INPUT';end if;
 delete from alm_private.newsletter where email=(select lower(email) from auth.users where id=u);
 delete from auth.users where id=u;
end;$$;
-- Exposed wrappers never take an owner ID for identity, sessions or deletion.
create function public.alm_ensure_identity(p_profile jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select to_jsonb(alm_private.ensure_identity(p_profile))$$;
create function public.alm_save_identity(p_profile jsonb) returns jsonb language sql security invoker set search_path='' as $$select to_jsonb(alm_private.save_identity(p_profile))$$;
create function public.alm_request_friend_v2(p_identifier text) returns jsonb language sql security invoker set search_path='' as $$select alm_private.request_friend_v2(p_identifier)$$;
create function public.alm_sessions() returns jsonb language sql security invoker set search_path='' as $$select alm_private.sessions()$$;
create function public.alm_revoke_other_sessions() returns void language sql security invoker set search_path='' as $$select alm_private.revoke_sessions()$$;
create function public.alm_delete_account(p_confirm text) returns void language sql security invoker set search_path='' as $$select alm_private.delete_account(p_confirm)$$;
-- Public-form counters are durable across server instances and contain no raw IP address.
create table alm_private.public_actions(id bigint generated always as identity primary key,fingerprint text not null check(length(fingerprint)=64),kind text not null check(kind in('contact','newsletter')),created_at timestamptz not null default now());
create index alm_public_actions_key on alm_private.public_actions(fingerprint,kind,created_at);
alter table alm_private.public_actions enable row level security;
create function public.alm_claim_public_action(p_fingerprint text,p_kind text) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if length(p_fingerprint)<>64 or p_kind not in('contact','newsletter') then return false;end if;
 perform pg_advisory_xact_lock(hashtext('alm-public-global'));
 delete from alm_private.public_actions where created_at<now()-interval '7 days';
 if (select count(*) from alm_private.public_actions where created_at>now()-interval '1 day')>=30 or (select count(*) from alm_private.public_actions where fingerprint=p_fingerprint and kind=p_kind and created_at>now()-interval '1 hour')>=3 then return false;end if;
 insert into alm_private.public_actions(fingerprint,kind) values(p_fingerprint,p_kind);return true;
end;$$;
create function public.alm_newsletter_prepare(p_email text,p_locale text,p_token_hash text,p_unsubscribe_hash text,p_id uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare i uuid;begin
 if p_email<>lower(p_email) or length(p_email)>254 or p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_token_hash)<>64 or length(p_unsubscribe_hash)<>64 then raise exception 'INVALID_INPUT';end if;
 insert into alm_private.newsletter(id,email,locale,token_hash,token_until,unsubscribe_hash) values(p_id,p_email,p_locale,p_token_hash,now()+interval '24 hours',p_unsubscribe_hash) on conflict(email) do update set token_hash=excluded.token_hash,token_until=excluded.token_until where alm_private.newsletter.confirmed_at is null returning id into i;return i;
end;$$;
create function public.alm_newsletter_action(p_hash text,p_action text) returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;begin
 if length(p_hash)<>64 then return false;end if;
 if p_action='confirm' then update alm_private.newsletter set confirmed_at=now(),token_hash=null,token_until=null where token_hash=p_hash and token_until>now();
 elsif p_action='unsubscribe' then delete from alm_private.newsletter where unsubscribe_hash=p_hash;
 else return false;end if;get diagnostics n=row_count;return n>0;
end;$$;
create function public.alm_newsletter_unsubscribe_key(p_id uuid,p_hash text) returns void language sql security invoker set search_path='' as $$
 update alm_private.newsletter set unsubscribe_hash=p_hash where id=p_id and length(p_hash)=64;
$$;
create table alm_private.denied_email_domains(domain text primary key);
alter table alm_private.denied_email_domains enable row level security;
create policy auth_domain_rules on alm_private.denied_email_domains for select to supabase_auth_admin using(true);
insert into alm_private.denied_email_domains values('yopmail.com'),('yopmail.fr'),('yopmail.net'),('mailinator.com'),('guerrillamail.com'),('guerrillamail.net'),('sharklasers.com'),('grr.la'),('10minutemail.com'),('tempmail.com'),('throwawaymail.com');
create function alm_private.before_user_created(event jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d text:=lower(split_part(event->'user'->>'email','@',2));begin
 if exists(select 1 from alm_private.denied_email_domains b where d=b.domain or right(d,length(b.domain)+1)='.'||b.domain) then return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','ALM_EMAIL_DOMAIN'));end if;
 return '{}';
end;$$;
create function public.alm_email_allowed(p_email text) returns boolean language sql security invoker set search_path='' as $$
 select not exists(select 1 from alm_private.denied_email_domains b where lower(split_part(p_email,'@',2))=b.domain or right(lower(split_part(p_email,'@',2)),length(b.domain)+1)='.'||b.domain);
$$;
-- Default function privileges are deliberately closed, with precise grants below.
revoke all on all tables in schema alm_private from public,anon,authenticated;
revoke execute on all functions in schema alm_private from public,anon,authenticated;
grant execute on function alm_private.friends(uuid),alm_private.can_view(uuid,text),alm_private.showcase(uuid,integer),alm_private.active_actor(),alm_private.require_actor(boolean),alm_private.ensure_identity(jsonb),alm_private.save_identity(jsonb),alm_private.publish_profile(jsonb,jsonb,jsonb,jsonb),alm_private.withdraw_profile(),alm_private.request_friend(text),alm_private.request_friend_v2(text),alm_private.friend_action(uuid,text),alm_private.friend_cards(),alm_private.recommend(uuid,jsonb,text),alm_private.read_recommendation(uuid),alm_private.sessions(),alm_private.revoke_sessions(),alm_private.delete_account(text) to authenticated;
revoke execute on function public.alm_ensure_identity(jsonb),public.alm_save_identity(jsonb),public.alm_request_friend_v2(text),public.alm_sessions(),public.alm_revoke_other_sessions(),public.alm_delete_account(text) from public,anon;
grant execute on function public.alm_ensure_identity(jsonb),public.alm_save_identity(jsonb),public.alm_request_friend_v2(text),public.alm_sessions(),public.alm_revoke_other_sessions(),public.alm_delete_account(text) to authenticated;
revoke execute on function public.alm_claim_public_action(text,text),public.alm_newsletter_prepare(text,text,text,text,uuid),public.alm_newsletter_action(text,text),public.alm_newsletter_unsubscribe_key(uuid,text),public.alm_email_allowed(text) from public,anon,authenticated;
grant usage on schema alm_private to service_role,supabase_auth_admin;
grant all on alm_private.public_actions,alm_private.newsletter to service_role;
grant usage on sequence alm_private.public_actions_id_seq to service_role;
grant execute on function public.alm_claim_public_action(text,text),public.alm_newsletter_prepare(text,text,text,text,uuid),public.alm_newsletter_action(text,text),public.alm_newsletter_unsubscribe_key(uuid,text),public.alm_email_allowed(text) to service_role;
grant select on alm_private.denied_email_domains to supabase_auth_admin,service_role;
grant execute on function alm_private.before_user_created(jsonb) to supabase_auth_admin;
commit;
