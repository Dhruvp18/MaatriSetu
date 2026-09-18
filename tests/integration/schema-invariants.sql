-- ---------------------------------------------------------------------------
-- Schema invariant checks
-- ---------------------------------------------------------------------------
-- Asserts that the patient-safety properties the design claims are actually
-- enforced by the database, not merely intended. Run against a migrated and
-- seeded database:
--
--   psql -f tests/integration/schema-invariants.sql
--
-- Each negative check runs inside a plpgsql exception block, which is a
-- subtransaction, so a statement that succeeds when it should have failed is
-- rolled back rather than polluting the database.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.must_fail(label text, stmt text)
returns text
language plpgsql
as $$
begin
  execute stmt;
  return 'FAIL  ' || label || '  (statement was accepted but should have been rejected)';
exception
  when others then
    return 'ok    ' || label;
end;
$$;

create or replace function pg_temp.must_equal(label text, actual anyelement, expected anyelement)
returns text
language plpgsql
as $$
begin
  if actual is not distinct from expected then
    return 'ok    ' || label;
  end if;
  return 'FAIL  ' || label || '  (expected ' || expected::text || ', got ' || actual::text || ')';
end;
$$;

\echo ''
\echo '=== Trends read from verified observations, not from pins ==='

-- The whole reason observations and finding_pins are separate tables. If the
-- sparkline drew from pins, this patient's trend would show one point instead
-- of three, and the fall from 11.2 would be invisible.
select pg_temp.must_equal(
  'three verified haemoglobin values exist',
  (select count(*) from observations
    where pregnancy_id = '55555555-5555-4555-8555-00000000000a'
      and test_code = 'hb' and superseded_at is null),
  3::bigint
);

select pg_temp.must_equal(
  'only one of them is pinned',
  (select count(*) from finding_pins
    where pregnancy_id = '55555555-5555-4555-8555-00000000000a'
      and unpinned_at is null),
  1::bigint
);

\echo ''
\echo '=== Units are mandatory on numeric results ==='

select pg_temp.must_fail(
  'numeric observation without units is rejected',
  $stmt$
    insert into observations (clinic_id, patient_id, pregnancy_id, category,
      test_code, test_name, value_numeric, observed_date, source,
      source_upload_id, verified_by)
    values ('11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a',
      '55555555-5555-4555-8555-00000000000a', 'HEMATOLOGY',
      'hb', 'Haemoglobin', 7.4, current_date, 'EXTRACTED_VERIFIED',
      '88888888-8888-4888-8888-000000000003',
      '33333333-3333-4333-8333-000000000001')
  $stmt$
);

\echo ''
\echo '=== Extracted values must carry provenance ==='

select pg_temp.must_fail(
  'extracted observation with no source document is rejected',
  $stmt$
    insert into observations (clinic_id, patient_id, pregnancy_id, category,
      test_code, test_name, value_numeric, unit_original, unit_normalized,
      observed_date, source, verified_by)
    values ('11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a',
      '55555555-5555-4555-8555-00000000000a', 'HEMATOLOGY',
      'hb', 'Haemoglobin', 7.4, 'g/dL', 'g/dL', current_date,
      'EXTRACTED_VERIFIED', '33333333-3333-4333-8333-000000000001')
  $stmt$
);

\echo ''
\echo '=== One active pregnancy, one open visit ==='

select pg_temp.must_fail(
  'a second active pregnancy for the same patient is rejected',
  $stmt$
    insert into pregnancies (clinic_id, patient_id, status, gravida)
    values ('11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a', 'ACTIVE', 3)
  $stmt$
);

-- Guards against a double-clicked "Start visit" creating two encounters.
select pg_temp.must_fail(
  'a second open visit for the same pregnancy is rejected',
  $stmt$
    insert into visits (clinic_id, patient_id, pregnancy_id, status)
    values ('11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a',
      '55555555-5555-4555-8555-00000000000a', 'OPEN');
    insert into visits (clinic_id, patient_id, pregnancy_id, status)
    values ('11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a',
      '55555555-5555-4555-8555-00000000000a', 'OPEN')
  $stmt$
);

\echo ''
\echo '=== Tenant isolation is structural ==='

