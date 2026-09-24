const { Client } = require('pg');

const connectionString = "postgresql://postgres.gbzmnjrwkcsyaxhkiysw:maatrisetu%40123@aws-0-ap-south-1.pooler.supabase.com:5432/postgres";

const sql = `
ALTER TABLE pregnancies ADD COLUMN IF NOT EXISTS birth_plan JSONB DEFAULT '{}'::jsonb NOT NULL;

UPDATE pregnancies 
SET birth_plan = '{"planned_place": "Tertiary Care Hospital (District Level)", "companion_name": "Rajesh Rathi (Husband)", "transport_arranged": true, "blood_donor_identified": true, "funds_saved": true, "special_instructions": "High risk - multiple co-morbidities. Elective LSCS planned at 38 weeks. Arrange 2 units PRBC."}'::jsonb
WHERE patient_id = '44444444-4444-4444-8444-00000000000c';

UPDATE pregnancies 
SET birth_plan = '{"planned_place": "Primary Health Centre", "companion_name": "Suresh Patel (Husband)", "transport_arranged": true, "blood_donor_identified": false, "funds_saved": true, "special_instructions": "GDM on diet. Monitor blood sugar during labor. Alert pediatrician for possible neonatal hypoglycemia."}'::jsonb
WHERE patient_id = '44444444-4444-4444-8444-00000000000e';

UPDATE pregnancies 
SET birth_plan = '{"planned_place": "Community Health Centre / FRU", "companion_name": "Amit Desai (Husband)", "transport_arranged": true, "blood_donor_identified": true, "funds_saved": true, "special_instructions": "Severe PIH. Plan for early induction at 37 weeks. Keep MgSO4 ready."}'::jsonb
WHERE patient_id = '44444444-4444-4444-8444-00000000000f';
`;

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log("Connected to DB.");

  try {
    await client.query(sql);
    console.log("Migration and data population successful.");
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

main();
