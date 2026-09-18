-- ---------------------------------------------------------------------------
-- Synthetic seed data
-- ---------------------------------------------------------------------------
-- SYNTHETIC ONLY. Every name, number and value below is invented. No real
-- patient data belongs in this repository under any circumstances.
--
-- Dates are expressed RELATIVE to current_date so the demo never goes stale:
-- a seeded pregnancy stays at the same gestation whenever the stack is reset,
-- and gestational ages are genuinely computed rather than hardcoded.
--
-- Local sign-in for all seeded staff: password `maatrisetu`
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- Clinic
-- ---------------------------------------------------------------------------
-- The four tenancy inserts below are ON CONFLICT DO NOTHING so the seed can be
-- re-run against a database that already has staff. They cannot simply be
-- deleted and recreated: audit_events references staff_users and is append-only
-- by design, so once anything has been done in a clinic its staff rows are
-- permanent. The clinical sections further down stay strict — re-seeding
-- patients over existing ones should fail loudly rather than half-apply.

insert into clinics (id, name, type, timezone, address, contact_phone) values
  ('11111111-1111-4111-8111-000000000001',
   'Matru Seva Municipal Maternity Centre',
   'MUNICIPAL',
   'Asia/Kolkata',
   'Sion, Mumbai, Maharashtra',
   '+912224071000')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Staff accounts
