'use client'

import { HeartHandshake, Pencil } from 'lucide-react'
import { useState, useTransition } from 'react'

import {
  type Consanguinity,
  type Pregnancy,
  type PregnancyConceptionMode,
  SHORT_STATURE_CM,
} from '@modules/pregnancies/pregnancy.types'

import { updatePregnancyProfileAction } from './history-actions'
import { FIELD, Field, RadioRow } from './history-fields'

/**
 * Marriage, conception and height for this pregnancy.
 *
 * Shown with the immunization history, where the OPD form asks them. A
 * consanguineous marriage reads in red, as asked; so does a height under
 * 150 cm. Both state what was recorded and conclude nothing from it.
 */

const CONSANGUINITY_LABELS: Record<Consanguinity, string> = {
  CONSANGUINEOUS: 'Consanguineous',
  NON_CONSANGUINEOUS: 'Non-consanguineous',
}

const CONCEPTION_LABELS: Record<PregnancyConceptionMode, string> = {
  NATURAL: 'Natural',
  IVF: 'IVF',
}

type Profile = Pick<Pregnancy, 'id' | 'version' | 'heightCm' | 'marriage' | 'conceptionMode'>

export function PregnancyProfilePanel({
  patientId,
  pregnancy,
  canEdit,
}: {
  patientId: string
  pregnancy: Profile
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const { marriage, conceptionMode, heightCm } = pregnancy
  const consanguineous = marriage.consanguinity === 'CONSANGUINEOUS'
  const shortStature = heightCm !== null && heightCm < SHORT_STATURE_CM

  if (editing) {
    return <ProfileForm patientId={patientId} pregnancy={pregnancy} onClose={() => setEditing(false)} />
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 font-heading text-[11px] font-bold tracking-wider text-slate-700 uppercase">
        <HeartHandshake aria-hidden className="h-4 w-4 text-brand-600" />
        Marriage &amp; conception
      </span>
      <Fact label="Married since">{marriage.years !== null ? `${marriage.years} yrs` : null}</Fact>
      <Fact label="Marriage" tone={consanguineous ? 'alert' : undefined}>
        {marriage.consanguinity ? CONSANGUINITY_LABELS[marriage.consanguinity] : null}
      </Fact>
      <Fact label="Conceived">{conceptionMode ? CONCEPTION_LABELS[conceptionMode] : null}</Fact>
      <Fact label="Height" tone={shortStature ? 'alert' : undefined}>
        {heightCm !== null ? `${heightCm} cm${shortStature ? ` (< ${SHORT_STATURE_CM})` : ''}` : null}
      </Fact>
      {canEdit ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-auto flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 hover:bg-brand-100"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" />
          Edit
        </button>
      ) : null}
    </div>
  )
}

function Fact({ label, tone, children }: { label: string; tone?: 'alert'; children: React.ReactNode }) {
  return (
    <span className="numeric">
      <span className="text-slate-500">{label}: </span>
      {children === null ? (
        <span className="text-slate-400">not recorded</span>
      ) : (
        <strong
          className={
            tone === 'alert'
              ? 'rounded border border-alert-200 bg-alert-50 px-1.5 py-0.5 font-bold text-alert-700'
              : 'font-semibold text-slate-800'
          }
        >
          {children}
        </strong>
      )}
    </span>
  )
}

function ProfileForm({
  patientId,
  pregnancy,
  onClose,
}: {
  patientId: string
  pregnancy: Profile
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [years, setYears] = useState(pregnancy.marriage.years !== null ? String(pregnancy.marriage.years) : '')
  const [consanguinity, setConsanguinity] = useState<Consanguinity | null>(pregnancy.marriage.consanguinity)
  const [conception, setConception] = useState<PregnancyConceptionMode | null>(pregnancy.conceptionMode)
  const [height, setHeight] = useState(pregnancy.heightCm !== null ? String(pregnancy.heightCm) : '')

  const save = () => {
    setError(null)
    const toNum = (v: string) => (v.trim() === '' ? null : Number(v))
    startTransition(async () => {
      const result = await updatePregnancyProfileAction(patientId, {
        pregnancyId: pregnancy.id,
        expectedVersion: pregnancy.version,
        heightCm: toNum(height),
        marriedYears: toNum(years),
        consanguinity,
        conceptionMode: conception,
      })
      if (result.ok) onClose()
      else setError(result.message)
    })
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-brand-200 bg-brand-50/30 p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Married since (yrs)">
          <input
            type="number"
            min={0}
            max={60}
            value={years}
            onChange={(e) => setYears(e.target.value)}
            className={`${FIELD} numeric`}
          />
        </Field>
        <Field label="Marriage" className="md:col-span-2">
          <RadioRow
            name="Marriage"
            options={[
              ['NON_CONSANGUINEOUS', 'Non-consanguineous'],
              ['CONSANGUINEOUS', 'Consanguineous'],
            ]}
            value={consanguinity}
            onChange={setConsanguinity}
          />
        </Field>
        <Field label="Height (cm)">
          <input
            type="number"
            min={100}
            max={220}
            step="0.1"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className={`${FIELD} numeric ${height && Number(height) < SHORT_STATURE_CM ? 'border-alert-300 text-alert-700' : ''}`}
          />
        </Field>
        <Field label="Pregnancy conceived" className="md:col-span-4">
          <RadioRow
            name="Pregnancy conceived"
            options={[
              ['NATURAL', 'Natural'],
              ['IVF', 'IVF'],
            ]}
            value={conception}
            onChange={setConception}
          />
        </Field>
      </div>
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
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
