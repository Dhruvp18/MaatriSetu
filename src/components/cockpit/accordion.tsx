import { ChevronDown } from 'lucide-react'

/**
 * A cockpit accordion (PRD F5).
 *
 * Built on native `<details>`, which buys three things a custom widget would
 * have to re-earn: it opens and closes without JavaScript, it is keyboard- and
 * screen-reader-correct by default, and browser find-in-page can reveal text
 * inside a collapsed section. In a consultation where the doctor is typing
 * rather than pointing, that last one matters — Ctrl+F for "platelets" should
 * find it.
 *
 * The summary line carries a pill count so a collapsed section still says how
 * much is inside it. A section that might be empty says so rather than opening
 * onto nothing.
 *
 * ---------------------------------------------------------------------------
 * Styling
 * ---------------------------------------------------------------------------
 * Transcribed from the Stitch "Clinical Cockpit" reference: a tinted header
 * strip over a white body, a hairline at the join, a leading icon, and a
 * monospaced preview pill. Everything is dense on purpose — six of these stack
 * on one screen, so the header is 40px and the type is 13–14px.
 *
 * `tone="emphasis"` is the sixth section, the one that writes. It gets the
 * indigo wash and the heavier border the reference uses to separate reading
 * from recording.
 */

type Tone = 'default' | 'emphasis'

/** What a summary pill is allowed to mean. Never severity — see globals.css. */
type PillTone = 'neutral' | 'brand' | 'caution' | 'alert'

const PILL_STYLES: Record<PillTone, string> = {
  neutral: 'border-slate-200 bg-slate-100 text-slate-600',
  brand: 'border-brand-200 bg-brand-50 text-brand-800',
  caution: 'border-caution-200 bg-caution-50 text-caution-700',
  alert: 'border-alert-200 bg-alert-50 text-alert-700',
}

export function Accordion({
  title,
  summary,
  summaryTone = 'neutral',
  meta,
  icon,
  tone = 'default',
  defaultOpen = false,
  emptyMessage,
  isEmpty = false,
  children,
}: {
  title: string
  /** Shown beside the title when collapsed, e.g. "3 active". */
  summary?: string
  summaryTone?: PillTone
  /** Right-aligned context in the header strip, e.g. a follow-up date. */
  meta?: React.ReactNode
  /** A 19px lucide icon. Sized by this component, not by the caller. */
  icon?: React.ReactNode
  tone?: Tone
  defaultOpen?: boolean
  /** Shown instead of children when there is nothing to list. */
  emptyMessage?: string
  isEmpty?: boolean
  children: React.ReactNode
}) {
  const emphasis = tone === 'emphasis'

  return (
    <details
      // `open` on a server-rendered <details> is the initial state, not a
      // controlled prop — the browser takes over once the user clicks.
      open={defaultOpen}
      className={`group overflow-hidden rounded-xl [&_summary::-webkit-details-marker]:hidden ${
        emphasis
          ? 'border-2 border-brand-600/30 bg-linear-to-b from-brand-50/40 to-white shadow-xs'
          : 'glass border border-slate-200/90 shadow-2xs transition-shadow hover:shadow-xs'
      }`}
    >
      <summary
        className={`flex cursor-pointer list-none items-center justify-between gap-3 text-left transition-colors select-none ${
          emphasis
            ? 'bg-brand-50/70 px-4 py-3 hover:bg-brand-50'
            : 'bg-slate-50/50 px-4 py-2.5 hover:bg-slate-50'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span
              aria-hidden
              className={`shrink-0 ${emphasis ? 'text-brand-800' : 'text-slate-600'}`}
            >
              {icon}
            </span>
          ) : null}

          <span
            className={`font-heading truncate text-slate-900 ${
              emphasis ? 'text-sm font-bold' : 'text-xs font-semibold sm:text-sm'
            }`}
          >
            {title}
          </span>

          {summary ? (
            <span
              className={`numeric hidden shrink-0 items-center rounded border px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${
                PILL_STYLES[summaryTone]
              } ${
                // A plain count is a preview of what is inside, so it steps
                // aside once the section is open and the content speaks for
                // itself. A toned pill is a standing fact — something is
                // awaiting review — and stays put.
                summaryTone === 'neutral' ? 'sm:group-open:hidden' : ''
              }`}
            >
              {summary}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          {meta}
          <ChevronDown
            aria-hidden
            className={`h-5 w-5 transition-transform duration-200 group-open:rotate-180 ${
              emphasis ? 'text-slate-500' : 'text-slate-400'
            }`}
            strokeWidth={2}
          />
        </span>
      </summary>

      <div
        className={`px-4 ${
          emphasis ? 'border-t border-brand-100 py-3.5' : 'border-t border-slate-100 py-3'
        }`}
      >
        {isEmpty ? (
          <p className="text-xs text-slate-500">{emptyMessage ?? 'Nothing recorded.'}</p>
        ) : (
          children
        )}
      </div>
    </details>
  )
}

/**
 * A header pill for the collapsed state, exported so the page can put one in
 * `meta` — the reference carries the next follow-up date up there, where it is
 * readable without opening the section that owns it.
 */
export function AccordionMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="numeric hidden text-xs text-slate-400 sm:inline">{children}</span>
  )
}
