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

console.log(
  failures === 0
    ? '\nAll page checks passed.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
