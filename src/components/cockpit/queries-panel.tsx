import { AudioLines, MessagesSquare } from 'lucide-react'

import {
  describeRouting,
  type RoutingBucket,
  type VoiceQuery,
} from '@modules/voice/voice.types'

/**
 * Patient voice queries, on the consultation screen (PRD F14).
 *
 * ---------------------------------------------------------------------------
 * Why both languages are always shown
 * ---------------------------------------------------------------------------
 * The English translation is what a clinician reads in a two-minute
 * consultation, and it is not reliable enough to be the only thing on screen.
 * A live test of this pipeline had Sarvam render "डोळ्यांपुढे अंधारी येते" —
 * vision darkening, a cardinal pre-eclampsia warning — as "I feel sleepy". Her
 * own words are printed above the translation, in the larger of the two type
 * sizes, for exactly that reason.
 *
 * The routing decision is shown with the phrases that produced it. A clinician
 * who disagrees with the ordering can see why it happened rather than being
 * asked to trust it, and the wording is about reading order, never about what
 * she has.
 */

export function QueriesPanel({ queries }: { queries: readonly VoiceQuery[] }) {
  if (queries.length === 0) return null

  // Priority first, then by arrival. The ordering is the whole point of the
  // routing: a danger sign must not sit below three questions about diet.
  const ordered = [...queries].sort((a, b) => {
    const rank = (bucket: RoutingBucket | null) =>
      bucket === 'PRIORITY_REVIEW' ? 0 : bucket === 'NEEDS_REVIEW' ? 1 : 2
    const byRank = rank(a.routingBucket) - rank(b.routingBucket)
    return byRank !== 0 ? byRank : b.receivedAt.localeCompare(a.receivedAt)
  })

  const priorityCount = ordered.filter((q) => q.routingBucket === 'PRIORITY_REVIEW').length

  return (
    <section
      className={`glass overflow-hidden rounded-xl border shadow-2xs ${
        priorityCount > 0 ? 'border-alert-200' : 'border-slate-200/90'
      }`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <MessagesSquare aria-hidden className="h-4.75 w-4.75 shrink-0 text-brand-800" />
          <div>
            <h2 className="font-heading text-xs font-semibold text-slate-900 sm:text-sm">
              Patient queries &amp; voice triage
            </h2>
            <p className="numeric text-[11px] text-slate-500">
              {ordered.length} unresolved · vernacular voice, transcribed
            </p>
          </div>
        </div>
        {priorityCount > 0 ? (
          <span className="numeric shrink-0 rounded border border-alert-200 bg-alert-50 px-1.5 py-0.5 text-[10px] font-bold text-alert-700 uppercase">
            {priorityCount} to read first
          </span>
        ) : null}
      </header>

      <ul className="flex flex-col gap-2.5 p-3">
        {ordered.map((query) => (
          <li key={query.id}>
            <QueryRow query={query} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One message, as the reference's voice-note card: a tinted shell carrying the
 * routing decision, a white inset holding her actual words, and the metadata
 * that produced the decision along the bottom.
 */
function QueryRow({ query }: { query: VoiceQuery }) {
  const { processing } = query
  const bucket = query.routingBucket

  const shell =
    bucket === 'PRIORITY_REVIEW'
      ? 'border-alert-200 bg-alert-50/70'
      : bucket === 'NEEDS_REVIEW'
        ? 'border-caution-200 bg-caution-50/80'
        : 'border-slate-200 bg-slate-50'

  const inset =
    bucket === 'PRIORITY_REVIEW'
      ? 'border-alert-200/70'
      : bucket === 'NEEDS_REVIEW'
        ? 'border-caution-200/70'
        : 'border-slate-200/80'

  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-3.5 shadow-2xs ${shell}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <AudioLines aria-hidden className="h-4 w-4 shrink-0 text-brand-800" />
          <span className="numeric font-medium text-slate-500">
            {query.receivedAt.slice(0, 16).replace('T', ' ')}
          </span>
          {query.acknowledgedAt ? (
            <span className="font-normal text-slate-400">· seen</span>
          ) : null}
        </span>
        <RoutingPill bucket={bucket} />
      </div>

      {processing.state === 'PENDING' ? (
        <p className="rounded-lg border border-slate-200/80 bg-white/90 p-2.5 text-xs text-slate-500">
          Still transcribing. Nothing has been read yet — this is not an empty
          message.
        </p>
      ) : null}

      {processing.state === 'FAILED' ? (
        /*
          A failed transcription is shown as a failure, never as an empty
          message and never bucketed. The audio is still there; somebody has to
          listen to it. Defaulting this to "routine" is how a danger sign gets
          buried.
        */
        <p className="rounded-lg border border-caution-200 bg-caution-100/60 p-2.5 text-xs text-caution-900">
          Could not be transcribed — {processing.error} Listen to the recording
          before assuming it was routine.
        </p>
      ) : null}

      {processing.state === 'READY' ? (
        <>
          <div className={`rounded-lg border bg-white/90 p-2.5 ${inset}`}>
            {/* Her own words first, and larger. See the file header. */}
            <p className="text-[13px] leading-relaxed font-bold text-slate-900">
              {processing.original}
            </p>

            {processing.english ? (
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 italic">
                {processing.english}
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-caution-700">
                Not translated. Read her own words above.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {processing.detectedLanguage ? (
              <span className="numeric">{processing.detectedLanguage}</span>
            ) : null}

            {processing.confidence !== null ? (
              // Shown as uncertainty for the reader. It gates nothing.
              <span className="numeric">
                transcription confidence {Math.round(processing.confidence * 100)}%
              </span>
            ) : null}

            {query.matchedPhrases.length > 0 ? (
              <span>
                matched {query.matchedPhrases.map((p) => `“${p}”`).join(', ')}
              </span>
            ) : null}

            {processing.isFixture ? (
              /*
                Canned output must never pass as a real transcription
                (docs/development-foundation.md §1).
              */
              <span className="rounded border border-caution-200 bg-caution-50 px-1.5 py-0.5 font-medium text-caution-700">
                sample text — not a real transcription
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function RoutingPill({ bucket }: { bucket: RoutingBucket | null }) {
  const label = describeRouting(bucket)

  const styles =
    bucket === 'PRIORITY_REVIEW'
      ? 'bg-alert-100 text-alert-700'
      : bucket === 'NEEDS_REVIEW'
        ? 'bg-caution-100 text-caution-900'
        : 'bg-slate-200 text-slate-700'

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${styles}`}>
      {label}
    </span>
  )
}
