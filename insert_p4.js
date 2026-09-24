const { Client } = require('pg');

const connectionString = "postgresql://postgres.gbzmnjrwkcsyaxhkiysw:maatrisetu%40123@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";

const sql = `
-- ---------------------------------------------------------------------------
-- Patient G — Normal ANC with Kyphosis (LSCS under GA)
-- ---------------------------------------------------------------------------
insert into patients (id, clinic_id, uhid, full_name, estimated_age_years, age_recorded_on, allergy_status, blood_group, blood_group_source, blood_group_recorded_on, created_by) values 
('44444444-4444-4444-8444-000000000010', '11111111-1111-4111-8111-000000000001', 'MH-2026-90303', 'Sunita Sharma', 26, current_date - 150, 'NONE_KNOWN', 'B_POS', 'STAFF_ENTERED', current_date - 150, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

insert into patient_contacts (clinic_id, patient_id, phone_e164, relationship, is_primary, verified_at, verified_by) values 
('11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000010', '+919876543213', 'HUSBAND', true, now() - interval '150 days', '33333333-3333-4333-8333-000000000002') on conflict do nothing;

insert into pregnancies (id, clinic_id, patient_id, status, dating_reference_date, dating_reference_ga_days, dating_method, dating_certainty, dating_confirmed_by, dating_confirmed_at, reported_lmp, reported_lmp_certainty, gravida, parity, living, abortions, birth_plan, created_by) values 
('55555555-5555-4555-8555-000000000010', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000010', 'ACTIVE', current_date - 150, 0, 'LMP', 'CERTAIN', '33333333-3333-4333-8333-000000000001', now() - interval '150 days', current_date - 150, 'CERTAIN', 1, 0, 0, 0, '{"planned_place": "Tertiary Care Hospital (District Level)", "companion_name": "Ramesh Sharma (Husband)", "transport_arranged": true, "blood_donor_identified": true, "funds_saved": true, "special_instructions": "Kyphosis noted on general physical examination. Spinal anomaly contraindicates spinal anesthesia. Plan for LSCS under General Anesthesia (GA)."}'::jsonb, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

-- Menstrual History
insert into menstrual_histories (id, clinic_id, patient_id, recorded_on, lmp, menarche_age_years, duration_days, cycle_length_days, cycle_regularity, flow, pads_per_day, recorded_by) values 
('99999999-9999-4999-9999-000000000003', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000010', current_date - 150, current_date - 150, 12, 4, 28, 'REGULAR', 'MODERATE', 3, '33333333-3333-4333-8333-000000000001') on conflict do nothing;

-- Normal ANC Visit
insert into visits (id, clinic_id, patient_id, pregnancy_id, visit_type, status, occurred_at, ga_days_at_visit, dating_method_at_visit, impression, examination, diagnosis, consultation_summary, clinician_id, opened_by, saved_at, saved_by) values 
('77777777-7777-4777-8777-000000000101', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000010', '55555555-5555-4555-8555-000000000010', 'ANC_OPD', 'SAVED', now(), 150, 'LMP', 'G1 at 21 weeks 3 days. Normal ANC but mother has Kyphosis.', 'General examination reveals severe kyphosis of the thoracic spine. Fundal height corresponds to dates. FHS regular and normal.', 'Primi with Kyphosis', 'Discussed birth plan with couple. Given the severe kyphosis, regional (spinal/epidural) anesthesia may be difficult or contraindicated. Planned for Elective LSCS under General Anesthesia at term. Referred to anesthetist for pre-anesthesia checkup.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now(), '33333333-3333-4333-8333-000000000001')
on conflict (id) do nothing;

insert into visit_vitals (clinic_id, visit_id, bp_systolic_mmhg, bp_diastolic_mmhg, weight_kg, fundal_height_cm, urine_sugar, sequence_no, recorded_by) values 
('11111111-1111-4111-8111-000000000001', '77777777-7777-4777-8777-000000000101', 110, 70, 52.0, 20, 'NIL', 1, '33333333-3333-4333-8333-000000000002')
on conflict do nothing;

-- Normal Labs
insert into observations (id, clinic_id, patient_id, pregnancy_id, category, test_code, test_name, value_numeric, unit_original, unit_normalized, value_normalized, reference_low, reference_high, observed_date, observed_date_precision, source, verified_by, verified_at, flagged_by_clinician) values 
('66666666-6666-4666-8666-000000000101', '11111111-1111-4111-8111-000000000001', '44444444-4444-4444-8444-000000000010', '55555555-5555-4555-8555-000000000010', 'HEMATOLOGY', 'hb', 'Haemoglobin', 11.5, 'g/dL', 'g/dL', 11.5, 11, 15, current_date, 'DAY', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now(), false)
on conflict (id) do nothing;
`;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log("Connected to DB.");

  try {
    await client.query(sql);
    console.log("Patient Sunita Sharma with Kyphosis added successfully.");
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

main();
