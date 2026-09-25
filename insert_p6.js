const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });
const crypto = require('crypto');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const p6Id = crypto.randomUUID();
const preg6Id = crypto.randomUUID();
const visitId = crypto.randomUUID();
const scan1Id = crypto.randomUUID();
const scan2Id = crypto.randomUUID();
const scan3Id = crypto.randomUUID();

const sql = `
-- Patient F (Polyhydramnios)
insert into patients (id, clinic_id, uhid, full_name, estimated_age_years, age_recorded_on, allergy_status, blood_group, blood_group_source, blood_group_recorded_on, created_by) 
values ('${p6Id}', '11111111-1111-4111-8111-000000000001', 'MH-2026-667789', 'Kavya Menon', 29, current_date - 200, 'NONE_KNOWN', 'O_POS', 'STAFF_ENTERED', current_date - 200, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

insert into patient_contacts (clinic_id, patient_id, phone_e164, relationship, is_primary, verified_at, verified_by) 
values ('11111111-1111-4111-8111-000000000001', '${p6Id}', '+919833155555', 'SELF', true, now() - interval '200 days', '33333333-3333-4333-8333-000000000002') on conflict do nothing;

insert into pregnancies (id, clinic_id, patient_id, status, dating_reference_date, dating_reference_ga_days, dating_method, dating_certainty, dating_confirmed_by, dating_confirmed_at, reported_lmp, reported_lmp_certainty, gravida, parity, living, abortions, created_by) 
values ('${preg6Id}', '11111111-1111-4111-8111-000000000001', '${p6Id}', 'ACTIVE', current_date - 200, 0, 'LMP', 'CERTAIN', '33333333-3333-4333-8333-000000000001', now() - interval '200 days', current_date - 200, 'CERTAIN', 2, 1, 1, 0, '33333333-3333-4333-8333-000000000002') on conflict (id) do nothing;

insert into scan_reports (id, clinic_id, patient_id, pregnancy_id, scan_type, scan_date, scan_date_precision, afi_cm, deepest_pocket_cm, presentation, findings, impression, source, verified_by, verified_at) 
values 
('${scan1Id}', '11111111-1111-4111-8111-000000000001', '${p6Id}', '${preg6Id}', 'TIFFA', current_date - 60, 'DAY', 26, 9, 'CEPHALIC', 'Increased amniotic fluid volume.', 'Polyhydramnios', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '60 days'),
('${scan2Id}', '11111111-1111-4111-8111-000000000001', '${p6Id}', '${preg6Id}', 'GROWTH', current_date - 30, 'DAY', 28, 10, 'UNSTABLE', 'Marked polyhydramnios.', 'Severe Polyhydramnios', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '30 days'),
('${scan3Id}', '11111111-1111-4111-8111-000000000001', '${p6Id}', '${preg6Id}', 'GROWTH', current_date - 5, 'DAY', 30, 11, 'TRANSVERSE', 'Persistent severe polyhydramnios.', 'Severe Polyhydramnios', 'STAFF_ENTERED', '33333333-3333-4333-8333-000000000001', now() - interval '5 days')
on conflict do nothing;

insert into finding_pins (clinic_id, pregnancy_id, scan_report_id, pinned_by) values 
('11111111-1111-4111-8111-000000000001', '${preg6Id}', '${scan2Id}', '33333333-3333-4333-8333-000000000001'),
('11111111-1111-4111-8111-000000000001', '${preg6Id}', '${scan3Id}', '33333333-3333-4333-8333-000000000001')
on conflict do nothing;

insert into visits (id, clinic_id, patient_id, pregnancy_id, visit_type, status, occurred_at, ga_days_at_visit, dating_method_at_visit, impression, clinician_id, opened_by, saved_at, saved_by) 
values ('${visitId}', '11111111-1111-4111-8111-000000000001', '${p6Id}', '${preg6Id}', 'ANC_OPD', 'SAVED', now(), 200, 'LMP', 'Patient complaining of breathlessness and abdominal discomfort due to distension.', '33333333-3333-4333-8333-000000000001', '33333333-3333-4333-8333-000000000002', now(), '33333333-3333-4333-8333-000000000001') on conflict (id) do nothing;
`;

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

client.connect()
  .then(() => client.query(sql))
  .then(() => {
    console.log('Successfully inserted Polyhydramnios patient (P6) via SQL.');
    return client.end();
  })
  .catch(err => {
    console.error('Error executing query', err);
    client.end();
  });
