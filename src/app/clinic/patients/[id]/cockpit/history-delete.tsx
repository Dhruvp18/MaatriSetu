'use client'

import { Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import type { HistoryKind } from '@modules/history/history.types'

import { removeHistoryEntryAction } from './history-actions'

/**
 * Delete one history entry, after a "Delete? Yes / No" confirmation. What the
 * entry said is kept in the audit trail. Renders nothing without edit rights.
 */
export function HistoryDelete({
  patientId,
  kind,
  entryId,
  canEdit,
  label,
}: {
  patientId: string
  kind: HistoryKind
  entryId: string
  canEdit: boolean
  /** What the entry is, for the button's accessible name. */
  label: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!canEdit) return null

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation()
    setError(null)
    startTransition(async () => {
      const result = await removeHistoryEntryAction(patientId, { patientId, kind, entryId })
      if (result.ok) setConfirming(false)
      else setError(result.message)
    })
  }

  if (confirming) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <span className="text-[11px] text-slate-700">{error ?? 'Delete?'}</span>
        <button
          type="button"
          disabled={pending}
          onClick={remove}
          className="rounded bg-alert-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-alert-700 disabled:opacity-60"
        >
          {pending ? '…' : 'Yes'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setConfirming(false)
            setError(null)
          }}
          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          No
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setConfirming(true)
      }}
      aria-label={`Delete ${label}`}
      title="Delete"
      className="shrink-0 rounded border border-alert-200 bg-alert-50 p-1 text-alert-600 transition-colors hover:bg-alert-100"
    >
      <Trash2 aria-hidden className="h-3.5 w-3.5" />
    </button>
  )
}
