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
      className={`rounded-xl border bg-white ${
        priorityCount > 0 ? 'border-alert-600/40' : 'border-slate-200'
      }`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Messages from her
          <span className="ml-2 font-normal text-slate-500">
            {ordered.length} unresolved
          </span>
        </h2>
        {priorityCount > 0 ? (
          <span className="rounded-full border border-alert-600/30 bg-alert-50 px-2.5 py-1 text-xs font-medium text-alert-700">
            {priorityCount} to read first
          </span>
        ) : null}
      </header>

      <ul className="divide-y divide-slate-100">
        {ordered.map((query) => (
          <li key={query.id} className="px-5 py-3">
            <QueryRow query={query} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function QueryRow({ query }: { query: VoiceQuery }) {
  const { processing } = query

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <RoutingPill bucket={query.routingBucket} />
        <span className="numeric text-xs text-slate-500">
          {query.receivedAt.slice(0, 16).replace('T', ' ')}
        </span>
        {query.acknowledgedAt ? (
          <span className="text-xs text-slate-500">seen</span>
        ) : null}
      </div>

      {processing.state === 'PENDING' ? (
        <p className="text-sm text-slate-500">
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
        <p className="rounded-lg border border-caution-700/30 bg-caution-50 px-3 py-2 text-sm text-caution-700">
          Could not be transcribed — {processing.error} Listen to the recording
          before assuming it was routine.
        </p>
      ) : null}

      {processing.state === 'READY' ? (
        <div className="space-y-1">
          {/* Her own words first, and larger. See the file header. */}
          <p className="text-sm leading-relaxed text-slate-900">{processing.original}</p>

          {processing.english ? (
            <p className="text-sm leading-relaxed text-slate-500 italic">
              {processing.english}
            </p>
          ) : (
            <p className="text-xs text-caution-700">
              Not translated. Read her own words above.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-slate-500">
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
              <span className="rounded border border-caution-700/30 bg-caution-50 px-1.5 py-0.5 font-medium text-caution-700">
                sample text — not a real transcription
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function RoutingPill({ bucket }: { bucket: RoutingBucket | null }) {
  const label = describeRouting(bucket)

  const styles =
    bucket === 'PRIORITY_REVIEW'
      ? 'border-alert-600/30 bg-alert-50 text-alert-700'
      : bucket === 'NEEDS_REVIEW'
        ? 'border-caution-700/30 bg-caution-50 text-caution-700'
        : 'border-slate-200 bg-slate-50 text-slate-600'

  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}>
      {label}
    </span>
  )
}
