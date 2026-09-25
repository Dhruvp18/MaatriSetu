const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const p7Id = crypto.randomUUID();
const preg7Id = crypto.randomUUID();
const visitId = crypto.randomUUID();
const scan1Id = crypto.randomUUID();
const scan2Id = crypto.randomUUID();
const scan3Id = crypto.randomUUID();
const obs1Id = crypto.randomUUID();
const obs2Id = crypto.randomUUID();
const obs3Id = crypto.randomUUID();

const sql = `
-- Patient 7 (IUGR / FGR)
insert into patients (id, clinic_id, uhid, full_name, estimated_age_years, age_recorded_on, allergy_status, blood_group, blood_group_source, blood_group_recorded_on, created_by) 
values ('${p7Id}', '11111111-1111-4111-8111-000000000001', 'MH-2026-778899', 'Priya Desai', 26, current_date - 240, 'NONE_KNOWN', 'A_POS', 'STAFF_ENTERED', current_date - 240, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

insert into patient_contacts (clinic_id, patient_id, phone_e164, relationship, is_primary, verified_at, verified_by) 
values ('11111111-1111-4111-8111-000000000001', '${p7Id}', '+919833166666', 'SELF', true, now() - interval '240 days', '33333333-3333-4333-8333-000000000002') on conflict do nothing;

insert into pregnancies (id, clinic_id, patient_id, status, dating_reference_date, dating_reference_ga_days, dating_method, dating_certainty, dating_confirmed_by, dating_confirmed_at, reported_lmp, reported_lmp_certainty, gravida, parity, living, abortions, created_by) 
values ('${preg7Id}', '11111111-1111-4111-8111-000000000001', '${p7Id}', 'ACTIVE', current_date - 240, 0, 'LMP', 'CERTAIN', '33333333-3333-4333-8333-000000000001', now() - interval '240 days', current_date - 240, 'CERTAIN', 1, 0, 0, 0, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

-- Scans with dropping EFW Centile
insert into scan_reports (id, clinic_id, patient_id, pregnancy_id, scan_type, scan_date, scan_date_precision, afi_cm, deepest_pocket_cm, presentation, findings, impression, source, verified_by, verified_at, efw_grams, efw_centile, umbilical_artery_pi) 
values 
('${scan1Id}', '11111111-1111-4111-8111-000000000001', '${p7Id}', '${preg7Id}', 'GROWTH', current_date - 60, 'DAY', 12, 4, 'CEPHALIC', 'Normal growth trajectory.', 'Appropriate for Gestational Age', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '60 days', 1000, 45, 0.9),
('${scan2Id}', '11111111-1111-4111-8111-000000000001', '${p7Id}', '${preg7Id}', 'GROWTH', current_date - 30, 'DAY', 9, 3, 'CEPHALIC', 'Slowing growth velocity. EFW at 12th centile.', 'Early restricted growth', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '30 days', 1500, 12, 1.2),
('${scan3Id}', '11111111-1111-4111-8111-000000000001', '${p7Id}', '${preg7Id}', 'GROWTH_DOPPLER', current_date - 5, 'DAY', 7, 2, 'CEPHALIC', 'EFW < 10th centile. Elevated umbilical artery PI. Asymmetrical growth restriction with AC lagging.', 'Intrauterine Growth Restriction (IUGR)', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '5 days', 1800, 4, 1.6)
on conflict do nothing;

-- Adding Abdominal Circumference Centile (AC Centile) to Observations
insert into observations (id, clinic_id, patient_id, pregnancy_id, category, test_code, test_name, value_numeric, unit_original, unit_normalized, reference_low, reference_high, source, verified_by, verified_at, observed_date, observed_date_precision)
values 
('${obs1Id}', '11111111-1111-4111-8111-000000000001', '${p7Id}', '${preg7Id}', 'OTHER', 'ac', 'Abdominal Circumference', 42, 'th', 'th', 10, 90, 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '60 days', current_date - 60, 'DAY'),
('${obs2Id}', '11111111-1111-4111-8111-000000000001', '${p7Id}', '${preg7Id}', 'OTHER', 'ac', 'Abdominal Circumference', 9, 'th', 'th', 10, 90, 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '30 days', current_date - 30, 'DAY'),
('${obs3Id}', '11111111-1111-4111-8111-000000000001', '${p7Id}', '${preg7Id}', 'OTHER', 'ac', 'Abdominal Circumference', 3, 'th', 'th', 10, 90, 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '5 days', current_date - 5, 'DAY')
on conflict do nothing;

insert into finding_pins (clinic_id, pregnancy_id, scan_report_id, pinned_by) values 
('11111111-1111-4111-8111-000000000001', '${preg7Id}', '${scan3Id}', '33333333-3333-4333-8333-000000000001')
on conflict do nothing;

insert into visits (id, clinic_id, patient_id, pregnancy_id, visit_type, status, occurred_at, ga_days_at_visit, dating_method_at_visit, impression, diagnosis, clinician_id, opened_by, saved_at, saved_by) 
values ('${visitId}', '11111111-1111-4111-8111-000000000001', '${p7Id}', '${preg7Id}', 'ANC_OPD', 'SAVED', now(), 240, 'LMP', 'Patient presenting with decreased fetal movements. Scans show asymmetrical IUGR.', 'IUGR', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now(), '33333333-3333-4333-8333-000000000001') on conflict (id) do nothing;
`;

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

client.connect()
  .then(() => client.query(sql))
  .then(() => {
    console.log('Successfully inserted IUGR patient (P7) via SQL.');
    return client.end();
  })
  .catch(err => {
    console.error('Error executing query', err);
    client.end();
  });
