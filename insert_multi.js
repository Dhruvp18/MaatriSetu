const { Client } = require('pg');

const connectionString = "postgresql://postgres.gbzmnjrwkcsyaxhkiysw:maatrisetu%40123@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";

const sql = `
-- Patient Multi (Anemia, GDM, PIH, Rh-ve)
insert into patients (id, clinic_id, uhid, full_name, estimated_age_years, age_recorded_on, allergy_status, blood_group, blood_group_source, blood_group_recorded_on, created_by) values 
('44444444-4444-4444-8444-000000000101', '11111111-1111-4111-8111-000000000001', 'MH-2026-90400', 'Priya Rathi', 32, current_date - 196, 'NONE_KNOWN', 'O_NEG', 'STAFF_ENTERED', current_date - 196, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

insert into patient_contacts (clinic_id, patient_id, phone_e164, relationship, is_primary, verified_at, verified_by) values 
('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '+919876543220', 'SELF', true, now() - interval '196 days', '33333333-3333-4333-8333-000000000002') on conflict do nothing;

insert into pregnancies (id, clinic_id, patient_id, status, dating_reference_date, dating_reference_ga_days, dating_method, dating_certainty, dating_confirmed_by, dating_confirmed_at, reported_lmp, reported_lmp_certainty, gravida, parity, living, abortions, created_by) values 
('55555555-5555-4555-8555-000000000101', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', 'ACTIVE', current_date - 196, 0, 'LMP', 'CERTAIN', '33333333-3333-4333-8333-000000000001', now() - interval '196 days', current_date - 196, 'CERTAIN', 1, 0, 0, 0, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

-- 3 Visits (Week 20, 24, 28)
insert into visits (id, clinic_id, patient_id, pregnancy_id, visit_type, status, occurred_at, ga_days_at_visit, dating_method_at_visit, impression, clinician_id, opened_by, saved_at, saved_by) values 
('77777777-7777-4777-8777-000000000101', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'ANC_OPD', 'SAVED', now() - interval '56 days', 140, 'LMP', 'Week 20: Elevated BP.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now() - interval '56 days', '33333333-3333-4333-8333-000000000001'),
('77777777-7777-4777-8777-000000000102', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'ANC_OPD', 'SAVED', now() - interval '28 days', 168, 'LMP', 'Week 24: Increasing BP, Anemia.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now() - interval '28 days', '33333333-3333-4333-8333-000000000001'),
('77777777-7777-4777-8777-000000000103', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'ANC_OPD', 'SAVED', now(), 196, 'LMP', 'Week 28: PIH, GDM, Anemia, Rh-ve. High Risk.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now(), '33333333-3333-4333-8333-000000000001')
on conflict (id) do nothing;

insert into visit_vitals (clinic_id, visit_id, bp_systolic_mmhg, bp_diastolic_mmhg, weight_kg, urine_albumin, urine_sugar, sequence_no, recorded_by) values 
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-000000000101', 140, 90, 65.0, 'TRACE', 'NIL', 1, '33333333-3333-4333-8333-000000000002'),
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-000000000102', 145, 95, 66.5, 'ONE_PLUS', 'ONE_PLUS', 1, '33333333-3333-4333-8333-000000000002'),
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-000000000103', 155, 100, 68.0, 'TWO_PLUS', 'TWO_PLUS', 1, '33333333-3333-4333-8333-000000000002')
on conflict do nothing;

-- Lab Observations (Hb, OGTT)
insert into observations (id, clinic_id, patient_id, pregnancy_id, category, test_code, test_name, value_numeric, unit_original, unit_normalized, value_normalized, reference_low, reference_high, observed_date, observed_date_precision, source, verified_by, verified_at, flagged_by_clinician) values 
('66666666-6666-4666-8666-00000000100a', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'HEMATOLOGY', 'hb', 'Haemoglobin', 10.5, 'g/dL', 'g/dL', 10.5, 11.0, 15.0, current_date - 56, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '56 days', true),
('66666666-6666-4666-8666-00000000100b', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'HEMATOLOGY', 'hb', 'Haemoglobin', 9.8, 'g/dL', 'g/dL', 9.8, 11.0, 15.0, current_date - 28, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '28 days', true),
('66666666-6666-4666-8666-00000000100c', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'HEMATOLOGY', 'hb', 'Haemoglobin', 8.5, 'g/dL', 'g/dL', 8.5, 11.0, 15.0, current_date, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now(), true),

('66666666-6666-4666-8666-00000000101a', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'BIOCHEMISTRY', 'ogtt_2hr', 'OGTT 75g — 2 hour', 140, 'mg/dL', 'mg/dL', 140, 0, 153, current_date - 56, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '56 days', false),
('66666666-6666-4666-8666-00000000101b', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'BIOCHEMISTRY', 'ogtt_2hr', 'OGTT 75g — 2 hour', 165, 'mg/dL', 'mg/dL', 165, 0, 153, current_date - 28, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '28 days', true),
('66666666-6666-4666-8666-00000000101c', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'BIOCHEMISTRY', 'ogtt_2hr', 'OGTT 75g — 2 hour', 180, 'mg/dL', 'mg/dL', 180, 0, 153, current_date, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now(), true)
on conflict (id) do nothing;

-- Anti-D Events
insert into anti_d_events (clinic_id, patient_id, pregnancy_id, event_type, occurred_at, titre_text, recorded_by) values 
('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'TITRE_RECORDED', now() - interval '56 days', '1:4', '33333333-3333-4333-8333-000000000001'),
('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'TITRE_RECORDED', now() - interval '28 days', '1:8', '33333333-3333-4333-8333-000000000001'),
('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000101', '55555555-5555-4555-8555-000000000101', 'TITRE_RECORDED', now(), '1:16', '33333333-3333-4333-8333-000000000001');

`;

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

client.connect()
  .then(() => client.query(sql))
  .then(() => {
    console.log('Successfully inserted combined patient into Supabase.');
    return client.end();
  })
  .catch(err => {
    console.error('Error executing query', err);
    client.end();
  });
