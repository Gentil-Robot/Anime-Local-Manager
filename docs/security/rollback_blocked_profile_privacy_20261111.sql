-- ALM 2026-11-11: emergency rollback for profile privacy behavior ONLY.
-- WARNING: this restores the old blocked-user information exposure.
-- Use only if the application critically fails after the security migration.
-- Intentionally does NOT restore permissive future-table ACLs.
BEGIN;
CREATE OR REPLACE FUNCTION alm_private.friend_cards()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'handle',p.handle,'display_name',p.display_name,'discriminator',p.discriminator,'avatar',p.avatar,'avatar_image',p.avatar_image)),'[]')
 from public.alm_profiles p where alm_private.active_actor() is not null and exists(
 select 1 from public.alm_friendships f where auth.uid() in(f.requester,f.recipient) and p.id in(f.requester,f.recipient) and p.id<>auth.uid());
$function$

ALTER POLICY friendship_read ON public.alm_friendships USING (((alm_private.active_actor() = requester) OR (alm_private.active_actor() = recipient)));
COMMIT;
