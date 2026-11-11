-- ALM security hardening: blocked relationship privacy and future table grants.
-- PostgreSQL 17, Supabase ALM Community. Keep this migration pending until staging tests.
--
-- Blocked users cannot read the other participant's card or relationship.
-- The blocker retains access to the card and relationship for the "Unblock" button.
-- Pending requests stay visible to both participants.

CREATE OR REPLACE FUNCTION alm_private.friend_cards()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'id', p.id,
      'handle', p.handle,
      'display_name', p.display_name,
      'discriminator', p.discriminator,
      'avatar', p.avatar,
      'avatar_image', p.avatar_image
    )),
    '[]'::jsonb
  )
  FROM public.alm_profiles AS p
  WHERE alm_private.active_actor() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.alm_friendships AS f
      WHERE auth.uid() IN (f.requester, f.recipient)
        AND p.id IN (f.requester, f.recipient)
        AND p.id <> auth.uid()
        AND (
          f.status IN ('accepted', 'pending')
          OR (f.status = 'blocked' AND f.blocked_by = auth.uid())
        )
    );
$function$;

ALTER POLICY friendship_read ON public.alm_friendships
USING (
  (alm_private.active_actor() = requester OR alm_private.active_actor() = recipient)
  AND (
    status IN ('accepted', 'pending')
    OR (status = 'blocked' AND blocked_by = alm_private.active_actor())
  )
);

-- Applies ONLY to public tables created subsequently by the role "postgres".
-- Existing table permissions remain untouched. New public API tables require
-- deliberate GRANT and RLS policies.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- Note: Supabase-managed role "supabase_admin" has separate defaults, which
-- cannot be modified by this postgres session. Track this residual separately.
