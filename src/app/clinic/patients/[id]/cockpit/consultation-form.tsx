'use client'

import {
  ArrowRight,
  ClipboardCheck,
  Pill as PillIcon,
  Plus,
  Send,
  Stethoscope,
  Zap,
} from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Accordion, AccordionMeta } from '@components/cockpit/accordion'
import {
  FIELD,
  RxLineEditor,
  type RxDraft,
  blankRx,
  fromFormulary,
  fromOngoing,
  fromPackMedicine,
  toPackMedicine,
} from '@components/cockpit/rx-line'
import { TokenInput } from '@components/cockpit/token-input'
import {
  COUNSELLING,
  type CounsellingKey,
  type MasterPack,
  applyPack,
} from '@modules/master-packs/master-pack.types'
import { CLINIC_FORMULARY, type FormularyItem } from '@modules/orders/formulary'
import {
  LAB_INVESTIGATIONS,
  SCAN_INVESTIGATIONS,
  searchInvestigations,
} from '@modules/orders/investigations'
import type { Prescription } from '@modules/orders/order.types'
import type { ClinicDoctor, DoctorReference } from '@modules/visits/visit.types'

import { submitConsultation, type SaveState } from './actions'
import { type PendingReport, useConsultationDraft, verificationPayload } from './consultation-draft'
import { DictatedTextarea } from './dictated-textarea'
import { type ApplyNotice, MasterPackStrip } from './master-pack-strip'

/**
 * Everything the doctor writes at a consultation, and the atomic Save & Next.
 *
 * Examination, Fresh orders & advice, Reference and Master packs live inside
 * this one <form>. Chief complaints sit higher on the page, outside it, and join
 * it through the form's id (`formId`). Together with the report decisions and
 * addressed queries staged in the panel at the top of the page, they commit in
 * one transaction (PRD F6) — so there is a single save button, never one per
 * section.
 *
 * The idempotency key is minted once when the form mounts and reused for every
 * retry of this save. A fresh key per attempt would make a double-click look
 * like two different consultations.
 */

const initialState: SaveState = { status: 'idle' }

const PANE = 'flex flex-col gap-2 rounded-lg border border-slate-200/90 bg-white p-3 shadow-2xs'

const PANE_TITLE = 'font-heading text-xs font-bold uppercase tracking-wider text-slate-800'

const CHECKBOX = 'h-3.5 w-3.5 shrink-0 accent-brand-600'

const CHECK_ROW =
  'flex cursor-pointer items-center gap-2 rounded border border-slate-200/60 bg-slate-50 p-1.5 text-xs text-slate-700 transition-colors hover:bg-slate-100/60'

const LAB_QUICK_PICKS = ['CBC', 'Urine routine & microscopy', 'TSH', 'OGTT 75 g', 'HBsAg', 'HIV 1 & 2']
const SCAN_QUICK_PICKS = ['Growth scan', 'Growth scan with Doppler', 'NST']