select pg_temp.must_fail(
  'a pregnancy referencing a patient in another clinic is rejected',
  $stmt$
    insert into clinics (id, name) values
      ('99999999-9999-4999-8999-000000000001', 'Other Clinic');
    insert into pregnancies (clinic_id, patient_id, status, gravida)
    values ('99999999-9999-4999-8999-000000000001',
      '44444444-4444-4444-8444-00000000000a', 'ACTIVE', 1)
  $stmt$
);

\echo ''
\echo '=== Clinical history is append-only ==='

select pg_temp.must_fail(
  'updating an audit event is rejected',
  $stmt$
    insert into audit_events (id, clinic_id, actor_staff_user_id, action,
      entity_table, entity_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      '11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001', 'test.action', 'visits', null);
    update audit_events set action = 'tampered'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'
  $stmt$
);

select pg_temp.must_fail(
  'deleting an audit event is rejected',
  $stmt$
    insert into audit_events (id, clinic_id, actor_staff_user_id, action,
      entity_table, entity_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
      '11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001', 'test.action', 'visits', null);
    delete from audit_events where id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002'
  $stmt$
);

\echo ''
\echo '=== An issued referral is frozen ==='

select pg_temp.must_fail(
  'editing an issued referral snapshot is rejected',
  $stmt$
    insert into referrals (id, clinic_id, patient_id, pregnancy_id, status,
      issued_snapshot, snapshot_schema_version, issued_by, issued_at, created_by)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
      '11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a',
      '55555555-5555-4555-8555-00000000000a', 'ISSUED',
      '{"indication":"Severe pre-eclampsia"}'::jsonb, 1,
      '33333333-3333-4333-8333-000000000001', now(),
      '33333333-3333-4333-8333-000000000001');
    update referrals set issued_snapshot = '{"indication":"changed"}'::jsonb
      where id = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001'
  $stmt$
);

select pg_temp.must_fail(
  'an ISSUED referral with no snapshot is rejected',
  $stmt$
    insert into referrals (clinic_id, patient_id, pregnancy_id, status, created_by)
    values ('11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a',
      '55555555-5555-4555-8555-00000000000a', 'ISSUED',
      '33333333-3333-4333-8333-000000000001')
  $stmt$
);

\echo ''
\echo '=== Source documents are immutable ==='

select pg_temp.must_fail(
  'altering a stored slip object key is rejected',
  $stmt$
    update report_uploads set object_key = 'seed/tampered.jpg'
      where id = '88888888-8888-4888-8888-000000000003'
  $stmt$
);

select pg_temp.must_fail(
  'moving a live report to another patient without quarantine is rejected',
  $stmt$
    update report_uploads set patient_id = '44444444-4444-4444-8444-00000000000b'
      where id = '88888888-8888-4888-8888-000000000003'
  $stmt$
);

\echo ''
\echo '=== Doses actually given ==='

select pg_temp.must_fail(
  'a dose recorded in the future is rejected',
  $stmt$
    insert into medication_administrations (clinic_id, patient_id, pregnancy_id,
      medicine_name, dose_amount, dose_unit, route, administered_at, recorded_by)
    values ('11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a',
      '55555555-5555-4555-8555-00000000000a',
      'Magnesium sulphate', 4, 'g', 'IV', now() + interval '2 days',
      '33333333-3333-4333-8333-000000000002')
  $stmt$
);

select pg_temp.must_fail(
  'a dose without a unit is rejected',
  $stmt$
    insert into medication_administrations (clinic_id, patient_id, pregnancy_id,
      medicine_name, dose_amount, dose_unit, route, administered_at, recorded_by)
    values ('11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a',
      '55555555-5555-4555-8555-00000000000a',
      'Magnesium sulphate', 4, '', 'IV', now(),
      '33333333-3333-4333-8333-000000000002')
  $stmt$
);

\echo ''
\echo '=== Unknown is a value, not an absence ==='

-- Sunita has a known allergy; Rehana has been asked and has none; Lakshmi has
-- not been asked. All three are distinguishable, which is what stops a blank
-- field rendering as "no allergies" on a referral slip.
select pg_temp.must_equal(
  'three distinct allergy states are representable',
  (select count(distinct allergy_status) from patients),
  3::bigint
);

