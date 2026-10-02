'use client'

import { Flag } from 'lucide-react'
import { useOptimistic, useTransition } from 'react'

import type { HistoryKind } from '@modules/history/history.types'

import { setHistoryFlagAction } from './history-actions'

/**
 * The flag on one history entry. A clinician sets it to draw the next reader's
 * eye to that entry; the section heading counts how many are flagged. Saved at
 * once, like the rest of her history.
 *
 * Without edit rights a flagged entry still shows its flag, read-only.
 */
export function HistoryFlag({
  patientId,
  kind,
  entryId,
  flagged,
  canEdit,
  label,
}: {
  patientId: string
  kind: HistoryKind
  entryId: string
  flagged: boolean
  canEdit: boolean
  /** What the entry is, for the button's accessible name. */
  label: string
}) {
  const [pending, startTransition] = useTransition()
  const [shown, setShown] = useOptimistic(flagged)

  if (!canEdit) {
    return shown ? (
      <Flag aria-label={`${label} is flagged`} className="h-3.5 w-3.5 shrink-0 fill-alert-600 text-alert-600" />
    ) : null
  }

  const toggle = (e: React.MouseEvent) => {
    // Rows that open a record on click must not open when the flag is tapped.
    e.stopPropagation()
    startTransition(async () => {
      setShown(!shown)
      await setHistoryFlagAction(patientId, { patientId, kind, entryId, flagged: !shown })
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={shown}
      aria-label={shown ? `Unflag ${label}` : `Flag ${label}`}
      title={shown ? 'Flagged — click to clear' : 'Flag this entry'}
      className={`shrink-0 rounded border p-1 transition-colors disabled:opacity-60 ${
        shown
          ? 'border-alert-200 bg-alert-50 text-alert-600 hover:bg-alert-100'
          : 'border-slate-200 bg-white text-slate-400 hover:border-alert-200 hover:text-alert-600'
      }`}
    >
      <Flag aria-hidden className={`h-3.5 w-3.5 ${shown ? 'fill-alert-600' : ''}`} />
    </button>
  )
}
