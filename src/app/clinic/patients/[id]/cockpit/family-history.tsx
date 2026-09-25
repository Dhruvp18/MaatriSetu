'use client'

import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState, useTransition } from 'react'

import { FAMILY_RELATIONS, type FamilyHistoryEntry, type VitalStatus } from '@modules/history/history.types'

import { removeFamilyHistoryAction, saveFamilyHistoryAction } from './history-actions'
import { FIELD, Field, RadioRow, toIntOrNull } from './history-fields'

/**
 * Family history — every relative recorded, as a table, with one "Add family
 * member" button beneath it. The form (relation, alive or deceased, disease,
 * onset age, current age, remarks) opens only when adding or correcting a row
 * (pencil), and closes again on save or cancel. A removed row (bin) is kept in
 * the record and audit trail, just no longer shown.
 */

interface Draft {
  relation: string
  vitalStatus: VitalStatus
  disease: string
  onsetAge: string
  currentAge: string
  remarks: string
}

const EMPTY: Draft = { relation: '', vitalStatus: 'ALIVE', disease: '', onsetAge: '', currentAge: '', remarks: '' }

const toDraft = (e: FamilyHistoryEntry): Draft => ({
  relation: e.relation,
  vitalStatus: e.vitalStatus,
  disease: e.disease,
  onsetAge: e.onsetAgeYears !== null ? String(e.onsetAgeYears) : '',
  currentAge: e.currentAgeYears !== null ? String(e.currentAgeYears) : '',
  remarks: e.remarks ?? '',
})

