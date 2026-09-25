'use client'

import { MessageSquareText, Plus, X } from 'lucide-react'
import { useState } from 'react'

import { Accordion } from '@components/cockpit/accordion'
import { type ChiefComplaint, DURATION_UNIT_LABELS, type DurationUnit } from '@modules/visits/visit.types'

import { DictatedTextarea } from './dictated-textarea'

/**
 * Chief complaints — what she came with today, each with how long.
 *
 * One row per complaint: a text box she can dictate into, then the duration as
 * a number and days / weeks / months / years. A row with no complaint is not
 * sent; a duration is optional, but a number without a unit is refused by the
 * server, so the unit defaults to days as soon as a number is typed.
 *
 * Commits with the consultation. The section sits above the record, outside
 * the consultation <form>, so its hidden field names that form by id.
 */

interface Row {
  key: number
  complaint: string
  durationValue: string
  durationUnit: DurationUnit
}

let nextKey = 1

const blank = (): Row => ({ key: nextKey++, complaint: '', durationValue: '', durationUnit: 'DAYS' })

const fromSaved = (c: ChiefComplaint): Row => ({
  key: nextKey++,
  complaint: c.complaint,
  durationValue: c.durationValue !== null ? String(c.durationValue) : '',
  durationUnit: c.durationUnit ?? 'DAYS',
})

const FIELD =
  'rounded border border-slate-300 bg-white/80 px-2 py-1.5 text-xs text-slate-900 outline-none transition-colors focus:border-brand-600 focus:ring-1 focus:ring-brand-600'

export function ChiefComplaintsSection({
  current,
  formId,
}: {
  current: readonly ChiefComplaint[]
  /** The consultation <form>'s id. */
  formId: string
}) {
  const [rows, setRows] = useState<Row[]>(() => (current.length > 0 ? current.map(fromSaved) : [blank()]))

  const update = (key: number, patch: Partial<Row>) =>
    setRows((all) => all.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const payload = rows
    .filter((row) => row.complaint.trim().length > 0)
    .map((row) => {
      const n = Number.parseInt(row.durationValue, 10)
      const hasDuration = Number.isInteger(n) && n > 0
      return {
        complaint: row.complaint.trim(),
        durationValue: hasDuration ? n : null,
        durationUnit: hasDuration ? row.durationUnit : null,
      }
    })

  return (
    <Accordion
      title="Chief complaints"
      icon={<MessageSquareText className="h-4.75 w-4.75" />}
      summary={payload.length > 0 ? `${payload.length} recorded` : undefined}
      defaultOpen
    >
      <input type="hidden" form={formId} name="chiefComplaints" value={JSON.stringify(payload)} />
      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li
            key={row.key}
            className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200/90 bg-white p-2.5 shadow-2xs md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <DictatedTextarea
              id={`chief-complaint-${row.key}`}
              label={`Complaint ${index + 1}`}
              rows={2}
              value={row.complaint}
              onValueChange={(complaint) => update(row.key, { complaint })}
              placeholder="e.g. Pain in abdomen, swelling over feet, reduced fetal movements"
            />
            <div className="flex items-end gap-1.5">
              <label className="flex flex-col gap-1">
                <span className="font-heading text-xs font-bold tracking-wider text-slate-800 uppercase">Since</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={row.durationValue}
                  onChange={(e) => update(row.key, { durationValue: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault()
                  }}
                  placeholder="No."
                  aria-label={`Complaint ${index + 1} duration`}
                  className={`${FIELD} numeric w-20`}
                />
              </label>
              <div className="flex rounded border border-slate-300 bg-white p-0.5" role="radiogroup" aria-label={`Complaint ${index + 1} duration unit`}>
                {(Object.keys(DURATION_UNIT_LABELS) as DurationUnit[]).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    role="radio"
                    aria-checked={row.durationUnit === unit}
                    onClick={() => update(row.key, { durationUnit: unit })}
                    className={`rounded px-2 py-1 text-[11px] font-bold capitalize transition-colors ${
                      row.durationUnit === unit ? 'bg-brand-600 text-white' : 'text-slate-600 hover:text-brand-800'
                    }`}
                  >
                    {DURATION_UNIT_LABELS[unit]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRows((all) => (all.length === 1 ? [blank()] : all.filter((r) => r.key !== row.key)))}
                aria-label={`Remove complaint ${index + 1}`}
                className="mb-1 rounded p-1 text-slate-400 transition-colors hover:text-alert-600"
              >
                <X aria-hidden className="h-4.25 w-4.25" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => setRows((all) => [...all, blank()])}
          className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-800 transition-colors hover:bg-brand-100"
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          Add complaint
        </button>
      </div>
    </Accordion>
  )
}
