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

\echo ''
\echo '=== The consultation commit is atomic, versioned and idempotent ==='

-- Save & Next is the one write that must be all-or-nothing. These exercise the
-- routine end to end against the seeded patient rather than asserting the
-- constraints behind it in isolation.

do $$
declare
  c_clinic  uuid := '11111111-1111-4111-8111-000000000001';
  c_patient uuid := '44444444-4444-4444-8444-00000000000a';
  c_preg    uuid := '55555555-5555-4555-8555-00000000000a';
  c_doctor  uuid := '33333333-3333-4333-8333-000000000001';
  c_hb_old  uuid := '66666666-6666-4666-8666-00000000000a';

  v_visit    uuid;
  v_version  integer;
  v_first    jsonb;
  v_second   jsonb;
  v_rx_count integer;
  v_advice   integer;
  v_pinned   integer;
begin
  insert into visits (clinic_id, patient_id, pregnancy_id, status, opened_by)
  values (c_clinic, c_patient, c_preg, 'OPEN', c_doctor)
  returning id, version into v_visit, v_version;

  -- First save: commits everything together.
  v_first := public.save_visit_consultation(
    c_clinic, c_doctor, 'inv-1', v_visit, v_version, current_date,
    'Mild anaemia on oral iron. Continue.',
    '[{"medicineName":"Ferrous ascorbate","doseAmount":100,"doseUnit":"mg","form":"Tab","frequency":"OD","foodRelation":"AFTER_FOOD","durationDays":30}]'::jsonb,
    '{"dfkcCounselled":true,"labOrders":["Repeat CBC in 3 weeks"],"nextFollowupDate":null}'::jsonb,
    '[]'::jsonb,
    array[c_hb_old]::uuid[], '{}'::uuid[], '{}'::uuid[],
    'inv-key-1', decode('aa', 'hex')
  );

  if (v_first->>'replayed')::boolean then
    raise notice 'FAIL  first save reported as a replay';
  else
    raise notice 'ok    consultation commits';
  end if;

  select count(*) into v_rx_count from prescriptions where visit_id = v_visit;
  select count(*) into v_advice from visit_advice where visit_id = v_visit;

  if v_rx_count = 1 and v_advice = 1 then
    raise notice 'ok    orders and advice land with the impression';
  else
    raise notice 'FAIL  orders/advice missing (rx=%, advice=%)', v_rx_count, v_advice;
  end if;

  if (select status from visits where id = v_visit) = 'SAVED'
     and (select ga_days_at_visit from visits where id = v_visit) is not null then
    raise notice 'ok    gestational age is frozen at save';
  else
    raise notice 'FAIL  visit not saved, or gestational age not frozen';
  end if;

  -- The same request again: returns the original result, writes nothing more.
  v_second := public.save_visit_consultation(
    c_clinic, c_doctor, 'inv-2', v_visit, v_version, current_date,
    'Mild anaemia on oral iron. Continue.',
    '[{"medicineName":"Ferrous ascorbate","doseAmount":100,"doseUnit":"mg","form":"Tab","frequency":"OD","foodRelation":"AFTER_FOOD","durationDays":30}]'::jsonb,
    '{"dfkcCounselled":true,"labOrders":["Repeat CBC in 3 weeks"],"nextFollowupDate":null}'::jsonb,
    '[]'::jsonb,
    array[c_hb_old]::uuid[], '{}'::uuid[], '{}'::uuid[],
    'inv-key-1', decode('aa', 'hex')
  );

  select count(*) into v_rx_count from prescriptions where visit_id = v_visit;

  if (v_second->>'replayed')::boolean and v_rx_count = 1 then
    raise notice 'ok    a repeated save replays instead of duplicating';
  else
    raise notice 'FAIL  repeat save duplicated work (replayed=%, rx=%)',
      v_second->>'replayed', v_rx_count;
  end if;

  -- Pins are recorded, and audited individually.
  select count(*) into v_pinned
  from finding_pins where observation_id = c_hb_old and unpinned_at is null;

  if v_pinned = 1 and exists (
    select 1 from audit_events where action = 'finding.pinned' and entity_id = c_hb_old
  ) then
    raise notice 'ok    pin decisions commit with the visit and are audited';
  else
    raise notice 'FAIL  pin not recorded or not audited';
  end if;
