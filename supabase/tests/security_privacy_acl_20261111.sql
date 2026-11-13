-- Read-only verification after migration on a staging branch.
-- The matrix is a logic regression; run actual two-account integration separately.
DO $$
DECLARE passing boolean;
BEGIN
  WITH cases(status, is_blocker, expected) AS (
    VALUES
      ('accepted'::text, false, true),
      ('pending'::text, false, true),
      ('blocked'::text, true, true),
      ('blocked'::text, false, false)
  )
  SELECT bool_and(
    (status IN ('accepted','pending') OR (status='blocked' AND is_blocker)) = expected
  ) INTO passing FROM cases;
  IF passing IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Privacy status regression';
  END IF;
END;
$$;

-- Migration definition: cards include status predicate and blocked_by restriction.
SELECT pg_get_functiondef('alm_private.friend_cards()'::regprocedure) AS card_function;

-- Relation RLS: blocked row only visible to the person who applied the block.
SELECT policyname, qual
FROM pg_policies
WHERE schemaname='public' AND tablename='alm_friendships'
ORDER BY policyname;

-- Existing tables must remain RLS-enabled and have no destructive client grants.
SELECT c.relname, c.relrowsecurity AS rls_enabled,
       has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon_truncate,
       has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS authenticated_truncate
FROM pg_class c
WHERE c.relnamespace='public'::regnamespace
AND c.relkind IN ('r','p')
AND c.relname LIKE 'alm_%'
ORDER BY c.relname;

-- Future public-table defaults for postgres must not grant client TRUNCATE etc.
SELECT pg_get_userbyid(d.defaclrole) AS creator,
       coalesce(n.nspname,'<global>') AS schema,
       coalesce(x.grantee::regrole::text,'PUBLIC') AS grantee,
       x.privilege_type
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) x
WHERE d.defaclobjtype='r' AND
  (n.nspname='public' OR d.defaclnamespace=0)
  AND pg_get_userbyid(d.defaclrole) IN ('postgres','supabase_admin')
ORDER BY creator,schema,grantee,privilege_type;

