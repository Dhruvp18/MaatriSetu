'use client'

import { X } from 'lucide-react'

/**
 * The small controls the history forms are built from, shaped after the paper
 * OPD form: a bold section label, a row of radio options, a remarks box beside
 * them.
 *
 * Every control can express "not recorded" — a radio row can be cleared, and a
 * multi-select distinguishes nothing-chosen from "None" — because a history
 * form that forces an answer gets answered with a guess (ARCH-10).
 */

export const FIELD =
  'w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none transition-colors focus:border-brand-600 focus:ring-1 focus:ring-brand-600'

export function Section({
  title,
  children,
  aside,
}: {
  title: string
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <fieldset className="flex flex-col gap-1.5 border-b border-slate-100 pb-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <legend className="font-heading text-[11px] font-bold tracking-wide text-slate-800 uppercase">{title}</legend>
        {aside}
      </div>
      {children}
    </fieldset>
  )
}

export function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

/** A single-choice row that can be cleared back to "not recorded". */
export function RadioRow<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string
  options: ReadonlyArray<readonly [T, string]>
  value: T | null
  onChange: (value: T | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={name}>
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            value === option
              ? 'border-brand-600 bg-brand-600 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-800'
          }`}
        >
          <span
            aria-hidden
            className={`h-2.5 w-2.5 rounded-full border ${
              value === option ? 'border-white bg-white' : 'border-slate-400'
            }`}
          />
          {label}
        </button>
      ))}
      {value !== null ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Clear ${name}`}
          title="Clear — not recorded"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/**
 * A multi-select with an explicit "None".
 *
 * `null` = not recorded, `[]` = None, otherwise the chosen items. Choosing an
 * item clears None; choosing None clears the items.
 */
export function MultiWithNone<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string
  options: ReadonlyArray<readonly [T, string]>
  value: readonly T[] | null
  onChange: (value: T[] | null) => void
}) {
  const toggle = (option: T) => {
    const current = value ?? []
    const next = current.includes(option) ? current.filter((v) => v !== option) : [...current, option]
    onChange(next.length > 0 ? next : null)
  }

  const chip = (selected: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
      selected
        ? 'border-brand-600 bg-brand-600 text-white'
        : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-800'
    }`

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={name}>
      {options.map(([option, label]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value?.includes(option) ?? false}
          onClick={() => toggle(option)}
          className={chip(value?.includes(option) ?? false)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={value !== null && value.length === 0}
        onClick={() => onChange(value !== null && value.length === 0 ? null : [])}
        className={chip(value !== null && value.length === 0)}
      >
        None
      </button>
      {value === null ? <span className="text-[10.5px] text-slate-400">not recorded</span> : null}
    </div>
  )
}

/** Yes / No, clearable back to "not asked". */
export function YesNoRow({
  name,
  value,
  onChange,
}: {
  name: string
  value: boolean | null
  onChange: (value: boolean | null) => void
}) {
  return (
    <RadioRow
      name={name}
      options={[
        ['YES', 'Yes'],
        ['NO', 'No'],
      ]}
      value={value === null ? null : value ? 'YES' : 'NO'}
      onChange={(v) => onChange(v === null ? null : v === 'YES')}
    />
  )
}

/** A labelled value in a read-only detail view. Unrecorded values say so. */
export function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="flex flex-col gap-0.5 rounded border border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
      <dt className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className={`numeric text-xs ${empty ? 'text-slate-400' : 'font-semibold text-slate-900'}`}>
        {empty ? 'Not recorded' : value}
      </dd>
    </div>
  )
}

/** A number input's value as a number, or null when blank or not a number. */
export function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function toIntOrNull(value: string): number | null {
  const n = toNumberOrNull(value)
  return n === null ? null : Math.round(n)
}
