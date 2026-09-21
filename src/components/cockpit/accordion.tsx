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
 */

export function Accordion({
  title,
  summary,
  defaultOpen = false,
  emptyMessage,
  isEmpty = false,
  children,
}: {
  title: string
  /** Shown beside the title when collapsed, e.g. "3 active". */
  summary?: string
  defaultOpen?: boolean
  /** Shown instead of children when there is nothing to list. */
  emptyMessage?: string
  isEmpty?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      // `open` on a server-rendered <details> is the initial state, not a
      // controlled prop — the browser takes over once the user clicks.
      open={defaultOpen}
      className="group rounded-xl border border-slate-200 bg-white [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 select-none">
        <span className="flex items-center gap-2">
          <Chevron />
          <span className="text-sm font-semibold text-slate-900">{title}</span>
        </span>
        {summary ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {summary}
          </span>
        ) : null}
      </summary>

      <div className="border-t border-slate-100 px-5 py-4">
        {isEmpty ? (
          <p className="text-sm text-slate-500">{emptyMessage ?? 'Nothing recorded.'}</p>
        ) : (
          children
        )}
      </div>
    </details>
  )
}

function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      focusable="false"
      className="shrink-0 text-slate-400 transition-transform group-open:rotate-90"
    >
      <path
        d="M7 5l6 5-6 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
