'use client'

import { CheckSquare, Square, Syringe } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Modal } from '@components/cockpit/modal'
import {
  IMMUNIZATION_CATALOG,
  IMMUNIZATION_STATUS_LABELS,
  type ImmunizationRecord,
  type ImmunizationStatus,
} from '@modules/history/history.types'

import { recordImmunizationAction } from './history-actions'
import { FIELD, Field, RadioRow } from './history-fields'

/**
 * Immunization history.
 *
 * The card's vaccines, each with what was recorded for it in this pregnancy —
 * given (with the date), pending, not given — or "not recorded". The Stitch
 * reference draws these as ticked and unticked boxes, and so does this.
 *
 * "Pending" is a status someone recorded, never one this screen works out.
 * Whether a dose is due depends on gestation and prior doses and is the
 * clinician's call (PRD §3), so an unrecorded vaccine is shown as exactly that.
 *
 * Doses recorded in earlier pregnancies are listed beneath, because a Td given
 * eighteen months ago is part of the picture.
 */

const STATUS_STYLES: Record<ImmunizationStatus, string> = {
  GIVEN: 'border-verified-200 bg-verified-50 text-verified-700',
  PLANNED: 'border-caution-200 bg-caution-50 text-caution-700',
  NOT_GIVEN: 'border-slate-200 bg-slate-100 text-slate-600',
  UNKNOWN: 'border-slate-200 bg-slate-50 text-slate-500',
}

export function ImmunizationPanel({
  pregnancyId,
  patientId,
  records,
  canRecord,
}: {
  pregnancyId: string
  patientId: string
  records: readonly ImmunizationRecord[]
  canRecord: boolean
}) {
  const [recording, setRecording] = useState<{ vaccine: string; existing: ImmunizationRecord | null } | null>(null)

  const current = records.filter((r) => r.pregnancyId === pregnancyId)
  const earlier = records.filter((r) => r.pregnancyId !== pregnancyId)
  const byVaccine = new Map(current.map((r) => [r.vaccine, r]))

  // The card's list first, then anything recorded under another name.
  const rows = [
    ...IMMUNIZATION_CATALOG.map((item) => ({ vaccine: item.vaccine, group: item.group })),
    ...current
      .filter((r) => !IMMUNIZATION_CATALOG.some((item) => item.vaccine === r.vaccine))
      .map((r) => ({ vaccine: r.vaccine, group: 'Other' })),
  ]

  return (
    <div className="flex flex-col gap-2.5">
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ vaccine, group }) => {
          const record = byVaccine.get(vaccine) ?? null
          return (
            <li key={vaccine}>
              <button
                type="button"
                disabled={!canRecord}
                onClick={() => setRecording({ vaccine, existing: record })}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs transition-colors enabled:hover:border-brand-200 enabled:hover:bg-brand-50/40 disabled:cursor-default"
              >
                {record?.status === 'GIVEN' ? (
                  <CheckSquare aria-hidden className="h-4 w-4 shrink-0 text-verified-600" />
                ) : (
                  <Square aria-hidden className="h-4 w-4 shrink-0 text-slate-300" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{vaccine}</span>
                  <span className="block text-[10px] text-slate-400">{group}</span>
                </span>
                {record ? (
                  <span className={`numeric shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_STYLES[record.status]}`}>
                    {IMMUNIZATION_STATUS_LABELS[record.status]}
                    {record.administeredOn ? ` · ${record.administeredOn}` : ''}
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] text-slate-400">not recorded</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      {canRecord ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setRecording({ vaccine: '', existing: null })}
            className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 transition-colors hover:bg-brand-100"
          >
            <Syringe aria-hidden className="h-3.5 w-3.5" />
            Record another vaccine
          </button>
        </div>
      ) : null}

      {earlier.length > 0 ? (
        <div className="rounded-lg border border-slate-200/60 bg-slate-50/60 p-2.5">
          <p className="font-heading mb-1 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
            Recorded in earlier pregnancies
          </p>
          <ul className="numeric flex flex-wrap gap-1.5 text-[11px]">
            {earlier.map((r) => (
              <li key={r.id} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-700">
                {r.vaccine} · {IMMUNIZATION_STATUS_LABELS[r.status]}
                {r.administeredOn ? ` ${r.administeredOn}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recording ? (
        <RecordForm
          key={recording.vaccine || 'new'}
          patientId={patientId}
          pregnancyId={pregnancyId}
          vaccine={recording.vaccine}
          existing={recording.existing}
          onClose={() => setRecording(null)}
        />
      ) : null}
    </div>
  )
}

function RecordForm({
  patientId,
  pregnancyId,
  vaccine: initialVaccine,
  existing,
  onClose,
}: {
  patientId: string
  pregnancyId: string
  vaccine: string
  existing: ImmunizationRecord | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [vaccine, setVaccine] = useState(initialVaccine)
  const [status, setStatus] = useState<ImmunizationStatus | null>(existing?.status ?? 'GIVEN')
  const [date, setDate] = useState(existing?.administeredOn ?? '')
  const [facility, setFacility] = useState(existing?.facility ?? '')
  const [batch, setBatch] = useState(existing?.batchNumber ?? '')

  const save = () => {
    setError(null)
    if (!status) {
      setError('Choose whether the dose was given, is pending, or was not given.')
      return
    }
    startTransition(async () => {
      const result = await recordImmunizationAction(patientId, {
        pregnancyId,
        vaccine,
        status,
        administeredOn: status === 'GIVEN' ? date || null : null,
        facility: facility || null,
        batchNumber: batch || null,
      })
      if (result.ok) onClose()
      else setError(result.message)
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={initialVaccine ? `Immunization · ${initialVaccine}` : 'Record a vaccine'}
      subtitle={existing ? 'Updating what is recorded for this pregnancy. The earlier entry stays in the audit trail.' : 'For this pregnancy.'}
      footer={
        <>
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
            disabled={pending || !vaccine.trim()}
            className="rounded-md bg-brand-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {!initialVaccine ? (
          <Field label="Vaccine">
            <input
              value={vaccine}
              onChange={(e) => setVaccine(e.target.value)}
              list="vaccine-catalog"
              placeholder="e.g. Tdap"
              className={FIELD}
            />
            <datalist id="vaccine-catalog">
              {IMMUNIZATION_CATALOG.map((item) => (
                <option key={item.vaccine} value={item.vaccine} />
              ))}
            </datalist>
          </Field>
        ) : null}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Status</span>
          <RadioRow
            name="Status"
            options={[
              ['GIVEN', 'Given'],
              ['PLANNED', 'Pending'],
              ['NOT_GIVEN', 'Not given'],
            ]}
            value={status}
            onChange={setStatus}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {status === 'GIVEN' ? (
            <Field label="Date given">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${FIELD} numeric`} />
            </Field>
          ) : null}
          <Field label="Facility">
            <input value={facility} onChange={(e) => setFacility(e.target.value)} className={FIELD} />
          </Field>
          <Field label="Batch no.">
            <input value={batch} onChange={(e) => setBatch(e.target.value)} className={`${FIELD} numeric`} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
