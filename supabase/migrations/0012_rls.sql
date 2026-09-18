-- ---------------------------------------------------------------------------
-- 0012 — Row level security
-- ---------------------------------------------------------------------------
-- RLS is the floor, not the whole authorization story. Domain services perform
-- their own explicit permission checks (ARCH-5) because a policy cannot express
-- rules like "only inside an atomic save" or "only if the candidate version
-- still matches". What RLS guarantees is that a bug in the application layer,
-- or a leaked anon key, cannot read another clinic's patients.
--
-- Default posture: deny. Every table gets RLS enabled; nothing is readable
-- without an explicit policy. Server-side clinical writes run through the
-- service role, which bypasses RLS by design and is never exposed to the
-- browser (see src/core/db).
--
-- Role matrix implemented here (docs/development-foundation.md §5):
--
--   DOCTOR     full clinical read; verification and issuing
--   NURSE      registration, visits, vitals, uploads — NOT prescriptions
--   ASSISTANT  uploads and candidate correction; minimal identity lookup
--   ADMIN      membership management only. NOT clinical access.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere, including tables whose policies come later. A table
-- with RLS enabled and no policy denies everything, which is the correct
-- failure direction.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'clinics', 'staff_users', 'clinic_memberships',
    'patients', 'patient_allergies', 'patient_contacts',
    'pregnancies', 'obstetric_history',
    'visits', 'visit_vitals', 'visit_drafts', 'visit_amendments',
    'report_uploads', 'extraction_runs', 'report_candidates', 'report_reviews',
    'observations', 'finding_pins', 'scan_reports',
    'prescriptions', 'visit_advice', 'medication_administrations',
    'immunizations', 'anti_d_events',
    'voice_queries',
    'referrals', 'referral_access_tokens', 'referral_access_log',
    'consent_records', 'audit_events',
    'outbox_events', 'delivery_attempts', 'idempotency_requests'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity tables
-- ---------------------------------------------------------------------------

-- A member may see the clinics they belong to.
create policy clinics_member_read on clinics
  for select to authenticated
  using (app.is_clinic_member(id));

-- A member may see their own profile, and the profiles of colleagues in a
-- shared clinic — needed to render "verified by Dr X" on a finding.
create policy staff_users_self_read on staff_users
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    or exists (
      select 1
      from clinic_memberships mine
      join clinic_memberships theirs on theirs.clinic_id = mine.clinic_id
      join staff_users me on me.id = mine.user_id
      where me.auth_user_id = auth.uid()
        and theirs.user_id = staff_users.id
        and mine.is_active and theirs.is_active
    )
  );

create policy memberships_read on clinic_memberships
  for select to authenticated
  using (app.is_clinic_member(clinic_id));

-- Only an ADMIN of that clinic may change membership.
create policy memberships_admin_write on clinic_memberships
  for all to authenticated
  using (app.has_clinic_role(clinic_id, array['ADMIN']::clinic_role[]))
  with check (app.has_clinic_role(clinic_id, array['ADMIN']::clinic_role[]));

-- ---------------------------------------------------------------------------
-- Clinical tables — membership-scoped read
-- ---------------------------------------------------------------------------
-- Generated uniformly so no table is accidentally left without a policy.
-- Tables needing a stricter rule are excluded here and handled below.

do $$
declare
  t text;
begin
  foreach t in array array[
    'patients', 'patient_allergies', 'patient_contacts',
    'pregnancies', 'obstetric_history',
    'visits', 'visit_vitals', 'visit_amendments',
    'report_uploads', 'extraction_runs', 'report_candidates', 'report_reviews',
    'observations', 'finding_pins', 'scan_reports',
    'visit_advice', 'medication_administrations',
    'immunizations', 'anti_d_events',
    'voice_queries', 'referrals', 'consent_records'
  ]
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (app.is_clinic_member(clinic_id))',
      t || '_member_read', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stricter: prescriptions
-- ---------------------------------------------------------------------------
-- The authorization matrix excludes nurses and assistants from prescription
-- data by default. A cockpit payload built for a doctor must never be reused
-- verbatim for an assistant just because the query was convenient.

create policy prescriptions_clinical_read on prescriptions
  for select to authenticated
  using (app.has_clinic_role(clinic_id, array['DOCTOR']::clinic_role[]));

-- ---------------------------------------------------------------------------
-- Stricter: visit_drafts
-- ---------------------------------------------------------------------------
-- A draft is one clinician's unfinished thinking. Colleagues do not read it.

create policy visit_drafts_author_access on visit_drafts
  for all to authenticated
  using (
    app.is_clinic_member(clinic_id)
    and author_id = app.current_staff_user_id()
  )
  with check (
    app.is_clinic_member(clinic_id)
    and author_id = app.current_staff_user_id()
  );

-- ---------------------------------------------------------------------------
-- Stricter: audit_events
-- ---------------------------------------------------------------------------
-- Readable by doctors and admins of the clinic for medico-legal review.
-- Deliberately no INSERT policy for authenticated: audit rows are written by
-- the service role inside the same transaction as the clinical write, so an
-- application bug cannot produce a clinical write with no audit trail.

create policy audit_events_review_read on audit_events
  for select to authenticated
  using (app.has_clinic_role(clinic_id, array['DOCTOR', 'ADMIN']::clinic_role[]));

-- Belt and braces alongside the append-only trigger: a trigger can be dropped
-- by whoever owns the table, a revoked privilege cannot be re-granted by the
-- application's own role.
revoke update, delete on audit_events from authenticated, anon;
revoke update, delete on referral_access_log from authenticated, anon;
revoke update, delete on visit_amendments from authenticated, anon;

-- ---------------------------------------------------------------------------
-- No anonymous access, anywhere
-- ---------------------------------------------------------------------------
-- The two unauthenticated entry points — the tokenized referral page and the
-- messaging webhook — are served by server-side code holding the service role,
-- after it has verified the token or the webhook signature. Neither ever hands
-- a database handle to an anonymous caller, so `anon` needs no policies at all
-- and is explicitly stripped of table privileges here.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- Infrastructure tables: service role only
-- ---------------------------------------------------------------------------
-- referral_access_tokens, outbox_events, delivery_attempts and
-- idempotency_requests have RLS enabled and no policies, so authenticated
-- callers cannot touch them. Only the service role, which bypasses RLS, may.
-- Token hashes in particular must never be readable from the browser.

revoke all on referral_access_tokens from authenticated, anon;
revoke all on outbox_events, delivery_attempts, idempotency_requests from authenticated, anon;

comment on table referral_access_tokens is
  'Service role only. RLS enabled with no policy, and privileges revoked from authenticated. Token hashes must never reach a browser.';
