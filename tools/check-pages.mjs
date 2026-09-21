/**
 * Renders the authenticated screens as a real signed-in user and asserts what
 * comes back.
 *
 * Why this exists: Next server actions are not curl-able and Playwright's
 * Chrome launch times out on this machine, so the authenticated pages were
 * repeatedly shipped as "written but unproven". This closes that gap without a
 * browser — it signs in through supabase-js, encodes the session the way
 * @supabase/ssr expects to find it in a cookie, and fetches the pages.
 *
 * It checks *rendered content*, not just status codes. A 200 proves the route
 * compiled; it does not prove the page found the patient, computed a
 * gestational age, or refused an assistant.
 *
 * Usage:  node tools/check-pages.mjs [baseUrl]      (default http://localhost:3000)
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BASE = process.argv[2] ?? 'http://localhost:3000'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const PROJECT_REF = new URL(URL_).hostname.split('.')[0]

// Seeded synthetic patients (supabase/seed.sql).
const SUNITA = '44444444-4444-4444-8444-00000000000a'
const LAKSHMI = '44444444-4444-4444-8444-00000000000c'

let failures = 0
const report = (ok, label, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

/**
 * Encode a session the way @supabase/ssr stores it.
 *
 * The cookie is `sb-<ref>-auth-token`, holding base64url JSON behind a
 * `base64-` marker, split into `.0`, `.1`… chunks past 3180 characters.
 */
function sessionCookies(session) {
  const name = `sb-${PROJECT_REF}-auth-token`
  const value = `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`

  const MAX = 3180
  if (value.length <= MAX) return [`${name}=${value}`]

  const chunks = []
  for (let i = 0; i < value.length; i += MAX) {
    chunks.push(`${name}.${chunks.length}=${value.slice(i, i + MAX)}`)
  }
  return chunks
}

