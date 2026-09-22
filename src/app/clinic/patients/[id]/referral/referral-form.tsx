'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import type { ReferralDraftFields } from '@modules/referrals/referral.types'

import {
  issueReferralAction,
  type ReferralActionState,
  saveReferralDraft,
  startReferral,
} from './actions'

/**
 * Preparing and issuing an emergency referral.
 *
 * The form posts the entire draft every time, which is why the service takes a
 * replace rather than a patch: with a patch an untouched field is ambiguous
 * between "leave it" and "clear it", and on this document that ambiguity can
 * clear a note about an indwelling line.
 *
 * Nothing here is required except the indication and the receiving facility,
 * and those two only at issue. A referral is filled in while someone is being
 * carried to an ambulance, and a form that refuses to save until it is complete
 * is a form that loses everything typed so far.
 *
 * Saving and issuing are separate buttons on purpose. Issue is irreversible —
 * it freezes a legal document — so it never rides on the same click as "keep
 * what I have typed".
 */

const initialState: ReferralActionState = { error: null }

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600'

function Submit({ idle, busy, tone = 'primary' }: { idle: string; busy: string; tone?: 'primary' | 'grave' }) {
  const { pending } = useFormStatus()

  const styles =
    tone === 'grave'
      ? 'bg-alert-600 hover:bg-alert-700'
      : 'bg-brand-600 hover:bg-brand-700'

  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${styles}`}
    >
      {pending ? busy : idle}
    </button>
  )
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-alert-600/30 bg-alert-50 px-3 py-2.5 text-sm text-alert-700"
    >
      {message}
    </p>
  )
}

/* -------------------------------------------------------------------------- */
/* Start                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Two fields to start.
 *
 * Why she is going and where — both optional even here, because a clinician who
 * types nothing and presses the button still gets a draft to fill in from the
 * corridor, which is better than being made to stop and think at the counter.
 */
export function StartReferralForm({
  patientId,
  pregnancyId,
  openVisitId,
  supersedesId,
}: {
  patientId: string
  pregnancyId: string
  openVisitId: string | null
  supersedesId?: string
}) {
  const [state, formAction] = useActionState(startReferral, initialState)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="pregnancyId" value={pregnancyId} />
      {/* Recorded only when the transfer actually arose inside a consultation. */}
      {openVisitId ? <input type="hidden" name="originVisitId" value={openVisitId} /> : null}
      {supersedesId ? <input type="hidden" name="supersedesId" value={supersedesId} /> : null}

      <div>
        <label htmlFor="indication" className="mb-1.5 block text-sm font-medium text-slate-700">
          Why is she being referred?
        </label>
        <input id="indication" name="indication" maxLength={2000} className={FIELD} />
      </div>

      <div>
        <label
          htmlFor="receivingFacility"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          Referred to <span className="font-normal text-slate-500">(can be added later)</span>
        </label>
        <input
          id="receivingFacility"
          name="receivingFacility"
          maxLength={300}
          className={FIELD}
        />
      </div>

      <ErrorLine message={state.error} />
      <Submit idle={supersedesId ? 'Start a replacement referral' : 'Start referral'} busy="Starting…" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* The draft                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The three `datetime-local` fields, already expressed on the clinic's clock.
 *
 * Resolved on the server rather than in the browser. A terminal with a wrong
 * clock, or one set to another zone, must not be able to put a false time on a
 * blood pressure — and the value that reaches the record is interpreted in the
 * clinic's zone regardless of where the browser thinks it is.
 *
 * The two clinical times default to now when nothing is recorded yet: a
 * clinician typing a reading is typing one they have just taken, and an empty
 * required field would refuse the save instead.
 */
export interface DraftTimeDefaults {
  readonly departureAt: string
  readonly vitalsRecordedAt: string
  readonly pvExaminedAt: string
}

export function ReferralDraftForm({
  patientId,
  referralId,
  version,
  draft,
  times,
  canIssue,
}: {
  patientId: string
  referralId: string
  version: number
  draft: ReferralDraftFields
  times: DraftTimeDefaults
  canIssue: boolean
}) {
  const [state, formAction] = useActionState(saveReferralDraft, initialState)

  const vitals = draft.transferVitals
  const exam = draft.examination

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-6">
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="referralId" value={referralId} />
        {/*
          Optimistic concurrency. If someone else saved this draft from another
          terminal since the page was rendered, the save is refused with a
          message rather than overwriting their receiving facility.
        */}
        <input type="hidden" name="expectedVersion" value={version} />

        <Fieldset legend="Reason for transfer">
          <Field label="Indication" htmlFor="indication">
            <textarea
              id="indication"
              name="indication"
              rows={2}
              maxLength={2000}
              defaultValue={draft.indication ?? ''}
              className={FIELD}
            />
          </Field>
          <Field
            label="Clinical summary"
            htmlFor="clinicalSummary"
            hint="What the receiving team needs to know, in your words."
          >
            <textarea
              id="clinicalSummary"
              name="clinicalSummary"
              rows={4}
              maxLength={10000}
              defaultValue={draft.clinicalSummary ?? ''}
              className={FIELD}
            />
          </Field>
        </Fieldset>

        <Fieldset legend="Where she is going">
          <Field label="Receiving facility" htmlFor="receivingFacility">
            <input
              id="receivingFacility"
              name="receivingFacility"
              maxLength={300}
              defaultValue={draft.receivingFacility ?? ''}
              className={FIELD}
            />
          </Field>
          <Field
            label="Their contact"
            htmlFor="receivingContact"
            hint="A name and number the escort can ring en route."
          >
            <input
              id="receivingContact"
              name="receivingContact"
              maxLength={300}
              defaultValue={draft.receivingContact ?? ''}
              className={`${FIELD} numeric`}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transport" htmlFor="transportMode">
              <input
                id="transportMode"
                name="transportMode"
                maxLength={120}
                placeholder="108 ambulance"
                defaultValue={draft.transportMode ?? ''}
                className={FIELD}
              />
            </Field>
            <Field label="Leaving at" htmlFor="departureAt">
              <input
                id="departureAt"
                name="departureAt"
                type="datetime-local"
                defaultValue={times.departureAt}
                className={`${FIELD} numeric`}
              />
            </Field>
          </div>
          <Field label="Escorted by" htmlFor="accompanyingStaff">
            <input
              id="accompanyingStaff"
              name="accompanyingStaff"
              maxLength={300}
              defaultValue={draft.accompanyingStaff ?? ''}
              className={FIELD}
            />
          </Field>
          <Field
            label="Lines and catheters in situ"
            htmlFor="linesAndCatheters"
            hint="What is already in her when she arrives."
          >
            <input
              id="linesAndCatheters"
              name="linesAndCatheters"
              maxLength={1000}
              defaultValue={draft.linesAndCatheters ?? ''}
              className={FIELD}
            />
          </Field>
        </Fieldset>

        <Fieldset
          legend="Observations at transfer"
          note="Leave the whole section blank if nothing was measured. A reading needs the time it was taken — without one the receiving unit cannot tell whether it is from arrival or four hours ago."
        >
          <Field label="Taken at" htmlFor="vitalsRecordedAt">
            <input
              id="vitalsRecordedAt"
              name="vitalsRecordedAt"
              type="datetime-local"
              defaultValue={times.vitalsRecordedAt}
              className={`${FIELD} numeric`}
            />
          </Field>

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
                defaultValue={
                  vitals.status === 'RECORDED' && vitals.bloodPressure
                    ? vitals.bloodPressure.systolicMmHg
                    : ''
                }
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
                defaultValue={
                  vitals.status === 'RECORDED' && vitals.bloodPressure
                    ? vitals.bloodPressure.diastolicMmHg
                    : ''
                }
                className={`${FIELD} numeric`}
              />
              <span className="shrink-0 text-xs text-slate-500">mmHg</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Measure
              name="pulseBpm"
              label="Pulse"
              unit="bpm"
              min={20}
              max={250}
              placeholder="110"
              defaultValue={vitals.status === 'RECORDED' ? vitals.pulseBpm : null}
            />
            <Measure
              name="respiratoryRateBpm"
              label="Respiratory rate"
              unit="/min"
              min={4}
              max={80}
              placeholder="22"
              defaultValue={vitals.status === 'RECORDED' ? vitals.respiratoryRateBpm : null}
            />
            <Measure
              name="spo2Percent"
              label="SpO₂"
              unit="%"
              min={50}
              max={100}
              placeholder="96"
              defaultValue={vitals.status === 'RECORDED' ? vitals.spo2Percent : null}
            />
            <Measure
              name="temperatureC"
              label="Temperature"
              unit="°C"
              min={30}
              max={45}
              step="0.1"
              placeholder="37.2"
              defaultValue={vitals.status === 'RECORDED' ? vitals.temperatureC : null}
            />
            <Measure
              name="fetalHeartRateBpm"
              label="Fetal heart rate"
              unit="bpm"
              min={60}
              max={240}
              placeholder="140"
              defaultValue={vitals.status === 'RECORDED' ? vitals.fetalHeartRateBpm : null}
            />
            <div>
              <label
                htmlFor="urineAlbumin"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Urine albumin
              </label>
              <select
                id="urineAlbumin"
                name="urineAlbumin"
                defaultValue={
                  vitals.status === 'RECORDED' && vitals.urineAlbumin ? vitals.urineAlbumin : ''
                }
                className={FIELD}
              >
                {/* Blank means not tested. Nil is a recorded negative result. */}
                <option value="">Not tested</option>
                <option value="NIL">Nil</option>
                <option value="TRACE">Trace</option>
                <option value="ONE_PLUS">1+</option>
                <option value="TWO_PLUS">2+</option>
                <option value="THREE_PLUS">3+</option>
                <option value="FOUR_PLUS">4+</option>
              </select>
            </div>
          </div>
        </Fieldset>

        <Fieldset
          legend="Vaginal examination"
          note="Leave blank if none was performed. Like the observations above, a finding needs the time it was made."
        >
          <Field label="Examined at" htmlFor="pvExaminedAt">
            <input
              id="pvExaminedAt"
              name="pvExaminedAt"
              type="datetime-local"
              defaultValue={times.pvExaminedAt}
              className={`${FIELD} numeric`}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Measure
              name="pvDilatationCm"
              label="Dilatation"
              unit="cm"
              min={0}
              max={10}
              step="0.5"
              placeholder="4"
              defaultValue={exam.status === 'PERFORMED' ? exam.dilatationCm : null}
            />
            <Measure
              name="pvEffacementPercent"
              label="Effacement"
              unit="%"
              min={0}
              max={100}
              placeholder="60"
              defaultValue={exam.status === 'PERFORMED' ? exam.effacementPercent : null}
            />
            <Field label="Station" htmlFor="pvStation">
              <input
                id="pvStation"
                name="pvStation"
                maxLength={20}
                placeholder="−2"
                defaultValue={exam.status === 'PERFORMED' ? (exam.station ?? '') : ''}
                className={`${FIELD} numeric`}
              />
            </Field>
            <Field label="Membranes" htmlFor="pvMembranes">
              <select
                id="pvMembranes"
                name="pvMembranes"
                defaultValue={exam.status === 'PERFORMED' ? exam.membranes : 'NOT_ASSESSED'}
                className={FIELD}
              >
                {/* Not assessed is a real answer and prints as one on the slip. */}
                <option value="NOT_ASSESSED">Not assessed</option>
                <option value="INTACT">Intact</option>
                <option value="RUPTURED">Ruptured</option>
              </select>
            </Field>
          </div>

          <Field label="Liquor" htmlFor="pvLiquor">
            <input
              id="pvLiquor"
              name="pvLiquor"
              maxLength={200}
              defaultValue={exam.status === 'PERFORMED' ? (exam.liquor ?? '') : ''}
              className={FIELD}
            />
          </Field>
        </Fieldset>

        <Fieldset legend="Referring clinician">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="referringDoctorName">
              <input
                id="referringDoctorName"
                name="referringDoctorName"
                maxLength={200}
                defaultValue={draft.referringDoctorName ?? ''}
                className={FIELD}
              />
            </Field>
            <Field label="Callback number" htmlFor="referringContactPhone">
              <input
                id="referringContactPhone"
                name="referringContactPhone"
                maxLength={32}
                defaultValue={draft.referringContactPhone ?? ''}
                className={`${FIELD} numeric`}
              />
            </Field>
          </div>
          <Field
            label="Facility name"
            htmlFor="referringFacility"
            hint="Leave blank to use this clinic's registered name."
          >
            <input
              id="referringFacility"
              name="referringFacility"
              maxLength={300}
              defaultValue={draft.referringFacility ?? ''}
              className={FIELD}
            />
          </Field>
        </Fieldset>

        <ErrorLine message={state.error} />
        <Submit idle="Save draft" busy="Saving…" />
      </form>

      {/*
        A separate form, so issuing can never be the accidental outcome of
        pressing Enter in a text field. Issue freezes the document: after it,
        this referral cannot be edited, only replaced.
      */}
      <IssueForm
        patientId={patientId}
        referralId={referralId}
        version={version}
        canIssue={canIssue}
        ready={draft.indication !== null && draft.receivingFacility !== null}
      />
    </div>
  )
}

function IssueForm({
  patientId,
  referralId,
  version,
  canIssue,
  ready,
}: {
  patientId: string
  referralId: string
  version: number
  canIssue: boolean
  ready: boolean
}) {
  const [state, formAction] = useActionState(issueReferralAction, initialState)

  if (!canIssue) {
    return (
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm text-slate-600">
          A referral is issued by a doctor. Save the draft and a clinician can
          issue it from here.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-alert-600/30 bg-alert-50 p-5">
      <h2 className="text-sm font-semibold text-alert-700">Issue this referral</h2>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-slate-700">
        Issuing freezes the document exactly as it stands and records you as its
        author. After that it cannot be edited — a correction is issued as a new
        referral that replaces this one, because the original will already be in
        the patient&rsquo;s hands.
      </p>

      {!ready ? (
        <p className="mb-4 text-sm text-slate-700">
          An indication and a receiving facility are needed before it can be
          issued. Save the draft with both filled in.
        </p>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="patientId" value={patientId} />
        <input type="hidden" name="referralId" value={referralId} />
        <input type="hidden" name="expectedVersion" value={version} />
        <Submit idle="Issue and print" busy="Issuing…" tone="grave" />
      </form>

      <div className="mt-3">
        <ErrorLine message={state.error} />
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

function Fieldset({
  legend,
  note,
  children,
}: {
  legend: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {legend}
      </legend>
      {note ? <p className="text-xs leading-relaxed text-slate-500">{note}</p> : null}
      {children}
    </fieldset>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
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
  defaultValue,
}: {
  name: string
  label: string
  unit: string
  min: number
  max: number
  step?: string
  placeholder: string
  defaultValue: number | null
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
          defaultValue={defaultValue ?? ''}
          className={`${FIELD} numeric`}
        />
        {/* The unit is never implied. It is printed beside every field and
            stored with every value (ARCH-9). */}
        <span className="shrink-0 text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  )
}
