'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { startVisit, submitVitals, type VisitActionState } from './actions'

/**
 * Recording a set of observations.
 *
 * Every field is optional individually — a nurse who has only a weight should
 * record the weight — but the whole form cannot be empty, which the service
 * enforces. Each reading appends; a recheck fifteen minutes later is the next
 * row, never an edit of the first, because overwriting destroys the comparison
 * the recheck was performed to make.
 */

const initialState: VisitActionState = { error: null }

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600'

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? busy : idle}
    </button>
  )
}

export function StartVisitButton({
  pregnancyId,
  patientId,
}: {
  pregnancyId: string
  patientId: string
}) {
  const [state, formAction] = useActionState(startVisit, initialState)

  return (
    <form action={formAction}>
      <input type="hidden" name="pregnancyId" value={pregnancyId} />
      <input type="hidden" name="patientId" value={patientId} />
      <Pending idle="Start today’s visit" busy="Starting…" />
      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-alert-700">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}

export function VitalsForm({
  visitId,
  patientId,
  readingNumber,
}: {
  visitId: string
  patientId: string
  readingNumber: number
}) {
  const [state, formAction] = useActionState(submitVitals, initialState)

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="patientId" value={patientId} />

      {readingNumber > 1 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          This will be reading {readingNumber}. The earlier ones stay on the
          chart — a recheck is recorded beside the first, not over it.
        </p>
      ) : null}

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700">Blood pressure</span>
        <div className="flex items-center gap-2">
          <input
            name="systolicMmHg"
            type="number"
            min={50}
            max={300}
            placeholder="120"
            aria-label="Systolic"
            className={`${FIELD} numeric`}
          />
          <span className="text-slate-400">/</span>
          <input
            name="diastolicMmHg"
            type="number"
            min={20}
            max={200}
            placeholder="80"
            aria-label="Diastolic"
            className={`${FIELD} numeric`}
          />
          <span className="shrink-0 text-xs text-slate-500">mmHg</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Measure name="pulseBpm" label="Pulse" unit="bpm" min={20} max={250} placeholder="82" />
        <Measure
          name="weightKg"
          label="Weight"
          unit="kg"
          min={20}
          max={250}
          step="0.1"
          placeholder="58.5"
        />
        <Measure
          name="fundalHeightCm"
          label="Fundal height"
          unit="cm"
          min={5}
          max={50}
          step="0.5"
          placeholder="28"
        />
        <Measure
          name="fetalHeartRateBpm"
          label="Fetal heart rate"
          unit="bpm"
          min={60}
          max={240}
          placeholder="144"
        />
        <Measure
          name="temperatureC"
          label="Temperature"
          unit="°C"
          min={30}
          max={45}
          step="0.1"
          placeholder="36.8"
        />
        <Measure
          name="spo2Percent"
          label="SpO₂"
          unit="%"
          min={50}
          max={100}
          placeholder="98"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Dipstick name="urineAlbumin" label="Urine albumin" />
        <Dipstick name="urineSugar" label="Urine sugar" />
      </div>

      <div>
        <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-slate-700">
          Note <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input id="note" name="note" maxLength={1000} className={FIELD} />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-alert-600/30 bg-alert-50 px-3 py-2.5 text-sm text-alert-700"
        >
          {state.error}
        </p>
      ) : null}

      <Pending idle="Record vitals" busy="Recording…" />
    </form>
  )
}

function Measure({
  name,
  label,
  unit,
  min,
  max,
  step,
  placeholder,
}: {
  name: string
  label: string
  unit: string
  min: number
  max: number
  step?: string
  placeholder: string
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type="number"
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          className={`${FIELD} numeric`}
        />
        {/* The unit is never implied. It is printed beside every field and
            stored with every value. */}
        <span className="shrink-0 text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  )
}

function Dipstick({ name, label }: { name: string; label: string }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select id={name} name={name} defaultValue="" className={FIELD}>
        {/* Blank means not tested, which is different from a nil result. */}
        <option value="">Not tested</option>
        <option value="NIL">Nil</option>
        <option value="TRACE">Trace</option>
        <option value="ONE_PLUS">1+</option>
        <option value="TWO_PLUS">2+</option>
        <option value="THREE_PLUS">3+</option>
        <option value="FOUR_PLUS">4+</option>
      </select>
    </div>
  )
}
