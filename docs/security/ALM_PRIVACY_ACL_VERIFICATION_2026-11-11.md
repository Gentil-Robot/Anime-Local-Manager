# ALM V2: blocked-profile privacy and PostgreSQL ACL verification (2026-11-11)

## Scope and execution

- Baseline source: `publication/v2.0.0-beta-stable`, all 12 existing Supabase migrations.
- Tested on a separate, empty Supabase PostgreSQL 17.11 project in `eu-west-3` on the ALM Free organization.
- The temporary project contained **only two synthetic users** with fabricated email addresses and sessions.
- Migration applied on the test project, then on the **ALM Community production project**.
- Production migration version: `20261111193057`, name `alm_security_privacy_acl`.
- Code migration path: `supabase/migrations/20261111193057_alm_security_privacy_acl.sql`.
- Emergency rollback for friendship display/RLS only: `docs/security/rollback_blocked_profile_privacy_20261111.sql`. Note: rolling back would reintroduce the privacy problem. Future-table ACL hardening is intentionally not rolled back.

## Verified live PostgreSQL behaviors on the isolated project

| Scenario | Before fix | After fix |
| --- | --- | --- |
| Pending friend request A to B | Both can see the card and relation | Both can see the card and relation |
| Accepted friendship | Both can see one card and shared profile | Both can see one card and shared profile |
| A blocks B: B reads A via `alm_friend_cards()` | **One card returned (information exposure reproduced)** | **Zero cards returned** |
| A blocks B: B direct `SELECT` on `alm_friendships` | **One blocked relation returned** | **Zero blocked relations returned** |
| A blocks B: A reads B's card and relation | Visible | Visible, preserving Unblock |
| B attempts to unblock A's block | Not authorized | Rejected (`ACTION_DENIED`) |
| B reads A's friend-only profile while blocked | Not authorized | No row returned |
| B attempts new friend request while blocked | Not allowed | `PROFILE_UNAVAILABLE` |
| A unblocks B | Relation deleted | Relation deleted; no cards remain |
| B sends a fresh request after unblock, A accepts | Supported | Both profiles and cards visible normally |
| Authenticated client with invalid `session_id` | Session invalid | Zero cards and relationships |
| Anonymous access | Denied | Anonymous role cannot SELECT friendships or EXECUTE card RPC |
| Six existing community public tables | RLS ON, no client TRUNCATE | RLS ON, no client TRUNCATE |
| Newly created public table as `postgres` | Excessive default grants | No default `anon` or `authenticated` grants for SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN |

A disposable table used to probe future-table grants was created inside a transaction that was rolled back.

## Production post-deployment verification

The production database confirmed:

- All six current community public tables still have RLS enabled.
- Neither `anon` nor `authenticated` can `TRUNCATE` the existing ALM tables.
- `alm_private.friend_cards()` contains the status and `blocked_by = auth.uid()` filters.
- `friendship_read` RLS policy contains the blocked-relation predicate.
- No default public-table privileges remain for `anon` or `authenticated` when objects are created by `postgres`.
- Supabase migration history includes `20261111193057 / alm_security_privacy_acl` exactly once.
- No real `blocked` friendship rows existed at deployment; real-user blocked-path validation therefore relies on the isolated PostgreSQL integration tests, not a live exploit.

## Remaining follow-up

1. **Supabase-managed `supabase_admin` defaults** remain permissive. The normal `postgres` connection is not a member of that role; do not claim these defaults were hardened. Ensure that future schema changes created by that owner are explicitly reviewed and locked down.
2. Security Advisor still lists **leaked-password protection disabled**. This is a separate Auth configuration task.
3. Nine private-schema `alm_private` tables report RLS enabled without client policies (INFO); they are in a private schema with controlled privileged functions, not automatically exposed.
4. The separate free testing project was **paused** following verification, but the Supabase connector cannot delete projects. Delete it manually in Supabase Dashboard when no longer needed to free the Free-plan project slot.
5. Browser/Electron front-end smoke tests of the newly deployed API were not run through live authenticated UI clients; the tests exercised Supabase SQL functions, authenticated role context, JWT session claims and RLS behavior directly.

No live user records or sessions were altered during this test campaign.
