'use client'

import {
  ArrowRight,
  ClipboardCheck,
  Pill as PillIcon,
  Plus,
  Send,
  Stethoscope,
  X,
  Zap,
} from 'lucide-react'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'

import { Accordion, AccordionMeta } from '@components/cockpit/accordion'
import { TokenInput } from '@components/cockpit/token-input'
import { CLINIC_FORMULARY, PRESCRIPTION_BUNDLES, type FormularyItem, searchFormulary } from '@modules/orders/formulary'
import {
  LAB_INVESTIGATIONS,
  SCAN_INVESTIGATIONS,
  searchInvestigations,
} from '@modules/orders/investigations'
import type { DoseFrequency, FoodRelation } from '@modules/orders/order.types'
import type { ClinicDoctor, DoctorReference } from '@modules/visits/visit.types'

import { submitConsultation, type SaveState } from './actions'
import { type PendingReport, useConsultationDraft, verificationPayload } from './consultation-draft'
import { DictatedTextarea } from './dictated-textarea'

/**
 * Everything the doctor writes at a consultation, and the atomic Save & Next.
 *
 * Three cockpit sections live inside this one <form>: Examination, Fresh orders
 * & advice, and the Reference tab. Together with the report decisions and
 * addressed queries staged in the panel at the top of the page, they commit in
 * one transaction (PRD F6) — so there is a single save button, never one per
 * section.
 *
 * The idempotency key is minted once when the form mounts and reused for every
 * retry of this save. A fresh key per attempt would make a double-click look
 * like two different consultations.
 */

const initialState: SaveState = { status: 'idle' }

const FIELD =
  'w-full rounded border border-slate-300 bg-white/80 px-2.5 py-1.5 text-xs text-slate-900 outline-none transition-colors focus:border-brand-600 focus:ring-1 focus:ring-brand-600'

const PANE = 'flex flex-col gap-2 rounded-lg border border-slate-200/90 bg-white p-3 shadow-2xs'

const PANE_TITLE = 'font-heading text-xs font-bold uppercase tracking-wider text-slate-800'

const CHECKBOX = 'h-3.5 w-3.5 shrink-0 accent-brand-600'

const CHECK_ROW =
  'flex cursor-pointer items-center gap-2 rounded border border-slate-200/60 bg-slate-50 p-1.5 text-xs text-slate-700 transition-colors hover:bg-slate-100/60'

/**
 * The schedules offered as one-tap buttons, in the order they are written.
 * Shown as the pattern and the abbreviation together — `1-0-1 BD` — which is
 * how the prescription pad reads.
 */
const SCHEDULES: ReadonlyArray<{ value: DoseFrequency; pattern: string | null; code: string }> = [
  { value: 'OD', pattern: '1-0-0', code: 'OD' },
  { value: 'BD', pattern: '1-0-1', code: 'BD' },
  { value: 'TDS', pattern: '1-1-1', code: 'TDS' },
  { value: 'QID', pattern: '1-1-1-1', code: 'QID' },
  { value: 'HS', pattern: '0-0-1', code: 'HS' },
  { value: 'SOS', pattern: null, code: 'SOS' },
  { value: 'WEEKLY', pattern: null, code: 'Weekly' },
]

const FORMS = ['Tab', 'Cap', 'Syp', 'Inj', 'Susp', 'Oint', 'Drops', 'Sachet']

const LAB_QUICK_PICKS = ['CBC', 'Urine routine & microscopy', 'TSH', 'OGTT 75 g', 'HBsAg', 'HIV 1 & 2']
const SCAN_QUICK_PICKS = ['Growth scan', 'Growth scan with Doppler', 'NST']

interface PrescriptionDraft {
  key: number
  medicineName: string
  doseAmount: string
  doseUnit: string
  form: string
  frequency: DoseFrequency
  foodRelation: FoodRelation
  durationDays: string
}

let nextKey = 1

const blankRx = (): PrescriptionDraft => ({
  key: nextKey++,
  medicineName: '',
  doseAmount: '',
  doseUnit: 'mg',
  form: 'Tab',
  frequency: 'OD',
  foodRelation: 'AFTER_FOOD',
  durationDays: '30',
})

