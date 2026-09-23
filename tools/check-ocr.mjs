/**
 * End-to-end proof of the report pipeline.
 *
 * Stores a real image in the private bucket exactly as the upload form would,
 * records it through `record_report_upload`, then waits for the worker to pick
 * it up. That exercises the whole chain — storage, the queue built out of
 * `extraction_runs`, the configured OCR provider, candidate persistence and the
 * audit trail — rather than asserting each part would probably work.
 *
 * What it deliberately also asserts is the boundary: after a successful
 * extraction, `observations` must be untouched. The worker proposes. Only a
 * clinician, inside Save & Next, turns a proposal into a clinical fact, and a
 * regression that let the worker write an observation would be the single worst
 * defect this product could ship.
 *
 * Requires: `pnpm worker:dev` running.
 * Synthetic throughout; cleans up after itself.
 *
 * Usage:  node tools/check-ocr.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CLINIC = '11111111-1111-4111-8111-000000000001'
const ASSISTANT = '33333333-3333-4333-8333-000000000003'
const SUNITA = '44444444-4444-4444-8444-00000000000a'
const PREGNANCY = '55555555-5555-4555-8555-00000000000a'

let failures = 0
const report = (ok, label, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

/**
 * A minimal valid JPEG.
 *
 * The fixture provider derives its output from the byte length and never looks
 * at the pixels, so the image only has to be a real file that storage will
 * accept and the worker can download. Against a real provider this would be a
 * photograph of a synthetic slip.
 */
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
)

const KEY = `reports/${CLINIC}/check-ocr-${Date.now()}.jpg`

console.log(`OCR provider: ${env.OCR_PROVIDER ?? 'fixture'}\n`)

let uploadId = null
let runIds = []

try {
  /* 1. Store the image, then record the upload — the order the service uses. */

  const { error: storageError } = await db.storage
    .from('clinical-media')
    .upload(KEY, JPEG, { contentType: 'image/jpeg', upsert: false })

  if (storageError) throw new Error(`storage: ${storageError.message}`)
  report(true, 'image stored in the private bucket')

  const { data: created, error: recordError } = await db.rpc('record_report_upload', {
    p_clinic_id: CLINIC,
    p_actor_staff_user_id: ASSISTANT,
    p_request_id: 'check-ocr',
    p_patient_id: SUNITA,
    p_pregnancy_id: PREGNANCY,
    p_visit_id: null,
    p_object_key: KEY,
    p_content_type: 'image/jpeg',
    p_byte_size: JPEG.byteLength,
    p_sha256: `\\x${'cd'.repeat(32)}`,
  })

  if (recordError) throw new Error(`record_report_upload: ${recordError.message}`)
  uploadId = created
  report(Boolean(uploadId), 'upload recorded')

  {
    const { data: row } = await db
      .from('report_uploads')
      .select('assignment_status')
      .eq('id', uploadId)
      .maybeSingle()

    report(row?.assignment_status === 'ASSIGNED', 'upload is attached to the episode')
  }

  /* 2. Wait for the worker. */

  console.log('\nwaiting for the worker (needs `pnpm worker:dev` running)…')

  let run = null
  for (let i = 0; i < 30; i++) {
    const { data } = await db
      .from('extraction_runs')
      .select('id, status, provider, model, prompt_version, attempt_no, error_code, error_message')
      .eq('upload_id', uploadId)
      .order('attempt_no', { ascending: false })

    runIds = (data ?? []).map((r) => r.id)
    run = data?.[0] ?? null

    if (run && run.status !== 'PROCESSING' && run.status !== 'QUEUED') break
    await new Promise((r) => setTimeout(r, 3000))
  }

  if (!run) {
    report(false, 'worker picked up the upload', 'nothing after 90s — is the worker running?')
  } else if (run.status === 'FAILED') {
    report(false, 'worker read the report', `${run.error_code}: ${run.error_message}`)
  } else {
    report(true, 'worker read the report', `${run.provider}/${run.model}`)
    report(run.attempt_no === 1, 'succeeded on the first attempt')
    report(Boolean(run.prompt_version), 'the prompt version was recorded', run.prompt_version)
  }

  /* 3. What it produced is a proposal, with units. */

  if (run && run.status === 'READY_FOR_REVIEW') {
    const { data: candidates } = await db
      .from('report_candidates')
      .select('test_code, printed_label, value_numeric, value_text, unit_original, confidence')
      .eq('extraction_run_id', run.id)

    const rows = candidates ?? []
    report(rows.length > 0, 'candidates were proposed', `${rows.length}`)

    report(
      rows.every((r) => r.value_numeric === null || r.unit_original !== null),
      'every numeric candidate carries the unit as printed',
    )
    report(
      rows.every((r) => r.value_numeric !== null || r.value_text !== null),
      'no candidate is empty',
    )
    report(
      rows.some((r) => r.printed_label !== null),
      'the printed label is kept beside the canonical code',
    )

    const { data: raw } = await db
      .from('extraction_runs')
      .select('raw_output')
      .eq('id', run.id)
      .maybeSingle()

    report(raw?.raw_output !== null, 'the verbatim provider response was kept')
  }

  /* 4. The boundary. Nothing reached the record.                             */

  {
    const { data: fromThis } = await db
      .from('observations')
      .select('id')
      .eq('source_upload_id', uploadId)

    report(
      (fromThis ?? []).length === 0,
      'NOTHING was written to observations — the worker proposes, it does not verify',
    )
  }

  {
    const { data: reviews } = await db
      .from('report_reviews')
      .select('id')
      .eq('upload_id', uploadId)

    report((reviews ?? []).length === 0, 'no review was recorded without a clinician')
  }

  /* 5. The audit trail names a worker, not a person.                         */

  if (run) {
    const { data: audit } = await db
      .from('audit_events')
      .select('action, actor_worker, actor_staff_user_id')
      .eq('entity_id', run.id)

    const completed = (audit ?? []).find((a) => a.action === 'extraction.completed')
    report(Boolean(completed), 'the extraction was audited')
    report(
      completed ? completed.actor_worker !== null && completed.actor_staff_user_id === null : false,
      'the worker is recorded as a worker, not as a clinician',
    )
  }
} finally {
  /*
   * Torn down innermost-first: the upload's foreign keys are RESTRICT.
   *
   * The audit rows stay. `audit_events` is append-only and a trigger refuses
   * the delete — correctly, because these attempts did happen. What is removed
   * is the working data this check created, not the record that it ran.
   */
  for (const id of runIds) {
    await db.from('report_candidates').delete().eq('extraction_run_id', id)
    await db.from('extraction_runs').delete().eq('id', id)
  }
  if (uploadId) await db.from('report_uploads').delete().eq('id', uploadId)
  await db.storage.from('clinical-media').remove([KEY])
}

console.log(
  failures === 0 ? '\nAll OCR checks passed.' : `\n${failures} check(s) failed.`,
)
process.exit(failures === 0 ? 0 : 1)
