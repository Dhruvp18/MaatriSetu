/*
 * Environment is loaded by `--env-file=.env.local` in the npm script, not here.
 * ES imports are hoisted, so a `dotenv.config()` call at the top of this file
 * would still run AFTER `core/config/env` had been evaluated and thrown on the
 * missing variables. The flag loads them before any module executes.
 */
import { serviceClient } from '../../src/core/db/clients'
import { ocrIsFixture } from '../../src/core/ocr'
import { speechIsFixture } from '../../src/core/speech'
import {
  extractQueuedReport,
  listQueuedExtractions,
} from '../../src/modules/reports/report.service'
import * as voiceRepo from '../../src/modules/voice/voice.repository'
import { transcribeQueuedNote } from '../../src/modules/voice/voice.service'

/**
 * The background worker.
 *
 * Transcription and extraction are model calls that can take tens of seconds.
 * Running one inside a request would hold a connection open while a nurse waits
 * at a counter, so they happen here instead (ARCH-7). The web app enqueues by
 * writing a row; this drains it.
 *
 * ---------------------------------------------------------------------------
 * What this process may and may not do
 * ---------------------------------------------------------------------------
 * It holds the service role, which bypasses RLS, and therefore has to be
 * deliberately narrow. It transcribes, it routes, and it proposes candidate
 * values — all three mechanical. It cannot verify an observation, decide whose
 * message a note is, decide whose slip a photograph is, or resolve a query.
 * Those are human acts, and `CLINICIAN_ONLY_PERMISSIONS` exists so that stays
 * true as this file grows (ARCH-8).
 *
 * ---------------------------------------------------------------------------
 * Polling, not a queue server
 * ---------------------------------------------------------------------------
 * `pg-boss` is a dependency and the right answer at volume. At one clinic's
 * OPD it would be a second moving part to operate for no gain, so this polls a
 * table instead. The switch is a change in this file alone — nothing else knows
 * how work is found.
 */

const POLL_INTERVAL_MS = 5_000
const BATCH_SIZE = 5

let stopping = false

async function drainVoiceQueue(): Promise<void> {
  const db = serviceClient()
  const pending = await voiceRepo.listPending(db, BATCH_SIZE)

  if (pending.length === 0) return

  console.log(`[voice] ${pending.length} note(s) queued`)

  for (const note of pending) {
    if (stopping) return

    // Sequential on purpose. Sarvam rate-limits, and a batch fired in parallel
    // would turn one slow note into five rate-limit failures.
    const started = Date.now()
    try {
      const result = await transcribeQueuedNote(note.id)
      const elapsed = Date.now() - started

      console.log(
        `[voice] ${note.id} ${result.ok ? 'ok' : 'failed'} in ${elapsed}ms — ${result.detail}`,
      )
    } catch (error) {
      // A throw here means the note could not even be marked failed — a
      // database or storage problem rather than a transcription one. Leave it
      // queued and try again next tick rather than losing it.
      console.error(`[voice] ${note.id} threw; leaving it queued`, error)
    }
  }
}

async function drainExtractionQueue(): Promise<void> {
  const pending = await listQueuedExtractions(BATCH_SIZE)

  if (pending.length === 0) return

  console.log(`[ocr] ${pending.length} report(s) queued`)

  for (const uploadId of pending) {
    if (stopping) return

    // Sequential, like transcription: a vision call is expensive and a batch
    // fired in parallel turns one slow read into a row of rate-limit failures.
    const started = Date.now()
    try {
      const result = await extractQueuedReport(uploadId)
      const elapsed = Date.now() - started

      console.log(
        `[ocr] ${uploadId} ${result.ok ? 'ok' : 'failed'} in ${elapsed}ms — ${result.detail}`,
      )
    } catch (error) {
      // A throw here means the run could not even be marked failed. Leave the
      // upload for the next tick rather than losing it — but note that an
      // upload with a PROCESSING run is no longer in the queue, so it will show
      // on the consultation screen as still being read, which is the truth.
      console.error(`[ocr] ${uploadId} threw`, error)
    }
  }
}

async function tick(): Promise<void> {
  try {
    await drainVoiceQueue()
  } catch (error) {
    // The loop must outlive any single failure. A worker that exits on a
    // transient database error stops transcribing until somebody notices.
    console.error('[worker] tick failed (voice)', error)
  }

  // A separate try: a database problem reading the voice queue says nothing
  // about the extraction queue, and one broken feature must not silently stop
  // the other.
  try {
    await drainExtractionQueue()
  } catch (error) {
    console.error('[worker] tick failed (ocr)', error)
  }
}

async function main(): Promise<void> {
  console.log('[worker] starting')
  console.log(
    `[worker] speech provider: ${speechIsFixture() ? 'FIXTURE (canned output, labelled in the UI)' : 'sarvam'}`,
  )
  console.log(
    `[worker] ocr provider:    ${ocrIsFixture() ? 'FIXTURE (canned output, labelled in the UI)' : 'anthropic'}`,
  )

  // Graceful stop: finish the item in flight rather than killing a request
  // mid-call and leaving a row in TRANSCRIBING or PROCESSING forever.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`[worker] ${signal} received; finishing current item`)
      stopping = true
    })
  }

  while (!stopping) {
    await tick()
    if (stopping) break
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  console.log('[worker] stopped')
}

main().catch((error) => {
  console.error('[worker] fatal', error)
  process.exit(1)
})