/** The form field each counselling checkbox posts as. */
const COUNSELLING_FIELDS: Record<CounsellingKey, string> = {
  DFKC: 'dfkcCounselled',
  NUTRITION: 'nutritionCounselled',
  LEFT_LATERAL_REST: 'leftLateralRest',
  DANGER_SIGNS: 'dangerSignsCounselled',
}

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
  visitDate,
  expectedVersion,
  current,
  reports,
  doctors,
  priorReferences,
  formId,
  systemicExamination,
  ongoing,
  masterPacks,
  examinationFlagger,
}: {
  visitId: string
  visitDate: string
  expectedVersion: number
  current: {
    impression: string | null
    examination: string | null
    diagnosis: string | null
    summary: string | null
  }
  reports: readonly PendingReport[]
  doctors: readonly ClinicDoctor[]
  priorReferences: readonly DoctorReference[]
  /** The <form>'s id, so fields rendered elsewhere on the page submit with it. */
  formId: string
  systemicExamination: { perAbdomen: string | null; perVaginum: string | null; perSpeculum: string | null }
  /** Ongoing prescriptions, pre-filled into today's Rx. */
  ongoing: readonly Prescription[]
  /** The signed-in doctor's own master packs, for the strip at the foot of the form. */
  masterPacks: readonly MasterPack[]
  /** The Examination section's "Diagnosis to be flagged" panel, built by the page. */
  examinationFlagger?: React.ReactNode
}) {
  const [state, formAction] = useActionState(submitConsultation, initialState)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const { decisions, addressedQueryIds, husbandCandidateIds } = useConsultationDraft()

  const [prescriptions, setPrescriptions] = useState<RxDraft[]>(() => ongoing.map(fromOngoing))
  const [labOrders, setLabOrders] = useState<string[]>([])
  const [scanOrders, setScanOrders] = useState<string[]>([])
  // Controlled, so a master pack can tick them and add to the advice.
  const [counselling, setCounselling] = useState<CounsellingKey[]>([])
  const [additionalAdvice, setAdditionalAdvice] = useState('')
  const [packNotice, setPackNotice] = useState<ApplyNotice | null>(null)

  const update = (key: number, patch: Partial<RxDraft>) =>
    setPrescriptions((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const addFromFormulary = (item: FormularyItem) =>
    setPrescriptions((rows) =>
      rows.some((row) => row.medicineName.toLowerCase() === item.medicineName.toLowerCase())
        ? rows
        : [...rows, fromFormulary(item)],
    )

  // Whatever is already in today's plan is kept as written; the pack only adds.
  const applyMasterPack = (pack: MasterPack) => {
    const result = applyPack(
      {
        medicineNames: prescriptions.map((rx) => rx.medicineName).filter((name) => name.trim()),
        labOrders,
        scanOrders,
        counselling,
        advice: additionalAdvice,
      },
      pack,
    )
    setPrescriptions((rows) => [...rows, ...result.medicines.map(fromPackMedicine)])
    setLabOrders([...result.labOrders])
    setScanOrders([...result.scanOrders])
    setCounselling([...result.counselling])
    setAdditionalAdvice(result.advice)
    setPackNotice({ packName: pack.name, added: result.added, skipped: result.skipped })
  }

  // Only completed lines are submitted. A half-typed row left on screen when
  // the clinician hits save should not become an order.
  const payload = prescriptions.map(toPackMedicine).filter((rx) => rx !== null)

  const verifyPayload = verificationPayload(reports, decisions)
  // Only values actually being verified in this save can be filed as the husband's.
  const husbandPayload = verifyPayload
    .map((v) => v.candidateId)
    .filter((id) => husbandCandidateIds.has(id))

  return (
    <form id={formId} action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="prescriptions" value={JSON.stringify(payload)} />
      <input type="hidden" name="verifyCandidates" value={JSON.stringify(verifyPayload)} />
      <input type="hidden" name="labOrdersJson" value={JSON.stringify(labOrders)} />
      <input type="hidden" name="scanOrdersJson" value={JSON.stringify(scanOrders)} />
      <input type="hidden" name="husbandBloodGroupCandidateIds" value={JSON.stringify(husbandPayload)} />
      {[...addressedQueryIds].map((id) => (
        <input key={id} type="hidden" name="resolveQuery" value={id} />
      ))}

      {/* Examination — general findings, then the three systemic examinations side by side. */}
      <Accordion
        title="Examination"
        icon={<Stethoscope className="h-4.75 w-4.75" />}
        defaultOpen
      >
        <div className="flex flex-col gap-3">
          <DictatedTextarea
            name="examination"
            label="General examination"
            rows={2}
            defaultValue={current.examination}
            placeholder="Afebrile, no pallor, no pedal oedema. BP, pulse as recorded."
            hint="Type, or press Voice and speak. What you dictate is added to the text; the recording is not kept."
          />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DictatedTextarea
              name="perAbdomen"
              label="Per abdomen"
              rows={4}
              defaultValue={systemicExamination.perAbdomen}
              placeholder="Uterus 32 wk size, relaxed, cephalic, FHS regular."
            />
            <DictatedTextarea
              name="perVaginum"
              label="Per vaginum"
              rows={4}
              defaultValue={systemicExamination.perVaginum}
              placeholder="Os closed, cervix uneffaced, no bleeding."
            />
            <DictatedTextarea
              name="perSpeculum"
              label="Per speculum"
              rows={4}
              defaultValue={systemicExamination.perSpeculum}
              placeholder="Cervix healthy, no discharge, no leak."
            />
          </div>
          {examinationFlagger}
        </div>
      </Accordion>

      {/* Fresh orders & advice — the active plan. */}
      <Accordion
        title="Fresh orders & advice (active plan)"
        icon={<ClipboardCheck className="h-5 w-5" />}
        tone="emphasis"
        meta={<AccordionMeta>visit {visitDate}</AccordionMeta>}
        defaultOpen
      >
        <div className="flex flex-col gap-3.5">
          <section className={`${PANE} grid gap-3 lg:grid-cols-2`}>
            <DictatedTextarea
              name="diagnosis"
              label="Diagnosis"
              rows={2}
              defaultValue={current.diagnosis}
              placeholder="G2P1L1A0 at 32 weeks. Previous LSCS."
              options={[
                'Anaemia in pregnancy',
                'Pregnancy Induced Hypertension',
                'Chronic Hypertension',
                'Gestational Diabetes Mellitus',
                'Rh Negative Pregnancy',
                'IUGR',
                'Oligohydramnios',
                'Polyhydramnios',
                'Short stature',
                'Placenta previa',
                'Kyphosis'
              ]}
            />
            <DictatedTextarea
              name="impression"
              label="Impression"
              rows={2}
              defaultValue={current.impression}
              placeholder="Mild anaemia on oral iron."
            />
            <div className="lg:col-span-2">
              <DictatedTextarea
                name="summary"
                label="Summary"
                rows={3}
                defaultValue={current.summary}
                placeholder="What was discussed and decided at this visit."
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <section className={`${PANE} min-w-0 lg:col-span-7`}>
              <div className="flex items-center justify-between">
                <span className={`${PANE_TITLE} flex items-center gap-1.5`}>
                  <PillIcon aria-hidden className="h-4 w-4 text-brand-600" />
                  Prescription list (Rx)
                </span>
                <button
                  type="button"
                  onClick={() => setPrescriptions((rows) => [...rows, blankRx()])}
                  className="flex items-center gap-1 rounded border border-brand-200/70 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800 transition-colors hover:bg-brand-100"
                >
                  <Plus aria-hidden className="h-3.5 w-3.5" />
                  <span>New drug</span>
                </button>
              </div>

              {/* The clinic's quick-pick list: one tap, fully editable after. */}
              <div className="rounded-md border border-dashed border-brand-200 bg-brand-50/40 p-2">
                <p className="mb-1.5 flex items-center gap-1 text-[10.5px] font-semibold text-brand-800">
                  <Zap aria-hidden className="h-3.5 w-3.5" />
                  Quick add from clinic list
                </p>
                <div className="flex flex-wrap gap-1">
                  {CLINIC_FORMULARY.map((item) => {
                    const added = prescriptions.some(
                      (row) => row.medicineName.toLowerCase() === item.medicineName.toLowerCase(),
                    )
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={added}
                        onClick={() => addFromFormulary(item)}
                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10.5px] font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 disabled:cursor-default disabled:border-brand-200 disabled:bg-brand-100 disabled:text-brand-800"
                      >
                        {added ? '✓ ' : ''}
                        {item.form}. {item.medicineName}
                        {item.doseAmount !== null ? ` ${item.doseAmount} ${item.doseUnit}` : ''}
                      </button>
                    )
                  })}
                </div>
              </div>

              {ongoing.length > 0 ? (
                <p className="text-[10.5px] text-slate-500">
                  Her {ongoing.length} ongoing medicine{ongoing.length === 1 ? ' is' : 's are'} carried in below —
                  edit or remove before saving. Whatever is listed is prescribed afresh today.
                </p>
              ) : null}
              {prescriptions.length === 0 ? (
                <p className="text-xs text-slate-500">Nothing prescribed at this visit.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {prescriptions.map((rx, index) => (
                    <RxLineEditor
                      key={rx.key}
                      index={index}
                      rx={rx}
                      onChange={(patch) => update(rx.key, patch)}
                      onRemove={() => setPrescriptions((rows) => rows.filter((row) => row.key !== rx.key))}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className={`${PANE} min-w-0 lg:col-span-5`}>
              <span className={PANE_TITLE}>Investigations &amp; advice</span>

              <TokenInput
                id="labOrders"
                label="Lab orders"
                values={labOrders}
                onChange={setLabOrders}
                search={(query, exclude) =>
                  searchInvestigations(LAB_INVESTIGATIONS, query, exclude).map((item) => ({
                    value: item.name,
                    detail: item.detail,
                  }))
                }
                quickPicks={LAB_QUICK_PICKS}
                placeholder="Type to search — c → CBC"
              />

              <TokenInput
                id="scanOrders"
                label="Scan orders"
                values={scanOrders}
                onChange={setScanOrders}
                search={(query, exclude) =>
                  searchInvestigations(SCAN_INVESTIGATIONS, query, exclude).map((item) => ({
                    value: item.name,
                    detail: item.detail,
                  }))
                }
                quickPicks={SCAN_QUICK_PICKS}
                placeholder="Type to search — g → Growth scan"
              />

              {/* Recorded as counselled, never auto-ticked — only the doctor, or
                  a pack she chose to apply, ticks these. */}
              <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2">
                {COUNSELLING.map((item) => (
                  <Check
                    key={item.key}
                    name={COUNSELLING_FIELDS[item.key]}
                    label={item.label}
                    checked={counselling.includes(item.key)}
                    onChange={(on) =>
                      setCounselling((keys) => (on ? [...keys, item.key] : keys.filter((key) => key !== item.key)))
                    }
                  />
                ))}
              </div>

              <div className="grid gap-2 border-t border-slate-100 pt-2">
                <Labelled htmlFor="nextFollowupDate" label="Next follow-up">
                  <input id="nextFollowupDate" name="nextFollowupDate" type="date" className={`${FIELD} numeric`} />
                </Labelled>
                <Labelled htmlFor="additionalAdvice" label="Other advice">
                  <input
                    id="additionalAdvice"
                    name="additionalAdvice"
                    value={additionalAdvice}
                    onChange={(e) => setAdditionalAdvice(e.target.value)}
                    className={FIELD}
                  />
                </Labelled>
              </div>
            </section>
          </div>
        </div>
      </Accordion>

      <ReferenceSection doctors={doctors} priorReferences={priorReferences} />

      <MasterPackStrip
        packs={masterPacks}
        onApply={applyMasterPack}
        notice={packNotice}
        onDismissNotice={() => setPackNotice(null)}
      />

      {state.status === 'error' ? (
        <p
          role="alert"
          className="rounded-lg border border-alert-200 bg-alert-50 px-3 py-2.5 text-xs text-alert-700"
        >
          {state.message}
          {state.retryable ? (
            <span className="mt-1 block text-alert-700/80">
              Nothing you typed has been lost. Refresh the record in another tab to see what changed,
              then save again.
            </span>
          ) : null}
        </p>
      ) : null}

      {/* The save bar follows the doctor down the page: at eighty patients a
          shift, scrolling back to find the button is time nobody has. */}
      <div className="glass-raised sticky bottom-2 z-10 flex flex-col items-center justify-between gap-2.5 rounded-xl border border-brand-100 px-3.5 py-2.5 shadow-md sm:flex-row">
        <span className="text-[11px] text-slate-600">
          <SaveSummary
            decided={Object.keys(decisions).length}
            addressed={addressedQueryIds.size}
            prescriptions={payload.length}
          />
        </span>
        <SaveButton />
      </div>
    </form>
  )
}

function SaveSummary({
  decided,
  addressed,
  prescriptions,
}: {
  decided: number
  addressed: number
  prescriptions: number
}) {
  const parts = [
    decided > 0 ? `${decided} report${decided === 1 ? '' : 's'} reviewed` : null,
    addressed > 0 ? `${addressed} quer${addressed === 1 ? 'y' : 'ies'} addressed` : null,
    prescriptions > 0 ? `${prescriptions} drug${prescriptions === 1 ? '' : 's'}` : null,
  ].filter(Boolean)

  return (
    <>
      {parts.length > 0 ? <strong className="font-semibold text-slate-800">{parts.join(' · ')}. </strong> : null}
      Examination, diagnosis, orders, advice, report reviews and the reference are written together, or not
      at all.
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Reference tab                                                              */
/* -------------------------------------------------------------------------- */

function ReferenceSection({
  doctors,
  priorReferences,
}: {
  doctors: readonly ClinicDoctor[]
  priorReferences: readonly DoctorReference[]
}) {
  const [mode, setMode] = useState<'COLLEAGUE' | 'EXTERNAL'>(doctors.length > 0 ? 'COLLEAGUE' : 'EXTERNAL')

  return (
    <Accordion
      title="Reference — refer to a doctor"
      icon={<Send className="h-4.5 w-4.5" />}
      summary={priorReferences.length > 0 ? `${priorReferences.length} earlier` : undefined}
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className={`${PANE} lg:col-span-7`}>
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Refer to">
            {(['COLLEAGUE', 'EXTERNAL'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                disabled={option === 'COLLEAGUE' && doctors.length === 0}
                onClick={() => setMode(option)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${
                  mode === option
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200'
                }`}
              >
                {option === 'COLLEAGUE' ? 'Registered doctor' : 'Other doctor'}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {mode === 'COLLEAGUE' ? (
              <Labelled htmlFor="refStaff" label="Doctor">
                <select id="refStaff" name="refStaffUserId" defaultValue="" className={FIELD}>
                  <option value="">Choose a registered doctor…</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.staffUserId} value={doctor.staffUserId}>
                      {doctor.displayName}
                      {doctor.registrationNo ? ` · Reg. ${doctor.registrationNo}` : ''}
                    </option>
                  ))}
                </select>
              </Labelled>
            ) : (
              <Labelled htmlFor="refExternal" label="Doctor's name">
                <input id="refExternal" name="refExternalName" placeholder="Dr. …" className={FIELD} />
              </Labelled>
            )}
            <Labelled htmlFor="refSpecialty" label="Speciality">
              <input
                id="refSpecialty"
                name="refSpecialty"
                list="ref-specialties"
                placeholder="Cardiology, Endocrinology…"
                className={FIELD}
              />
              <datalist id="ref-specialties">
                {[
                  'Cardiology', 'Endocrinology', 'Medicine', 'Nephrology', 'Haematology', 'Neurology',
                  'Psychiatry', 'Fetal medicine', 'Dermatology', 'Ophthalmology', 'Dental', 'Paediatrics',
                ].map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Labelled>
            {mode === 'EXTERNAL' ? (
              <Labelled htmlFor="refFacility" label="Hospital / clinic">
                <input id="refFacility" name="refFacility" className={FIELD} />
              </Labelled>
            ) : null}
            <fieldset className="flex items-end gap-3 text-xs text-slate-700">
              <legend className="mb-1 text-[11px] font-medium text-slate-600">Urgency</legend>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="refUrgency" value="ROUTINE" defaultChecked className={CHECKBOX} />
                Routine
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="refUrgency" value="URGENT" className={CHECKBOX} />
                Urgent
              </label>
            </fieldset>
          </div>

          <Labelled htmlFor="refReason" label="Reason for reference">
            <textarea
              id="refReason"
              name="refReason"
              rows={2}
              placeholder="Opinion regarding … (leave blank to make no reference)"
              className={FIELD}
            />
          </Labelled>
          <p className="text-[10.5px] text-slate-500">
            Saved with this consultation. Leave the doctor and reason empty to make no reference.
          </p>
        </div>

        <div className={`${PANE} lg:col-span-5`}>
          <span className={PANE_TITLE}>Earlier references</span>
          {priorReferences.length === 0 ? (
            <p className="text-xs text-slate-500">None in this pregnancy.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {priorReferences.map((ref) => (
                <li key={ref.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {ref.recipient.kind === 'COLLEAGUE'
                        ? (ref.recipient.displayName ?? 'Registered doctor')
                        : ref.recipient.name}
                      {ref.specialty ? <span className="font-normal text-slate-500"> · {ref.specialty}</span> : null}
                    </span>
                    <span className="numeric shrink-0 text-[10px] text-slate-500">
                      {ref.createdAt.slice(0, 10)}
                      {ref.urgency === 'URGENT' ? (
                        <span className="ml-1 rounded bg-alert-50 px-1 font-bold text-alert-700">urgent</span>
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">{ref.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Accordion>
  )
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

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

function Check({
  name,
  label,
  checked,
  onChange,
}: {
  name: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className={CHECK_ROW}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={CHECKBOX}
      />
      <span className="font-medium">{label}</span>
    </label>
  )
}
