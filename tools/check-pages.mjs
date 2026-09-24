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
// Signed in early so the cockpit's role-minimisation can be checked alongside
// the doctor's view of the same screen.
const nurseEarly = await signIn('nurse@maatrisetu.local')

{
  const { status, body } = await get('/clinic', doctor)
  report(status === 200, 'clinic home renders', `status ${status}`)
  report(body.includes('Dr. Ananya Rao'), 'shows the signed-in clinician')
  report(/acting as/i.test(body) || body.toLowerCase().includes('doctor'), 'shows the acting role')
  report(body.includes('Today’s patients'), 'home leads with today’s list')
  report(body.includes('Find a patient'), 'home offers search by name, file number or phone')
  report(body.includes('Scan QR'), 'home offers a QR scan')
  report(!body.includes('Not built yet'), 'home offers nothing that is not built')
}

{
  const { status, body } = await get(`/clinic/patients/${SUNITA}/card`, doctor)
  report(status === 200, 'patient card page renders', `status ${status}`)
  report(body.includes('Generate'), 'patient card is generated on demand, with a fresh QR')
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

{
  const { status, body } = await get(`/clinic/patients/${SUNITA}/cockpit`, doctor)
  report(status === 200, 'cockpit renders', `status ${status}`)

  // Header banner (PRD F3).
  report(body.includes('Sunita Devi'), 'banner names the patient')
  report(/G2 P1 L1 A0/.test(body), 'banner shows the GPLA badge')
  report(body.includes('Rh-negative'), 'banner flags Rh-negative as a recorded fact')
  report(body.includes('Blood grp'), 'banner leads with the colour-coded blood group')
  report(body.includes('Penicillin'), 'banner flags the recorded allergy')
  report(body.includes('Previous uterine scar'), 'banner flags the previous scar')
  report(/\d+w \+ \d+d/.test(body), 'banner computes POG live')

  // Presentation belongs to the scan that observed it, dated — never pinned to
  // a banner where it would go stale unnoticed.
  // Visible markup only: the page streams behind a loading skeleton, so the
  // serialized data (which names the scan's presentation) can precede it.
  const visible = body.replace(/<script[\s\S]*?<\/script>/g, '')
  const bannerEnd = visible.indexOf('Diagnostic Reports for Current Visit')
  const banner = bannerEnd > 0 ? visible.slice(0, bannerEnd) : visible
  report(!/cephalic/i.test(banner), 'banner carries no fetal presentation')
  report(/cephalic/i.test(body), 'presentation appears with the scan instead')

  // The whole reason observations and finding_pins are separate tables. The
  // seed pins only the latest haemoglobin; all three must still be on the line.
  report(/11\.2\s*\S\s*9\.8\s*\S\s*8\.6/.test(body), 'Hb trend shows every verified value, not just pins')
  report(body.includes('g/dL'), 'trend carries its unit')

  // The read accordions (PRD F5). The writing ones need an open visit and are
  // checked further down, once one is opened.
  for (const section of [
    'Diagnostic Reports for Current Visit',
    'Active medication',
    'Significant blood',
    'Significant scans',
    'Previous obstetric history',
    'Previous menstrual history',
    'Immunization history',
  ]) {
    report(body.includes(section), `accordion present: ${section}`)
  }

  report(body.includes('Ferrous ascorbate'), 'ongoing medication lists the seeded prescription')
  report(body.includes('1-0-0') && body.includes('(OD)'), 'dosing is written in the pad notation, 1-0-0 (OD)')
  report(body.includes('Gravida'), 'past pregnancies are listed by gravida')
  report(body.includes('TIFFA'), 'scans are listed')

  // The seed leaves her last visit SAVED, so at this point no visit is open.
  // Orders belong to a consultation, so the sixth accordion must say there is
  // nothing to record against rather than offering inputs that cannot persist.
  // Her messages, above the record. The seed gives Sunita one unresolved
  // Marathi note about swelling.
  // Her messages sit behind the queries widget: purple to address, green
  // addressed. The messages themselves render in its modal, client-side, which
  // server HTML cannot show — so the widget and its counts are what is checked.
  report(body.includes('Patient queries'), 'voice queries widget appears on the cockpit')
  report(/\d+(<!-- -->)?\s*to address/.test(body), 'widget counts queries still to address')
  report(
    !body.includes('pre-eclampsia') && !body.includes('RED_FLAG'),
    'routing never states what she has',
  )

  report(
    body.includes('No consultation is open today'),
    'fresh orders refuses to collect orders with no open visit',
  )
  report(body.includes('Start today’s consultation'), 'cockpit offers to start the consultation')
  report(body.includes('refer to a doctor'), 'reference tab is visible before a visit is open')
  report(body.includes('Upload reports / scans'), 'cockpit offers report upload')
  report(body.includes('Patient card'), 'cockpit offers the patient card')
  report(!body.includes('Save &amp; next patient'), 'no commit offered without a visit')
}

{
  // A nurse may read the record but not prescriptions — by the matrix and,
  // independently, by RLS.
  const { status, body } = await get(`/clinic/patients/${SUNITA}/cockpit`, nurseEarly)
  report(status === 200, 'nurse may open the cockpit', `status ${status}`)
  report(body.includes('Significant blood'), 'nurse sees labs')
  report(
    !body.includes('Ferrous ascorbate'),
    'nurse sees no prescription detail',
  )
}

{
  const { body } = await get(`/clinic/patients/${LAKSHMI}/cockpit`, doctor)
  report(body.includes('Dating not established'), 'cockpit is honest about missing dating')
  report(!/\d+w \+ \d+d/.test(body), 'cockpit invents no gestational age')
}

{
  // Save & Next needs an open visit. The seed leaves Sunita's last visit SAVED,
  // so one is opened here and cancelled afterwards — a cancelled visit is
  // excluded from history, and cancelling is the audited way to undo an
  // encounter that should not have been started.
  const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const CLINIC = '11111111-1111-4111-8111-000000000001'
  const DOCTOR = '33333333-3333-4333-8333-000000000001'
  const SUNITA_PREGNANCY = '55555555-5555-4555-8555-00000000000a'
  let openedVisitId = null
  // The ingestion fixture below, torn down in the finally.
  let uploadId = null
  let runId = null

  try {
    const { data, error } = await admin.rpc('open_or_reuse_visit', {
      p_clinic_id: CLINIC,
      p_actor_staff_user_id: DOCTOR,
      p_request_id: 'pagecheck-visit',
      p_pregnancy_id: SUNITA_PREGNANCY,
      p_visit_type: 'ANC_OPD',
    })
    if (error) throw new Error(error.message)
    // open_or_reuse_visit hands back a visit someone already has open. That is
    // a real consultation in progress: it must never be cancelled by a check,
    // so the run stops rather than borrowing it.
    if (!data.created) {
      throw new Error(
        'Sunita already has an open visit (someone is using the app). Refusing to reuse and cancel it — close it or rerun later.',
      )
    }
    openedVisitId = data.visit_id

    // A read report awaiting verification, built through the real routines so
    // this exercises the ingestion path rather than a hand-written row. No
    // storage object is created: nothing on these screens downloads the image.
    {
      const { data: id, error: uploadError } = await admin.rpc('record_report_upload', {
        p_clinic_id: CLINIC,
        p_actor_staff_user_id: DOCTOR,
        p_request_id: 'pagecheck-upload',
        p_patient_id: SUNITA,
        p_pregnancy_id: SUNITA_PREGNANCY,
        p_visit_id: openedVisitId,
        p_object_key: `pagecheck/${crypto.randomUUID()}.jpg`,
        p_content_type: 'image/jpeg',
        p_byte_size: 204800,
        p_sha256: `\\x${'ab'.repeat(32)}`,
      })
      if (uploadError) throw new Error(uploadError.message)
      uploadId = id

      const { data: run, error: runError } = await admin.rpc('start_extraction_run', {
        p_clinic_id: CLINIC,
        p_worker: 'pagecheck',
        p_request_id: 'pagecheck-run',
        p_upload_id: uploadId,
        p_provider: 'fixture',
        p_model: 'fixture',
        p_prompt_version: 'fixture-v1',
      })
      if (runError) throw new Error(runError.message)
      runId = run

      const { error: completeError } = await admin.rpc('complete_extraction_run', {
        p_clinic_id: CLINIC,
        p_worker: 'pagecheck',
        p_request_id: 'pagecheck-complete',
        p_run_id: runId,
        p_raw_output: { note: 'page check' },
        p_report_type: 'CBC',
        p_candidates: [
          {
            testCode: 'hb',
            printedLabel: 'Haemoglobin (Hb%)',
            valueNumeric: 8.6,
            unit: 'g/dL',
            referenceLow: 11,
            referenceHigh: 15,
            observedDate: '2026-09-14',
            confidence: 0.97,
          },
          {
            // Deliberately low confidence and an Indian-convention unit: both
            // are things the screen has to surface rather than smooth over.
            testCode: 'platelets',
            printedLabel: 'Platelet count',
            valueNumeric: 1.85,
            unit: 'lakhs/cumm',
            confidence: 0.41,
          },
        ],
      })
      if (completeError) throw new Error(completeError.message)
    }

    {
      const { status, body } = await get(`/clinic/patients/${SUNITA}/reports`, doctor)
      report(status === 200, 'reports page renders', `status ${status}`)
      report(body.includes('Photograph or PDF of the report'), 'offers the camera capture field')
      report(body.includes('Haemoglobin (Hb%)'), 'shows the printed label from the slip')
      report(body.includes('8.6 g/dL'), 'shows the extracted value with its unit')
      report(body.includes('lakhs/cumm'), 'keeps the printed unit rather than converting it')
      // Matched without the label: React puts a comment marker between static
      // text and an interpolated value, so "slip range" and the range itself
      // are not contiguous in the HTML.
      report(body.includes('11 – 15'), 'shows the range the lab printed')
      report(
        body.includes('low confidence') || body.includes('41%'),
        'surfaces the uncertain reading',
      )
      report(
        body.includes('Sample output'),
        'labels fixture output as not a reading of the photograph',
      )
      report(
        body.includes('Nothing on this page is part of the patient'),
        'states that nothing here is in the record',
      )
      // The whole safety claim, checked at the read path: candidate values must
      // not have leaked into the verified tables.
      report(!body.includes('★'), 'no candidate is rendered as a verified finding')
    }

    {
      // An assistant holds upload.create and upload.read but not patient.read.
      // The page has to work for her without putting demographics on screen.
      const assistantEarly = await signIn('assistant@maatrisetu.local')
      const { status, body } = await get(`/clinic/patients/${SUNITA}/reports`, assistantEarly)
      report(status === 200, 'assistant may open report intake', `status ${status}`)
      report(body.includes('Photograph or PDF of the report'), 'assistant may upload a slip')
      report(!body.includes('Sunita Devi'), 'no name is shown to the assistant')
      report(!body.includes('Penicillin'), 'no clinical detail leaks on the reports page')
    }

    const { body } = await get(`/clinic/patients/${SUNITA}/cockpit`, doctor)

    report(
      body.includes('Pending Doctor Review'),
      'cockpit offers the extracted values for verification',
    )
    report(
      body.includes('Flag to Significant Labs') && body.includes('Mark Reviewed'),
      'each report can be flagged or marked reviewed',
    )
    report(
      body.includes('name="verifyCandidates"'),
      'verification travels inside the same save',
    )
    report(body.includes('Save &amp; next patient'), 'consultation form offers Save & Next')
    report(body.includes('Impression'), 'form takes an impression')
    report(body.includes('New drug'), 'form can add a prescription')
    report(body.includes('Quick add from clinic list'), 'form offers the clinic quick-pick list')
    report(body.includes('name="examination"'), 'form takes an examination')
    report(body.includes('name="diagnosis"') && body.includes('name="summary"'), 'form takes a diagnosis and summary')
    report(body.includes('Voice'), 'text fields offer dictation')
    report(body.includes('refer to a doctor'), 'form offers the reference tab')
    report(body.includes('Danger signs explained'), 'advice checklist is present')
    report(body.includes('Next follow-up'), 'form takes a follow-up date')
    report(!body.includes('Surface on the cockpit'), 'the separate pin section is gone')
    report(
      body.includes('written together, or not at all'),
      'form states the commit is atomic',
    )
    // The idempotency key is minted client-side per mount, so it cannot appear
    // in server-rendered HTML — but the field must exist for it to land in.
    report(body.includes('name="idempotencyKey"'), 'form carries an idempotency key field')
    report(body.includes('name="expectedVersion"'), 'form carries the version it edited')

    // A nurse may read this cockpit but must not be offered the commit.
    const nurseView = await get(`/clinic/patients/${SUNITA}/cockpit`, nurseEarly)
    report(
      !nurseView.body.includes('Save &amp; next patient'),
      'nurse is not offered Save & Next',
    )
    report(
      nurseView.body.includes('clinician act'),
      'nurse is told why the commit is unavailable',
    )
  } finally {
    // Torn down innermost-first: candidates cascade from the run, but the
    // upload's foreign keys are RESTRICT, so nothing can be left pointing at it.
    if (runId) await admin.from('report_candidates').delete().eq('extraction_run_id', runId)
    if (runId) await admin.from('extraction_runs').delete().eq('id', runId)
    if (uploadId) await admin.from('report_uploads').delete().eq('id', uploadId)

    if (openedVisitId) {
      const { data: v } = await admin
        .from('visits')
        .select('version')
        .eq('id', openedVisitId)
        .maybeSingle()

      await admin.rpc('cancel_visit', {
        p_clinic_id: CLINIC,
        p_actor_staff_user_id: DOCTOR,
        p_request_id: 'pagecheck-visit-cancel',
        p_visit_id: openedVisitId,
        p_expected_version: v?.version ?? 1,
        p_reason: 'Opened by an automated page check.',
      })
    }
  }
}

{
  const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const crypto = await import('node:crypto')

  const CLINIC = '11111111-1111-4111-8111-000000000001'
  const DOCTOR = '33333333-3333-4333-8333-000000000001'
  const SUNITA_PREGNANCY = '55555555-5555-4555-8555-00000000000a'
  let referralId = null

  try {
    const { data: dId, error: createError } = await admin.rpc('create_referral_draft', {
      p_clinic_id: CLINIC,
      p_actor_staff_user_id: DOCTOR,
      p_request_id: 'pagecheck-ref-create',
      p_pregnancy_id: SUNITA_PREGNANCY,
      p_origin_visit_id: null,
      p_supersedes_id: null,
      p_indication: 'Pre-eclampsia',
      p_receiving_facility: 'Civil Hospital'
    })
    if (createError) throw new Error(createError.message)
    referralId = dId

    const draftPage = await get(`/clinic/patients/${SUNITA}/referral`, doctor)
    report(draftPage.status === 200, 'referral draft page renders')
    report(draftPage.body.includes('Pre-eclampsia'), 'draft indication is shown')

    const { error: issueError } = await admin.rpc('issue_referral', {
      p_clinic_id: CLINIC,
      p_actor_staff_user_id: DOCTOR,
      p_request_id: 'pagecheck-ref-issue',
      p_referral_id: referralId,
      p_expected_version: 1,
      p_as_of_date: new Date().toISOString().slice(0, 10),
      p_snapshot_schema_version: 1
    })
    if (issueError) throw new Error(issueError.message)

    const printView = await get(`/clinic/patients/${SUNITA}/referral/${referralId}`, doctor)
    report(printView.status === 200, 'issued referral print view renders')
    report(printView.body.includes('Civil Hospital'), 'print view shows receiving facility')
    report(printView.body.includes('Print the slip'), 'print view includes print button')

    const rawToken = 'test_token_' + crypto.randomBytes(16).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex')

    const { error: tokenError } = await admin.rpc('create_referral_token', {
      p_clinic_id: CLINIC,
      p_actor_staff_user_id: DOCTOR,
      p_request_id: 'pagecheck-ref-token',
      p_referral_id: referralId,
      p_token_hash: tokenHash,
      p_ttl_minutes: 1440
    })
    if (tokenError) throw new Error(tokenError.message)

    // The public token page is accessed without a session
    const publicView = await get(`/referral/${rawToken}`, null)
    report(publicView.status === 200, 'public referral page renders without auth')
    report(publicView.body.includes('Civil Hospital'), 'public view shows receiving facility')
  } finally {
    if (referralId) {
      await admin.from('referral_access_tokens').delete().eq('referral_id', referralId)
      await admin.from('referrals').delete().eq('id', referralId)
    }
  }
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
  report(body.includes('New patient'), 'nurse is offered registration')
  // The cockpit is gated on observation.read, which a nurse holds: she takes
  // the vitals and may well need the last haemoglobin. What she does not get is
  // the prescription accordion, checked against the rendered cockpit above.
  report(body.includes('Today’s patients'), 'nurse sees today’s list')
  report(body.includes('Find a patient'), 'nurse can search for a patient')
  report(!body.includes('Emergency referral'), 'nurse is not offered referral issue')
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

/* -------------------------------------------------------------------------- */
/* Voice Intake Queue                                                         */
/* -------------------------------------------------------------------------- */

{
  const { status, body } = await get('/clinic/voice', doctor)
  report(status === 200, 'doctor may open voice intake queue', `status ${status}`)
  report(body.includes('Voice Intake Queue'), 'voice queue UI renders')
}

{
  const { status } = await get('/clinic/voice', nurse)
  report(status === 200, 'nurse may open voice intake queue', `status ${status}`)
}

{
  const { body } = await get('/clinic/voice', assistant)
  report(body.includes('Not available to you'), 'assistant cannot open voice queue')
}

console.log(
  failures === 0
    ? '\nAll page checks passed.'
    : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
