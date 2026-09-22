'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { submitConsultation, type SaveState } from './actions'

/**
 * Fresh orders, advice, and the atomic Save & Next (PRD F6).
 *
 * Everything on this form commits in one transaction with the impression, the
 * pin decisions and the follow-up date. Nothing here writes on its own, which
 * is why there is a single button rather than a save beside each section.
 *
 * The idempotency key is minted once when the form mounts and reused for every
 * retry of this save. That is the whole mechanism: a fresh key per attempt
 * would make a double-click look like two different consultations.
 */

const initialState: SaveState = { status: 'idle' }

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600'

interface PrescriptionDraft {
  medicineName: string
  doseAmount: string
  doseUnit: string
  form: string
  frequency: string
  foodRelation: string
  durationDays: string
}

const EMPTY_RX: PrescriptionDraft = {
  medicineName: '',
  doseAmount: '',
  doseUnit: 'mg',
  form: 'Tab',
  frequency: 'OD',
  foodRelation: 'AFTER_FOOD',
  durationDays: '30',
}

export interface PinnableFinding {
  readonly id: string
  readonly label: string
  readonly isPinned: boolean
}

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save & next patient'}
    </button>
  )
}

export function ConsultationForm({
  visitId,
  expectedVersion,
  currentImpression,
  findings,
}: {
  visitId: string
  expectedVersion: number
  currentImpression: string | null
  findings: readonly PinnableFinding[]
}) {
  const [state, formAction] = useActionState(submitConsultation, initialState)

  // Minted once per mount. Retries after a conflict reuse it, which is what
  // makes a repeat safe rather than duplicative.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const [prescriptions, setPrescriptions] = useState<PrescriptionDraft[]>([])

  const update = (index: number, patch: Partial<PrescriptionDraft>) =>
    setPrescriptions((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )

  // Only completed lines are submitted. A half-typed row left on screen when
  // the clinician hits save should not become an order.
  const payload = prescriptions
    .filter((rx) => rx.medicineName.trim().length > 0)
    .map((rx) => ({
      medicineName: rx.medicineName.trim(),
      doseAmount: rx.doseAmount ? Number(rx.doseAmount) : null,
      doseUnit: rx.doseAmount ? rx.doseUnit : null,
      form: rx.form || null,
      frequency: rx.frequency,
      foodRelation: rx.foodRelation,
      durationDays: rx.durationDays ? Number(rx.durationDays) : null,
    }))

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="prescriptions" value={JSON.stringify(payload)} />

      <section>
        <label htmlFor="impression" className="mb-1.5 block text-sm font-medium text-slate-700">
          Impression
        </label>
        <textarea
          id="impression"
          name="impression"
          rows={3}
          defaultValue={currentImpression ?? ''}
          placeholder="G2P1L1A0 at 32w. Mild anaemia on oral iron. Previous LSCS."
          className={FIELD}
        />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Prescription</span>
          <button
            type="button"
            onClick={() => setPrescriptions((rows) => [...rows, { ...EMPTY_RX }])}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            Add drug
          </button>
        </div>

        {prescriptions.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing prescribed at this visit.</p>
        ) : (
          <ul className="space-y-3">
            {prescriptions.map((rx, index) => (
              <li key={index} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex gap-2">
                  <input
                    value={rx.form}
                    onChange={(e) => update(index, { form: e.target.value })}
                    aria-label="Form"
                    className={`${FIELD} w-20`}
                  />
                  <input
                    value={rx.medicineName}
                    onChange={(e) => update(index, { medicineName: e.target.value })}
                    placeholder="Medicine"
                    aria-label="Medicine"
                    className={FIELD}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPrescriptions((rows) => rows.filter((_, i) => i !== index))
                    }
                    aria-label="Remove"
                    className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm text-slate-500 transition hover:bg-slate-50"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {/* Amount and unit are one field in the domain: the schema
                      refuses one without the other. */}
                  <input
                    value={rx.doseAmount}
                    onChange={(e) => update(index, { doseAmount: e.target.value })}
                    type="number"
                    step="any"
                    placeholder="Dose"
                    aria-label="Dose amount"
                    className={`${FIELD} numeric`}
                  />
                  <input
                    value={rx.doseUnit}
                    onChange={(e) => update(index, { doseUnit: e.target.value })}
                    aria-label="Dose unit"
                    className={FIELD}
                  />
                  <select
                    value={rx.frequency}
                    onChange={(e) => update(index, { frequency: e.target.value })}
                    aria-label="Frequency"
                    className={FIELD}
                  >
                    {/* Spelled out, because OD and BD are a known source of
                        dosing error for everyone who reads the line later. */}
                    <option value="OD">once daily</option>
                    <option value="BD">twice daily</option>
                    <option value="TDS">three times daily</option>
                    <option value="HS">at night</option>
                    <option value="WEEKLY">weekly</option>
                    <option value="SOS">if needed</option>
                  </select>
                  <select
                    value={rx.foodRelation}
                    onChange={(e) => update(index, { foodRelation: e.target.value })}
                    aria-label="Relation to food"
                    className={FIELD}
                  >
                    <option value="AFTER_FOOD">after food</option>
                    <option value="BEFORE_FOOD">before food</option>
                    <option value="WITH_FOOD">with food</option>
                    <option value="NOT_SPECIFIED">not specified</option>
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <span className="mb-2 block text-sm font-medium text-slate-700">Advice given</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check name="dfkcCounselled" label="Daily fetal kick count explained" />
          <Check name="nutritionCounselled" label="Nutrition counselling" />
          <Check name="leftLateralRest" label="Left lateral rest" />
          {/* Danger signs are what turn a routine visit into an early
              presentation. Recorded as counselled, never auto-ticked. */}
          <Check name="dangerSignsCounselled" label="Danger signs explained" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="labOrders" className="mb-1.5 block text-sm font-medium text-slate-700">
            Lab orders
          </label>
          <input
            id="labOrders"
            name="labOrders"
            placeholder="Repeat CBC in 3 weeks, TSH"
            className={FIELD}
          />
          <p className="mt-1 text-xs text-slate-500">Separate with commas.</p>
        </div>
        <div>
          <label htmlFor="scanOrders" className="mb-1.5 block text-sm font-medium text-slate-700">
            Scan orders
          </label>
          <input
            id="scanOrders"
            name="scanOrders"
            placeholder="36 week growth scan with Doppler"
            className={FIELD}
          />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="nextFollowupDate"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Next follow-up
          </label>
          <input
            id="nextFollowupDate"
            name="nextFollowupDate"
            type="date"
            className={`${FIELD} numeric`}
          />
        </div>
        <div>
          <label
            htmlFor="additionalAdvice"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Other advice
          </label>
          <input id="additionalAdvice" name="additionalAdvice" className={FIELD} />
        </div>
      </section>

      {findings.length > 0 ? (
        <section>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Surface on the cockpit
          </span>
          {/*
            A display preference, committed with the consultation and audited
            individually. Unticking hides a finding from the summary; it never
            unverifies it, and the trend still includes every value.
          */}
          <p className="mb-2 text-xs text-slate-500">
            Pinned findings show first next visit. Trends always use every
            verified value, pinned or not.
          </p>
          <ul className="space-y-1">
            {findings.map((finding) => (
              <li key={finding.id}>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name={finding.isPinned ? 'unpin' : 'pin'}
                    value={finding.id}
                    defaultChecked={false}
                  />
                  <span>
                    {finding.isPinned ? 'Unpin' : 'Pin'} — {finding.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-alert-600/30 bg-alert-50 px-3 py-2.5 text-sm text-alert-700"
        >
          {state.message}
          {state.retryable ? (
            <span className="mt-1 block text-alert-700/80">
              Nothing you typed has been lost. Refresh the record in another tab
              to see what changed, then save again.
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
        <SaveButton />
        <span className="text-xs text-slate-500">
          Impression, orders, advice and pins are written together, or not at all.
        </span>
      </div>
    </form>
  )
}

function Check({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} />
      {label}
    </label>
  )
}
