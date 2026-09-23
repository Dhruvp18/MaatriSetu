'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { submitCorrection, type CorrectionState } from './actions'

/**
 * One extracted value, and the correction of it.
 *
 * Two things on this row do real safety work.
 *
 * The printed label is shown beside the canonical test code. When a slip says
 * "Hb%" and the extraction claims `hb`, the person holding the paper needs both
 * in order to judge whether that mapping was right — the code alone hides the
 * mistake, and the label alone hides the claim.
 *
 * The unit is a required field whenever there is a number, and it is never
 * pre-converted. Platelets printed as "1.85 lakhs/cumm" stay in lakhs; turning
 * them into 10^9/L here would be this screen making a clinical translation
 * nobody asked it for.
 *
 * Correcting is not verifying. Nothing done on this row reaches the patient's
 * record — that happens once, in the cockpit, when a doctor saves the
 * consultation.
 */

const initialState: CorrectionState = { status: 'idle' }

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600'

export interface CandidateView {
  readonly id: string
  readonly testCode: string
  readonly printedLabel: string | null
  readonly valueNumeric: number | null
  readonly valueText: string | null
  readonly unit: string | null
  readonly observedDate: string | null
  readonly referenceRange: string | null
  readonly confidence: number | null
  readonly correctionVersion: number
}

/**
 * Save and Discard, as two submit buttons on the same form.
 *
 * Discard carries `name="discard"`, so the browser puts it in the payload only
 * when it is the button that submitted. A React state flag set in an onClick
 * handler would not have flushed by the time the form serialises, which is a
 * discard that silently saves instead.
 */
function Actions() {
  const { pending } = useFormStatus()

  return (
    <div className="flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save correction'}
      </button>
      <button
        type="submit"
        name="discard"
        value="true"
        disabled={pending}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
      >
        Discard
      </button>
    </div>
  )
}

export function CandidateRow({
  candidate,
  patientId,
  canCorrect,
}: {
  candidate: CandidateView
  patientId: string
  canCorrect: boolean
}) {
  const [state, formAction] = useActionState(submitCorrection, initialState)
  const [editing, setEditing] = useState(false)

  // Close the editor once the correction lands. The row behind it has already
  // been revalidated, so leaving the form open would show the old numbers in
  // the inputs beside the new ones in the row.
  useEffect(() => {
    if (state.status === 'done') setEditing(false)
  }, [state.status])

  const value =
    candidate.valueNumeric !== null
      ? `${candidate.valueNumeric} ${candidate.unit ?? ''}`.trim()
      : (candidate.valueText ?? '—')

  // Below this, the reading is doubtful enough that the reviewer should be
  // looking at the slip rather than at the number. It draws attention; it
  // decides nothing, and a confident misread is no safer for being confident.
  const uncertain = candidate.confidence !== null && candidate.confidence < 0.7

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm text-slate-800">
          {candidate.printedLabel ?? candidate.testCode}
          {candidate.printedLabel && candidate.testCode !== 'unmapped' ? (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
              {candidate.testCode}
            </span>
          ) : null}
          {candidate.testCode === 'unmapped' ? (
            <span
              className="ml-2 rounded bg-caution-50 px-1.5 py-0.5 text-xs text-caution-700"
              title="The extraction could not match this to a known test. It still needs a person to look at it."
            >
              not recognised
            </span>
          ) : null}
        </span>

        <span className="shrink-0 text-right">
          <span className="numeric text-sm font-medium text-slate-900">{value}</span>
          {candidate.referenceRange ? (
            <span className="numeric block text-xs text-slate-500">
              slip range {candidate.referenceRange}
            </span>
          ) : null}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="numeric">
          {candidate.observedDate ?? 'no date printed'}
        </span>
        {candidate.confidence !== null ? (
          <span className={uncertain ? 'text-caution-700' : undefined}>
            {uncertain ? 'low confidence · ' : ''}
            {Math.round(candidate.confidence * 100)}%
          </span>
        ) : null}
        {candidate.correctionVersion > 0 ? (
          <span>corrected {candidate.correctionVersion}×</span>
        ) : null}
        {canCorrect && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-brand-600 hover:underline"
          >
            Fix this
          </button>
        ) : null}
      </div>

      {state.status === 'error' ? (
        <p role="alert" className="mt-2 text-sm text-alert-700">
          {state.message}
        </p>
      ) : null}

      {editing ? (
        <form action={formAction} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input type="hidden" name="candidateId" value={candidate.id} />
          <input type="hidden" name="patientId" value={patientId} />

          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <label
                htmlFor={`n-${candidate.id}`}
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Number
              </label>
              <input
                id={`n-${candidate.id}`}
                name="valueNumeric"
                defaultValue={candidate.valueNumeric ?? ''}
                inputMode="decimal"
                className={`${FIELD} numeric`}
              />
            </div>
            <div>
              <label
                htmlFor={`u-${candidate.id}`}
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Unit as printed
              </label>
              <input
                id={`u-${candidate.id}`}
                name="unit"
                defaultValue={candidate.unit ?? ''}
                placeholder="g/dL"
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor={`t-${candidate.id}`}
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Or the text result
              </label>
              <input
                id={`t-${candidate.id}`}
                name="valueText"
                defaultValue={candidate.valueText ?? ''}
                placeholder="Non-reactive"
                className={FIELD}
              />
            </div>
            <div>
              <label
                htmlFor={`d-${candidate.id}`}
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Date on the slip
              </label>
              <input
                id={`d-${candidate.id}`}
                name="observedDate"
                type="date"
                defaultValue={candidate.observedDate ?? ''}
                className={`${FIELD} numeric`}
              />
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Copy what the paper says. Do not convert units, and do not fill in
            anything the slip does not show.
          </p>

          <div className="mt-3 flex items-center justify-between gap-3">
            <Actions />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-slate-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </li>
  )
}
