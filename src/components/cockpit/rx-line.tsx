'use client'

import { X } from 'lucide-react'
import { useState } from 'react'

import { type FormularyItem, searchFormulary } from '@modules/orders/formulary'
import type { DoseFrequency, FoodRelation, Prescription } from '@modules/orders/order.types'
import type { PackMedicine } from '@modules/master-packs/master-pack.types'

/**
 * One prescription line, as the doctor edits it.
 *
 * Shared by today's Rx in the cockpit and the master-pack editor, so a line in
 * a pack is written exactly the way it will land on the prescription.
 */

// Without a width, for controls that size themselves: `w-full` would beat any
// width class added next to it.
export const FIELD_BOX =
  'rounded border border-slate-300 bg-white/80 px-2.5 py-1.5 text-xs text-slate-900 outline-none transition-colors focus:border-brand-600 focus:ring-1 focus:ring-brand-600'

export const FIELD = `w-full ${FIELD_BOX}`

/**
 * The schedules offered as one-tap buttons, in the order they are written.
 * Shown as the pattern and the abbreviation together — `1-0-1 BD` — which is
 * how the prescription pad reads.
 */
export const SCHEDULES: ReadonlyArray<{ value: DoseFrequency; pattern: string | null; code: string }> = [
  { value: 'OD', pattern: '1-0-0', code: 'OD' },
  { value: 'BD', pattern: '1-0-1', code: 'BD' },
  { value: 'TDS', pattern: '1-1-1', code: 'TDS' },
  { value: 'QID', pattern: '1-1-1-1', code: 'QID' },
  { value: 'HS', pattern: '0-0-1', code: 'HS' },
  { value: 'SOS', pattern: null, code: 'SOS' },
  { value: 'WEEKLY', pattern: null, code: 'Weekly' },
]

const FORMS = ['Tab', 'Cap', 'Syp', 'Inj', 'Susp', 'Oint', 'Drops', 'Sachet']

export interface RxDraft {
  key: number
  medicineName: string
  doseAmount: string
  doseUnit: string
  form: string
  frequency: DoseFrequency
  foodRelation: FoodRelation
  durationDays: string
  instructions: string
}

let nextKey = 1

export const blankRx = (): RxDraft => ({
  key: nextKey++,
  medicineName: '',
  doseAmount: '',
  doseUnit: 'mg',
  form: 'Tab',
  frequency: 'OD',
  foodRelation: 'AFTER_FOOD',
  durationDays: '30',
  instructions: '',
})

/**
 * An ongoing prescription, carried into today's Rx so the doctor continues,
 * edits or removes it rather than retyping it. Nothing is re-ordered unless it
 * is still on the list when she saves.
 */
export const fromOngoing = (rx: Prescription): RxDraft => ({
  key: nextKey++,
  medicineName: rx.medicineName,
  doseAmount: rx.dose.kind === 'SPECIFIED' ? String(rx.dose.amount) : '',
  doseUnit: rx.dose.kind === 'SPECIFIED' ? rx.dose.unit : '',
  form: rx.form ?? 'Tab',
  frequency: rx.frequency,
  foodRelation: rx.foodRelation,
  durationDays: rx.durationDays !== null ? String(rx.durationDays) : '',
  instructions: rx.instructions ?? '',
})

export const fromFormulary = (item: FormularyItem): RxDraft => ({
  key: nextKey++,
  medicineName: item.medicineName,
  doseAmount: item.doseAmount !== null ? String(item.doseAmount) : '',
  doseUnit: item.doseUnit ?? '',
  form: item.form,
  frequency: item.frequency,
  foodRelation: item.foodRelation,
  durationDays: item.durationDays !== null ? String(item.durationDays) : '',
  instructions: '',
})

export const fromPackMedicine = (line: PackMedicine): RxDraft => ({
  key: nextKey++,
  medicineName: line.medicineName,
  doseAmount: line.doseAmount !== null ? String(line.doseAmount) : '',
  doseUnit: line.doseUnit ?? '',
  form: line.form ?? 'Tab',
  frequency: line.frequency,
  foodRelation: line.foodRelation,
  durationDays: line.durationDays !== null ? String(line.durationDays) : '',
  instructions: line.instructions ?? '',
})

/**
 * A completed line in the shape both the consultation and a pack store, or
 * null for a half-typed one. A dose needs its amount and unit together.
 */
export function toPackMedicine(rx: RxDraft): PackMedicine | null {
  const medicineName = rx.medicineName.trim()
  if (!medicineName) return null
  const hasDose = rx.doseAmount !== '' && rx.doseUnit.trim() !== ''
  return {
    medicineName,
    form: rx.form || null,
    doseAmount: hasDose ? Number(rx.doseAmount) : null,
    doseUnit: hasDose ? rx.doseUnit.trim() : null,
    frequency: rx.frequency,
    foodRelation: rx.foodRelation,
    durationDays: rx.durationDays ? Number(rx.durationDays) : null,
    instructions: rx.instructions.trim() || null,
  }
}

