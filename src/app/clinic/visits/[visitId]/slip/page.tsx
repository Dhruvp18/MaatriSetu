import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import {
  type CalendarDate,
  type DatingReference,
  estimatedDueDate,
  formatGestationalAge,
  splitGestationalAge,
} from '@core/obstetrics/dating'
import { formatCalendarDate, formatClinicDate } from '@core/time/clinic-time'
import { listPrescriptions } from '@modules/orders/order.service'
import { formatPrescription, type Prescription } from '@modules/orders/order.types'
import { getPatient } from '@modules/patients/patient.service'
import {
  ageInYears,
  describeAllergies,
  formatBloodGroup,
  type Patient,
} from '@modules/patients/patient.types'
import { getPregnancy } from '@modules/pregnancies/pregnancy.service'
import { getPregnancyResults } from '@modules/reports/report.service'
import {
  formatObservationValue,
  formatReferenceRange,
  type Observation,
  type ScanReport,
} from '@modules/reports/report.types'
import { getVisitAdvice, getVisitWithVitals } from '@modules/visits/visit.service'
import {
  adviceGiven,
  hasAnyMeasurement,
  type DatingMethod,
  type Quantity,
  type Visit,
  type VisitAdvice,
  type VitalsReading,
  visitDate,
  vitalsAsQuantities,
} from '@modules/visits/visit.types'

import { PrintButton } from './print-button'

/**
 * The MCP visit slip (PRD F8).
 *
 * The one artefact of this product that leaves the building in the mother's
 * hand. It is laid out to match the Mother and Child Protection card she
 * already carries, because that is the document the next clinician — at a
 * sub-centre, a camp, or a district hospital at 2 AM — knows how to read.
 *
 * Three constraints shape everything below.
 *
 *   It is a record, not a draft. Only a SAVED visit prints. An open
 *   consultation is a screen being typed into; putting it on paper would hand
 *   someone a prescription that the doctor may still be halfway through
 *   changing, with no way to tell from the sheet.
 *
 *   Every number on it is the number the consultation was reasoned from.
 *   Gestational age is read from `ga_days_at_visit`, frozen at save, and the
 *   due date is reconstructed from it — never recomputed from the pregnancy's
 *   dating as it stands today. Redating after a first-trimester scan is
 *   routine, and it must not silently rewrite the slip of a visit that
 *   happened before it.
 *
 *   Nothing here is a judgment. No value is marked high, low or abnormal; a
 *   laboratory's printed reference interval appears as a transcribed fact and
 *   nothing more (PRD §3). The danger-signs list is fixed text, identical on
 *   every slip this clinic prints.
 */

export const metadata = { title: 'Visit slip' }
export const dynamic = 'force-dynamic'

/**
 * How an absent value reads on paper.
 *
 * Every field on this slip either carries a value or says this. A blank beside
 * "Blood group" on a document a receiving unit reads under pressure is worse
 * than useless — it is read as "nothing to worry about" (ARCH-10, and see
 * `describeAllergies` for the same treatment of allergy state).
 */
const NOT_RECORDED = 'Not recorded'

/**
 * Danger signs, as printed on the government MCP card.
 *
 * FIXED TEXT. This list is identical on every slip, for every mother, at every
 * gestation. It is not assembled from her findings, not filtered by her
 * history, and not reordered by anything the system thinks is likelier for
 * her — doing any of that would turn a public-health leaflet into personalised
 * clinical advice, which this product does not give (PRD §3).
 *
 * Which also means: editing this array changes what every mother is told, so it
 * is a clinician's decision, not a developer's.
 */
const DANGER_SIGNS: readonly string[] = [
  'Bleeding from the vagina',
  'Severe headache, or blurred vision',
  'Fits, or loss of consciousness',
  'Fever with chills',
  'Reduced or absent movements of the baby',
  'Watery fluid leaking from the vagina',
  'Severe pain in the abdomen',
  'Vomiting that does not stop',
  'Swelling of the face and hands',
  'Difficulty in breathing',
]

/** How the visit's frozen dating method reads in a sentence. */
const DATING_METHOD_LABELS: Record<DatingMethod, string> = {
  LMP: 'dated by last menstrual period',
  ULTRASOUND: 'dated by ultrasound',
  CLINICAL_ESTIMATE: 'dated by clinical estimate',
  UNKNOWN: 'dating method not recorded',
}

