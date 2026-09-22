'use client'

/**
 * One call to `window.print()`.
 *
 * A client island of its own so the page around it stays a server component
 * and the frozen snapshot is never serialised into a browser bundle.
 *
 * The button itself does not survive printing — `globals.css` hides every
 * `button` in the print stylesheet — so there is no risk of it appearing on the
 * slip that travels with the patient.
 */
export function PrintButton({ label = 'Print the slip' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
    >
      {label}
    </button>
  )
}
