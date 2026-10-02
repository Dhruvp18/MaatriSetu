'use client'

import { useState, useTransition } from 'react'

import { PAST_HISTORY_OPTIONS, type PastHistory } from '@modules/history/history.types'

import { DictatedTextarea } from './dictated-textarea'
import { savePastHistoryAction } from './history-actions'
import { HistoryFlag } from './history-flag'

/**
 * Past history — her own past illnesses, surgeries, admissions.
 *
 * One text box she can type or dictate into, with the quick-add list beside it
 * (Epilepsy, Asthma, Cardiovascular disorders, Tuberculosis) appending a line.
 * Saved on its own, at once, like the rest of her history: it is a fact about
 * her, not part of one visit.
 */

export function PastHistoryPanel({
  patientId,
  past,
  canEdit,
}: {
  patientId: string
  past: PastHistory | null
  canEdit: boolean
}) {
  const saved = past?.notes ?? ''
  const [notes, setNotes] = useState(saved)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  if (!canEdit) {
    return saved ? (
      <div className="flex items-start gap-2">
        {past ? (
          <HistoryFlag patientId={patientId} kind="PAST" entryId={past.id} flagged={past.flagged} canEdit={false} label="past history" />
        ) : null}
        <p className="text-xs leading-relaxed whitespace-pre-line text-slate-800">{saved}</p>
      </div>
    ) : (
      <p className="text-xs text-slate-500">No past history recorded.</p>
    )
  }

  const dirty = notes.trim() !== saved.trim()

  const save = () => {
    setError(null)
    setJustSaved(false)
    startTransition(async () => {
      const result = await savePastHistoryAction(patientId, {
        patientId,
        expectedVersion: past?.version ?? null,
        notes: notes || null,
      })
      if (result.ok) setJustSaved(true)
      else setError(result.message)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <DictatedTextarea
        id="past-history"
        label="Past history"
        rows={3}
        value={notes}
        onValueChange={(value) => {
          setNotes(value)
          setJustSaved(false)
        }}
        options={[...PAST_HISTORY_OPTIONS]}
        placeholder="Past illnesses, surgeries, admissions, blood transfusions — with the year where known."
      />
      <div className="flex items-center justify-end gap-2">
        {past ? (
          <HistoryFlag patientId={patientId} kind="PAST" entryId={past.id} flagged={past.flagged} canEdit label="past history" />
        ) : null}
        {error ? (
          <p role="alert" className="mr-auto text-[11px] text-alert-700">
            {error}
          </p>
        ) : justSaved && !dirty ? (
          <p className="mr-auto text-[11px] text-verified-700">Saved.</p>
        ) : past ? (
          <p className="numeric mr-auto text-[10.5px] text-slate-500">Last updated {past.updatedAt.slice(0, 10)}</p>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-md bg-brand-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save past history'}
        </button>
      </div>
    </div>
  )
}
