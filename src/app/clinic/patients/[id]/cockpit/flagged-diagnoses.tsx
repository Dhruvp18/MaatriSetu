'use client'

import { Check, Flag, Plus, X } from 'lucide-react'
import { useState, useTransition } from 'react'

import {
  DIAGNOSIS_OPTIONS,
  DIAGNOSIS_SECTION_LABELS,
  type DiagnosisSection,
  type FlaggedDiagnosis,
} from '@modules/diagnoses/diagnosis.types'

import { flagDiagnosesAction, resolveFlaggedDiagnosisAction } from './history-actions'

/**
 * Diagnoses a clinician flagged, on the banner, and the picker that flags them.
 *
 * Each open flag is its own red pill beside Rh-negative. Clicking one asks
 * "Mark resolved?" in place; confirming takes it off the banner. Both writes
 * happen at once — a flag is a standing fact on her record, not part of one
 * visit's Save & Next.
 */

const lower = (s: string) => s.trim().toLowerCase()

export function FlaggedDiagnosisPills({
  patientId,
  flags,
  canResolve,
}: {
  patientId: string
  flags: readonly FlaggedDiagnosis[]
  canResolve: boolean
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (flags.length === 0) return null

  const resolve = (id: string) => {
    setError(null)
    startTransition(async () => {
      const result = await resolveFlaggedDiagnosisAction(patientId, id)
      if (result.ok) setConfirming(null)
      else setError(result.message)
    })
  }

  return (
    <div className="flex flex-col items-start gap-1 lg:items-end">
      <ul className="flex flex-wrap items-center gap-1.5 lg:justify-end" aria-label="Flagged diagnoses">
        {flags.map((flag) =>
          confirming === flag.id ? (
            <li
              key={flag.id}
              className="flex items-center gap-1 rounded-full border border-alert-300 bg-white px-2 py-0.5 text-xs shadow-xs"
            >
              <span className="font-semibold text-slate-800">Mark “{flag.label}” resolved?</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => resolve(flag.id)}
                className="flex items-center gap-0.5 rounded-full bg-verified-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-verified-700 disabled:opacity-60"
              >
                <Check aria-hidden className="h-3 w-3" />
                {pending ? 'Saving…' : 'Resolved'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                aria-label="Keep flagged"
                className="rounded-full p-0.5 text-slate-500 hover:bg-slate-100"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          ) : (
            <li key={flag.id}>
              <button
                type="button"
                disabled={!canResolve}
                onClick={() => setConfirming(flag.id)}
                title={
                  canResolve
                    ? `Flagged from ${DIAGNOSIS_SECTION_LABELS[flag.section].toLowerCase()} on ${flag.flaggedAt.slice(0, 10)} — click to mark resolved`
                    : `Flagged from ${DIAGNOSIS_SECTION_LABELS[flag.section].toLowerCase()} on ${flag.flaggedAt.slice(0, 10)}`
                }
                className="rounded-full bg-alert-600 px-3 py-1 text-xs font-semibold text-white shadow-xs transition-colors enabled:hover:bg-alert-700 disabled:cursor-default"
              >
                <span className="tracking-tight uppercase">{flag.label}</span>
              </button>
            </li>
          ),
        )}
      </ul>
      {error ? (
        <p role="alert" className="text-[11px] text-alert-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function DiagnosisFlagger({
  patientId,
  pregnancyId,
  section,
  openFlags,
  canFlag,
}: {
  patientId: string
  pregnancyId: string
  section: DiagnosisSection
  openFlags: readonly FlaggedDiagnosis[]
  canFlag: boolean
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [typed, setTyped] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const open = new Set(openFlags.map((f) => lower(f.label)))
  const options = DIAGNOSIS_OPTIONS[section]
  // Anything typed earlier and still selected shows as a chip too.
  const custom = selected.filter((label) => !options.some((o) => lower(o) === lower(label)))

  const toggle = (label: string) =>
    setSelected((current) =>
      current.some((l) => lower(l) === lower(label))
        ? current.filter((l) => lower(l) !== lower(label))
        : [...current, label],
    )

  const addTyped = () => {
    const label = typed.trim()
    if (!label) return
    if (!selected.some((l) => lower(l) === lower(label)) && !open.has(lower(label))) {
      setSelected((current) => [...current, label])
    }
    setTyped('')
  }

  const flag = () => {
    setError(null)
    setSaved(null)
    const labels = selected.filter((l) => !open.has(lower(l)))
    if (labels.length === 0) return
    startTransition(async () => {
      const result = await flagDiagnosesAction(patientId, { pregnancyId, section, labels })
      if (result.ok) {
        setSaved(`${labels.length} flagged to the banner.`)
        setSelected([])
      } else {
        setError(result.message)
      }
    })
  }

  const chip = (label: string) => {
    const isOpen = open.has(lower(label))
    const isSelected = selected.some((l) => lower(l) === lower(label))
    return (
      <button
        key={label}
        type="button"
        role="checkbox"
        aria-checked={isOpen || isSelected}
        disabled={!canFlag || isOpen}
        onClick={() => toggle(label)}
        title={isOpen ? 'Already on the banner' : undefined}
        className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold transition-colors disabled:cursor-default ${
          isOpen
            ? 'border-alert-200 bg-alert-50 text-alert-700'
            : isSelected
              ? 'border-alert-600 bg-alert-600 text-white'
              : 'border-slate-200 bg-white text-slate-700 enabled:hover:border-alert-200 enabled:hover:text-alert-700'
        }`}
      >
        {isOpen ? '⚑ ' : isSelected ? '✓ ' : ''}
        {label}
      </button>
    )
  }

  return (
    <section className="rounded-lg border border-dashed border-alert-200 bg-alert-50/30 p-2.5">
      <p className="font-heading mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-alert-700 uppercase">
        <Flag aria-hidden className="h-3.5 w-3.5" />
        Diagnosis to be flagged
      </p>

      <div className="flex flex-wrap gap-1">
        {options.map(chip)}
        {custom.map(chip)}
      </div>

      {canFlag ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the diagnosis; it must never submit the consultation form around it.
              if (e.key === 'Enter') {
                e.preventDefault()
                addTyped()
              }
            }}
            placeholder="Or type a diagnosis and press Enter"
            aria-label="Type a diagnosis to flag"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none focus:border-alert-600 focus:ring-1 focus:ring-alert-600"
          />
          <button
            type="button"
            onClick={addTyped}
            disabled={!typed.trim()}
            className="flex items-center gap-0.5 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-alert-200 disabled:opacity-50"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
            Add
          </button>
          <button
            type="button"
            onClick={flag}
            disabled={pending || selected.filter((l) => !open.has(lower(l))).length === 0}
            className="flex items-center gap-1 rounded bg-alert-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-alert-700 disabled:opacity-50"
          >
            <Flag aria-hidden className="h-3.5 w-3.5" />
            {pending ? 'Flagging…' : `Flag ${selected.length > 0 ? selected.length : ''} to banner`}
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-[10.5px] text-slate-500">Flagging a diagnosis is a clinician act.</p>
      )}

      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-alert-700">
          {error}
        </p>
      ) : saved ? (
        <p className="mt-1 text-[11px] text-verified-700">{saved} Click a pill on the banner to mark it resolved.</p>
      ) : null}
    </section>
  )
}
