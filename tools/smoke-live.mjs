// End-to-end smoke test through the real service-role client, exercising the
// same RPCs the repositories call. Synthetic data only; cleans up after itself.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CLINIC = '11111111-1111-4111-8111-000000000001'
const NURSE = '33333333-3333-4333-8333-000000000002'
const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1 }
const ok = (m) => console.log('ok   ' + m)

// 1. Read the seeded demo patient.
const { data: sunita, error: e1 } = await db.from('patients').select('id, uhid, full_name, blood_group')
  .eq('clinic_id', CLINIC).eq('uhid', 'MH-2026-89412').maybeSingle()
if (e1 || !sunita) fail('read seeded patient: ' + (e1?.message ?? 'not found'))
else ok(`read seeded patient ${sunita.full_name} (${sunita.blood_group})`)

// 2. Register a new patient through the real RPC.
const uhid = 'SMOKE-' + randomBytes(4).toString('hex').toUpperCase()
const { data: newId, error: e2 } = await db.rpc('register_patient', {
  p_clinic_id: CLINIC, p_actor_staff_user_id: NURSE, p_request_id: 'smoke-1',
  p_uhid: uhid, p_full_name: 'Smoke Test Patient',
  p_date_of_birth: null, p_estimated_age_years: 25, p_age_recorded_on: new Date().toISOString().slice(0, 10),
  p_abha_id: null, p_abha_verification: 'NOT_PROVIDED', p_allergy_status: 'NONE_KNOWN',
  p_blood_group: null, p_blood_group_source: null, p_blood_group_recorded_on: null,
  p_allergies: [], p_contacts: [{ phone: '+919833100999', relationship: 'SELF', contactName: 'Smoke', isPrimary: true, hasMessagingConsent: false }],
})
if (e2) fail('register_patient: ' + e2.message); else ok('register_patient -> ' + newId)

// 3. Pregnancy + visit + vitals.
const { data: pregId, error: e3 } = await db.rpc('create_pregnancy', {
  p_clinic_id: CLINIC, p_actor_staff_user_id: NURSE, p_request_id: 'smoke-2', p_patient_id: newId,
  p_dating_reference_date: new Date(Date.now() - 150 * 864e5).toISOString().slice(0, 10),
  p_dating_reference_ga_days: 0, p_dating_method: 'LMP', p_dating_certainty: 'CERTAIN',
  p_reported_lmp: null, p_reported_lmp_certainty: 'UNKNOWN',
  p_gravida: 1, p_parity: 0, p_living: 0, p_abortions: 0,
  p_pre_pregnancy_weight_kg: null, p_height_cm: null, p_obstetric_history: [],
})
if (e3) fail('create_pregnancy: ' + e3.message); else ok('create_pregnancy -> ' + pregId)

const { data: v1 } = await db.rpc('open_or_reuse_visit', { p_clinic_id: CLINIC, p_actor_staff_user_id: NURSE, p_request_id: 'smoke-3', p_pregnancy_id: pregId, p_visit_type: 'ANC_OPD' })
const { data: v2 } = await db.rpc('open_or_reuse_visit', { p_clinic_id: CLINIC, p_actor_staff_user_id: NURSE, p_request_id: 'smoke-4', p_pregnancy_id: pregId, p_visit_type: 'ANC_OPD' })
if (v1?.visit_id !== v2?.visit_id) fail('double-click created two visits')
else if (v1?.created !== true || v2?.created !== false) fail('created flags wrong: ' + v1?.created + '/' + v2?.created)
else ok('open_or_reuse_visit idempotent (created true then false)')

const { error: e5 } = await db.rpc('record_visit_vitals', {
  p_clinic_id: CLINIC, p_actor_staff_user_id: NURSE, p_request_id: 'smoke-5', p_visit_id: v1.visit_id,
  p_bp_systolic_mmhg: 124, p_bp_diastolic_mmhg: 78, p_pulse_bpm: 82, p_respiratory_rate_bpm: null,
  p_temperature_c: 36.9, p_spo2_percent: 99, p_weight_kg: 54.2, p_fundal_height_cm: null,
  p_fetal_heart_rate_bpm: 148, p_urine_albumin: 'NIL', p_urine_sugar: 'NIL', p_note: 'Smoke test',
})
if (e5) fail('record_visit_vitals: ' + e5.message); else ok('record_visit_vitals')

// 4. QR round trip.
//
// The two lines below deliberately mirror mintToken() and hashToken() in
// src/core/tokens/opaque-token.ts, byte count and encoding included, so this
// exercises the real sticker format rather than an approximation of it. If that
// module changes, tests/unit/opaque-token.test.ts fails first -- keep these in
// step with it.
const raw = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(raw, 'utf8').digest('hex')
await db.rpc('issue_patient_qr', { p_clinic_id: CLINIC, p_actor_staff_user_id: NURSE, p_request_id: 'smoke-6', p_patient_id: newId, p_token_hash: hash })
const { data: scanned } = await db.rpc('find_patient_by_qr', { p_clinic_id: CLINIC, p_actor_staff_user_id: NURSE, p_request_id: 'smoke-7', p_token_hash: hash })
if (scanned !== newId) fail('QR scan did not resolve to the patient'); else ok('QR issue -> scan round trip')

// 5. Audit trail.
const { data: audit } = await db.from('audit_events').select('action').like('request_id', 'smoke-%').order('occurred_at')
ok('audit trail: ' + (audit ?? []).map((a) => a.action).join(', '))

// Cleanup.
await db.from('visit_vitals').delete().eq('visit_id', v1.visit_id)
await db.from('visits').delete().eq('pregnancy_id', pregId)
await db.from('pregnancies').delete().eq('id', pregId)
await db.from('patient_contacts').delete().eq('patient_id', newId)
await db.from('patients').delete().eq('id', newId)
const { count } = await db.from('patients').select('*', { count: 'exact', head: true })
ok(`cleaned up; patients remaining: ${count} (3 seeded expected)`)