end;
$$;

-- Reusing a key with different content must be refused outright: applying it
-- would let one clinician's save silently replace another's.
select pg_temp.must_fail(
  'an idempotency key reused with different content is rejected',
  $stmt$
    select public.save_visit_consultation(
      '11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001',
      'inv-3',
      (select id from visits where status = 'SAVED' order by created_at desc limit 1),
      1, current_date, 'Different impression entirely.',
      '[]'::jsonb, null, '[]'::jsonb, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
      'inv-key-1', decode('bb', 'hex')
    )
  $stmt$
);

-- A stale version means someone else changed the visit underneath the editor.
select pg_temp.must_fail(
  'a stale visit version is rejected',
  $stmt$
    insert into visits (id, clinic_id, patient_id, pregnancy_id, status, opened_by)
    values ('cccccccc-cccc-4ccc-8ccc-000000000001',
      '11111111-1111-4111-8111-000000000001',
      '44444444-4444-4444-8444-00000000000a',
      '55555555-5555-4555-8555-00000000000a', 'OPEN',
      '33333333-3333-4333-8333-000000000001');
    select public.save_visit_consultation(
      '11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001',
      'inv-4', 'cccccccc-cccc-4ccc-8ccc-000000000001',
      999, current_date, 'Impression.',
      '[]'::jsonb, null, '[]'::jsonb, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
      'inv-key-stale', decode('cc', 'hex')
    )
  $stmt$
);

-- A saved consultation is corrected by amendment, never by saving over it.
select pg_temp.must_fail(
  'saving an already-saved visit is rejected',
  $stmt$
    select public.save_visit_consultation(
      '11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001',
      'inv-5',
      (select id from visits where status = 'SAVED' order by created_at desc limit 1),
      (select version from visits where status = 'SAVED' order by created_at desc limit 1),
      current_date, 'Saving again.',
      '[]'::jsonb, null, '[]'::jsonb, '{}'::uuid[], '{}'::uuid[], '{}'::uuid[],
      'inv-key-resave', decode('dd', 'hex')
    )
  $stmt$
);

select pg_temp.must_equal(
  'the save routine is not executable by authenticated or anon',
  (
    select count(*)
    from unnest(array['authenticated', 'anon']) as grantee
    where has_function_privilege(
      grantee,
      'public.save_visit_consultation(uuid, uuid, text, uuid, integer, date, text, jsonb, jsonb, jsonb, uuid[], uuid[], uuid[], text, bytea)',
      'EXECUTE'
    )
  ),
  0::bigint
);

\echo ''
\echo ''
\echo '=== An issued referral is a frozen document ==='

-- The referral is the one artefact this system produces that is read by someone
-- with no account and no way to ask a follow-up question. These exercise the
-- routines in 0021 end to end rather than asserting the constraints behind them
-- in isolation.

do $$
declare
  c_clinic  uuid := '11111111-1111-4111-8111-000000000001';
  c_patient uuid := '44444444-4444-4444-8444-00000000000a';
  c_preg    uuid := '55555555-5555-4555-8555-00000000000a';
  c_doctor  uuid := '33333333-3333-4333-8333-000000000001';

  v_draft    uuid;
  v_version  integer;
  v_first    jsonb;
  v_replay   jsonb;
  v_snapshot jsonb;
  v_doses    jsonb;
