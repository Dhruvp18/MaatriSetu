'use client'

import { CheckCircle2, Pencil, Plus, XCircle } from 'lucide-react'
import { useState, useTransition } from 'react'

import type { BirthPlan } from '@modules/pregnancies/pregnancy.types'

import { saveBirthPlanAction } from './history-actions'
import { FIELD, Field, YesNoRow } from './history-fields'

/**
 * The birth preparedness plan: where she plans to deliver, who goes with her,
 * and whether transport, a blood donor and money are arranged. Shown as
 * recorded, and editable in place. An item nobody asked about is left out
 * rather than shown as "no".
 */

const PLACES = [
  'Tertiary Care Hospital (District Level)',
  'Community Health Centre / FRU',
  'Primary Health Centre',
  'Private hospital',
  'This clinic',
]

export function BirthPlanPanel({
  patientId,
  pregnancyId,
  version,
  plan,
  canEdit,
}: {
  patientId: string
  pregnancyId: string
  version: number
  plan: BirthPlan
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const isFilled = Object.keys(plan).length > 0

  if (editing) {
    return (
      <BirthPlanForm
        patientId={patientId}
        pregnancyId={pregnancyId}
        version={version}
        plan={plan}
        onClose={() => setEditing(false)}
      />
    )
  }

  const editButton = canEdit ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 hover:bg-brand-100"
    >
      {isFilled ? <Pencil aria-hidden className="h-3.5 w-3.5" /> : <Plus aria-hidden className="h-3.5 w-3.5" />}
      {isFilled ? 'Edit' : 'Add birth plan'}
    </button>
  ) : null

  if (!isFilled) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">No birth plan details recorded yet.</p>
        {editButton}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200/70 bg-white p-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div>
          <h3 className="mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">Delivery Arrangement</h3>
          <p className="text-sm font-semibold text-slate-900">{plan.planned_place || 'Not decided'}</p>
          <p className="mt-0.5 text-xs text-slate-600">Companion: {plan.companion_name || 'Not decided'}</p>
        </div>

        <div className="flex flex-col gap-1.5 text-xs">
          <ReadinessItem label="Transport arranged" status={plan.transport_arranged} />
          <ReadinessItem label="Blood donor identified" status={plan.blood_donor_identified} />
          <ReadinessItem label="Funds saved" status={plan.funds_saved} />
        </div>

        <div className="self-start">{editButton}</div>
      </div>

      {plan.special_instructions ? (
        <div className="mt-2 border-t border-slate-100 pt-3">
          <h3 className="mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">Special Instructions</h3>
          <p className="text-xs italic text-slate-700">{plan.special_instructions}</p>
        </div>
      ) : null}
    </div>
  )
}

function ReadinessItem({ label, status }: { label: string; status?: boolean }) {
  if (status === undefined) return null

  return (
    <div className="flex items-center gap-1.5">
      {status ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-brand-600" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-caution-600" />
      )}
      <span className={status ? 'text-slate-700 font-medium' : 'text-slate-500'}>{label}</span>
    </div>
  )
}

function BirthPlanForm({
  patientId,
  pregnancyId,
  version,
  plan,
  onClose,
}: {
  patientId: string
  pregnancyId: string
  version: number
  plan: BirthPlan
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [place, setPlace] = useState(plan.planned_place ?? '')
  const [companion, setCompanion] = useState(plan.companion_name ?? '')
  const [transport, setTransport] = useState<boolean | null>(plan.transport_arranged ?? null)
  const [donor, setDonor] = useState<boolean | null>(plan.blood_donor_identified ?? null)
  const [funds, setFunds] = useState<boolean | null>(plan.funds_saved ?? null)
  const [instructions, setInstructions] = useState(plan.special_instructions ?? '')

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await saveBirthPlanAction(patientId, {
        pregnancyId,
        expectedVersion: version,
        plan: {
          planned_place: place || undefined,
          companion_name: companion || undefined,
          transport_arranged: transport ?? undefined,
          blood_donor_identified: donor ?? undefined,
          funds_saved: funds ?? undefined,
          special_instructions: instructions || undefined,
        },
      })
      if (result.ok) onClose()
      else setError(result.message)
    })
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-brand-200 bg-brand-50/30 p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Planned place of delivery">
          <input value={place} onChange={(e) => setPlace(e.target.value)} list="birth-places" className={FIELD} />
          <datalist id="birth-places">
            {PLACES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Birth companion">
          <input
            value={companion}
            onChange={(e) => setCompanion(e.target.value)}
            placeholder="Name (relation)"
            className={FIELD}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Transport arranged">
          <YesNoRow name="Transport arranged" value={transport} onChange={setTransport} />
        </Field>
        <Field label="Blood donor identified">
          <YesNoRow name="Blood donor identified" value={donor} onChange={setDonor} />
        </Field>
        <Field label="Funds saved">
          <YesNoRow name="Funds saved" value={funds} onChange={setFunds} />
        </Field>
      </div>
      <Field label="Special instructions">
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} className={FIELD} />
      </Field>
      <div className="flex items-center justify-end gap-2">
        {error ? (
          <p role="alert" className="mr-auto text-[11px] text-alert-700">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-brand-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save birth plan'}
        </button>
      </div>
    </div>
  )
}
