import { timingSafeEqual } from 'node:crypto'

import { after, type NextRequest, NextResponse } from 'next/server'

import { serverEnv } from '@core/config/env'
import { drainQueues } from '@/modules/queue/queue.service'

/**
 * POST /api/queue/drain — one pass over the background queues.
 *
 * Called every minute by pg_cron (migration 0028) as the safety net behind the
 * drain each upload triggers for itself. Authenticated by a bearer secret, not
 * a session: the caller is the database, not a person.
 *
 * Answers 202 at once and works after responding, so pg_net's short timeout
 * never cuts a model call off halfway.
 */

// Vercel's ceiling for this function. The drain stops starting new items well
// before it, so an in-flight call is not killed mid-write.
export const maxDuration = 60
const DRAIN_BUDGET_MS = 40_000

export async function POST(request: NextRequest) {
  const secret = serverEnv().QUEUE_DRAIN_SECRET
  if (!secret || !bearerMatches(request.headers.get('authorization'), secret)) {
    // Same answer for "not configured" and "wrong secret".
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  after(async () => {
    const summary = await drainQueues({ budgetMs: DRAIN_BUDGET_MS, log: console.log })
    if (summary.voice + summary.ocr > 0) console.log('[queue] drained', summary)
  })

  return NextResponse.json({ accepted: true }, { status: 202 })
}

function bearerMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header ?? '')
  return expected.length === given.length && timingSafeEqual(expected, given)
}
