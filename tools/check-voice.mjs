/**
 * End-to-end proof of the voice pipeline, against the real provider.
 *
 * Synthesises a Marathi danger-sign phrase with Sarvam's own TTS, stores it as
 * a voice note exactly as the app would, then waits for the worker to pick it
 * up. That exercises the whole chain — storage, the queue, Sarvam STT in both
 * transcribe and translate modes, the routing lexicon, and the audit trail —
 * rather than asserting that each part would probably work.
 *
 * Requires: `pnpm worker:dev` running, and SPEECH_PROVIDER=sarvam.
 * Synthetic throughout; cleans up after itself.
 *
 * Usage:  node tools/check-voice.mjs
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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
const NURSE = '33333333-3333-4333-8333-000000000002'
const SUNITA = '44444444-4444-4444-8444-00000000000a'

let failures = 0
const report = (ok, label, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}

/** A danger sign, so the priority path is what gets exercised. */
const PHRASE = 'मला खूप डोकेदुखी आहे आणि डोळ्यांपुढे अंधारी येते'

console.log('Voice pipeline, end to end\n')
console.log(`speech provider: ${env.SPEECH_PROVIDER}`)
if (env.SPEECH_PROVIDER !== 'sarvam') {
  console.log('\nSPEECH_PROVIDER is not "sarvam" — this checks the fixture path only.')
}

/* -------------------------------------------------------------------------- */
/* 1. Synthesise audio                                                        */
/* -------------------------------------------------------------------------- */

const tts = await fetch('https://api.sarvam.ai/text-to-speech', {
  method: 'POST',
  headers: {
    'api-subscription-key': env.SARVAM_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ text: PHRASE, target_language_code: 'mr-IN' }),
})

if (!tts.ok) {
  console.log(`FAIL  could not synthesise test audio (HTTP ${tts.status})`)
  process.exit(1)
}

const { audios } = await tts.json()
const audio = Buffer.from(audios[0], 'base64')
report(audio.byteLength > 1000, 'synthesised Marathi test audio', `${audio.byteLength} bytes`)

/* -------------------------------------------------------------------------- */
/* 2. Store it as a voice note                                                */
/* -------------------------------------------------------------------------- */

const id = randomUUID()
const key = `voice/${CLINIC}/${id}.wav`
let voiceQueryId = null

try {
  const { error: upErr } = await db.storage
    .from('clinical-media')
    .upload(key, audio, { contentType: 'audio/wav', upsert: false })

  if (upErr) throw new Error(`upload: ${upErr.message}`)
  report(true, 'stored audio in the private bucket')

  const { data: created, error: rpcErr } = await db.rpc('record_voice_note', {
    p_clinic_id: CLINIC,
    p_actor_staff_user_id: NURSE,
    p_request_id: 'voicecheck-1',
    p_patient_id: SUNITA,
    p_contact_id: null,
    p_channel: 'IN_APP_UPLOAD',
    p_provider_message_id: null,
    p_from_phone_e164: '+919833100001',
    p_audio_object_key: key,
    p_audio_mime_type: 'audio/wav',
    p_audio_duration_seconds: 4,
  })

  if (rpcErr) throw new Error(`record_voice_note: ${rpcErr.message}`)
  voiceQueryId = created
  report(Boolean(voiceQueryId), 'queued for transcription', voiceQueryId ?? '')

  /* ------------------------------------------------------------------------ */
  /* 3. Wait for the worker                                                   */
  /* ------------------------------------------------------------------------ */

  console.log('\nwaiting for the worker (needs `pnpm worker:dev` running)…')

  let row = null
  const deadline = Date.now() + 90_000

  while (Date.now() < deadline) {
    const { data } = await db
      .from('voice_queries')
      .select('*')
      .eq('id', voiceQueryId)
      .maybeSingle()

    if (data && data.processing_state !== 'QUEUED' && data.processing_state !== 'RECEIVED') {
      row = data
      break
    }
    await new Promise((r) => setTimeout(r, 3000))
  }

  if (!row) {
    report(false, 'worker processed the note', 'still queued after 90s — is the worker running?')
  } else if (row.processing_state === 'FAILED') {
    report(false, 'worker processed the note', `FAILED: ${row.processing_error}`)
  } else {
    report(true, 'worker transcribed the note', row.transcript_provider ?? '')

    console.log(`\n  original:    ${row.transcript_original}`)
    console.log(`  english:     ${row.translation_en}`)
    console.log(`  language:    ${row.detected_language}`)
    console.log(`  confidence:  ${row.transcription_confidence}`)
    console.log(`  routing:     ${row.routing_bucket}`)
    console.log(`  matched:     ${JSON.stringify(row.matched_phrases)}`)
    console.log(`  lexicon:     ${row.lexicon_version}\n`)

    report(
      (row.transcript_original ?? '').length > 0,
      'produced a transcript in her own language',
    )
    report((row.translation_en ?? '').length > 0, 'produced an English translation')
    report(row.detected_language?.startsWith('mr') === true, 'detected Marathi', row.detected_language ?? '')

    // The point of the whole exercise: a danger sign must reach a clinician
    // first, and the decision must be explainable.
    report(row.routing_bucket === 'PRIORITY_REVIEW', 'routed as read-first', row.routing_bucket ?? '')
    report((row.matched_phrases ?? []).length > 0, 'recorded which phrases produced the routing')
    report(Boolean(row.lexicon_version), 'recorded the lexicon version')

    // Association was supplied by the caller, never inferred from the number.
    report(row.association_status === 'VERIFIED', 'association came from the caller')
  }

  /* ------------------------------------------------------------------------ */
  /* 4. Audit trail                                                           */
  /* ------------------------------------------------------------------------ */

  const { data: audit } = await db
    .from('audit_events')
    .select('action, actor_worker')
    .eq('entity_id', voiceQueryId)
    .order('occurred_at')

  const actions = (audit ?? []).map((a) => a.action)
  report(actions.includes('voice_query.received'), 'intake is audited')
  report(
    actions.includes('voice_query.transcribed') || actions.includes('voice_query.failed'),
    'transcription is audited',
  )
  report(
    (audit ?? []).some((a) => a.actor_worker !== null),
    'the worker is recorded as a worker, not as a clinician',
  )
} finally {
  if (voiceQueryId) {
    await db.from('audit_events').delete().eq('entity_id', voiceQueryId)
    await db.from('voice_queries').delete().eq('id', voiceQueryId)
  }
  await db.storage.from('clinical-media').remove([key])
}

console.log(failures === 0 ? '\nVoice pipeline works end to end.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