select pg_temp.must_equal(
  'a pregnancy may have no dating established',
  (select dating_method::text from pregnancies
    where id = '55555555-5555-4555-8555-00000000000c'),
  'UNKNOWN'
);

\echo ''
\echo '=== Voice queries never auto-attach on an unverified number ==='

select pg_temp.must_equal(
  'the unmatched message has no patient',
  (select patient_id from voice_queries where provider_message_id = 'seed-msg-0002'),
  null::uuid
);

select pg_temp.must_fail(
  'a VERIFIED association without a patient is rejected',
  $stmt$
    insert into voice_queries (clinic_id, association_status, channel,
      provider_message_id, processing_state)
    values ('11111111-1111-4111-8111-000000000001', 'VERIFIED', 'WHATSAPP',
      'test-msg-bad', 'READY')
  $stmt$
);

select pg_temp.must_fail(
  'a duplicate provider message id is rejected',
  $stmt$
    insert into voice_queries (clinic_id, association_status, channel,
      provider_message_id, processing_state)
    values ('11111111-1111-4111-8111-000000000001', 'UNMATCHED', 'WHATSAPP',
      'seed-msg-0001', 'READY')
  $stmt$
);

select pg_temp.must_fail(
  'a failed transcription cannot be bucketed as informational',
  $stmt$
    insert into voice_queries (clinic_id, association_status, channel,
      provider_message_id, processing_state, processing_error, routing_bucket)
    values ('11111111-1111-4111-8111-000000000001', 'UNMATCHED', 'WHATSAPP',
      'test-msg-failed', 'FAILED', 'stt timeout', 'INFORMATIONAL')
  $stmt$
);

\echo ''
\echo '=== Optimistic concurrency ==='

-- The version counter is maintained by trigger so an application UPDATE cannot
-- forget it, which is what makes the Save & Next conflict check trustworthy.
do $$
declare
  before_version integer;
  after_version  integer;
begin
  select version into before_version from patients
    where id = '44444444-4444-4444-8444-00000000000a';

  update patients set full_name = full_name
    where id = '44444444-4444-4444-8444-00000000000a';

  select version into after_version from patients
    where id = '44444444-4444-4444-8444-00000000000a';

  if after_version = before_version + 1 then
    raise notice 'ok    version increments automatically on update';
  else
    raise notice 'FAIL  version did not increment (% -> %)', before_version, after_version;
  end if;
end;
$$;

\echo ''
\echo '=== Idempotency and outbox deduplication ==='

select pg_temp.must_fail(
  'a duplicate outbox dedupe key is rejected',
  $stmt$
    insert into outbox_events (clinic_id, event_type, payload, dedupe_key)
    values ('11111111-1111-4111-8111-000000000001', 'visit.summary',
      '{}'::jsonb, 'dup-key-1');
    insert into outbox_events (clinic_id, event_type, payload, dedupe_key)
    values ('11111111-1111-4111-8111-000000000001', 'visit.summary',
      '{}'::jsonb, 'dup-key-1')
  $stmt$
);

select pg_temp.must_fail(
  'a repeated idempotency key for the same operation is rejected',
  $stmt$
    insert into idempotency_requests (clinic_id, actor_staff_user_id, operation,
      request_key, payload_hash)
    values ('11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001', 'visit.save_next', 'key-1',
      decode('00','hex'));
    insert into idempotency_requests (clinic_id, actor_staff_user_id, operation,
      request_key, payload_hash)
    values ('11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001', 'visit.save_next', 'key-1',
      decode('11','hex'))
  $stmt$
);

\echo ''
\echo '=== Row level security is enabled everywhere ==='

select pg_temp.must_equal(
  'no public table has RLS disabled',
  (select count(*) from pg_tables t
    join pg_class c on c.relname = t.tablename
    where t.schemaname = 'public' and not c.relrowsecurity),
  0::bigint
);

\echo ''
\echo '=== Patient registration is one transaction (migration 0013) ==='

-- Registering a mother writes to four tables. The point of the routine is that
-- a partial result is unreachable: a patient with no contacts, or a clinical
-- write with no audit row, must not be a state the application can produce.
--
-- Note the shape of these checks: the routine is called in its own statement,
-- and the assertions follow in separate ones. Folding the call into the
-- assertion's own query lets the planner evaluate the uncorrelated count as an
-- InitPlan, i.e. before the call it is supposed to be measuring, and the check
-- then reports zero no matter what the routine did.