const SCAN_TYPE_LABELS: Record<string, string> = {
  DATING: 'Dating scan',
  NT_NB: 'NT / NB',
  TIFFA: 'TIFFA (anomaly)',
  GROWTH: 'Growth',
  GROWTH_DOPPLER: 'Growth + Doppler',
  BPP: 'Biophysical profile',
  OTHER: 'Ultrasound',
}

export default async function VisitSlipPage({
  params,
}: {
  params: Promise<{ visitId: string }>
}) {
  const { visitId } = await params

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect(`/sign-in?next=/clinic/visits/${visitId}/slip`)

  const { actor } = session

  if (!roleHasPermission(actor.role, 'visit.read')) {
    return (
      <Refusal title="Not available to you">
        The visit slip is a copy of a consultation record. Your role
        ({actor.role.toLowerCase()}) does not include reading one.
      </Refusal>
    )
  }

  let visit: Visit
  let vitals: readonly VitalsReading[]
  try {
    const record = await getVisitWithVitals(actor, visitId)
    visit = record.visit
    vitals = record.vitals
  } catch (error) {
    if (error instanceof AppError && (error.kind === 'NOT_FOUND' || error.kind === 'FORBIDDEN')) {
      notFound()
    }
    throw error
  }

  // A slip is a record of what was decided, not of what is being typed. An open
  // visit has no frozen gestational age, its orders are still being edited, and
  // the sheet would carry no mark distinguishing it from a finished one.
  if (visit.status !== 'SAVED') {
    return (
      <Refusal title="This consultation has not been saved" patientId={visit.patientId}>
        {visit.status === 'OPEN'
          ? 'The slip prints what was decided at a consultation, so it can only be printed once the consultation has been saved. Finish it in the cockpit first.'
          : 'This visit was cancelled, so there is no consultation to print. A cancelled visit is not part of this pregnancy’s record.'}
      </Refusal>
    )
  }

  // Doctors only, and deliberately not softened the way the cockpit softens it.
  // The cockpit can show a nurse everything except the prescriptions and say so
  // on screen; a sheet of paper cannot. A slip printed without the medication
  // list is indistinguishable from a slip for a mother who was prescribed
  // nothing, and it is the mother who would act on the difference.
  if (!roleHasPermission(actor.role, 'prescription.read')) {
    return (
      <Refusal title="The slip is printed by the consulting doctor" patientId={visit.patientId}>
        Your role ({actor.role.toLowerCase()}) cannot read prescriptions, and a
        slip that left the medicines off would read as though none were
        prescribed. Ask the consulting doctor to print it.
      </Refusal>
    )
  }

  const pregnancy = await getPregnancy(actor, visit.pregnancyId)

  // The calendar day of the consultation in the clinic's own zone — not a UTC
  // slice of the timestamp, which moves a 00:30 IST visit to the previous day.
  const onDate = visitDate(visit, actor.clinicTimezone)

  // Fetched together: this page renders once, prints once, and has no reason to
  // arrive in pieces.
  const [patient, advice, prescriptions, results] = await Promise.all([
    getPatient(actor, visit.patientId),
    getVisitAdvice(actor, visit.id),
    listPrescriptions(actor, visit.pregnancyId),
    getPregnancyResults(actor, visit.pregnancyId),
  ])

  // What was written at THIS consultation. Drugs she was already taking are on
  // her previous slips; repeating them here would read as a fresh order and is
  // how a dose ends up doubled at home.
  const writtenHere = prescriptions.filter((p) => p.visitId === visit.id)

  /**
   * Dating exactly as this consultation held it.
   *
   * Reconstructed from the frozen gestational age and the date of the visit,
   * rather than read from the pregnancy's current anchor. Both numbers on the
   * slip then agree with each other and with what the doctor was looking at: a
   * redating done next month moves the record's EDD, and must not move this
   * one.
   */
  const datingAtVisit: DatingReference | null =
    // A negative frozen age means the anchor and the visit date contradict each
    // other. `formatGestationalAge` says "dating inconsistent" for that, and no
    // due date is printed beside it: arithmetic on a contradiction produces a
    // date that looks every bit as authoritative as a real one.
    visit.gaDaysAtVisit !== null && visit.gaDaysAtVisit >= 0
      ? { referenceDate: onDate, referenceGaDays: visit.gaDaysAtVisit }
      : null

  // Results are limited to those observed on or before the consultation. A
  // report that arrived afterwards is not what the advice below was given on,
  // and printing it beneath this date would misrepresent the consultation.
  const labs = results.observations.filter((o) => o.observedDate <= onDate)
  const scans = results.scans.filter((s) => s.scanDate <= onDate)

  return (
    <main className="mx-auto max-w-3xl px-6 py-6">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link
          href={`/clinic/patients/${visit.patientId}/cockpit`}
          className="text-sm text-brand-600 hover:underline"
        >
          ← {patient.fullName}
        </Link>
        <PrintButton />
      </div>

      <article className="print-slip mx-auto max-w-[148mm] rounded-xl border border-slate-200 bg-white px-8 py-6 text-slate-900">
        <header className="border-b-2 border-slate-900 pb-3">
          <h1 className="text-base font-bold">{actor.clinicName}</h1>
          <p className="mt-0.5 text-sm">
            Antenatal visit record · Mother and Child Protection card
          </p>
          <p className="numeric mt-0.5 text-sm">Visit date: {formatCalendarDate(onDate)}</p>
        </header>

        {/* ---- Who she is -------------------------------------------------- */}
        <Section title="Mother">
          <Row label="Name">{patient.fullName}</Row>
          <Row label="UHID">{patient.uhid}</Row>
          <Row label="Age">{formatAge(patient, onDate)}</Row>
          <Row label="Blood group">
            {/* The recorded group, printed plainly. Not "Anti-D due" — that
                depends on gestation, sensitising events and titres, and is the
                clinician's call, not a slip's. */}
            {patient.bloodGroup ? formatBloodGroup(patient.bloodGroup.value) : NOT_RECORDED}
          </Row>
          {/* On the slip because prescriptions are on the slip. "Allergies not
              recorded" is the house wording for a question nobody asked, and it
              must not be collapsed into a blank. */}
          <Row label="Allergies">{describeAllergies(patient.allergies)}</Row>
        </Section>

        {/* ---- Where this pregnancy was, on the day ------------------------ */}
        <Section title="This pregnancy">
          <Row label="LMP">
            {/* As the mother stated it, kept verbatim. It is not recomputed and
                not reconciled with the dating anchor: it is a record of what she
                said, and a redated pregnancy would otherwise carry two
                competing LMPs. */}
            {pregnancy.reportedLmp.date ? formatCalendarDate(pregnancy.reportedLmp.date) : NOT_RECORDED}
          </Row>
          <Row label="EDD">
            {datingAtVisit ? formatCalendarDate(estimatedDueDate(datingAtVisit)) : NOT_RECORDED}
          </Row>
          <Row label="Gestation on this date">
            {visit.gaDaysAtVisit !== null
              ? formatGestationalAge(splitGestationalAge(visit.gaDaysAtVisit))
              : 'Dating was not established at this visit'}
          </Row>
          {visit.datingMethodAtVisit !== null ? (
            <p className="mt-1 text-xs">{DATING_METHOD_LABELS[visit.datingMethodAtVisit]}</p>
          ) : null}
        </Section>

        {/* ---- What was measured ------------------------------------------ */}
        <Section title="Examination today">
          {vitals.length === 0 ? (
            <Absent>No observations were recorded at this visit.</Absent>
          ) : (
            <ul className="space-y-2">
              {vitals.map((reading) => (
                <li key={reading.id}>
                  {/* Every reading, not just the last. A blood pressure taken
                      again after fifteen minutes is the comparison the recheck
                      was performed to make, and it only exists if both survive
                      onto the paper. */}
                  {vitals.length > 1 ? (
                    <p className="text-xs font-semibold">Reading {reading.sequenceNo}</p>
                  ) : null}
                  {/* A reading can hold a note and no measurement. Rendering
                      the empty line anyway would print a label followed by
                      nothing, which is the blank this slip never shows. */}
                  {hasAnyMeasurement(reading) ? (
                    <p className="numeric text-sm">
                      {formatQuantities(vitalsAsQuantities(reading))}
                    </p>
                  ) : null}
                  {reading.note ? <p className="text-xs">{reading.note}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ---- What she was told to take ---------------------------------- */}
        <Section title="Medicines started today">
          {writtenHere.length === 0 ? (
            <Absent>No new medicine was prescribed at this visit.</Absent>
          ) : (
            <ol className="space-y-1.5">
              {writtenHere.map((prescription) => (
                <li key={prescription.id} className="text-sm">
                  {/* Spelled out by `formatPrescription`: "twice daily", never
                      "BD". The abbreviation is unambiguous to the doctor who
                      typed it and a known dosing error for everyone who reads
                      the line afterwards — starting with the person the sheet
                      belongs to. */}
                  {formatPrescription(prescription)}
                  <span className="numeric block text-xs">{durationLine(prescription)}</span>
                  {prescription.instructions ? (
                    <span className="block text-xs">{prescription.instructions}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* ---- What she was advised --------------------------------------- */}
        <Section title="Advice given">
          {advice === null ? (
            <Absent>No advice was recorded at this visit.</Absent>
          ) : (
            <AdviceBlock advice={advice} />
          )}
        </Section>

        {/* ---- Reports on record ------------------------------------------ */}
        {labs.length > 0 || scans.length > 0 ? (
          <Section title="Reports on record">
            {labs.length > 0 ? (
              <ul className="mb-2 space-y-1">
                {labs.map((observation) => (
                  <li key={observation.id} className="text-sm">
                    <LabLine observation={observation} />
                  </li>
                ))}
              </ul>
            ) : null}

            {scans.map((scan) => (
              <p key={scan.id} className="numeric text-sm">
                {SCAN_TYPE_LABELS[scan.scanType] ?? 'Ultrasound'} · {formatCalendarDate(scan.scanDate)}
                {scanMeasurements(scan) ? ` · ${scanMeasurements(scan)}` : ''}
              </p>
            ))}
          </Section>
        ) : null}

        {/* ---- Fixed public-health text ------------------------------------ */}
        <section className="mt-4 border-2 border-slate-900 px-3 py-2">
          <h2 className="text-sm font-bold">
            Come to the hospital at once if any of these happen
          </h2>
          <ul className="mt-1 columns-2 gap-4 text-sm">
            {DANGER_SIGNS.map((sign) => (
              <li key={sign} className="break-inside-avoid">
                • {sign}
              </li>
            ))}
          </ul>
          {/* Said in as many words, so nobody reads the box above as a list
              assembled from her own findings. */}
          <p className="mt-1.5 text-xs">
            This list is printed on every card and is the same for every mother.
          </p>
        </section>

        <footer className="mt-4 border-t border-slate-300 pt-2 text-xs">
          <p>Please bring this slip to every visit, and keep it with your MCP card.</p>
          <p className="numeric mt-0.5">
            Consultation saved
            {/* In the clinic's zone, like every other date here. A UTC slice of
                the timestamp names the previous day for anything saved after
                05:30 IST, which is most of the working day. */}
            {visit.closure.savedAt
              ? ` on ${formatClinicDate(visit.closure.savedAt, actor.clinicTimezone)}`
              : ''}{' '}
            · {actor.clinicName}
          </p>
        </footer>
      </article>
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

function AdviceBlock({ advice }: { advice: VisitAdvice }) {
  const counselled = adviceGiven(advice)

  return (
    <>
      {/* Only the items that were ticked. Printing the unticked ones — as empty
          boxes, or greyed out — puts advice on the page that was never given,
          and on a take-home sheet nobody is there to explain the difference. */}
      {counselled.length > 0 ? (
        <ul className="space-y-0.5 text-sm">
          {counselled.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ) : null}

      {advice.labOrders.length > 0 ? (
        <Row label="Tests to get done">{advice.labOrders.join(', ')}</Row>
      ) : null}

      {advice.scanOrders.length > 0 ? (
        <Row label="Scans to get done">{advice.scanOrders.join(', ')}</Row>
      ) : null}

      {advice.additionalAdvice ? (
        <p className="mt-1 text-sm whitespace-pre-wrap">{advice.additionalAdvice}</p>
      ) : null}

      {/* Always printed, present or absent. A mother who was given no date and
          a mother whose date was never written down both need to know which of
          the two happened before she leaves. */}
      <Row label="Next visit">
        {advice.nextFollowupDate ? formatCalendarDate(advice.nextFollowupDate) : NOT_RECORDED}
      </Row>
    </>
  )
}

function LabLine({ observation }: { observation: Observation }) {
  const range = formatReferenceRange(observation.referenceRange)

  return (
    <span className="numeric">
      {observation.testName} {formatObservationValue(observation.value)} ·{' '}
      {formatCalendarDate(observation.observedDate)}
      {/*
        The interval the laboratory printed, transcribed and attributed. The
        cockpit additionally marks a value that sits outside it, for a clinician
        reading with the rest of the record in front of them; that marker is
        deliberately absent here. On a sheet read at home with no context, it is
        one short step from being read as a diagnosis, and the system does not
        make one (PRD §3).
      */}
      {range ? <span className="block text-xs">Laboratory’s stated range: {range}</span> : null}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `2026-09-22` → `22 Sep 2026`.
 *
 * Parsed as UTC rather than as a local instant. A `CalendarDate` is a calendar
 * fact with no time in it; handing the string to `new Date` and formatting it
 * in a zone behind UTC prints the previous day, which is precisely the class of
 * one-day error the dating module exists to prevent.
 */

/**
 * `BP 128/84 mmHg · Weight 58.2 kg · Urine albumin 1+`.
 *
 * The unit comes from the quantity, never from this file (ARCH-9). The two
 * dipstick grades carry an empty unit because `1+` and `Nil` are complete
 * readings in themselves — that is an absent unit, not a dropped one.
 */
function formatQuantities(quantities: readonly Quantity[]): string {
  return quantities
    .map((q) => `${q.label} ${q.value}${q.unit ? ` ${q.unit}` : ''}`)
    .join(' · ')
}

/** Her age as the record actually knows it, or a statement that it does not. */
function formatAge(patient: Patient, on: CalendarDate): string {
  const years = ageInYears(patient.age, on)
  return years === null ? NOT_RECORDED : `${years} years`
}

/**
 * How long to take it for, and from when.
 *
 * A course with no duration says so. "Ferrous ascorbate, twice daily" with
 * nothing after it is read as "until told otherwise", and iron is exactly the
 * drug a mother keeps taking for months because the slip never said to stop.
 */
function durationLine(prescription: Prescription): string {
  const from = `from ${formatCalendarDate(prescription.startDate)}`

  if (prescription.durationDays !== null) {
    return `${prescription.durationDays} days, ${from}`
  }
  if (prescription.endDate !== null) {
    return `${from} until ${formatCalendarDate(prescription.endDate)}`
  }
  return `${from} · duration not recorded, ask at your next visit`
}

/** The scan's measurements, each with its unit, or an empty string. */
function scanMeasurements(scan: ScanReport): string {
  return [
    scan.efwGrams !== null ? `EFW ${scan.efwGrams} g` : null,
    scan.afiCm !== null ? `AFI ${scan.afiCm} cm` : null,
    // Presentation travels with the study that observed it and its date, never
    // on its own: before term it changes, and a bare "breech" on a slip printed
    // in August is read as current in October.
    scan.presentation !== 'NOT_ASSESSED' ? scan.presentation.toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 border-b border-slate-300 pb-2 last-of-type:border-b-0">
      <h2 className="mb-1 text-xs font-bold tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex gap-2 text-sm">
      <span className="w-36 shrink-0">{label}</span>
      <span className="numeric font-medium">{children}</span>
    </p>
  )
}

/** A section with nothing in it says so, in a sentence, every time. */
function Absent({ children }: { children: React.ReactNode }) {
  return <p className="text-sm">{children}</p>
}

/**
 * The page when there is nothing to print.
 *
 * Carries no `print-slip`, so the print rule never engages and a stray Ctrl+P
 * produces the ordinary page rather than a half-slip that looks official.
 */
function Refusal({
  title,
  patientId,
  children,
}: {
  title: string
  /** Absent before the visit has been read, when there is nowhere to go back to. */
  patientId?: string
  children: React.ReactNode
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{children}</p>
        {/* Written out here rather than passed in: Next's typed routes check
            the literal at the call site, and a `string` prop is not one. */}
        {patientId ? (
          <Link
            href={`/clinic/patients/${patientId}/cockpit`}
            className="mt-4 inline-block text-sm text-brand-600 hover:underline"
          >
            Back to the consultation
          </Link>
        ) : null}
      </section>
    </main>
  )
}