export function RxLineEditor({
  index,
  rx,
  onChange,
  onRemove,
}: {
  index: number
  rx: RxDraft
  onChange: (patch: Partial<RxDraft>) => void
  onRemove: () => void
}) {
  return (
    <li className="rounded border border-slate-200/70 bg-slate-50/90 p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="numeric shrink-0 text-xs font-bold text-brand-800">{index + 1}.</span>
        <select
          value={rx.form || 'Tab'}
          onChange={(e) => onChange({ form: e.target.value })}
          aria-label="Form"
          className={`${FIELD_BOX} w-20 shrink-0 px-1.5`}
        >
          {[...new Set([...FORMS, rx.form].filter(Boolean))].map((form) => (
            <option key={form} value={form}>
              {form}
            </option>
          ))}
        </select>
        <MedicineInput
          value={rx.medicineName}
          onChange={(medicineName) => onChange({ medicineName })}
          onPick={(item) => onChange({ ...fromFormulary(item), key: rx.key })}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-alert-600"
        >
          <X aria-hidden className="h-4.25 w-4.25" />
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 sm:pl-6">
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Schedule">
          {SCHEDULES.map((schedule) => {
            const selected = rx.frequency === schedule.value
            return (
              <button
                key={schedule.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ frequency: schedule.value })}
                className={`numeric rounded border px-1.5 py-0.5 text-[10.5px] font-bold transition-colors ${
                  selected
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-800'
                }`}
              >
                {schedule.pattern ? `${schedule.pattern} ` : ''}
                <span className={selected ? 'text-white/85' : 'text-slate-400'}>{schedule.code}</span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {/* Amount and unit are one field in the domain: the
              schema refuses one without the other. */}
          <input
            value={rx.doseAmount}
            onChange={(e) => onChange({ doseAmount: e.target.value })}
            type="number"
            step="any"
            placeholder="Dose"
            aria-label="Dose amount"
            className={`${FIELD} numeric`}
          />
          <input
            value={rx.doseUnit}
            onChange={(e) => onChange({ doseUnit: e.target.value })}
            placeholder="unit"
            aria-label="Dose unit"
            className={`${FIELD} numeric`}
          />
          <select
            value={rx.foodRelation}
            onChange={(e) => onChange({ foodRelation: e.target.value as FoodRelation })}
            aria-label="Relation to food"
            className={FIELD}
          >
            <option value="AFTER_FOOD">after food</option>
            <option value="BEFORE_FOOD">before food</option>
            <option value="WITH_FOOD">with food</option>
            <option value="NOT_SPECIFIED">not specified</option>
          </select>
          <div className="flex min-w-0 items-center gap-1">
            <input
              value={rx.durationDays}
              onChange={(e) => onChange({ durationDays: e.target.value })}
              type="number"
              min={1}
              placeholder="Days"
              aria-label="Duration in days"
              className={`${FIELD} numeric`}
            />
            <span className="text-[10px] text-slate-500">days</span>
          </div>
        </div>

        <input
          value={rx.instructions}
          onChange={(e) => onChange({ instructions: e.target.value })}
          onKeyDown={(e) => {
            // Enter must never submit the consultation from a drug line.
            if (e.key === 'Enter') e.preventDefault()
          }}
          placeholder="Remarks — e.g. with milk, stop if rash"
          aria-label="Remarks"
          maxLength={1000}
          className={FIELD}
        />
      </div>
    </li>
  )
}

/** Medicine name with the formulary type-ahead. */
function MedicineInput({
  value,
  onChange,
  onPick,
}: {
  value: string
  onChange: (value: string) => void
  onPick: (item: FormularyItem) => void
}) {
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const matches = focused ? searchFormulary(value) : []
  const exact = matches.some((item) => item.medicineName.toLowerCase() === value.trim().toLowerCase())
  const open = matches.length > 0 && !exact

  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setActive(0)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => {
          if (!open) {
            // Enter must never submit the consultation from a drug line.
            if (e.key === 'Enter') e.preventDefault()
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => (i + 1) % matches.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => (i - 1 + matches.length) % matches.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const item = matches[active]
            if (item) onPick(item)
          }
        }}
        placeholder="Medicine — type to search the clinic list, or any name"
        aria-label="Medicine"
        autoComplete="off"
        className={FIELD}
      />
      {open ? (
        <ul className="absolute top-full right-0 left-0 z-20 mt-1 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(item)}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-xs ${
                  index === active ? 'bg-brand-50 text-brand-800' : 'text-slate-800'
                }`}
              >
                <span className="font-semibold">
                  {item.form}. {item.medicineName}
                  {item.doseAmount !== null ? ` ${item.doseAmount} ${item.doseUnit}` : ''}
                </span>
                <span className="numeric shrink-0 text-[10.5px] text-slate-500">
                  {SCHEDULES.find((s) => s.value === item.frequency)?.pattern ?? ''} {item.frequency}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