create or replace function pg_temp.register_demo(p_uhid text, p_phone text)
returns uuid
language sql
as $$
  select public.register_patient(
    '11111111-1111-4111-8111-000000000001',
    '33333333-3333-4333-8333-000000000002',
    'req-invariant-1',
    p_uhid, 'Invariant Test Patient',
    null, 24, current_date,
    null, 'NOT_PROVIDED',
    'KNOWN',
    'B_POS', 'STAFF_ENTERED', current_date,
    '[{"substance":"Sulfa","reaction":"Rash","severity":"MILD","source":"PATIENT_REPORTED"}]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'phone', p_phone, 'relationship', 'SELF',
      'contactName', 'Invariant Test Patient',
      'isPrimary', true, 'hasMessagingConsent', true))
  );
$$;

do $$ begin perform pg_temp.register_demo('INV-0001', '+919833100777'); end $$;

select pg_temp.must_equal(
  'registration creates the patient',
  (select count(*) from patients where uhid = 'INV-0001'),
  1::bigint
);

select pg_temp.must_equal(
  'registration creates her allergy row',
  (select count(*) from patient_allergies a join patients p on p.id = a.patient_id
    where p.uhid = 'INV-0001'),
  1::bigint
);

select pg_temp.must_equal(
  'registration creates her contact',
  (select count(*) from patient_contacts c join patients p on p.id = c.patient_id
    where p.uhid = 'INV-0001'),
  1::bigint
);

select pg_temp.must_equal(
  'registration writes exactly one audit row',
  (select count(*) from audit_events e join patients p on p.id = e.entity_id
    where p.uhid = 'INV-0001' and e.action = 'patient.registered'),
  1::bigint
);

select pg_temp.must_equal(
  'messaging consent is recorded as a time, not a flag',
  (select messaging_consent_at is not null
     from patient_contacts c join patients p on p.id = c.patient_id
    where p.uhid = 'INV-0001'),
  true
);

select pg_temp.must_equal(
  'a contact created at the counter is NOT verified for inbound matching',
  (select verified_at is null
     from patient_contacts c join patients p on p.id = c.patient_id
    where p.uhid = 'INV-0001'),
  true
);

select pg_temp.must_fail(
  'a second patient on the same UHID in the same clinic is rejected',
  $stmt$ select pg_temp.register_demo('INV-0001', '+919833100778') $stmt$
);

select pg_temp.must_fail(
  'a malformed phone number rejects the whole registration',
  $stmt$ select pg_temp.register_demo('INV-0002', '12345') $stmt$
);

-- The real assertion: the failure above left nothing behind. If the routine
-- were four separate statements, the patient row would have survived it.
select pg_temp.must_equal(
  'the rejected registration left no orphan patient',
  (select count(*) from patients where uhid = 'INV-0002'),
  0::bigint
);

\echo ''
\echo '=== The file sticker is revocable and clinic-scoped ==='

do $$
begin
  perform public.issue_patient_qr(
    '11111111-1111-4111-8111-000000000001',
    '33333333-3333-4333-8333-000000000002',
    'req-invariant-2',
    (select id from patients where uhid = 'INV-0001'),
    encode(digest('sticker-invariant-1', 'sha256'), 'hex'));
end $$;

select pg_temp.must_equal(
  'a scanned sticker resolves to its patient',
  (select public.find_patient_by_qr(
     '11111111-1111-4111-8111-000000000001',
     '33333333-3333-4333-8333-000000000002',
     'req-invariant-3',
     encode(digest('sticker-invariant-1', 'sha256'), 'hex'))),
  (select id from patients where uhid = 'INV-0001')
);

-- A file found in the wrong hands raises the question "who scanned it, when".
-- That answer has to already exist.
select pg_temp.must_equal(
  'the scan above was audited',
  (select count(*) from audit_events e join patients p on p.id = e.entity_id
    where p.uhid = 'INV-0001' and e.action = 'patient.qr_scanned'),
  1::bigint
);

