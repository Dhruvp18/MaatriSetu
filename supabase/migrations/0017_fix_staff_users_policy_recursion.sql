-- ---------------------------------------------------------------------------
-- 0017 — Fix infinite recursion in the staff_users read policy
-- ---------------------------------------------------------------------------
-- DEFECT
-- ------
-- `staff_users_self_read` (migration 0012) joined `staff_users` inside its own
-- USING clause, to find the caller's staff row:
--
--     join staff_users me on me.id = mine.user_id
--     where me.auth_user_id = auth.uid()
--
-- Evaluating the policy therefore required reading `staff_users`, which
-- required evaluating the policy. PostgreSQL detects this and every SELECT on
-- the table fails with:
--
--     infinite recursion detected in policy for relation "staff_users"
--
-- IMPACT
-- ------
-- Total, and silent in the worst way. Resolving a session reads `staff_users`
-- first, so every sign-in — for every role — failed that lookup and fell
-- through to the NO_MEMBERSHIP branch. The user authenticates successfully and
-- is then told they have no clinic access, which reads like a data problem
-- rather than a policy bug.
--
-- WHY IT WAS NOT CAUGHT
-- ---------------------
-- `pnpm verify:schema` connects as `postgres`, which holds BYPASSRLS, so
-- policies are never evaluated and the recursion never triggers. The README
-- already notes that script does not cover RLS behaviour under a real user
-- session; this is precisely that gap. A regression check now runs the query
-- as `authenticated` in tests/integration/schema-invariants.sql.
--
-- FIX
-- ---
-- Resolve the caller's staff row through `app.current_staff_user_id()`, which
-- is SECURITY DEFINER and owned by a BYPASSRLS role. It reads `staff_users`
-- without re-entering the policy, so the cycle is broken.
--
-- The visibility rule itself is unchanged: you may read your own profile, and
-- the profiles of colleagues with whom you share an active clinic membership.
-- That second clause is what lets the cockpit render "verified by Dr X".
-- ---------------------------------------------------------------------------

drop policy if exists staff_users_self_read on staff_users;

create policy staff_users_self_read on staff_users
  for select to authenticated
  using (
    -- Your own profile. Cheap, and the common case.
    auth_user_id = auth.uid()
    -- Or a colleague in a clinic where you hold an active membership.
    or exists (
      select 1
      from clinic_memberships mine
      join clinic_memberships theirs on theirs.clinic_id = mine.clinic_id
      where mine.user_id = app.current_staff_user_id()
        and theirs.user_id = staff_users.id
        and mine.is_active
        and theirs.is_active
    )
  );

comment on policy staff_users_self_read on staff_users is
  'Own profile, plus colleagues sharing an active clinic. Must resolve the caller via app.current_staff_user_id() (SECURITY DEFINER) — querying staff_users inline here recurses and breaks every read on the table.';