begin
  -- A dose that was GIVEN. The whole feature turns on this row being the source
  -- of the slip's drug list, rather than the prescriptions seeded against the
  -- same pregnancy.
  insert into medication_administrations (
    clinic_id, patient_id, pregnancy_id, medicine_name,
    dose_amount, dose_unit, route, administered_at, certainty, recorded_by
  ) values (
    c_clinic, c_patient, c_preg, 'Magnesium sulphate',
    4, 'g', 'IV', now() - interval '95 minutes', 'WITNESSED', c_doctor
  );

  v_draft := public.create_referral_draft(
    c_clinic, c_doctor, 'inv-ref-1', c_preg, null, null,
    'Severe pre-eclampsia, BP 170/115 with headache', 'District Hospital'
  );

  select version into v_version from referrals where id = v_draft;

  v_version := public.update_referral_draft(
    c_clinic, c_doctor, 'inv-ref-2', v_draft, v_version,
    null, 'Dr Seeded', '9820000000', 'District Hospital', 'Labour ward 022-0000',
    '108 ambulance', now(),
    'Severe pre-eclampsia, BP 170/115 with headache',
    'Loading dose given. Transferring for definitive care.',
    170, 115, 104, 22, 96, 37.1, 'THREE_PLUS', 140, now(),
    null, null, null, 'NOT_ASSESSED', null, null, null,
    '18G cannula right forearm; Foley in situ', 'Staff nurse escorting'
  );

  v_first := public.issue_referral(
    c_clinic, c_doctor, 'inv-ref-3', v_draft, v_version, current_date, 1
  );

  v_snapshot := v_first->'issued_snapshot';
  v_doses := v_snapshot->'preReferralDoses';

  if (v_first->>'replayed')::boolean then
    raise notice 'FAIL  first issue reported as a replay';
  else
    raise notice 'ok    a draft issues';
  end if;

  -- THE point of the feature. What was given is on the slip; what was merely
  -- ordered is not.
  if jsonb_array_length(v_doses) = 1
     and v_doses->0->>'medicineName' = 'Magnesium sulphate'
     and v_doses->0->>'administeredAt' is not null then
    raise notice 'ok    pre-referral doses come from what was GIVEN, with a time';
  else
    raise notice 'FAIL  pre-referral doses are wrong: %', v_doses;
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_doses) d
    where d->>'medicineName' in ('Ferrous ascorbate', 'Calcium carbonate with Vitamin D3')
  ) then
    raise notice 'ok    prescribed-but-not-given drugs stay off the slip';
  else
    raise notice 'FAIL  a prescription reached the referral slip';
  end if;

  -- Unknowns are written down as values, never omitted.
  if v_snapshot->'patient'->'allergies'->>'status' is not null
     and v_snapshot->'patient'->'bloodGroup'->>'status' is not null
     and v_snapshot->'pregnancy'->'uterineScar'->>'status' is not null
     and v_snapshot->'transferVitals'->>'status' = 'RECORDED'
     and v_snapshot->'examination'->>'status' = 'NOT_PERFORMED' then
    raise notice 'ok    every unknown on the slip is a tagged value';
  else
    raise notice 'FAIL  a field that can be unknown is missing its tag';
  end if;

  if v_snapshot->>'timeZone' is not null then
    raise notice 'ok    the clinic timezone travels with the document';
  else
    raise notice 'FAIL  the snapshot carries no timezone';
  end if;

  -- A double-tapped Issue returns the frozen document instead of failing.
  v_replay := public.issue_referral(
    c_clinic, c_doctor, 'inv-ref-4', v_draft, v_version, current_date, 1
  );

  if (v_replay->>'replayed')::boolean
     and v_replay->'issued_snapshot' = v_snapshot then
    raise notice 'ok    issuing twice replays the same document';
  else
    raise notice 'FAIL  a second issue did not replay';
  end if;

  if exists (
    select 1 from audit_events
    where entity_id = v_draft and action = 'referral.issued'
  ) then
    raise notice 'ok    the issue was audited in the same transaction';
  else
    raise notice 'FAIL  a referral was issued with no audit row';
  end if;
end;
$$;

select pg_temp.must_fail(
  'the frozen snapshot cannot be edited',
  $stmt$
    update referrals set issued_snapshot = '{"tampered":true}'::jsonb
     where status = 'ISSUED'
  $stmt$
);

select pg_temp.must_fail(
  'an issued referral cannot return to draft',
  $stmt$
    update referrals set status = 'DRAFT' where status = 'ISSUED'
  $stmt$
);

select pg_temp.must_fail(
  'an issued referral cannot be edited through the draft routine',
  $stmt$
    select public.update_referral_draft(
      '11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001',
      'inv-ref-5',
      (select id from referrals where status = 'ISSUED' limit 1),
      (select version from referrals where status = 'ISSUED' limit 1),
      null, null, null, 'Somewhere else', null, null, null,
      'Changed my mind', null,
      null, null, null, null, null, null, null, null, null,
      null, null, null, 'NOT_ASSESSED', null, null, null,
      null, null)
  $stmt$
);

