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

export interface AddressableQuery {
  readonly id: string
  readonly summary: string
}

/**
 * One extracted value offered for verification.
 *
 * `correctionVersion` is what the clinician is actually looking at. It travels
 * into the save so that a correction made by an assistant between this render
 * and the commit rejects the save rather than storing a number nobody approved.
 *
 * `fromFixture` is carried all the way to the checkbox on purpose. Canned
 * output must never be mistaken for a reading of a real slip, least of all at
 * the moment someone is about to make it part of a patient's record.
 */
export interface VerifiableCandidate {
  readonly id: string
  readonly correctionVersion: number
  readonly testName: string
  readonly value: string
  readonly printedRange: string | null
  readonly observedDate: string | null
  readonly confidence: number | null
  readonly defaultCategory: string
  readonly reportLabel: string
  readonly fromFixture: boolean
}

interface VerifyDraft {
  accept: boolean
  category: string
  flagged: boolean
  pin: boolean
  note: string
}

const OBSERVATION_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ['HEMATOLOGY', 'Haematology'],
  ['BIOCHEMISTRY', 'Biochemistry'],
  ['SEROLOGY', 'Serology'],
  ['URINE', 'Urine'],
  ['ENDOCRINE', 'Endocrine'],
  ['OTHER', 'Other'],
]

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
  queries,
  candidates,
}: {
  visitId: string
  expectedVersion: number
  currentImpression: string | null
  findings: readonly PinnableFinding[]
  queries: readonly AddressableQuery[]
  candidates: readonly VerifiableCandidate[]
}) {
  const [state, formAction] = useActionState(submitConsultation, initialState)

  // Minted once per mount. Retries after a conflict reuse it, which is what
  // makes a repeat safe rather than duplicative.
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const [prescriptions, setPrescriptions] = useState<PrescriptionDraft[]>([])

  // Nothing starts accepted. A default of "tick everything" would turn
  // verification into a formality that a tired clinician clicks past, which is
  // the exact failure the two-tier model exists to prevent.
  const [verify, setVerify] = useState<Record<string, VerifyDraft>>(() =>
    Object.fromEntries(
      candidates.map((candidate) => [
        candidate.id,
        {
          accept: false,
          category: candidate.defaultCategory,
          flagged: false,
          pin: false,
          note: '',
        },
      ]),
    ),
  )

  const setVerifyDraft = (id: string, patch: Partial<VerifyDraft>) =>
    setVerify((drafts) => {
      const current = drafts[id]
      return current ? { ...drafts, [id]: { ...current, ...patch } } : drafts
    })

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

  // Only ticked values are sent. An untouched candidate stays a candidate: it
  // is not rejected, not discarded, and still there at the next visit.
  const verifyPayload = candidates
    .filter((candidate) => verify[candidate.id]?.accept)
    .map((candidate) => {
      const draft = verify[candidate.id] as VerifyDraft

      return {
        candidateId: candidate.id,
        // What was on screen when the clinician read it. The routine compares
        // this and refuses the save if the value moved underneath them.
        correctionVersion: candidate.correctionVersion,
        category: draft.category,
        testName: candidate.testName,
        // Sent only when actually flagged. Passing `false` would record a
        // clinician's judgment that the value is unremarkable, which is not
        // what leaving a checkbox alone means.
        flagged: draft.flagged ? true : null,
        note: draft.note.trim() || null,
        pin: draft.pin,
      }
    })

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="prescriptions" value={JSON.stringify(payload)} />
      <input type="hidden" name="verifyCandidates" value={JSON.stringify(verifyPayload)} />

      {candidates.length > 0 ? (
        <section className="rounded-lg border border-brand-600/30 bg-brand-50/60 p-3">
          <span className="mb-1 block text-sm font-medium text-slate-800">
            New reports · {candidates.length} value
            {candidates.length === 1 ? '' : 's'} awaiting your verification
          </span>
          {/*
            The only place in the product where an extracted value becomes a
            clinical fact, and it commits with the rest of the consultation.
            Ticking a box here is a clinical act; the wording says so rather
            than calling it "accept" or "import".
          */}
          <p className="mb-3 text-xs text-slate-600">
            Read each value against the slip before you tick it. Anything you
            leave unticked stays a proposal and will be offered again.
          </p>

          <ul className="space-y-2">
            {candidates.map((candidate) => {
              const draft = verify[candidate.id]
              if (!draft) return null

              const uncertain = candidate.confidence !== null && candidate.confidence < 0.7

              return (
                <li
                  key={candidate.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <label className="flex items-start gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={draft.accept}
                      onChange={(e) => setVerifyDraft(candidate.id, { accept: e.target.checked })}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-medium">{candidate.testName}</span>{' '}
                      <span className="numeric">{candidate.value}</span>
                      {candidate.printedRange ? (
                        <span className="numeric text-xs text-slate-500">
                          {' '}
                          · slip range {candidate.printedRange}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {candidate.reportLabel}
                        {candidate.observedDate ? ` · ${candidate.observedDate}` : ' · no date printed'}
                        {candidate.confidence !== null
                          ? ` · ${Math.round(candidate.confidence * 100)}% confidence`
                          : ''}
                        {candidate.correctionVersion > 0 ? ' · corrected by staff' : ''}
                      </span>
                      {uncertain ? (
                        <span className="mt-0.5 block text-xs text-caution-700">
                          Low confidence. Check this one against the paper.
                        </span>
                      ) : null}
                      {candidate.fromFixture ? (
                        <span className="mt-0.5 block text-xs text-caution-700">
                          Sample output — no image was read. Do not verify this
                          as a real result.
                        </span>
                      ) : null}
                    </span>
                  </label>

                  {draft.accept ? (
                    <div className="mt-2 grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-2">
                      <select
                        value={draft.category}
                        onChange={(e) =>
                          setVerifyDraft(candidate.id, { category: e.target.value })
                        }
                        aria-label={`Category for ${candidate.testName}`}
                        className={FIELD}
                      >
                        {OBSERVATION_CATEGORIES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>

                      <input
                        value={draft.note}
                        onChange={(e) => setVerifyDraft(candidate.id, { note: e.target.value })}
                        placeholder="Your note on this result (optional)"
                        aria-label={`Note on ${candidate.testName}`}
                        className={FIELD}
                      />

                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={draft.flagged}
                          onChange={(e) =>
                            setVerifyDraft(candidate.id, { flagged: e.target.checked })
                          }
                        />
                        {/*
                          Your flag, not the system's. Nothing derives this from
                          the printed range, and leaving it alone records that
                          nobody flagged it — not that it is normal.
                        */}
                        Flag this result
                      </label>

                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={draft.pin}
                          onChange={(e) => setVerifyDraft(candidate.id, { pin: e.target.checked })}
                        />
                        Surface on the cockpit
                      </label>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

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

      {queries.length > 0 ? (
        <section>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Messages addressed
          </span>
          {/*
            Resolution commits with the consultation rather than on its own
            button. Marking a question answered and recording what was said
            about it are the same act, and letting them come apart leaves a
            resolved query with no consultation behind it.
          */}
          <p className="mb-2 text-xs text-slate-500">
            Tick what you have answered during this visit. Anything left unticked
            stays in her queue.
          </p>
          <ul className="space-y-1">
            {queries.map((query) => (
              <li key={query.id}>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="resolveQuery" value={query.id} className="mt-1" />
                  <span>{query.summary}</span>
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