async function signIn(email) {
  const db = createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.signInWithPassword({ email, password: 'maatrisetu' })
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`)
  return sessionCookies(data.session).join('; ')
}

async function get(path, cookie) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { cookie },
    redirect: 'manual',
  })
  return { status: response.status, body: await response.text() }
}

console.log(`Checking ${BASE} as seeded staff\n`)

/* -------------------------------------------------------------------------- */
/* Doctor                                                                     */
/* -------------------------------------------------------------------------- */

const doctor = await signIn('doctor@maatrisetu.local')

{
  const { status, body } = await get('/clinic', doctor)
  report(status === 200, 'clinic home renders', `status ${status}`)
  report(body.includes('Dr. Ananya Rao'), 'shows the signed-in clinician')
  report(/acting as/i.test(body) || body.toLowerCase().includes('doctor'), 'shows the acting role')
}

{
  const { status, body } = await get('/clinic/patients?q=Sunita', doctor)
  report(status === 200, 'search renders', `status ${status}`)
  report(body.includes('Sunita Devi'), 'finds the seeded patient by name')
  report(body.includes('MH-2026-89412'), 'shows her file number')
}

{
  // Phone search must survive being typed the way a mother recites it.
  const { body } = await get('/clinic/patients?q=98331%2000001', doctor)
  report(body.includes('Sunita Devi'), 'finds her by a loosely-typed phone number')
}

{
  const { status, body } = await get(`/clinic/patients/${SUNITA}`, doctor)
  report(status === 200, 'patient record renders', `status ${status}`)
  report(body.includes('Sunita Devi'), 'shows her name')

  // The seeded case: Rh negative, penicillin allergy, previous LSCS.
  report(body.includes('Rh negative'), 'surfaces Rh-negative as a recorded fact')
  report(body.includes('Penicillin'), 'surfaces the recorded allergy')
  report(body.includes('Previous uterine scar recorded'), 'surfaces the previous scar')

  // Dating is anchored 228 days before today in the seed, so she is at term-ish
  // and the page must show a computed gestation, not a stored one.
  report(/\d+w \+ \d+d/.test(body), 'computes a gestational age')
  report(body.includes('Estimated due date'), 'shows an estimated due date')
}

{
  // The honesty case. Lakshmi has no dating anchor; the page must say so
  // rather than invent a gestational age.
  const { body } = await get(`/clinic/patients/${LAKSHMI}`, doctor)
  report(body.includes('Lakshmi Yadav'), 'renders the undated patient')
  report(body.includes('Dating not established'), 'refuses to invent a gestational age')
  report(!/\d+w \+ \d+d/.test(body), 'shows no gestational age for her')
  report(body.includes('Allergies not recorded'), 'renders unknown allergies as unknown')
}

{
  const { status, body } = await get('/clinic/scan', doctor)
  report(status === 200, 'scan page renders', `status ${status}`)
  report(body.includes('Scan the file sticker'), 'shows the capture field')
  // The token must never travel in a URL, so the capture is a form post rather
  // than a link or a GET. A regression here would leak working keys into
  // browser history and proxy logs on a shared counter machine.
  report(!body.includes('method="get"'), 'captures by POST, not GET')
  report(body.includes('search for her by name'), 'offers the sticker-failed fallback')
}

{
  // Every seeded patient already has an active episode, so the form must not
  // be offered — a second episode would split her record in two, and the
  // service would refuse the submit anyway.
  const { status, body } = await get(`/clinic/patients/${SUNITA}/pregnancy/new`, doctor)
  report(status === 200, 'pregnancy form route renders', `status ${status}`)
  report(body.includes('already has an open pregnancy'), 'refuses a second active episode')
  report(!body.includes('How is this pregnancy dated?'), 'does not offer the form regardless')
}

{
  /*
   * The dating form itself, which no seeded patient can reach — they all have
   * an active episode. The three dating branches are the most safety-relevant
   * UI in this flow (an LMP, a scan-measured gestation, or an explicit "not
   * established"), so rendering them is worth a throwaway patient.
   *
   * Created and removed through the service role, the same way smoke-live.mjs
   * does. Synthetic, and cleaned up in `finally` so a failed assertion cannot
   * leave a stray record behind.
   */
  const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const CLINIC = '11111111-1111-4111-8111-000000000001'
  const NURSE = '33333333-3333-4333-8333-000000000002'
  let scratchId = null

  try {
    const { data, error } = await admin.rpc('register_patient', {
      p_clinic_id: CLINIC,
      p_actor_staff_user_id: NURSE,
      p_request_id: 'pagecheck-1',
      p_uhid: 'PAGECHK-' + Math.random().toString(16).slice(2, 10).toUpperCase(),
      p_full_name: 'Page Check Patient',
      p_date_of_birth: null,
      p_estimated_age_years: 24,
      p_age_recorded_on: new Date().toISOString().slice(0, 10),
      p_abha_id: null,
      p_abha_verification: 'NOT_PROVIDED',
      p_allergy_status: 'UNKNOWN',
      p_blood_group: null,
      p_blood_group_source: null,
      p_blood_group_recorded_on: null,
      p_allergies: [],
      p_contacts: [],
    })

    if (error) throw new Error(error.message)
    scratchId = data

    const { status, body } = await get(`/clinic/patients/${scratchId}/pregnancy/new`, doctor)
    report(status === 200, 'dating form renders for a patient with no episode', `status ${status}`)
    report(body.includes('How is this pregnancy dated?'), 'asks the dating question first')
    report(body.includes('Last menstrual period'), 'offers LMP dating')
    report(body.includes('Dating scan'), 'offers scan dating')
    report(body.includes('Not established yet'), 'offers "not established" as a real choice')

    const record = await get(`/clinic/patients/${scratchId}`, doctor)
    report(
      record.body.includes('No active pregnancy episode'),
      'record page states there is no episode',
    )
    report(
      record.body.includes('Allergies not recorded'),
      'a patient registered without an allergy answer reads as not recorded',
    )
  } finally {
    if (scratchId) {
      await admin.from('audit_events').delete().like('request_id', 'pagecheck-%')
      await admin.from('patient_contacts').delete().eq('patient_id', scratchId)
      await admin.from('patients').delete().eq('id', scratchId)
    }
  }
}

{
  const { status, body } = await get(`/clinic/patients/${SUNITA}/visit`, doctor)
  report(status === 200, 'visit page renders', `status ${status}`)
  // Computed live from the pregnancy's dating, not read off the visit row —
  // gaDaysAtVisit is null until a consultation is saved.
  report(/\d+w \+ \d+d/.test(body), 'shows a live gestational age')
  // The seed leaves her last visit SAVED, so today has no open encounter.
  report(body.includes('No visit open'), 'reports no open visit')
  report(body.includes('Start today'), 'offers to start one')
}

{
  const { body } = await get(`/clinic/patients/${LAKSHMI}/visit`, doctor)
  report(body.includes('dating not established'), 'visit page is honest about missing dating')
  report(!/\d+w \+ \d+d/.test(body), 'invents no gestational age on the visit page')
}

/* -------------------------------------------------------------------------- */
/* Assistant — minimisation                                                   */
/* -------------------------------------------------------------------------- */

const assistant = await signIn('assistant@maatrisetu.local')

{
  const { status, body } = await get('/clinic/patients?q=Sunita', assistant)
  report(status === 200, 'assistant may search', `status ${status}`)
  report(body.includes('Sunita Devi'), 'assistant sees the name needed to attach a slip')
  // She holds patient.search but not patient.read, so the result carries
  // identity only — no age, no sticker state.
  report(!body.includes('Sticker issued'), 'assistant sees no demographics in results')
}

{
  const { body } = await get(`/clinic/patients/${SUNITA}`, assistant)
  report(body.includes('Not available to you'), 'assistant is refused the full record')
  report(!body.includes('Penicillin'), 'no clinical detail leaks to the assistant')
}

{
  // A sticker is a faster way to reach a record, never a way to reach one you
  // could not otherwise open. An assistant lacks patient.read, so she must not
  // be able to scan past that boundary.
  const { body } = await get('/clinic/scan', assistant)
  report(body.includes('Not available to you'), 'assistant cannot scan into a record')
  report(!body.includes('Scan the file sticker'), 'no capture field for the assistant')
}

/* -------------------------------------------------------------------------- */
/* Nurse — prescriptions are doctor-only                                      */
/* -------------------------------------------------------------------------- */

const nurse = await signIn('nurse@maatrisetu.local')

{
  const { status, body } = await get('/clinic', nurse)
  report(status === 200, 'nurse home renders', `status ${status}`)
  report(body.includes('Register a patient'), 'nurse is offered registration')
  report(!body.includes('Consultation cockpit'), 'nurse is not offered the cockpit')
}

{
  // Vitals are the nurse's job and happen before the doctor sees the patient.
  // Making that wait on a clinician would put the bottleneck exactly where the
  // product is trying to remove it.
  const { status, body } = await get(`/clinic/patients/${SUNITA}/visit`, nurse)
  report(status === 200, 'nurse may open the visit page', `status ${status}`)
  report(body.includes('Start today'), 'nurse may start a visit')
}

{
  const { body } = await get(`/clinic/patients/${SUNITA}/visit`, assistant)
  report(body.includes('Not available to you'), 'assistant cannot open a visit')
}

console.log(
  failures === 0
    ? '\nAll page checks passed.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
