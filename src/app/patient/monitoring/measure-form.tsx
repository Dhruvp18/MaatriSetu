'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Plus, X } from 'lucide-react'

import { GLUCOSE_CONTEXT_LABELS, type GlucoseContext, type HomeReadingMetric } from '@/modules/monitoring/monitoring.types'

import { recordReading, type RecordReadingState } from './actions'

const initial: RecordReadingState = { status: 'idle', message: null }

const FIELD =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#b84c63] focus:ring-1 focus:ring-[#b84c63]'

const GLUCOSE_CONTEXTS: readonly GlucoseContext[] = ['FASTING', 'POST_BREAKFAST', 'POST_LUNCH', 'POST_DINNER', 'RANDOM']

function SaveButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[#8a3c4a] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#743140] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? busy : label}
    </button>
  )
}

export function MeasureForm({
  metric,
  labels,
}: {
  metric: HomeReadingMetric
  labels: {
    measure: string
    save: string
    saving: string
    saved: string
    close: string
    glucoseValue: string
    glucoseContext: string
    bloodPressure: string
    systolic: string
    diastolic: string
  }
}) {
  const [open, setOpen] = useState(false)
  const [state, action] = useActionState(recordReading, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.status !== 'saved') return
    formRef.current?.reset()
    const timer = setTimeout(() => setOpen(false), 900)
    return () => clearTimeout(timer)
  }, [state])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-[#8a3c4a] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#743140]"
      >
        <Plus aria-hidden className="h-3.5 w-3.5" />
        {labels.measure}
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-[#8a3c4a]">{labels.measure}</span>
        <button type="button" onClick={() => setOpen(false)} aria-label={labels.close}>
          <X aria-hidden className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      <form ref={formRef} action={action} className="space-y-3">
        <input type="hidden" name="metric" value={metric} />

        {metric === 'BLOOD_GLUCOSE' ? (
          <>
            <div>
              <label htmlFor="mgDl" className="mb-1 block text-xs font-semibold text-slate-600">
                {labels.glucoseValue}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="mgDl"
                  name="mgDl"
                  type="number"
                  inputMode="numeric"
                  min={20}
                  max={700}
                  required
                  placeholder="95"
                  className={`${FIELD} numeric`}
                />
                <span className="shrink-0 text-xs text-slate-500">mg/dL</span>
              </div>
            </div>
            <div>
              <label htmlFor="context" className="mb-1 block text-xs font-semibold text-slate-600">
                {labels.glucoseContext}
              </label>
              <select id="context" name="context" required defaultValue="" className={FIELD}>
                <option value="" disabled>
                  —
                </option>
                {GLUCOSE_CONTEXTS.map((c) => (
                  <option key={c} value={c}>
                    {GLUCOSE_CONTEXT_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">{labels.bloodPressure}</span>
            <div className="flex items-center gap-2">
              <input
                name="systolicMmHg"
                type="number"
                inputMode="numeric"
                min={50}
                max={300}
                required
                placeholder="120"
                aria-label={labels.systolic}
                className={`${FIELD} numeric`}
              />
              <span className="text-slate-400">/</span>
              <input
                name="diastolicMmHg"
                type="number"
                inputMode="numeric"
                min={20}
                max={200}
                required
                placeholder="80"
                aria-label={labels.diastolic}
                className={`${FIELD} numeric`}
              />
              <span className="shrink-0 text-xs text-slate-500">mmHg</span>
            </div>
          </div>
        )}

        {state.status === 'error' && state.message ? (
          <p role="alert" className="text-xs text-alert-700">
            {state.message}
          </p>
        ) : null}
        {state.status === 'saved' ? <p className="text-xs font-semibold text-emerald-700">{labels.saved}</p> : null}

        <SaveButton label={labels.save} busy={labels.saving} />
      </form>
    </div>
  )
}
