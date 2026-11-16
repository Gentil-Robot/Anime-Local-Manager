-- ALM Community: diagnostic only. No DDL, user rows, secrets or exploit attempts.
BEGIN TRANSACTION READ ONLY;

SELECT version() AS full_version,
       current_setting('server_version') AS server_version,
       current_setting('server_version_num')::integer AS server_version_num,
       CASE
         WHEN current_setting('server_version_num')::integer BETWEEN 170012 AND 179999
           THEN 'PostgreSQL 17: upstream fix included by version'
         WHEN current_setting('server_version_num')::integer BETWEEN 170000 AND 170011
           THEN 'PostgreSQL 17: upgrade or provider backport confirmation required'
         ELSE 'Other major: compare against the official advisory'
       END AS cve_2026_116304_version_check;

SELECT name, setting, source
FROM pg_settings
WHERE name IN ('max_parallel_workers_per_gather', 'max_parallel_workers', 'max_worker_processes')
ORDER BY name;

-- Supabase API roles are distinct from a direct database login.
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'authenticator', 'service_role')
ORDER BY rolname;

-- Schema metadata only. Review intentional private tables without weakening RLS.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'alm_private') AND c.relkind IN ('r', 'p')
ORDER BY n.nspname, c.relname;

COMMIT;
