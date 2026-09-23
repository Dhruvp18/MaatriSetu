'use client'

import { ArrowRight, Plus, X } from 'lucide-react'
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

/**
 * Dense by design-system rule: 32px-ish inputs, because a consultation form
 * that needs scrolling is a consultation form that gets half filled in.
 */
const FIELD =
  'w-full rounded border border-slate-300 bg-white/80 px-2.5 py-1.5 text-xs text-slate-900 outline-none transition-colors focus:border-brand-600 focus:ring-1 focus:ring-brand-600'

/** A white sub-panel inside the indigo-washed orders accordion. */
const PANE = 'flex flex-col gap-2 rounded-lg border border-slate-200/90 bg-white p-3 shadow-2xs'

const PANE_TITLE = 'font-heading text-xs font-bold uppercase tracking-wider text-slate-800'

const CHECKBOX = 'h-3.5 w-3.5 shrink-0 accent-brand-600'

const CHECK_ROW =
  'flex cursor-pointer items-center gap-2 rounded border border-slate-200/60 bg-slate-50 p-1.5 text-xs text-slate-700 transition-colors hover:bg-slate-100/60'

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
      className="font-heading flex w-full items-center justify-center gap-2 rounded-lg bg-brand-800 px-6 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:scale-[1.01] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:text-sm"
    >
      <span>{pending ? 'Saving…' : 'Save & next patient'}</span>
      {!pending ? <ArrowRight aria-hidden className="h-4.5 w-4.5" /> : null}
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
    <form action={formAction} className="flex flex-col gap-3.5">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="prescriptions" value={JSON.stringify(payload)} />
      <input type="hidden" name="verifyCandidates" value={JSON.stringify(verifyPayload)} />

      {candidates.length > 0 ? (
        <section className="rounded-lg border border-brand-600/30 bg-brand-50/60 p-3">
          <span className={`${PANE_TITLE} mb-1 block`}>
            New reports · {candidates.length} value
            {candidates.length === 1 ? '' : 's'} awaiting your verification
          </span>
          {/*
            The only place in the product where an extracted value becomes a
            clinical fact, and it commits with the rest of the consultation.
            Ticking a box here is a clinical act; the wording says so rather
            than calling it "accept" or "import".
          */}
          <p className="mb-3 text-[11px] text-slate-600">
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
                  <label className="flex items-start gap-2 text-xs text-slate-800">
                    <input
                      type="checkbox"
                      checked={draft.accept}
                      onChange={(e) => setVerifyDraft(candidate.id, { accept: e.target.checked })}
                      className={`${CHECKBOX} mt-0.5`}
                    />
                    <span>
                      <span className="font-semibold">{candidate.testName}</span>{' '}
                      <span className="numeric font-bold">{candidate.value}</span>
                      {candidate.printedRange ? (
                        <span className="numeric text-[11px] text-slate-500">
                          {' '}
                          · slip range {candidate.printedRange}
                        </span>
                      ) : null}
                      <span className="numeric mt-0.5 block text-[11px] text-slate-500">
                        {candidate.reportLabel}
                        {candidate.observedDate ? ` · ${candidate.observedDate}` : ' · no date printed'}
                        {candidate.confidence !== null
                          ? ` · ${Math.round(candidate.confidence * 100)}% confidence`
                          : ''}
                        {candidate.correctionVersion > 0 ? ' · corrected by staff' : ''}
                      </span>
                      {uncertain ? (
                        <span className="mt-0.5 block text-[11px] text-caution-700">
                          Low confidence. Check this one against the paper.
                        </span>
                      ) : null}
                      {candidate.fromFixture ? (
                        <span className="mt-0.5 block text-[11px] text-caution-700">
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

                      <label className={CHECK_ROW}>
                        <input
                          type="checkbox"
                          checked={draft.flagged}
                          onChange={(e) =>
                            setVerifyDraft(candidate.id, { flagged: e.target.checked })
                          }
                          className={CHECKBOX}
                        />
                        {/*
                          Your flag, not the system's. Nothing derives this from
                          the printed range, and leaving it alone records that
                          nobody flagged it — not that it is normal.
                        */}
                        <span className="font-medium">Flag this result</span>
                      </label>

                      <label className={CHECK_ROW}>
                        <input
                          type="checkbox"
                          checked={draft.pin}
                          onChange={(e) => setVerifyDraft(candidate.id, { pin: e.target.checked })}
                          className={CHECKBOX}
                        />
                        <span className="font-medium">Surface on the cockpit</span>
                      </label>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section className={PANE}>
        <label htmlFor="impression" className={PANE_TITLE}>
          Impression
        </label>
        <textarea
          id="impression"
          name="impression"
          rows={3}
          defaultValue={currentImpression ?? ''}
          placeholder="G2P1L1A0 at 32w. Mild anaemia on oral iron. Previous LSCS."
          className={`${FIELD} numeric leading-relaxed`}
        />
      </section>

      {/* The reference's two-pane plan: what she will take on the left, what
          she was told and what comes next on the right. */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <section className={`${PANE} lg:col-span-7`}>
          <div className="flex items-center justify-between">
            <span className={PANE_TITLE}>Prescription list (Rx)</span>
            <button
              type="button"
              onClick={() => setPrescriptions((rows) => [...rows, { ...EMPTY_RX }])}
              className="flex items-center gap-1 rounded border border-brand-200/70 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800 transition-colors hover:bg-brand-100"
            >
              <Plus aria-hidden className="h-3.5 w-3.5" />
              <span>Add drug</span>
            </button>
          </div>

          {prescriptions.length === 0 ? (
            <p className="text-xs text-slate-500">Nothing prescribed at this visit.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {prescriptions.map((rx, index) => (
                <li
                  key={index}
                  className="rounded border border-slate-200/70 bg-slate-50/90 p-2"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="numeric shrink-0 text-xs font-bold text-brand-800">
                      {index + 1}.
                    </span>
                    <input
                      value={rx.form}
                      onChange={(e) => update(index, { form: e.target.value })}
                      aria-label="Form"
                      className={`${FIELD} w-16 shrink-0`}
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
                      className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-alert-600"
                    >
                      <X aria-hidden className="h-4.25 w-4.25" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pl-6 sm:grid-cols-4">
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
                      className={`${FIELD} numeric`}
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

        <section className={`${PANE} lg:col-span-5`}>
          <span className={PANE_TITLE}>Advice &amp; orders checklist</span>

          <div className="flex flex-col gap-1.5">
            <Check name="dfkcCounselled" label="Daily fetal kick count explained" />
            <Check name="nutritionCounselled" label="Nutrition counselling" />
            <Check name="leftLateralRest" label="Left lateral rest" />
            {/* Danger signs are what turn a routine visit into an early
                presentation. Recorded as counselled, never auto-ticked. */}
            <Check name="dangerSignsCounselled" label="Danger signs explained" />
          </div>

          <div className="grid gap-2 border-t border-slate-100 pt-2">
            <Labelled htmlFor="labOrders" label="Lab orders">
              <input
                id="labOrders"
                name="labOrders"
                placeholder="Repeat CBC in 3 weeks, TSH"
                className={FIELD}
              />
              <p className="mt-1 text-[10px] text-slate-500">Separate with commas.</p>
            </Labelled>

            <Labelled htmlFor="scanOrders" label="Scan orders">
              <input
                id="scanOrders"
                name="scanOrders"
                placeholder="36 week growth scan with Doppler"
                className={FIELD}
              />
            </Labelled>

            <Labelled htmlFor="nextFollowupDate" label="Next follow-up">
              <input
                id="nextFollowupDate"
                name="nextFollowupDate"
                type="date"
                className={`${FIELD} numeric`}
              />
            </Labelled>

            <Labelled htmlFor="additionalAdvice" label="Other advice">
              <input id="additionalAdvice" name="additionalAdvice" className={FIELD} />
            </Labelled>
          </div>
        </section>
      </div>

      {findings.length > 0 ? (
        <section className={PANE}>
          <span className={PANE_TITLE}>Surface on the cockpit</span>
          {/*
            A display preference, committed with the consultation and audited
            individually. Unticking hides a finding from the summary; it never
            unverifies it, and the trend still includes every value.
          */}
          <p className="text-[11px] text-slate-500">
            Pinned findings show first next visit. Trends always use every
            verified value, pinned or not.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {findings.map((finding) => (
              <li key={finding.id}>
                <label className={CHECK_ROW}>
                  <input
                    type="checkbox"
                    name={finding.isPinned ? 'unpin' : 'pin'}
                    value={finding.id}
                    defaultChecked={false}
                    className={CHECKBOX}
                  />
                  <span className="numeric truncate font-medium">
                    {finding.isPinned ? 'Unpin' : 'Pin'} — {finding.label}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {queries.length > 0 ? (
        <section className={PANE}>
          <span className={PANE_TITLE}>Messages addressed</span>
          {/*
            Resolution commits with the consultation rather than on its own
            button. Marking a question answered and recording what was said
            about it are the same act, and letting them come apart leaves a
            resolved query with no consultation behind it.
          */}
          <p className="text-[11px] text-slate-500">
            Tick what you have answered during this visit. Anything left unticked
            stays in her queue.
          </p>
          <ul className="flex flex-col gap-1.5">
            {queries.map((query) => (
              <li key={query.id}>
                <label className={`${CHECK_ROW} items-start`}>
                  <input
                    type="checkbox"
                    name="resolveQuery"
                    value={query.id}
                    className={`${CHECKBOX} mt-0.5`}
                  />
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
          className="rounded-lg border border-alert-200 bg-alert-50 px-3 py-2.5 text-xs text-alert-700"
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

      {/* The reference's bottom action bar. The caveat sits beside the button
          rather than under it: it is the one thing a clinician should read
          before pressing save. */}
      <div className="flex flex-col items-center justify-between gap-2.5 border-t border-brand-100/80 pt-2 sm:flex-row">
        <span className="text-[11px] text-slate-500">
          Impression, orders, advice and pins are written together, or not at all.
        </span>
        <SaveButton />
      </div>
    </form>
  )
}

/** A dense label-over-field pair, as used down the checklist pane. */
function Labelled({
  htmlFor,
  label,
  children,
}: {
  htmlFor: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  )
}

function Check({ name, label }: { name: string; label: string }) {
  return (
    <label className={CHECK_ROW}>
      <input type="checkbox" name={name} className={CHECKBOX} />
      <span className="font-medium">{label}</span>
    </label>
  )
}