const fromFormulary = (item: FormularyItem): PrescriptionDraft => ({
  key: nextKey++,
  medicineName: item.medicineName,
  doseAmount: item.doseAmount !== null ? String(item.doseAmount) : '',
  doseUnit: item.doseUnit ?? '',
  form: item.form,
  frequency: item.frequency,
  foodRelation: item.foodRelation,
  durationDays: item.durationDays !== null ? String(item.durationDays) : '',
})

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
}) {
  const [state, formAction] = useActionState(submitConsultation, initialState)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const { decisions, addressedQueryIds } = useConsultationDraft()

  const [prescriptions, setPrescriptions] = useState<PrescriptionDraft[]>([])
  const [labOrders, setLabOrders] = useState<string[]>([])
  const [scanOrders, setScanOrders] = useState<string[]>([])

  const update = (key: number, patch: Partial<PrescriptionDraft>) =>
    setPrescriptions((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const addFromFormulary = (item: FormularyItem) =>
    setPrescriptions((rows) =>
      rows.some((row) => row.medicineName.toLowerCase() === item.medicineName.toLowerCase())
        ? rows
        : [...rows, fromFormulary(item)],
    )

  const addBundle = (bundle: typeof PRESCRIPTION_BUNDLES[number]) => {
    const items = bundle.itemIds.map(id => CLINIC_FORMULARY.find(f => f.id === id)).filter((Boolean as any) as <T>(x: T | undefined | null) => x is T)
    items.forEach(item => addFromFormulary(item))
  }

  // Only completed lines are submitted. A half-typed row left on screen when
  // the clinician hits save should not become an order.
  const payload = prescriptions
    .filter((rx) => rx.medicineName.trim().length > 0)
    .map((rx) => ({
      medicineName: rx.medicineName.trim(),
      doseAmount: rx.doseAmount && rx.doseUnit ? Number(rx.doseAmount) : null,
      doseUnit: rx.doseAmount && rx.doseUnit ? rx.doseUnit : null,
      form: rx.form || null,
      frequency: rx.frequency,
      foodRelation: rx.foodRelation,
      durationDays: rx.durationDays ? Number(rx.durationDays) : null,
    }))

  const verifyPayload = verificationPayload(reports, decisions)

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="visitId" value={visitId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="prescriptions" value={JSON.stringify(payload)} />
      <input type="hidden" name="verifyCandidates" value={JSON.stringify(verifyPayload)} />
      <input type="hidden" name="labOrdersJson" value={JSON.stringify(labOrders)} />
      <input type="hidden" name="scanOrdersJson" value={JSON.stringify(scanOrders)} />
      {[...addressedQueryIds].map((id) => (
        <input key={id} type="hidden" name="resolveQuery" value={id} />
      ))}

      {/* Examination — replaces the old read-only impression panel. */}
      <Accordion
        title="Examination"
        icon={<Stethoscope className="h-4.75 w-4.75" />}
        defaultOpen
      >
        <DictatedTextarea
          name="examination"
          label="Examination findings"
          rows={4}
          defaultValue={current.examination}
          placeholder="General: afebrile, no pallor, no pedal oedema. P/A: uterus 32 wk size, relaxed, cephalic, FHS regular. P/S, P/V: …"
          hint="Type, or press Voice and speak. What you dictate is added to the text; the recording is not kept."
        />
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
                'Placenta previa'
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
            <section className={`${PANE} lg:col-span-7`}>
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

              {/* Master templates / Bundles */}
              <div className="mb-2 rounded-md border border-dashed border-brand-300 bg-brand-100/30 p-2">
                <p className="mb-1.5 flex items-center gap-1 text-[10.5px] font-semibold text-brand-800">
                  <Zap aria-hidden className="h-3.5 w-3.5" />
                  Master templates (Diagnosis based)
                </p>
                <div className="flex flex-wrap gap-1">
                  {PRESCRIPTION_BUNDLES.map((bundle) => (
                    <button
                      key={bundle.id}
                      type="button"
                      onClick={() => addBundle(bundle)}
                      className="rounded border border-brand-300 bg-brand-50 px-2.5 py-1 text-[10.5px] font-bold text-brand-700 transition-colors hover:bg-brand-600 hover:text-white shadow-sm"
                    >
                      + {bundle.name}
                    </button>
                  ))}
                </div>
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

              {prescriptions.length === 0 ? (
                <p className="text-xs text-slate-500">Nothing prescribed at this visit.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {prescriptions.map((rx, index) => (
                    <li key={rx.key} className="rounded border border-slate-200/70 bg-slate-50/90 p-2">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="numeric shrink-0 text-xs font-bold text-brand-800">{index + 1}.</span>
                        <select
                          value={FORMS.includes(rx.form) ? rx.form : rx.form || 'Tab'}
                          onChange={(e) => update(rx.key, { form: e.target.value })}
                          aria-label="Form"
                          className={`${FIELD} w-20 shrink-0`}
                        >
                          {[...new Set([...FORMS, rx.form].filter(Boolean))].map((form) => (
                            <option key={form} value={form}>
                              {form}
                            </option>
                          ))}
                        </select>
                        <MedicineInput
                          value={rx.medicineName}
                          onChange={(medicineName) => update(rx.key, { medicineName })}
                          onPick={(item) => update(rx.key, { ...fromFormulary(item), key: rx.key })}
                        />
                        <button
                          type="button"
                          onClick={() => setPrescriptions((rows) => rows.filter((row) => row.key !== rx.key))}
                          aria-label="Remove"
                          className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-alert-600"
                        >
                          <X aria-hidden className="h-4.25 w-4.25" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-1.5 pl-6">
                        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Schedule">
                          {SCHEDULES.map((schedule) => {
                            const selected = rx.frequency === schedule.value
                            return (
                              <button
                                key={schedule.value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => update(rx.key, { frequency: schedule.value })}
                                className={`numeric rounded border px-1.5 py-0.5 text-[10.5px] font-bold transition-colors ${
                                  selected
                                    ? 'border-brand-600 bg-brand-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-800'
                                }`}
                              >
                                {schedule.pattern ? `${schedule.pattern} ` : ''}
                                <span className={selected ? 'text-white/85' : 'text-slate-400'}>{schedule.code}</span>
                              </button>
                            )
                          })}
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                          {/* Amount and unit are one field in the domain: the
                              schema refuses one without the other. */}
                          <input
                            value={rx.doseAmount}
                            onChange={(e) => update(rx.key, { doseAmount: e.target.value })}
                            type="number"
                            step="any"
                            placeholder="Dose"
                            aria-label="Dose amount"
                            className={`${FIELD} numeric`}
                          />
                          <input
                            value={rx.doseUnit}
                            onChange={(e) => update(rx.key, { doseUnit: e.target.value })}
                            placeholder="unit"
                            aria-label="Dose unit"
                            className={`${FIELD} numeric`}
                          />
                          <select
                            value={rx.foodRelation}
                            onChange={(e) => update(rx.key, { foodRelation: e.target.value as FoodRelation })}
                            aria-label="Relation to food"
                            className={FIELD}
                          >
                            <option value="AFTER_FOOD">after food</option>
                            <option value="BEFORE_FOOD">before food</option>
                            <option value="WITH_FOOD">with food</option>
                            <option value="NOT_SPECIFIED">not specified</option>
                          </select>
                          <div className="flex items-center gap-1">
                            <input
                              value={rx.durationDays}
                              onChange={(e) => update(rx.key, { durationDays: e.target.value })}
                              type="number"
                              min={1}
                              placeholder="Days"
                              aria-label="Duration in days"
                              className={`${FIELD} numeric`}
                            />
                            <span className="text-[10px] text-slate-500">days</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${PANE} lg:col-span-5`}>
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

              <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2">
                <Check name="dfkcCounselled" label="Daily fetal kick count explained" />
                <Check name="nutritionCounselled" label="Nutrition counselling" />
                <Check name="leftLateralRest" label="Left lateral rest" />
                {/* Recorded as counselled, never auto-ticked. */}
                <Check name="dangerSignsCounselled" label="Danger signs explained" />
              </div>

              <div className="grid gap-2 border-t border-slate-100 pt-2">
                <Labelled htmlFor="nextFollowupDate" label="Next follow-up">
                  <input id="nextFollowupDate" name="nextFollowupDate" type="date" className={`${FIELD} numeric`} />
                </Labelled>
                <Labelled htmlFor="additionalAdvice" label="Other advice">
                  <input id="additionalAdvice" name="additionalAdvice" className={FIELD} />
                </Labelled>
              </div>
            </section>
          </div>
        </div>
      </Accordion>

      <ReferenceSection doctors={doctors} priorReferences={priorReferences} />

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
/* Medicine name with formulary type-ahead                                    */
/* -------------------------------------------------------------------------- */

function MedicineInput({
  value,
  onChange,
  onPick,
}: {
  value: string
  onChange: (value: string) => void
  onPick: (item: FormularyItem) => void
}) {
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(0)
  const matches = focused ? searchFormulary(value) : []
  const exact = matches.some((item) => item.medicineName.toLowerCase() === value.trim().toLowerCase())
  const open = matches.length > 0 && !exact

  return (
    <div className="relative min-w-0 flex-1">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setActive(0)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onKeyDown={(e) => {
          if (!open) {
            // Enter must never submit the consultation from a drug line.
            if (e.key === 'Enter') e.preventDefault()
            return
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => (i + 1) % matches.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => (i - 1 + matches.length) % matches.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const item = matches[active]
            if (item) onPick(item)
          }
        }}
        placeholder="Medicine — type to search the clinic list, or any name"
        aria-label="Medicine"
        autoComplete="off"
        className={FIELD}
      />
      {open ? (
        <ul className="absolute top-full right-0 left-0 z-20 mt-1 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(item)}
                onMouseEnter={() => setActive(index)}
                className={`flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-xs ${
                  index === active ? 'bg-brand-50 text-brand-800' : 'text-slate-800'
                }`}
              >
                <span className="font-semibold">
                  {item.form}. {item.medicineName}
                  {item.doseAmount !== null ? ` ${item.doseAmount} ${item.doseUnit}` : ''}
                </span>
                <span className="numeric shrink-0 text-[10.5px] text-slate-500">
                  {SCHEDULES.find((s) => s.value === item.frequency)?.pattern ?? ''} {item.frequency}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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

function Check({ name, label }: { name: string; label: string }) {
  return (
    <label className={CHECK_ROW}>
      <input type="checkbox" name={name} className={CHECKBOX} />
      <span className="font-medium">{label}</span>
    </label>
  )
}
