-- ---------------------------------------------------------------------------
-- 0014 — Pin search_path on the trigger and guard functions
-- ---------------------------------------------------------------------------
-- Raised by Supabase's database linter (0011_function_search_path_mutable)
-- against the live project.
--
-- The helpers added in 0001 and the guards in 0006 and 0010 were created
-- without `set search_path`, so they resolve unqualified names using whatever
-- search_path the calling role happens to have. The authorization helpers in
-- 0002 already pin theirs — these were simply missed.
--
-- Why it matters here, even though these are SECURITY INVOKER: they are trigger
-- functions, so they run on essentially every clinical write, under whatever
-- role performed it. A role that can create objects in a schema earlier in its
-- own search_path could shadow a name these functions depend on and change what
-- an append-only guard or an immutability guard actually does. The guards are
-- the enforcement behind "an audit row cannot be edited" and "an issued
-- referral is frozen", so they are the last functions in this schema that
-- should resolve names ambiguously.
--
-- `alter function ... set search_path` changes only that setting; the bodies are
-- untouched, so this migration is safe to apply to a database already carrying
-- data.
-- ---------------------------------------------------------------------------

alter function app.touch_row()                 set search_path = public, pg_temp;
alter function app.attach_touch_trigger(regclass) set search_path = public, pg_temp;
alter function app.forbid_mutation()           set search_path = public, pg_temp;
alter function app.guard_upload_immutability() set search_path = public, pg_temp;
alter function app.guard_referral_snapshot()   set search_path = public, pg_temp;
alter function app.guard_referral_token()      set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Deliberately NOT addressed here
-- ---------------------------------------------------------------------------
-- The linter also reports, and these are answered rather than silenced:
--
--   rls_enabled_no_policy on referral_access_tokens, outbox_events,
--   delivery_attempts, idempotency_requests and referral_access_log.
--   This is the intended posture, stated in 0012: RLS enabled with no policy
--   denies everything, and privileges are additionally revoked from
--   authenticated and anon. Only the service role reaches these tables. Adding
--   a policy to quiet the linter would weaken them.
--
--   extension_in_public for `citext`. The `patients.uhid` column depends on
--   this type, so relocating the extension is a data-affecting change, not a
--   tidy-up. Left for a deliberate migration before a pilot.
--
--   auth_leaked_password_protection. A project-level Auth setting, not schema.
--   Worth enabling in the dashboard before real accounts exist.
-- ---------------------------------------------------------------------------