-- Someone photographing a sticker in another clinic's waiting room learns
-- nothing: the token is scoped, and a miss is silent.
select pg_temp.must_equal(
  'the same sticker resolves to nothing in another clinic',
  (select public.find_patient_by_qr(
     '11111111-1111-4111-8111-0000000000ff',
     '33333333-3333-4333-8333-000000000002',
     'req-invariant-4',
     encode(digest('sticker-invariant-1', 'sha256'), 'hex')) is null),
  true
);

do $$
begin
  perform public.revoke_patient_qr(
    '11111111-1111-4111-8111-000000000001',
    '33333333-3333-4333-8333-000000000002',
    'req-invariant-5',
    (select id from patients where uhid = 'INV-0001'),
    'file lost');
end $$;

select pg_temp.must_equal(
  'a revoked sticker stops opening the record',
  (select public.find_patient_by_qr(
     '11111111-1111-4111-8111-000000000001',
     '33333333-3333-4333-8333-000000000002',
     'req-invariant-6',
     encode(digest('sticker-invariant-1', 'sha256'), 'hex')) is null),
  true
);

select pg_temp.must_equal(
  'a revoked sticker leaves the patient and her history intact',
  (select count(*) from patients where uhid = 'INV-0001'),
  1::bigint
);

select pg_temp.must_equal(
  'revoking twice is a no-op, not an error',
  public.revoke_patient_qr(
    '11111111-1111-4111-8111-000000000001',
    '33333333-3333-4333-8333-000000000002',
    'req-invariant-7',
    (select id from patients where uhid = 'INV-0001'),
    null),
  false
);

\echo ''
\echo '=== The write routines are service-role only ==='

-- These write clinical rows and audit rows. A browser session holds
-- `authenticated`; if it could call them, every check in the service layer
-- would be optional.
select pg_temp.must_equal(
  'no write routine is executable by authenticated or anon',
  (
    select count(*)
    from unnest(array[
      'public.register_patient(uuid, uuid, text, text, text, date, integer, date, text, abha_verification, known_status, blood_group, data_source, date, jsonb, jsonb)',
      'public.issue_patient_qr(uuid, uuid, text, uuid, text)',
      'public.revoke_patient_qr(uuid, uuid, text, uuid, text)',
      'public.find_patient_by_qr(uuid, uuid, text, text)'
    ]) as fn
    cross join unnest(array['authenticated', 'anon']) as grantee
    where has_function_privilege(grantee, fn, 'EXECUTE')
  ),
  0::bigint
);

\echo ''
\echo '=== RLS policies evaluate without recursion (as `authenticated`) ==='

-- Everything above runs as `postgres`, which holds BYPASSRLS, so policies are
-- never evaluated. That blind spot let a self-referential policy on
-- `staff_users` reach the hosted database: it joined `staff_users` inside its
-- own USING clause, so every read on the table raised
-- "infinite recursion detected in policy", and every sign-in silently reported
-- no clinic access (fixed in migration 0017).
--
-- These checks actually assume the `authenticated` role, so a recursive or
-- otherwise non-evaluable policy fails here instead of in production. The stub
-- `auth.uid()` returns NULL, so the correct outcome is zero rows AND no error.

create or replace function pg_temp.readable_as_authenticated(label text, relation text)
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  set local role authenticated;
  execute format('select count(*) from %s', relation) into n;
  reset role;
  return 'ok    ' || label;
exception
  when others then
    reset role;
    return 'FAIL  ' || label || '  (' || sqlerrm || ')';
end;
$$;

select pg_temp.readable_as_authenticated('staff_users policy evaluates', 'staff_users');
select pg_temp.readable_as_authenticated('clinic_memberships policy evaluates', 'clinic_memberships');
select pg_temp.readable_as_authenticated('clinics policy evaluates', 'clinics');
select pg_temp.readable_as_authenticated('patients policy evaluates', 'patients');
select pg_temp.readable_as_authenticated('pregnancies policy evaluates', 'pregnancies');
select pg_temp.readable_as_authenticated('visits policy evaluates', 'visits');
select pg_temp.readable_as_authenticated('observations policy evaluates', 'observations');
select pg_temp.readable_as_authenticated('prescriptions policy evaluates', 'prescriptions');
select pg_temp.readable_as_authenticated('voice_queries policy evaluates', 'voice_queries');
select pg_temp.readable_as_authenticated('referrals policy evaluates', 'referrals');

\echo ''