select pg_temp.must_fail(
  'a transfer observation with no time is rejected',
  $stmt$
    with d as (
      select public.create_referral_draft(
        '11111111-1111-4111-8111-000000000001',
        '33333333-3333-4333-8333-000000000001',
        'inv-ref-6', '55555555-5555-4555-8555-00000000000a',
        null, null, 'Test', 'Test') as id
    )
    select public.update_referral_draft(
      '11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001',
      'inv-ref-7', d.id, 1,
      null, null, null, null, null, null, null, null, null,
      170, 115, null, null, null, null, null, null, null,
      null, null, null, 'NOT_ASSESSED', null, null, null,
      null, null)
    from d
  $stmt$
);

select pg_temp.must_fail(
  'a referral with no indication cannot be issued',
  $stmt$
    with d as (
      select public.create_referral_draft(
        '11111111-1111-4111-8111-000000000001',
        '33333333-3333-4333-8333-000000000001',
        'inv-ref-8', '55555555-5555-4555-8555-00000000000a',
        null, null, null, 'District Hospital') as id
    )
    select public.issue_referral(
      '11111111-1111-4111-8111-000000000001',
      '33333333-3333-4333-8333-000000000001',
      'inv-ref-9', d.id, 1, current_date, 1)
    from d
  $stmt$
);

\echo ''
\echo '=== Referral links reveal nothing they should not ==='

do $$
declare
  c_clinic uuid := '11111111-1111-4111-8111-000000000001';
  c_doctor uuid := '33333333-3333-4333-8333-000000000001';

  v_referral uuid;
  v_live     jsonb;
  v_token    uuid;
  v_expired  uuid;
  v_result   jsonb;
begin
  select id into v_referral from referrals where status = 'ISSUED' order by issued_at desc limit 1;

  v_live := public.create_referral_token(
    c_clinic, c_doctor, 'inv-ref-10', v_referral,
    encode(digest('token-one', 'sha256'), 'hex'), 4320
  );
  v_token := (v_live->>'token_id')::uuid;

  -- Only a hash is stored. If the raw value were recoverable from the row, a
  -- database dump would be a working key to every referral ever issued.
  if exists (
    select 1 from referral_access_tokens
    where id = v_token and token_hash = digest('token-one', 'sha256')
  ) then
    raise notice 'ok    only the token hash is stored';
  else
    raise notice 'FAIL  the stored token hash is not the hash of the raw value';
  end if;

  v_result := public.log_referral_access(
    encode(digest('token-one', 'sha256'), 'hex'), null, 'invariant-check'
  );

  if (v_result->>'granted')::boolean and v_result->'issued_snapshot' is not null then
    raise notice 'ok    a live token opens the frozen document';
  else
    raise notice 'FAIL  a live token did not open the document';
  end if;

  if exists (
    select 1 from referral_access_log
    where token_id = v_token and outcome = 'GRANTED'
  ) then
    raise notice 'ok    the access was logged in the same transaction';
  else
    raise notice 'FAIL  a referral was served with no access log row';
  end if;

  -- An unknown token is indistinguishable from an expired or revoked one, and
  -- leaves no row behind: there is no tenant to attribute it to, so enumeration
  -- cannot be used to fill another clinic's log.
  v_result := public.log_referral_access(
    encode(digest('never-issued', 'sha256'), 'hex'), null, 'invariant-check'
  );

  if v_result = jsonb_build_object('granted', false) then
    raise notice 'ok    an unknown token reveals nothing';
  else
    raise notice 'FAIL  an unknown token returned %', v_result;
  end if;

  -- Expired. Inserted directly, because the routine refuses to mint a token
  -- that is already dead.
  insert into referral_access_tokens (
    clinic_id, referral_id, token_hash, expires_at, issued_by, created_at
  ) values (
    c_clinic, v_referral, digest('token-expired', 'sha256'),
    now() - interval '1 minute', c_doctor, now() - interval '2 hours'
  ) returning id into v_expired;

  v_result := public.log_referral_access(
    encode(digest('token-expired', 'sha256'), 'hex'), null, 'invariant-check'
  );

  if v_result = jsonb_build_object('granted', false) then
    raise notice 'ok    an expired token is refused, identically';
  else
    raise notice 'FAIL  an expired token returned %', v_result;
  end if;

  if exists (select 1 from referral_access_log where token_id = v_expired and outcome = 'EXPIRED') then
    raise notice 'ok    the refusal is recorded even though the caller is not told why';
  else
    raise notice 'FAIL  an expired access was not logged';
  end if;

  -- Revoked.
  perform public.revoke_referral_token(
    c_clinic, c_doctor, 'inv-ref-11', v_token, 'handed to the wrong relative'
  );

  v_result := public.log_referral_access(
    encode(digest('token-one', 'sha256'), 'hex'), null, 'invariant-check'
  );

  if v_result = jsonb_build_object('granted', false) then
    raise notice 'ok    a revoked token is refused, identically';
  else
    raise notice 'FAIL  a revoked token returned %', v_result;
  end if;

  if public.revoke_referral_token(c_clinic, c_doctor, 'inv-ref-12', v_token, null) then
    raise notice 'FAIL  revoking twice reported a second revocation';
  else
    raise notice 'ok    revoking a referral link twice is a no-op, not an error';
  end if;
