const { Client } = require('pg');

const connectionString = "postgresql://postgres.gbzmnjrwkcsyaxhkiysw:maatrisetu%40123@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";

const sql = `
-- ---------------------------------------------------------------------------
-- Patient E — Diabetic Pregnancy (Gestational Diabetes)
-- ---------------------------------------------------------------------------
insert into patients (id, clinic_id, uhid, full_name, estimated_age_years, age_recorded_on, allergy_status, blood_group, blood_group_source, blood_group_recorded_on, created_by) values 
('44444444-4444-4444-8444-00000000000e', '11111111-1111-4111-8111-000000000001', 'MH-2026-90301', 'Meera Patel', 30, current_date - 196, 'NONE_KNOWN', 'A_POS', 'STAFF_ENTERED', current_date - 196, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

insert into patient_contacts (clinic_id, patient_id, phone_e164, relationship, is_primary, verified_at, verified_by) values 
('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', '+919876543211', 'HUSBAND', true, now() - interval '196 days', '33333333-3333-4333-8333-000000000002') on conflict do nothing;

insert into pregnancies (id, clinic_id, patient_id, status, dating_reference_date, dating_reference_ga_days, dating_method, dating_certainty, dating_confirmed_by, dating_confirmed_at, reported_lmp, reported_lmp_certainty, gravida, parity, living, abortions, created_by) values 
('55555555-5555-4555-8555-00000000000e', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', 'ACTIVE', current_date - 196, 0, 'LMP', 'CERTAIN', '33333333-3333-4333-8333-000000000001', now() - interval '196 days', current_date - 196, 'CERTAIN', 2, 1, 1, 0, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

-- Menstrual History
insert into menstrual_histories (id, clinic_id, patient_id, recorded_on, lmp, menarche_age_years, duration_days, cycle_length_days, cycle_regularity, flow, pads_per_day, recorded_by) values 
('99999999-9999-4999-9999-000000000001', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', current_date - 196, current_date - 196, 13, 5, 28, 'REGULAR', 'MODERATE', 3, '33333333-3333-4333-8333-000000000001') on conflict do nothing;

-- Obstetric History (G1 - GDM, Macrosomia)
insert into obstetric_history (id, clinic_id, patient_id, sequence_no, source, recorded_by, year_of_event, outcome, delivery_mode, gestation_weeks_at_delivery, gestation_category, induced_complications, plurality) values 
('88888888-8888-4888-8888-000000000001', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', 1, 'PATIENT_REPORTED', '33333333-3333-4333-8333-000000000001', 2022, 'LIVE_BIRTH', 'VAGINAL', 39, 'FULL_TERM', array['GESTATIONAL_DM'], 'SINGLE') on conflict do nothing;

insert into obstetric_history_infants (clinic_id, history_id, fetus_no, outcome, birth_weight_grams, sex) values 
('11111111-1111-4111-8111-000000000001', '88888888-8888-4888-8888-000000000001', 1, 'ALIVE', 4000, 'MALE') on conflict do nothing;

-- 3 Visits (Week 20, 24, 28)
insert into visits (id, clinic_id, patient_id, pregnancy_id, visit_type, status, occurred_at, ga_days_at_visit, dating_method_at_visit, impression, examination, diagnosis, consultation_summary, clinician_id, opened_by, saved_at, saved_by) values 
('77777777-7777-4777-8777-0000000000e1', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', '55555555-5555-4555-8555-00000000000e', 'ANC_OPD', 'SAVED', now() - interval '56 days', 140, 'LMP', 'G2P1L1A0 at 20 weeks. High risk for GDM given previous macrosomia.', 'Fundus corresponds to dates. FHS regular.', 'At Risk for GDM', 'Advised early OGTT due to previous history of GDM.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now() - interval '56 days', '33333333-3333-4333-8333-000000000001'),
('77777777-7777-4777-8777-0000000000e2', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', '55555555-5555-4555-8555-00000000000e', 'ANC_OPD', 'SAVED', now() - interval '28 days', 168, 'LMP', 'G2P1L1A0 at 24 weeks. OGTT borderline.', 'Fundus corresponds to dates. Accelerated weight gain noted.', 'Gestational Diabetes Mellitus (Borderline)', 'Advised strictly diabetic diet and exercise. Monitor fasting and PP sugars.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now() - interval '28 days', '33333333-3333-4333-8333-000000000001'),
('77777777-7777-4777-8777-0000000000e3', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', '55555555-5555-4555-8555-00000000000e', 'ANC_OPD', 'SAVED', now(), 196, 'LMP', 'G2P1L1A0 at 28 weeks. GDM confirmed. Sugar poorly controlled on diet.', 'Fundal height 30cm (large for dates). Suspect polyhydramnios.', 'Gestational Diabetes Mellitus (Uncontrolled)', 'Started on Insulin therapy. Advised strictly charting sugars 4 times a day.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now(), '33333333-3333-4333-8333-000000000001')
on conflict (id) do nothing;

insert into visit_vitals (clinic_id, visit_id, bp_systolic_mmhg, bp_diastolic_mmhg, weight_kg, fundal_height_cm, urine_sugar, sequence_no, recorded_by) values 
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-0000000000e1', 110, 70, 62.0, 20, 'NIL', 1, '33333333-3333-4333-8333-000000000002'),
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-0000000000e2', 115, 75, 65.5, 24, 'TRACE', 1, '33333333-3333-4333-8333-000000000002'),
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-0000000000e3', 118, 76, 68.5, 30, 'ONE_PLUS', 1, '33333333-3333-4333-8333-000000000002')
on conflict do nothing;

-- Lab Observations (Hb, OGTT)
insert into observations (id, clinic_id, patient_id, pregnancy_id, category, test_code, test_name, value_numeric, unit_original, unit_normalized, value_normalized, reference_low, reference_high, observed_date, observed_date_precision, source, verified_by, verified_at, flagged_by_clinician) values 
('66666666-6666-4666-8666-0000000000e1', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', '55555555-5555-4555-8555-00000000000e', 'BIOCHEMISTRY', 'ogtt_2hr', 'OGTT 75g — 2 hour', 145, 'mg/dL', 'mg/dL', 145, 0, 153, current_date - 56, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '56 days', false),
('66666666-6666-4666-8666-0000000000e2', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', '55555555-5555-4555-8555-00000000000e', 'BIOCHEMISTRY', 'ogtt_2hr', 'OGTT 75g — 2 hour', 160, 'mg/dL', 'mg/dL', 160, 0, 153, current_date - 28, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '28 days', true),
('66666666-6666-4666-8666-0000000000e3', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000e', '55555555-5555-4555-8555-00000000000e', 'BIOCHEMISTRY', 'ogtt_2hr', 'OGTT 75g — 2 hour', 185, 'mg/dL', 'mg/dL', 185, 0, 153, current_date, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now(), true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Patient F — Hypertensive Pregnancy (Preeclampsia)
-- ---------------------------------------------------------------------------
insert into patients (id, clinic_id, uhid, full_name, estimated_age_years, age_recorded_on, allergy_status, blood_group, blood_group_source, blood_group_recorded_on, created_by) values 
('44444444-4444-4444-8444-00000000000f', '11111111-1111-4111-8111-000000000001', 'MH-2026-90302', 'Kavita Desai', 28, current_date - 238, 'NONE_KNOWN', 'O_POS', 'STAFF_ENTERED', current_date - 238, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

insert into patient_contacts (clinic_id, patient_id, phone_e164, relationship, is_primary, verified_at, verified_by) values 
('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000f', '+919876543212', 'SELF', true, now() - interval '238 days', '33333333-3333-4333-8333-000000000002') on conflict do nothing;

insert into pregnancies (id, clinic_id, patient_id, status, dating_reference_date, dating_reference_ga_days, dating_method, dating_certainty, dating_confirmed_by, dating_confirmed_at, reported_lmp, reported_lmp_certainty, gravida, parity, living, abortions, created_by) values 
('55555555-5555-4555-8555-00000000000f', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000f', 'ACTIVE', current_date - 238, 0, 'LMP', 'CERTAIN', '33333333-3333-4333-8333-000000000001', now() - interval '238 days', current_date - 238, 'CERTAIN', 1, 0, 0, 0, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

-- Menstrual History
insert into menstrual_histories (id, clinic_id, patient_id, recorded_on, lmp, menarche_age_years, duration_days, cycle_length_days, cycle_regularity, flow, pads_per_day, recorded_by) values 
('99999999-9999-4999-9999-000000000002', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000f', current_date - 238, current_date - 238, 14, 4, 30, 'REGULAR', 'MODERATE', 3, '33333333-3333-4333-8333-000000000001') on conflict do nothing;

-- Family History (We don't have family_histories table in migration, wait - let's skip family history if it's not explicitly in 0024. 0024 only added obstetric_history details, menstrual, immunizations. We'll rely on visit narrative).

-- 3 Visits (Week 26, 30, 34 for hypertensive)
insert into visits (id, clinic_id, patient_id, pregnancy_id, visit_type, status, occurred_at, ga_days_at_visit, dating_method_at_visit, impression, examination, diagnosis, consultation_summary, clinician_id, opened_by, saved_at, saved_by) values 
('77777777-7777-4777-8777-0000000000f1', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000f', '55555555-5555-4555-8555-00000000000f', 'ANC_OPD', 'SAVED', now() - interval '56 days', 182, 'LMP', 'G1P0L0A0 at 26 weeks. Early signs of PIH.', 'Mild pedal edema. Normal fundal height.', 'Pregnancy Induced Hypertension (Mild)', 'Advised strict salt restriction and regular BP monitoring.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now() - interval '56 days', '33333333-3333-4333-8333-000000000001'),
('77777777-7777-4777-8777-0000000000f2', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000f', '55555555-5555-4555-8555-00000000000f', 'ANC_OPD', 'SAVED', now() - interval '28 days', 210, 'LMP', 'G1P0L0A0 at 30 weeks. BP rising.', 'Significant pedal edema extending to shin.', 'Pregnancy Induced Hypertension (Moderate)', 'Started on Tab Labetalol 100mg BD. Ordered PIH profile.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now() - interval '28 days', '33333333-3333-4333-8333-000000000001'),
('77777777-7777-4777-8777-0000000000f3', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-00000000000f', '55555555-5555-4555-8555-00000000000f', 'ANC_OPD', 'SAVED', now(), 238, 'LMP', 'G1P0L0A0 at 34 weeks. Severe PIH / Mild Preeclampsia.', 'BP 150/100 despite medication. Headache present. No visual blurring.', 'Preeclampsia', 'Admit for observation and fetal monitoring. Increase Labetalol dose.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now(), '33333333-3333-4333-8333-000000000001')
on conflict (id) do nothing;

insert into visit_vitals (clinic_id, visit_id, bp_systolic_mmhg, bp_diastolic_mmhg, weight_kg, fundal_height_cm, urine_albumin, sequence_no, recorded_by) values 
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-0000000000f1', 130, 85, 68.0, 26, 'NIL', 1, '33333333-3333-4333-8333-000000000002'),
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-0000000000f2', 140, 90, 70.0, 30, 'TRACE', 1, '33333333-3333-4333-8333-000000000002'),
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-0000000000f3', 150, 100, 72.0, 32, 'ONE_PLUS', 1, '33333333-3333-4333-8333-000000000002')
on conflict do nothing;

`;

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

client.connect()
  .then(() => client.query(sql))
  .then(() => {
    console.log('Successfully inserted patients E and F with history into Supabase.');
    return client.end();
  })
  .catch(err => {
    console.error('Error executing query', err);
    client.end();
  });
