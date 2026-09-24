import 'server-only'

import { extractQueuedReport, listQueuedExtractions } from '@/modules/reports/report.service'
import { listQueuedNotes, transcribeQueuedNote } from '@/modules/voice/voice.service'

/**
 * One pass over the background queues: voice transcription, then report
 * extraction.
 *
 * Called from three places, all of them safe to overlap because picking up an
 * item is an atomic claim (migration 0028):
 *
 *   - right after an upload, via `after()` in the action that queued it
 *   - every minute, from pg_cron through POST /api/queue/drain
 *   - in a loop, by `pnpm worker:dev` for local development
 *
 * Holds the service role and is deliberately narrow (ARCH-8): it transcribes,
 * routes and proposes candidates. It never verifies anything.
 *
 * Items are processed one at a time on purpose. Sarvam and Gemini rate-limit,
 * and a batch fired in parallel turns one slow item into several rate-limit
 * failures.
 */

const BATCH_SIZE = 5

export interface DrainSummary {
  readonly voice: number
  readonly ocr: number
  readonly stoppedEarly: boolean
}

export async function drainQueues(options: {
  /** Stop starting new items after this long; a serverless call has a hard ceiling. */
  readonly budgetMs: number
  readonly log?: (line: string) => void
}): Promise<DrainSummary> {
  const deadline = Date.now() + options.budgetMs
  const log = options.log ?? (() => {})
  const outOfTime = () => Date.now() >= deadline

  let voice = 0
  let ocr = 0

  // Separate try blocks: a database problem reading one queue says nothing
  // about the other, and one broken feature must not silently stop the other.
  try {
    for (const id of await listQueuedNotes(BATCH_SIZE)) {
      if (outOfTime()) return { voice, ocr, stoppedEarly: true }
      const started = Date.now()
      try {
        const result = await transcribeQueuedNote(id)
        log(`[voice] ${id} ${result.ok ? 'ok' : 'failed'} in ${Date.now() - started}ms — ${result.detail}`)
      } catch (error) {
        // Could not even be marked failed: a database or storage problem. The
        // claim's lease expires and the next drain retries it.
        console.error(`[voice] ${id} threw; will retry after the lease expires`, error)
      }
      voice++
    }
  } catch (error) {
    console.error('[queue] voice drain failed', error)
  }

  try {
    for (const id of await listQueuedExtractions(BATCH_SIZE)) {
      if (outOfTime()) return { voice, ocr, stoppedEarly: true }
      const started = Date.now()
      try {
        const result = await extractQueuedReport(id)
        log(`[ocr] ${id} ${result.ok ? 'ok' : 'failed'} in ${Date.now() - started}ms — ${result.detail}`)
      } catch (error) {
        console.error(`[ocr] ${id} threw`, error)
      }
      ocr++
    }
  } catch (error) {
    console.error('[queue] ocr drain failed', error)
  }

  return { voice, ocr, stoppedEarly: false }
}