end;
$$;

\echo ''
\echo '=== A correction supersedes; it never edits ==='

do $$
declare
  c_clinic uuid := '11111111-1111-4111-8111-000000000001';
  c_preg   uuid := '55555555-5555-4555-8555-00000000000a';
  c_doctor uuid := '33333333-3333-4333-8333-000000000001';

  v_original     uuid;
  v_original_doc jsonb;
  v_replacement  uuid;
  v_version      integer;
  v_token        jsonb;
begin
  select id, issued_snapshot into v_original, v_original_doc
  from referrals where status = 'ISSUED' order by issued_at desc limit 1;

  v_token := public.create_referral_token(
    c_clinic, c_doctor, 'inv-ref-13', v_original,
    encode(digest('token-original', 'sha256'), 'hex'), 4320
  );

  v_replacement := public.create_referral_draft(
    c_clinic, c_doctor, 'inv-ref-14', c_preg, null, v_original,
    'Severe pre-eclampsia - corrected: BP 180/120', 'District Hospital'
  );

  select version into v_version from referrals where id = v_replacement;

  perform public.issue_referral(
    c_clinic, c_doctor, 'inv-ref-15', v_replacement, v_version, current_date, 1
  );

  if (select status from referrals where id = v_original) = 'SUPERSEDED' then
    raise notice 'ok    issuing a replacement retires the original';
  else
    raise notice 'FAIL  the original was not superseded';
  end if;

  -- The retired document is kept exactly as it was handed over.
  if (select issued_snapshot from referrals where id = v_original) = v_original_doc then
    raise notice 'ok    the superseded document is unchanged';
  else
    raise notice 'FAIL  superseding altered the original document';
  end if;

  if (select revoked_at from referral_access_tokens
       where id = (v_token->>'token_id')::uuid) is not null then
    raise notice 'ok    a superseded referral has no live links left';
  else
    raise notice 'FAIL  a superseded referral still has a live link';
  end if;

  if not (public.log_referral_access(
            encode(digest('token-original', 'sha256'), 'hex'), null, 'invariant-check'
          )->>'granted')::boolean then
    raise notice 'ok    a superseded referral no longer opens';
  else
    raise notice 'FAIL  a superseded referral still opens';
  end if;
end;
$$;

select pg_temp.must_equal(
  'no referral routine is executable by authenticated or anon',
  (
    select count(*)
    from unnest(array[
      'public.create_referral_draft(uuid, uuid, text, uuid, uuid, uuid, text, text)',
      'public.update_referral_draft(uuid, uuid, text, uuid, integer, text, text, text, text, text, text, timestamptz, text, text, integer, integer, integer, integer, integer, numeric, dipstick_grade, integer, timestamptz, numeric, integer, text, membrane_status, text, timestamptz, uuid, text, text)',
      'public.issue_referral(uuid, uuid, text, uuid, integer, date, integer)',
      'public.create_referral_token(uuid, uuid, text, uuid, text, integer)',
      'public.revoke_referral_token(uuid, uuid, text, uuid, text)',
      'public.log_referral_access(text, text, text)'
    ]) as fn
    cross join unnest(array['authenticated', 'anon']) as grantee
    where has_function_privilege(grantee, fn, 'EXECUTE')
  ),
  0::bigint
);

\echo ''