export function FamilyHistoryPanel({
  patientId,
  entries,
  canEdit,
}: {
  patientId: string
  entries: readonly FamilyHistoryEntry[]
  canEdit: boolean
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [editing, setEditing] = useState<FamilyHistoryEntry | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const reset = () => {
    setDraft(EMPTY)
    setEditing(null)
    setFormOpen(false)
    setError(null)
  }

  const save = () => {
    setError(null)
    if (!draft.relation.trim() || !draft.disease.trim()) {
      setError('Relation and disease name are needed.')
      return
    }
    startTransition(async () => {
      const result = await saveFamilyHistoryAction(patientId, {
        patientId,
        entryId: editing?.id ?? null,
        expectedVersion: editing?.version ?? null,
        entry: {
          relation: draft.relation,
          vitalStatus: draft.vitalStatus,
          disease: draft.disease,
          onsetAgeYears: toIntOrNull(draft.onsetAge),
          currentAgeYears: toIntOrNull(draft.currentAge),
          remarks: draft.remarks || null,
        },
      })
      if (result.ok) reset()
      else setError(result.message)
    })
  }

  const remove = (entry: FamilyHistoryEntry) => {
    setError(null)
    startTransition(async () => {
      const result = await removeFamilyHistoryAction(patientId, {
        patientId,
        entryId: entry.id,
        expectedVersion: entry.version,
      })
      if (result.ok) {
        setRemoving(null)
        if (editing?.id === entry.id) reset()
      } else {
        setError(result.message)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-3 text-center text-xs text-slate-500">
          No family history recorded.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200/70">
          <table className="numeric w-full min-w-[560px] border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-2.5 py-1.5">No.</th>
                <th className="px-2.5 py-1.5">Relation</th>
                <th className="px-2.5 py-1.5">Age</th>
                <th className="px-2.5 py-1.5">Disease</th>
                <th className="px-2.5 py-1.5">Onset age</th>
                <th className="px-2.5 py-1.5">Remarks</th>
                {canEdit ? <th className="px-2.5 py-1.5 text-right">Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr
                  key={entry.id}
                  className={`border-t border-slate-100 ${editing?.id === entry.id ? 'bg-brand-50/60' : 'bg-white'}`}
                >
                  <td className="px-2.5 py-1.5 text-slate-500">{index + 1}</td>
                  <td className="px-2.5 py-1.5 font-semibold text-slate-900">
                    {entry.relation}
                    {entry.vitalStatus === 'DECEASED' ? (
                      <span className="ml-1.5 rounded border border-slate-200 bg-slate-100 px-1 text-[10px] font-semibold text-slate-600">
                        deceased
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2.5 py-1.5 text-slate-700">
                    {entry.currentAgeYears !== null ? `${entry.currentAgeYears} yrs` : '—'}
                  </td>
                  <td className="px-2.5 py-1.5 font-semibold text-slate-900">{entry.disease}</td>
                  <td className="px-2.5 py-1.5 text-slate-700">
                    {entry.onsetAgeYears !== null ? `${entry.onsetAgeYears} yrs` : '—'}
                  </td>
                  <td className="px-2.5 py-1.5 text-slate-600">{entry.remarks ?? '—'}</td>
                  {canEdit ? (
                    <td className="px-2.5 py-1.5 text-right">
                      {removing === entry.id ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-[11px] text-slate-700">Remove?</span>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => remove(entry)}
                            className="rounded bg-alert-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-alert-700 disabled:opacity-60"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoving(null)}
                            className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(entry)
                              setDraft(toDraft(entry))
                              setError(null)
                              setFormOpen(true)
                            }}
                            aria-label={`Edit ${entry.relation} — ${entry.disease}`}
                            className="rounded border border-caution-200 bg-caution-50 p-1 text-caution-700 hover:bg-caution-100"
                          >
                            <Pencil aria-hidden className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoving(entry.id)}
                            aria-label={`Remove ${entry.relation} — ${entry.disease}`}
                            className="rounded border border-alert-200 bg-alert-50 p-1 text-alert-600 hover:bg-alert-100"
                          >
                            <Trash2 aria-hidden className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && formOpen ? (
        <div
          className={`flex flex-col gap-2 rounded-lg border p-2.5 ${
            editing ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 bg-white'
          }`}
          onKeyDown={(e) => {
            // Enter saves the row; it must never submit a form around the cockpit.
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
              e.preventDefault()
              save()
            }
          }}
        >
          <p className="font-heading text-[11px] font-bold tracking-wider text-slate-700 uppercase">
            {editing ? `Editing — ${editing.relation}, ${editing.disease}` : 'New family member'}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Relation *">
              <input
                value={draft.relation}
                onChange={(e) => set({ relation: e.target.value })}
                list="family-relations"
                placeholder="e.g. Mother, Husband"
                className={FIELD}
              />
              <datalist id="family-relations">
                {FAMILY_RELATIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <Field label="Status">
              <RadioRow
                name="Alive or deceased"
                options={[
                  ['ALIVE', 'Alive'],
                  ['DECEASED', 'Deceased'],
                ]}
                value={draft.vitalStatus}
                onChange={(v) => set({ vitalStatus: v ?? 'ALIVE' })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="Disease name *">
              <input
                value={draft.disease}
                onChange={(e) => set({ disease: e.target.value })}
                placeholder="e.g. Diabetes, Hypertension, Thalassaemia"
                className={FIELD}
              />
            </Field>
            <Field label="Onset age (yrs)">
              <input
                type="number"
                min={0}
                max={120}
                value={draft.onsetAge}
                onChange={(e) => set({ onsetAge: e.target.value })}
                className={`${FIELD} numeric`}
              />
            </Field>
            <Field label={draft.vitalStatus === 'DECEASED' ? 'Age at death (yrs)' : 'Current age (yrs)'}>
              <input
                type="number"
                min={0}
                max={130}
                value={draft.currentAge}
                onChange={(e) => set({ currentAge: e.target.value })}
                className={`${FIELD} numeric`}
              />
            </Field>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <Field label="Remarks" className="flex-1">
              <input value={draft.remarks} onChange={(e) => set({ remarks: e.target.value })} className={FIELD} />
            </Field>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="flex items-center gap-1 rounded-md bg-brand-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {editing ? <Pencil aria-hidden className="h-3.5 w-3.5" /> : <Plus aria-hidden className="h-3.5 w-3.5" />}
                {pending ? 'Saving…' : editing ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-[11px] text-alert-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : canEdit ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY)
              setEditing(null)
              setError(null)
              setFormOpen(true)
            }}
            className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 transition-colors hover:bg-brand-100"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
            Add family member
          </button>
        </div>
      ) : null}

      {/* A failed removal happens with the form closed; say so here. */}
      {!formOpen && error ? (
        <p role="alert" className="text-right text-[11px] text-alert-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}