-- ---------------------------------------------------------------------------
-- auth.users rows are created directly; this is local-only seed data and the
-- password is shared and non-secret by design.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  -- These four are nullable with no default, and GoTrue scans them into Go
  -- strings. Leaving them NULL makes sign-in fail with "converting NULL to
  -- string is unsupported" — the rows look fine in the table and the login
  -- simply never works, which is a long way to travel for a demo.
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000',
  u.auth_id,
  'authenticated',
  'authenticated',
  u.email,
  crypt('maatrisetu', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', u.display_name),
  '', '', '', ''
from (values
  ('22222222-2222-4222-8222-000000000001'::uuid, 'doctor@maatrisetu.local',    'Dr. Ananya Rao'),
  ('22222222-2222-4222-8222-000000000002'::uuid, 'nurse@maatrisetu.local',     'Sr. Kavita Pawar'),
  ('22222222-2222-4222-8222-000000000003'::uuid, 'assistant@maatrisetu.local', 'Rohit Kamble'),
  ('22222222-2222-4222-8222-000000000004'::uuid, 'admin@maatrisetu.local',     'Suresh Nair')
) as u(auth_id, email, display_name)
on conflict (id) do nothing;

insert into staff_users (id, auth_user_id, display_name, registration_no, phone) values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-000000000001', 'Dr. Ananya Rao',   'MMC-2018-44127', '+919820000001'),
  ('33333333-3333-4333-8333-000000000002', '22222222-2222-4222-8222-000000000002', 'Sr. Kavita Pawar', null,            '+919820000002'),
  ('33333333-3333-4333-8333-000000000003', '22222222-2222-4222-8222-000000000003', 'Rohit Kamble',     null,            '+919820000003'),
  ('33333333-3333-4333-8333-000000000004', '22222222-2222-4222-8222-000000000004', 'Suresh Nair',      null,            '+919820000004')
on conflict (id) do nothing;

insert into clinic_memberships (clinic_id, user_id, role) values
  ('11111111-1111-4111-8111-000000000001', '33333333-3333-4333-8333-000000000001', 'DOCTOR'),
  ('11111111-1111-4111-8111-000000000001', '33333333-3333-4333-8333-000000000002', 'NURSE'),
  ('11111111-1111-4111-8111-000000000001', '33333333-3333-4333-8333-000000000003', 'ASSISTANT'),
  ('11111111-1111-4111-8111-000000000001', '33333333-3333-4333-8333-000000000004', 'ADMIN')
on conflict (clinic_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Patient A — the main demo case
-- ---------------------------------------------------------------------------
-- Third-trimester, Rh-negative, anaemic with a falling haemoglobin trend, one
-- previous LSCS, penicillin allergy. Exercises the header pills, the serial
-- trend, the scan milestones and the referral prefill.

insert into patients (
  id, clinic_id, uhid, full_name, estimated_age_years, age_recorded_on,
  allergy_status, blood_group, blood_group_source, blood_group_recorded_on, created_by
) values (
  '44444444-4444-4444-8444-00000000000a',
  '11111111-1111-4111-8111-000000000001',
  'MH-2026-89412', 'Sunita Devi', 26, current_date - 240,
  'KNOWN', 'O_NEG', 'EXTRACTED_VERIFIED', current_date - 230,
  '33333333-3333-4333-8333-000000000002'
);

insert into patient_allergies (clinic_id, patient_id, substance, reaction, severity, source, recorded_by) values
  ('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
   'Penicillin', 'Urticarial rash', 'MODERATE', 'PATIENT_REPORTED',
   '33333333-3333-4333-8333-000000000002');

insert into patient_contacts (
  clinic_id, patient_id, phone_e164, relationship, contact_name, is_primary,
  messaging_consent_at, verified_at, verified_by
) values
  ('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
   '+919833100001', 'SELF', 'Sunita Devi', true,
   now() - interval '200 days', now() - interval '200 days',
   '33333333-3333-4333-8333-000000000002');

-- Pregnancy: dated from LMP, currently 32w + 4d.
insert into pregnancies (
  id, clinic_id, patient_id, status,
  dating_reference_date, dating_reference_ga_days, dating_method, dating_certainty,
  dating_confirmed_by, dating_confirmed_at,
  reported_lmp, reported_lmp_certainty,
  gravida, parity, living, abortions,
  pre_pregnancy_weight_kg, height_cm, created_by
) values (
  '55555555-5555-4555-8555-00000000000a',
  '11111111-1111-4111-8111-000000000001',
  '44444444-4444-4444-8444-00000000000a',
  'ACTIVE',
  current_date - 228, 0, 'LMP', 'CERTAIN',
  '33333333-3333-4333-8333-000000000001', now() - interval '180 days',
  current_date - 228, 'CERTAIN',
  2, 1, 1, 0,
  55.0, 154.0,
  '33333333-3333-4333-8333-000000000002'
);

-- Previous delivery: LSCS, with the scar recorded as a fact and no judgment
-- about whether the interval is adequate.
insert into obstetric_history (
  clinic_id, patient_id, sequence_no, year_of_event, event_date, event_date_precision,
  outcome, delivery_mode, gestation_weeks_at_delivery, birth_weight_grams, child_alive,
  has_uterine_scar, scar_indication, place_of_event, source, recorded_by
) values (
  '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
  1, extract(year from current_date - interval '4 years')::int,
  current_date - interval '4 years', 'MONTH',
  'LIVE_BIRTH', 'LSCS_EMERGENCY', 38, 2900, 'KNOWN',
  true, 'Fetal distress in labour', 'District Hospital, Latur',
  'PATIENT_REPORTED', '33333333-3333-4333-8333-000000000002'
);

-- Consent, captured at registration in Marathi.
insert into consent_records (
  clinic_id, patient_id, purpose, granted, wording_version, language, method, captured_by
)
select
  '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
  p, true, 'v1', 'mr', 'VERBAL_WITNESSED', '33333333-3333-4333-8333-000000000002'
from unnest(array['RECORD_KEEPING', 'MESSAGING', 'VOICE_PROCESSING']::consent_purpose[]) as p;

-- Rh-negative: facts only. No computed "Anti-D due" — that is the clinician's call.
insert into anti_d_events (
  clinic_id, patient_id, pregnancy_id, event_type, occurred_at, titre_text, recorded_by
) values (
  '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
  '55555555-5555-4555-8555-00000000000a',
  'TITRE_RECORDED', now() - interval '60 days', 'ICT negative',
  '33333333-3333-4333-8333-000000000001'
);

-- Immunizations.
insert into immunizations (
  clinic_id, patient_id, pregnancy_id, vaccine, status, administered_on, recorded_by
) values
  ('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
   '55555555-5555-4555-8555-00000000000a', 'Td1', 'GIVEN', current_date - 120,
   '33333333-3333-4333-8333-000000000002'),
  ('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
   '55555555-5555-4555-8555-00000000000a', 'Td2', 'PLANNED', null,
   '33333333-3333-4333-8333-000000000002');

-- ---------------------------------------------------------------------------
-- Source documents
-- ---------------------------------------------------------------------------
-- The schema refuses an EXTRACTED_VERIFIED value that cannot point back at the
-- slip it came from, so provenance cannot be lost. These are the documents
-- behind the observations and scans below. Object keys are synthetic; no files
-- exist in local storage, and the UI labels them as such.

insert into report_uploads (
  id, clinic_id, patient_id, pregnancy_id, object_key, content_type, byte_size,
  sha256, assignment_status, uploaded_by, uploaded_at
)
select
  u.id, '11111111-1111-4111-8111-000000000001',
  '44444444-4444-4444-8444-00000000000a', '55555555-5555-4555-8555-00000000000a',
  u.object_key, 'image/jpeg', 420000,
  decode(md5(u.object_key), 'hex'), 'ASSIGNED',
  '33333333-3333-4333-8333-000000000003', now() - (u.days_ago || ' days')::interval
from (values
  ('88888888-8888-4888-8888-000000000001'::uuid, 'seed/sunita/cbc-1.jpg',      170),
  ('88888888-8888-4888-8888-000000000002'::uuid, 'seed/sunita/cbc-2.jpg',       80),
  ('88888888-8888-4888-8888-000000000003'::uuid, 'seed/sunita/cbc-3.jpg',        5),
  ('88888888-8888-4888-8888-000000000004'::uuid, 'seed/sunita/ogtt.jpg',       100),
  ('88888888-8888-4888-8888-000000000005'::uuid, 'seed/sunita/serology.jpg',   160),
  ('88888888-8888-4888-8888-000000000006'::uuid, 'seed/sunita/usg-nt.jpg',     141),
  ('88888888-8888-4888-8888-000000000007'::uuid, 'seed/sunita/usg-tiffa.jpg',   82),
  ('88888888-8888-4888-8888-000000000008'::uuid, 'seed/sunita/usg-growth.jpg',   4)
) as u(id, object_key, days_ago);

-- ---------------------------------------------------------------------------
-- Verified observations: the falling haemoglobin trend
-- ---------------------------------------------------------------------------
-- 11.2 → 9.8 → 8.6 g/dL, matching the design mock. All three are verified
-- observations. Only the latest is pinned — which is exactly why the trend must
-- read from `observations` and not from `finding_pins`: pinning one value must
-- not erase the other two from the sparkline.

insert into observations (
  id, clinic_id, patient_id, pregnancy_id, category, test_code, test_name,
  value_numeric, unit_original, unit_normalized, value_normalized,
  reference_low, reference_high, observed_date, observed_date_precision,
  source, source_upload_id, verified_by, verified_at
) values
  ('66666666-6666-4666-8666-00000000000a', '11111111-1111-4111-8111-000000000001',
   '44444444-4444-4444-8444-00000000000a', '55555555-5555-4555-8555-00000000000a',
   'HEMATOLOGY', 'hb', 'Haemoglobin',
   11.2, 'g/dL', 'g/dL', 11.2, 11.0, 15.0, current_date - 170, 'DAY',
   'EXTRACTED_VERIFIED', '88888888-8888-4888-8888-000000000001',
   '33333333-3333-4333-8333-000000000001', now() - interval '170 days'),

  ('66666666-6666-4666-8666-00000000000b', '11111111-1111-4111-8111-000000000001',
   '44444444-4444-4444-8444-00000000000a', '55555555-5555-4555-8555-00000000000a',
   'HEMATOLOGY', 'hb', 'Haemoglobin',
   9.8, 'g/dL', 'g/dL', 9.8, 11.0, 15.0, current_date - 80, 'DAY',
   'EXTRACTED_VERIFIED', '88888888-8888-4888-8888-000000000002',
   '33333333-3333-4333-8333-000000000001', now() - interval '80 days'),

  ('66666666-6666-4666-8666-00000000000c', '11111111-1111-4111-8111-000000000001',
   '44444444-4444-4444-8444-00000000000a', '55555555-5555-4555-8555-00000000000a',
   'HEMATOLOGY', 'hb', 'Haemoglobin',
   8.6, 'g/dL', 'g/dL', 8.6, 11.0, 15.0, current_date - 5, 'DAY',
   'EXTRACTED_VERIFIED', '88888888-8888-4888-8888-000000000003',
   '33333333-3333-4333-8333-000000000001', now() - interval '5 days'),

  ('66666666-6666-4666-8666-00000000000d', '11111111-1111-4111-8111-000000000001',
   '44444444-4444-4444-8444-00000000000a', '55555555-5555-4555-8555-00000000000a',
   'HEMATOLOGY', 'platelets', 'Platelet count',
   185, '10^3/uL', '10^9/L', 185, 150, 410, current_date - 5, 'DAY',
   'EXTRACTED_VERIFIED', '88888888-8888-4888-8888-000000000003',
   '33333333-3333-4333-8333-000000000001', now() - interval '5 days'),

  ('66666666-6666-4666-8666-00000000000e', '11111111-1111-4111-8111-000000000001',
   '44444444-4444-4444-8444-00000000000a', '55555555-5555-4555-8555-00000000000a',
   'BIOCHEMISTRY', 'ogtt_fasting', 'OGTT 75g — fasting',
   84, 'mg/dL', 'mg/dL', 84, 70, 92, current_date - 100, 'DAY',
   'EXTRACTED_VERIFIED', '88888888-8888-4888-8888-000000000004',
   '33333333-3333-4333-8333-000000000001', now() - interval '100 days'),

  ('66666666-6666-4666-8666-00000000000f', '11111111-1111-4111-8111-000000000001',
   '44444444-4444-4444-8444-00000000000a', '55555555-5555-4555-8555-00000000000a',
   'BIOCHEMISTRY', 'ogtt_2hr', 'OGTT 75g — 2 hour',
   118, 'mg/dL', 'mg/dL', 118, 0, 153, current_date - 100, 'DAY',
   'EXTRACTED_VERIFIED', '88888888-8888-4888-8888-000000000004',
   '33333333-3333-4333-8333-000000000001', now() - interval '100 days');

-- Serology, as text values. Note these are recorded as results, not as
-- interpretations.
insert into observations (
  clinic_id, patient_id, pregnancy_id, category, test_code, test_name,
  value_text, observed_date, source, source_upload_id, verified_by
)
select
  '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
  '55555555-5555-4555-8555-00000000000a', 'SEROLOGY', s.code, s.name,
  'Non-reactive', current_date - 160,
  'EXTRACTED_VERIFIED', '88888888-8888-4888-8888-000000000005',
  '33333333-3333-4333-8333-000000000001'
from (values
  ('hiv',   'HIV I & II'),
  ('hbsag', 'HBsAg'),
  ('vdrl',  'VDRL')
) as s(code, name);

-- Only the latest haemoglobin is pinned to the cockpit.
insert into finding_pins (clinic_id, pregnancy_id, observation_id, pinned_by) values
  ('11111111-1111-4111-8111-000000000001', '55555555-5555-4555-8555-00000000000a',
   '66666666-6666-4666-8666-00000000000c', '33333333-3333-4333-8333-000000000001');

-- ---------------------------------------------------------------------------
-- Milestone scans
-- ---------------------------------------------------------------------------
-- Scan dates are real dates, not milestone slots: the anomaly scan was
-- performed at 20w+6d, which is entirely normal and which PRD §8's
-- `gestational_week int` could not have represented.

insert into scan_reports (
  clinic_id, patient_id, pregnancy_id, source_upload_id, scan_type, scan_date,
  ga_days_at_scan, efw_grams, efw_centile, afi_cm, presentation, placenta_position,
  cervical_length_mm, findings, impression, source, verified_by
) values
  ('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
   '55555555-5555-4555-8555-00000000000a', '88888888-8888-4888-8888-000000000006',
   'NT_NB', current_date - 141, 87,
   null, null, null, 'NOT_ASSESSED', null, null,
   'NT 1.2 mm. Nasal bone present. CRL 58 mm.', 'Single live intrauterine gestation.',
   'EXTRACTED_VERIFIED', '33333333-3333-4333-8333-000000000001'),

  ('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
   '55555555-5555-4555-8555-00000000000a', '88888888-8888-4888-8888-000000000007',
   'TIFFA', current_date - 82, 146,
   null, null, 14.0, 'NOT_ASSESSED', 'Anterior, upper segment', 38.0,
   'Four-chamber cardiac view intact. Spine intact, no gross anomaly detected.',
   'No gross structural anomaly detected on this study.',
   'EXTRACTED_VERIFIED', '33333333-3333-4333-8333-000000000001'),

  ('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
   '55555555-5555-4555-8555-00000000000a', '88888888-8888-4888-8888-000000000008',
   'GROWTH', current_date - 4, 224,
   1850, 50.0, 12.0, 'CEPHALIC', 'Anterior, Grade II', null,
   'EFW 1850 g, 50th centile. AFI 12 cm. Cephalic presentation.',
   'Growth appropriate for stated gestation.',
   'EXTRACTED_VERIFIED', '33333333-3333-4333-8333-000000000001');

-- ---------------------------------------------------------------------------
-- A saved previous visit, with its prescriptions
-- ---------------------------------------------------------------------------

insert into visits (
  id, clinic_id, patient_id, pregnancy_id, visit_type, status, occurred_at,
  ga_days_at_visit, dating_method_at_visit, impression,
  clinician_id, opened_by, saved_at, saved_by
) values (
  '77777777-7777-4777-8777-00000000000a',
  '11111111-1111-4111-8111-000000000001',
  '44444444-4444-4444-8444-00000000000a',
  '55555555-5555-4555-8555-00000000000a',
  'ANC_OPD', 'SAVED', now() - interval '28 days',
  200, 'LMP',
  'G2P1L1A0 at 28w+4d. Mild anaemia on oral iron. Previous LSCS. Haemodynamically stable.',
  '33333333-3333-4333-8333-000000000001',
  '33333333-3333-4333-8333-000000000002',
  now() - interval '28 days',
  '33333333-3333-4333-8333-000000000001'
);

insert into visit_vitals (
  clinic_id, visit_id, bp_systolic_mmhg, bp_diastolic_mmhg, pulse_bpm, weight_kg,
  fundal_height_cm, fetal_heart_rate_bpm, urine_albumin, sequence_no, recorded_by
) values (
  '11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-00000000000a',
  118, 76, 82, 58.5, 28.0, 144, 'NIL', 1,
  '33333333-3333-4333-8333-000000000002'
);

insert into prescriptions (
  clinic_id, pregnancy_id, visit_id, medicine_name, dose_amount, dose_unit, form,
  route, frequency, food_relation, duration_days, start_date, status, prescribed_by
) values
  ('11111111-1111-4111-8111-000000000001', '55555555-5555-4555-8555-00000000000a',
   '77777777-7777-4777-8777-00000000000a', 'Ferrous ascorbate', 100, 'mg', 'Tab',
   'ORAL', 'OD', 'AFTER_FOOD', 30, current_date - 28, 'ACTIVE',
   '33333333-3333-4333-8333-000000000001'),

  ('11111111-1111-4111-8111-000000000001', '55555555-5555-4555-8555-00000000000a',
   '77777777-7777-4777-8777-00000000000a', 'Calcium carbonate with Vitamin D3', 500, 'mg', 'Tab',
   'ORAL', 'BD', 'AFTER_FOOD', 30, current_date - 28, 'ACTIVE',
   '33333333-3333-4333-8333-000000000001'),

  ('11111111-1111-4111-8111-000000000001', '55555555-5555-4555-8555-00000000000a',
   '77777777-7777-4777-8777-00000000000a', 'Folic acid', 5, 'mg', 'Tab',
   'ORAL', 'OD', 'NOT_SPECIFIED', 30, current_date - 28, 'ACTIVE',
   '33333333-3333-4333-8333-000000000001');

insert into visit_advice (
  clinic_id, visit_id, dfkc_counselled, nutrition_counselled, left_lateral_rest,
  danger_signs_counselled, lab_orders, scan_orders, next_followup_date, recorded_by
) values (
  '11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-00000000000a',
  true, true, true, true,
  array['Repeat CBC in 3 weeks'], array['36 week growth scan with Doppler'],
  current_date + 2, '33333333-3333-4333-8333-000000000001'
);

-- ---------------------------------------------------------------------------
-- A patient query awaiting the clinician
-- ---------------------------------------------------------------------------
-- Note the routing bucket is NEEDS_REVIEW, not a risk label, and the matched
-- phrase is recorded so the tag can be explained.

insert into voice_queries (
  clinic_id, patient_id, association_status, channel, provider_message_id,
  from_phone_e164, audio_duration_seconds, processing_state, detected_language,
  transcript_original, translation_en, transcription_confidence,
  transcript_provider, routing_bucket, matched_phrases, lexicon_version, received_at
) values (
  '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000a',
  'VERIFIED', 'IN_APP_UPLOAD', 'seed-msg-0001',
  '+919833100001', 8, 'READY', 'mr',
  'संध्याकाळी पायावर थोडी सूज येते',
  'Slight swelling of the feet towards evening.',
  0.92, 'fixture', 'NEEDS_REVIEW', array['सूज'], 'lexicon-v1',
  now() - interval '3 hours'
);

-- An unmatched message: the number is not a verified contact of any patient, so
-- it waits in the association queue rather than attaching itself to a record.
insert into voice_queries (
  clinic_id, association_status, channel, provider_message_id, from_phone_e164,
  audio_duration_seconds, processing_state, detected_language,
  transcript_original, translation_en, transcription_confidence,
  transcript_provider, routing_bucket, lexicon_version, received_at
) values (
  '11111111-1111-4111-8111-000000000001',
  'UNMATCHED', 'IN_APP_UPLOAD', 'seed-msg-0002', '+919833199999',
  6, 'READY', 'hi',
  'मैडम, अगली तारीख कब है?',
  'Madam, when is the next appointment?',
  0.88, 'fixture', 'INFORMATIONAL', 'lexicon-v1',
  now() - interval '1 hour'
);

-- ---------------------------------------------------------------------------
-- Patient B — early booking, dating from a scan
-- ---------------------------------------------------------------------------
-- Exercises ultrasound-anchored dating, for which there is no LMP at all.

insert into patients (
  id, clinic_id, uhid, full_name, estimated_age_years, age_recorded_on,
  allergy_status, created_by
) values (
  '44444444-4444-4444-8444-00000000000b',
  '11111111-1111-4111-8111-000000000001',
  'MH-2026-90155', 'Rehana Shaikh', 22, current_date - 20,
  'NONE_KNOWN', '33333333-3333-4333-8333-000000000002'
);

insert into patient_contacts (
  clinic_id, patient_id, phone_e164, relationship, is_primary, verified_at, verified_by
) values (
  '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000b',
  '+919833100002', 'SELF', true, now() - interval '20 days',
  '33333333-3333-4333-8333-000000000002'
);

-- Dated from a scan at 9w+2d, twenty days ago. She has no recalled LMP.
insert into pregnancies (
  id, clinic_id, patient_id, status,
  dating_reference_date, dating_reference_ga_days, dating_method, dating_certainty,
  dating_confirmed_by, dating_confirmed_at,
  reported_lmp, reported_lmp_certainty,
  gravida, parity, living, abortions, created_by
) values (
  '55555555-5555-4555-8555-00000000000b',
  '11111111-1111-4111-8111-000000000001',
  '44444444-4444-4444-8444-00000000000b',
  'ACTIVE',
  current_date - 20, 65, 'ULTRASOUND', 'CERTAIN',
  '33333333-3333-4333-8333-000000000001', now() - interval '20 days',
  null, 'UNKNOWN',
  1, 0, 0, 0, '33333333-3333-4333-8333-000000000002'
);

-- ---------------------------------------------------------------------------
-- Patient C — booked, dating not yet established
-- ---------------------------------------------------------------------------
-- The cockpit must render this honestly as "dating not established" rather than
-- inventing a gestational age. Allergy status is UNKNOWN, not "none".

insert into patients (
  id, clinic_id, uhid, full_name, estimated_age_years, age_recorded_on,
  allergy_status, created_by
) values (
  '44444444-4444-4444-8444-00000000000c',
  '11111111-1111-4111-8111-000000000001',
  'MH-2026-90211', 'Lakshmi Yadav', 31, current_date - 2,
  'UNKNOWN', '33333333-3333-4333-8333-000000000002'
);

insert into pregnancies (
  id, clinic_id, patient_id, status, dating_method, dating_certainty,
  gravida, parity, living, abortions, created_by
) values (
  '55555555-5555-4555-8555-00000000000c',
  '11111111-1111-4111-8111-000000000001',
  '44444444-4444-4444-8444-00000000000c',
  'ACTIVE', 'UNKNOWN', 'UNKNOWN',
  3, 2, 2, 0, '33333333-3333-4333-8333-000000000002'
);

commit;
