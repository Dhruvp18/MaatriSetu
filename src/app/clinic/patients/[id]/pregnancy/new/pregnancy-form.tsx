'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { submitPregnancy, type CreatePregnancyState } from './actions'

/**
 * Open a pregnancy episode.
 *
 * The dating choice drives everything downstream — gestational age, the due
 * date, which milestone scan is next — so it is the first thing asked and the
 * three options are offered plainly. "Not established yet" is a first-class
 * choice, not a way of skipping the question: a mother who cannot recall an LMP
 * and has not had a scan is common, and the honest record of that is better
 * than a date someone guessed at the counter.
 */

const initialState: CreatePregnancyState = { status: 'idle' }

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600'
const LABEL = 'mb-1.5 block text-sm font-medium text-slate-700'

type DatingMethod = 'LMP' | 'ULTRASOUND' | 'NONE'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Opening…' : 'Open pregnancy episode'}
    </button>
  )
}

export function PregnancyForm({ patientId }: { patientId: string }) {
  const [state, formAction] = useActionState(submitPregnancy, initialState)
  const [dating, setDating] = useState<DatingMethod>('LMP')

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="patientId" value={patientId} />

      <fieldset>
        <legend className={LABEL}>How is this pregnancy dated?</legend>

        <div className="space-y-2">
          <Choice
            checked={dating === 'LMP'}
            onSelect={() => setDating('LMP')}
            value="LMP"
            title="Last menstrual period"
            detail="She recalls the first day of her last period."
          />
          <Choice
            checked={dating === 'ULTRASOUND'}
            onSelect={() => setDating('ULTRASOUND')}
            value="ULTRASOUND"
            title="Dating scan"
            detail="A scan report states her gestation. Use this even if she also recalls an LMP — the scan is the anchor."
          />
          <Choice
            checked={dating === 'NONE'}
            onSelect={() => setDating('NONE')}
            value="NONE"
            title="Not established yet"
            detail="No gestational age or due date will be shown until one is recorded."
          />
        </div>
      </fieldset>

      {dating === 'LMP' ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div>
            <label htmlFor="lmp" className={LABEL}>
              First day of her last period
            </label>
            <input id="lmp" name="lmp" type="date" required className={`${FIELD} numeric`} />
          </div>
          <div>
            <label htmlFor="lmpCertainty" className={LABEL}>
              How sure is she?
            </label>
            <select id="lmpCertainty" name="lmpCertainty" defaultValue="CERTAIN" className={FIELD}>
              <option value="CERTAIN">Sure of the date</option>
              <option value="APPROXIMATE">Approximate</option>
              <option value="UNKNOWN">Not sure</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Recorded with the date. A gestational age built on an uncertain
              recollection should read as uncertain wherever it is shown.
            </p>
          </div>
        </div>
      ) : null}

      {dating === 'ULTRASOUND' ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div>
            <label htmlFor="scanDate" className={LABEL}>
              Date of the scan
            </label>
            <input
              id="scanDate"
              name="scanDate"
              type="date"
              required
              className={`${FIELD} numeric`}
            />
            <p className="mt-1 text-xs text-slate-500">
              The date the scan was performed, not the date the report reached
              the clinic.
            </p>
          </div>

          <div>
            {/* Reports read "12w + 3d", so that is what the form asks for. */}
            <span className={LABEL}>Gestation stated on the report</span>
            <div className="flex items-center gap-2">
              <input
                name="scanGaWeeks"
                type="number"
                min={0}
                max={44}
                required
                placeholder="12"
                aria-label="Weeks"
                className={`${FIELD} numeric`}
              />
              <span className="text-sm text-slate-500">w</span>
              <input
                name="scanGaDays"
                type="number"
                min={0}
                max={6}
                defaultValue={0}
                aria-label="Days"
                className={`${FIELD} numeric`}
              />
              <span className="text-sm text-slate-500">d</span>
            </div>
          </div>

          <div>
            <label htmlFor="reportedLmp" className={LABEL}>
              LMP she recalls <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="reportedLmp"
              name="reportedLmp"
              type="date"
              className={`${FIELD} numeric`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Kept as part of the record of what she said. The scan remains the
              anchor for every calculation.
            </p>
          </div>
        </div>
      ) : null}

      <fieldset>
        <legend className={LABEL}>
          Obstetric history <span className="font-normal text-slate-500">(optional)</span>
        </legend>
        <div className="grid grid-cols-4 gap-2">
          <NumberBox name="gravida" label="G" hint="Pregnancies" />
          <NumberBox name="parity" label="P" hint="Deliveries" />
          <NumberBox name="living" label="L" hint="Living" />
          <NumberBox name="abortions" label="A" hint="Losses" />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Leave blank where it has not been asked — a blank is not a zero. These
          are checked against each other, so a slip is caught here rather than on
          a handover slip.
        </p>
      </fieldset>

      <fieldset>
        <legend className={LABEL}>
          Baseline <span className="font-normal text-slate-500">(optional)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <input
              name="prePregnancyWeightKg"
              type="number"
              step="0.1"
              min={25}
              max={250}
              placeholder="Weight"
              aria-label="Pre-pregnancy weight in kilograms"
              className={`${FIELD} numeric`}
            />
            <p className="mt-1 text-xs text-slate-500">kg, before pregnancy</p>
          </div>
          <div>
            <input
              name="heightCm"
              type="number"
              step="0.1"
              min={100}
              max={220}
              placeholder="Height"
              aria-label="Height in centimetres"
              className={`${FIELD} numeric`}
            />
            <p className="mt-1 text-xs text-slate-500">cm</p>
          </div>
        </div>
      </fieldset>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-alert-600/30 bg-alert-50 px-3 py-2.5 text-sm text-alert-700"
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}

function Choice({
  checked,
  onSelect,
  value,
  title,
  detail,
}: {
  checked: boolean
  onSelect: () => void
  value: string
  title: string
  detail: string
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
        checked ? 'border-brand-600 bg-brand-50' : 'border-slate-300 hover:bg-slate-50'
      }`}
    >
      <input
        type="radio"
        name="datingMethod"
        value={value}
        checked={checked}
        onChange={onSelect}
        className="mt-1"
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{detail}</span>
      </span>
    </label>
  )
}

function NumberBox({ name, label, hint }: { name: string; label: string; hint: string }) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-center text-xs text-slate-500">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        min={0}
        max={25}
        aria-label={hint}
        className={`${FIELD} numeric text-center`}
      />
    </div>
  )
}
