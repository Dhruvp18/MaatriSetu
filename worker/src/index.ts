/*
 * Environment is loaded by `--env-file-if-exists=.env.local` in the npm script,
 * not here. ES imports are hoisted, so a `dotenv.config()` call at the top of
 * this file would still run AFTER `core/config/env` had been evaluated and
 * thrown on the missing variables. The flag loads them before any module runs.
 */
import { providerEnv } from '../../src/core/config/env'
import { ocrIsFixture } from '../../src/core/ocr'
import { speechIsFixture } from '../../src/core/speech'
import { drainQueues } from '../../src/modules/queue/queue.service'

/**
 * The local queue drainer.
 *
 * In production nothing runs this: each upload drains the queue right after
 * responding, and pg_cron calls POST /api/queue/drain every minute (migration
 * 0028). Locally there is no pg_cron pointed at your laptop, so this loop does
 * the same job. The work itself lives in `modules/queue/queue.service.ts`, so
 * both paths behave identically — including the atomic claims that make it
 * safe to run this alongside the app.
 */

const POLL_INTERVAL_MS = 5_000

let stopping = false

async function main(): Promise<void> {
  console.log('[worker] starting')
  console.log(
    `[worker] speech provider: ${speechIsFixture() ? 'FIXTURE (canned output, labelled in the UI)' : providerEnv().SPEECH_PROVIDER}`,
  )
  console.log(
    `[worker] ocr provider:    ${ocrIsFixture() ? 'FIXTURE (canned output, labelled in the UI)' : providerEnv().OCR_PROVIDER}`,
  )

  // Graceful stop: finish the item in flight rather than killing a request
  // mid-call. (A kill is survivable too — the claim's lease expires.)
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(`[worker] ${signal} received; finishing current item`)
      stopping = true
    })
  }

  while (!stopping) {
    await drainQueues({ budgetMs: POLL_INTERVAL_MS * 12, log: console.log })
    if (stopping) break
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  console.log('[worker] stopped')
}

main().catch((error) => {
  console.error('[worker] fatal', error)
  process.exit(1)
})
