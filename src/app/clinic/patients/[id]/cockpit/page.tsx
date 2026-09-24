import {
  Activity,
  ArrowLeft,
  Baby,
  CalendarHeart,
  FolderOpen,
  History,
  IdCard,
  ListChecks,
  Send,
  NotebookPen,
  Pill as PillIcon,
  Star,
  Stethoscope,
  Syringe,
} from 'lucide-react'
import Link, { type LinkProps } from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Accordion } from '@components/cockpit/accordion'
import { HeaderBanner } from '@components/cockpit/header-banner'
import { Sparkline } from '@components/cockpit/sparkline'
import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { formatGestationalAge, splitGestationalAge, todayIn } from '@core/obstetrics/dating'
import { getPatientHistory, type PatientHistory } from '@modules/history/history.service'
import {
  describeFoodRelation,
  describeFrequency,
  formatDosing,
  formatDrug,
  type Prescription,
} from '@modules/orders/order.types'
import { listOngoingPrescriptions } from '@modules/orders/order.service'
import { getPatient } from '@modules/patients/patient.service'
import { getActivePregnancyWithHistory } from '@modules/pregnancies/pregnancy.service'
import { getPregnancyResults, listAwaitingVerification } from '@modules/reports/report.service'
import {
  type ReportType,
  type ReportWithExtraction,
  defaultCategoryFor,
  formatCandidateValue,
  formatObservationValue,
  formatReferenceRange,
  isFixtureExtraction,
  isOutsidePrintedRange,
  type Observation,
  type ScanReport,
} from '@modules/reports/report.types'
import {
  getFirstRecordedWeightKg,
  getOpenVisit,
  getVisitWithVitals,
  listClinicDoctors,
  listDoctorReferences,
  listVisits,
} from '@modules/visits/visit.service'
import type { VitalsReading } from '@modules/visits/visit.types'
import { listForPatient as listVoiceQueries } from '@modules/voice/voice.service'
import { listUpcomingAppointments } from '@modules/schedule/schedule.service'
import { describeRouting, type VoiceQuery } from '@modules/voice/voice.types'

import { ConsultationDraftProvider, type PendingReport } from './consultation-draft'
import { ConsultationForm } from './consultation-form'
import { DiagnosticReports, type QueryView, StagedSignificant } from './diagnostic-reports'
import { ImmunizationPanel } from './immunization-history'
import { MenstrualHistoryPanel } from './menstrual-history'
import { ObstetricHistoryPanel } from './obstetric-history'
import { ViewOriginalButton } from './original-viewer'
import { NextVisitChip, StartConsultationButton } from './visit-buttons'

/**
 * The consultation cockpit (PRD F3–F7).
 *
 * One screen, read in a single pass: the patient banner, the reports and
 * queries waiting on the doctor, her medication and results, her history, and
 * then everything the doctor writes — examination, the plan, a reference — all
 * committed together by one Save & Next.
 */

export const metadata = { title: 'Cockpit' }
export const dynamic = 'force-dynamic'

const SCAN_TYPE_LABELS: Record<string, string> = {
  DATING: 'Dating scan',
  NT_NB: 'NT / NB',
  TIFFA: 'TIFFA (anomaly)',
  GROWTH: 'Growth',
  GROWTH_DOPPLER: 'Growth + Doppler',
  BPP: 'Biophysical profile',
  OTHER: 'Ultrasound',
}

/** What each kind of slip is called on its card, and in the one-line summary. */
const REPORT_TITLES: Record<ReportType | 'UNKNOWN', [title: string, short: string]> = {
  CBC: ['CBC (Complete Blood Count)', 'CBC'],
  OGTT: ['OGTT (Glucose tolerance)', 'OGTT'],
  SEROLOGY: ['Serology / viral markers', 'Serology'],
  URINE: ['Urine Routine & Microscopy', 'Urine'],
  BLOOD_GROUP: ['Blood group & Rh', 'Blood group'],
  THYROID: ['Thyroid profile', 'Thyroid'],
  LFT: ['Liver function tests', 'LFT'],
  RFT: ['Renal function tests', 'RFT'],
  HPLC: ['HPLC (Haemoglobinopathy)', 'HPLC'],
  ULTRASOUND: ['Obstetric ultrasound (USG)', 'USG'],
  OTHER: ['Report', 'Report'],
  UNRECOGNISED: ['Unrecognised report', 'Report'],
  UNKNOWN: ['Report', 'Report'],
}

export default async function CockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect(`/sign-in?next=/clinic/patients/${id}/cockpit`)

  const { actor } = session

  if (!roleHasPermission(actor.role, 'observation.read')) {
    return (
      <Shell>
        <Panel>
          <h1 className="font-heading text-lg font-bold tracking-tight text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm text-slate-600">
            The cockpit shows a patient&rsquo;s full clinical record. Your role ({actor.role.toLowerCase()}) does
            not include it.
          </p>
        </Panel>
      </Shell>
    )
  }

  const canSave = roleHasPermission(actor.role, 'visit.save')

  // Stage 1 — everything that needs only the patient id, fetched at once.
  // Each read is a round trip to Mumbai; issuing them one after another is
  // what made the cockpit slow, not any single query.
  const [patientResult, episode, voiceQueries, history, upcoming, doctors] = await Promise.all([
    getPatient(actor, id).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    getActivePregnancyWithHistory(actor, id),
    // Addressed ones too: the widget counts both, purple and green.
    roleHasPermission(actor.role, 'query.read') ? listVoiceQueries(actor, id, true) : Promise.resolve([]),
    roleHasPermission(actor.role, 'patient.read')
      ? getPatientHistory(actor, id)
      : Promise.resolve<PatientHistory>({ obstetric: [], menstrual: [], immunizations: [] }),
    listUpcomingAppointments(actor, id),
    canSave ? listClinicDoctors(actor) : Promise.resolve([]),
  ])

  if (!patientResult.ok) {
    const error = patientResult.error
    if (error instanceof AppError && (error.kind === 'NOT_FOUND' || error.kind === 'FORBIDDEN')) {
      notFound()
    }
    throw error
  }
  const patient = patientResult.value

  if (!episode) {
    return (
      <Shell>
        <Panel>
          <h1 className="font-heading text-lg font-bold tracking-tight text-slate-900">No open pregnancy</h1>
          <p className="mt-2 text-sm text-slate-600">
            The cockpit shows one antenatal episode. {patient.fullName} ({patient.uhid}) has none open —
            book this pregnancy to open her cockpit.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {roleHasPermission(actor.role, 'pregnancy.create') ? (
              <Link
                href={`/clinic/patients/${id}/pregnancy/new`}
                className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
              >
                Book this pregnancy
              </Link>
            ) : null}
            <Link href={`/clinic/patients/${id}`} className="text-sm text-brand-600 hover:underline">
              Her record
            </Link>
          </div>
        </Panel>
      </Shell>
    )
  }

  const { pregnancy, obstetricHistory } = episode
  const today = todayIn(actor.clinicTimezone)

  // Stage 2 — everything that hangs off the pregnancy, fetched at once. The
  // trend and the tables come from the same observation read.
  const [results, visits, openVisitWithVitals, pendingReports, references, firstWeightKg, ongoing] =
    await Promise.all([
      getPregnancyResults(actor, pregnancy.id),
      listVisits(actor, pregnancy.id),
      getOpenVisit(actor, pregnancy.id).then(async (visit) => ({
        visit,
        latest: visit ? ((await getVisitWithVitals(actor, visit.id)).vitals.at(-1) ?? null) : null,
      })),
      // Read, unreviewed reports. Only a clinician can act on these.
      roleHasPermission(actor.role, 'observation.verify')
        ? listAwaitingVerification(actor, pregnancy.id)
        : Promise.resolve([]),
      listDoctorReferences(actor, pregnancy.id),
      // The baseline weight gain is shown against, when none was taken at booking.
      pregnancy.prePregnancyWeightKg === null
        ? getFirstRecordedWeightKg(actor, pregnancy.id)
        : Promise.resolve(null),
      // Prescription data is doctor-only, by the matrix and independently by RLS.
      roleHasPermission(actor.role, 'prescription.read')
        ? listOngoingPrescriptions(actor, pregnancy.id, today)
        : Promise.resolve<Prescription[]>([]),
    ])

  const openVisit = openVisitWithVitals.visit
  const latestVitals: VitalsReading | null = openVisitWithVitals.latest

  const baselineWeightKg = pregnancy.prePregnancyWeightKg ?? firstWeightKg

  const labs = results.observations.filter((o) => o.category !== 'OTHER')
  const significantLabs = labs.filter((o) => o.isPinned)
  const flaggedScanFindings = results.observations.filter((o) => o.category === 'OTHER' && o.isPinned)
  const hbTrend = results.trends.find((t) => t.testCode === 'hb')

  const reports = pendingReports.map(toPendingReport)
  const queries = voiceQueries.map(toQueryView)

  const canDecide = canSave && openVisit !== null
  const blockedReason = !canSave
    ? 'Reviewing reports is a clinician act; your role can see them but not decide on them.'
    : !openVisit
      ? 'Start today’s consultation to flag or review these — decisions are saved with it.'
      : null
  const canOpenVisit = roleHasPermission(actor.role, 'visit.open')

  return (
    <Shell>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/clinic"
          className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100/90 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-brand-800"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          <span>Today’s patients</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <NavChip href={`/clinic/patients/${id}/reports`} icon={<FolderOpen className="h-4 w-4" />}>
            Reports
            {pendingReports.length > 0 ? (
              <span className="numeric ml-1.5 rounded-full bg-brand-800 px-1.5 text-[10px] font-bold text-white">
                {pendingReports.length} new
              </span>
            ) : null}
          </NavChip>
          <NavChip href={`/clinic/patients/${id}/visit`} icon={<Stethoscope className="h-4 w-4" />}>
            Today’s vitals
          </NavChip>
          <NavChip href={`/clinic/patients/${id}/card`} icon={<IdCard className="h-4 w-4" />}>
            Patient card
          </NavChip>
          <NextVisitChip
            patientId={patient.id}
            pregnancyId={pregnancy.id}
            upcoming={upcoming}
            canSchedule={canOpenVisit}
            today={today}
          />
        </div>
      </div>

      <HeaderBanner
        patient={patient}
        pregnancy={pregnancy}
        obstetricHistory={obstetricHistory}
        latestVitals={latestVitals}
        baselineWeightKg={baselineWeightKg}
        today={today}
      />

      {!openVisit && canOpenVisit ? (
        <section className="no-print flex flex-col items-start justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-700">
            <strong className="font-semibold text-slate-900">No consultation is open today.</strong>{' '}
            {canSave
              ? 'Start one to review reports, examine, prescribe and refer — everything saves together.'
              : 'Start today’s visit to record her vitals.'}
          </p>
          <StartConsultationButton
            patientId={patient.id}
            pregnancyId={pregnancy.id}
            label={canSave ? 'Start today’s consultation' : 'Start today’s visit'}
          />
        </section>
      ) : null}

      <ConsultationDraftProvider>
        <DiagnosticReports
          reports={reports}
          queries={queries}
          canDecide={canDecide}
          canAddress={canDecide}
          blockedReason={blockedReason}
          upload={
            roleHasPermission(actor.role, 'upload.create')
              ? { patientId: patient.id, pregnancyId: pregnancy.id, visitId: openVisit?.id ?? null }
              : null
          }
        />

        <div className="flex flex-col gap-2.5">
          {/* Ongoing medication, in the prescription pad's own notation. */}
          <Accordion
            title="Active medication"
            summary={`${ongoing.length} active`}
            icon={<PillIcon className="h-4.75 w-4.75" />}
            isEmpty={ongoing.length === 0}
            emptyMessage={
              roleHasPermission(actor.role, 'prescription.read')
                ? 'Nothing currently prescribed.'
                : 'Prescriptions are visible to the consulting doctor.'
            }
          >
            <div className="overflow-x-auto rounded-lg border border-slate-200/70">
              <table className="numeric w-full min-w-[560px] border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-[10.5px] font-semibold tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-2.5 py-1.5">Drug</th>
                    <th className="px-2.5 py-1.5">Dosing</th>
                    <th className="px-2.5 py-1.5">Food</th>
                    <th className="px-2.5 py-1.5">Duration</th>
                    <th className="px-2.5 py-1.5">Since</th>
                  </tr>
                </thead>
                <tbody>
                  {ongoing.map((prescription) => (
                    <tr key={prescription.id} className="border-t border-slate-100 bg-white">
                      <td className="px-2.5 py-1.5 font-semibold text-slate-900">{formatDrug(prescription)}</td>
                      <td className="px-2.5 py-1.5" title={describeFrequency(prescription.frequency)}>
                        <span className="rounded bg-brand-50 px-1.5 py-0.5 font-bold text-brand-800">
                          {formatDosing(prescription.frequency)}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 text-slate-600">
                        {describeFoodRelation(prescription.foodRelation) ?? '—'}
                      </td>
                      <td className="px-2.5 py-1.5 text-slate-600">
                        {prescription.durationDays !== null ? `${prescription.durationDays} days` : '—'}
                      </td>
                      <td className="px-2.5 py-1.5 text-slate-500">{prescription.startDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Accordion>

          {/* Significant labs: what a clinician flagged. The trend still draws
              on every verified value, pinned or not. */}
          <Accordion
            title="Significant blood & urine reports"
            summary={`${significantLabs.length} significant · ${labs.length} verified`}
            icon={<Activity className="h-4.75 w-4.75" />}
            defaultOpen
          >
            <div className="flex flex-col gap-2.5">
              <StagedSignificant reports={reports} kind="LAB" />
              {labs.length === 0 ? <p className="text-xs text-slate-500">No verified results yet.</p> : null}
              {hbTrend ? (
                <div className="rounded-lg border border-slate-200/60 bg-slate-50/70 p-3">
                  <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                    {hbTrend.testName} trajectory
                  </p>
                  <Sparkline series={hbTrend} />
                  <p className="mt-1.5 text-[11px] text-slate-500">Every verified value in this pregnancy, flagged or not.</p>
                </div>
              ) : null}

              {significantLabs.length > 0 ? (
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {significantLabs.map((observation) => (
                    <LabRow key={observation.id} observation={observation} />
                  ))}
                </ul>
              ) : labs.length > 0 ? (
                <p className="text-xs text-slate-500">
                  Nothing flagged as significant yet. Flag a report from the panel above to bring it here.
                </p>
              ) : null}

              {labs.length > significantLabs.length ? (
                <details className="group rounded-lg border border-slate-200/70 bg-white">
                  <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-slate-600 select-none hover:text-brand-800 [&::-webkit-details-marker]:hidden">
                    All verified results ({labs.length})
                  </summary>
                  <ul className="grid grid-cols-1 gap-2 border-t border-slate-100 p-2.5 md:grid-cols-2">
                    {labs.map((observation) => (
                      <LabRow key={observation.id} observation={observation} />
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          </Accordion>

          <Accordion
            title="Significant scans (milestones)"
            summary={`${results.scans.length} on file`}
            icon={<Baby className="h-4.75 w-4.75" />}
            defaultOpen
          >
            <div className="flex flex-col gap-2.5">
              <StagedSignificant reports={reports} kind="SCAN" />
              {results.scans.length === 0 && flaggedScanFindings.length === 0 ? (
                <p className="text-xs text-slate-500">No verified scans yet.</p>
              ) : null}
              {results.scans.length > 0 ? (
                <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                  {results.scans.map((scan, index) => (
                    // The most recent study is tinted — a statement about recency and nothing else.
                    <ScanRow key={scan.id} scan={scan} isLatest={index === 0} />
                  ))}
                </ul>
              ) : null}
              {flaggedScanFindings.length > 0 ? (
                <div className="rounded-lg border border-slate-200/60 bg-slate-50/60 p-3">
                  <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                    Flagged scan findings
                  </p>
                  <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {flaggedScanFindings.map((observation) => (
                      <LabRow key={observation.id} observation={observation} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Accordion>

          <Accordion
            title="Previous obstetric history"
            summary={`${history.obstetric.length} recorded`}
            icon={<History className="h-4.75 w-4.75" />}
          >
            <ObstetricHistoryPanel
              patientId={patient.id}
              history={history.obstetric}
              canEdit={roleHasPermission(actor.role, 'patient.update')}
            />
          </Accordion>

          <Accordion
            title="Previous menstrual history"
            summary={
              history.menstrual[0] ? `last taken ${history.menstrual[0].recordedOn}` : 'not taken'
            }
            icon={<CalendarHeart className="h-4.75 w-4.75" />}
          >
            <MenstrualHistoryPanel
              patientId={patient.id}
              history={history.menstrual}
              canEdit={roleHasPermission(actor.role, 'patient.update')}
            />
          </Accordion>

          <Accordion
            title="Immunization history"
            summary={immunizationSummary(history, pregnancy.id)}
            icon={<Syringe className="h-4.75 w-4.75" />}
          >
            <ImmunizationPanel
              patientId={patient.id}
              pregnancyId={pregnancy.id}
              records={history.immunizations}
              canRecord={roleHasPermission(actor.role, 'medication_administration.record')}
            />
          </Accordion>

          <Accordion
            title="Visits this pregnancy"
            summary={`${visits.length} visits`}
            icon={<ListChecks className="h-4.75 w-4.75" />}
            isEmpty={visits.length === 0}
            emptyMessage="No visits recorded in this pregnancy yet."
          >
            <ul className="numeric flex flex-col gap-1">
              {visits.map((visit) => (
                <li
                  key={visit.id}
                  className="flex flex-wrap items-center gap-2 rounded border border-slate-100 bg-white px-2 py-1.5 text-xs text-slate-700"
                >
                  <span className="font-semibold text-slate-900">{visit.occurredAt.slice(0, 10)}</span>
                  {/* Frozen at save, never recomputed. */}
                  {visit.gaDaysAtVisit !== null ? (
                    <span>{formatGestationalAge(splitGestationalAge(visit.gaDaysAtVisit))}</span>
                  ) : null}
                  <span className="text-[10px] text-slate-500">{visit.status.toLowerCase()}</span>
                  {visit.diagnosis ? (
                    <span className="min-w-0 truncate text-[11px] text-slate-600">· {visit.diagnosis}</span>
                  ) : null}
                  {visit.status === 'SAVED' ? (
                    <Link
                      href={`/clinic/visits/${visit.id}/slip`}
                      className="no-print ml-auto text-[11px] font-medium text-brand-600 hover:underline"
                    >
                      print slip
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </Accordion>

          {openVisit && canSave ? (
            <ConsultationForm
              visitId={openVisit.id}
              visitDate={openVisit.occurredAt.slice(0, 10)}
              expectedVersion={openVisit.version}
              current={{
                impression: openVisit.impression,
                examination: openVisit.examination,
                diagnosis: openVisit.diagnosis,
                summary: openVisit.consultationSummary,
              }}
              reports={reports}
              doctors={doctors}
              priorReferences={references}
            />
          ) : (
            <>
              <Accordion
                title="Examination & fresh orders"
                icon={<NotebookPen className="h-4.75 w-4.75" />}
                tone="emphasis"
                defaultOpen
              >
                <div className="flex flex-col items-start gap-2.5">
                  <p className="text-xs leading-relaxed text-slate-600">
                    {!openVisit
                      ? 'Examination, diagnosis, prescriptions, orders and the reference to another doctor are recorded against today’s consultation.'
                      : `Finishing a consultation is a clinician act. Your role (${actor.role.toLowerCase()}) can record vitals, history, immunizations and reports, but not examine, prescribe or refer.`}
                  </p>
                  {!openVisit && canOpenVisit ? (
                    <StartConsultationButton
                      patientId={patient.id}
                      pregnancyId={pregnancy.id}
                      label={canSave ? 'Start today’s consultation' : 'Start today’s visit'}
                    />
                  ) : null}
                </div>
              </Accordion>
              <Accordion
                title="Reference — refer to a doctor"
                icon={<Send className="h-4.5 w-4.5" />}
                summary={references.length > 0 ? `${references.length} earlier` : undefined}
              >
                <div className="flex flex-col gap-2">
                  {canSave ? (
                    <p className="text-xs text-slate-600">
                      Start today’s consultation to refer her to a registered doctor or an outside
                      specialist; the reference is saved with it.
                    </p>
                  ) : null}
                  {references.length === 0 ? (
                    <p className="text-xs text-slate-500">No references in this pregnancy.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {references.map((ref) => (
                        <li key={ref.id} className="rounded border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs">
                          <span className="font-semibold text-slate-900">
                            {ref.recipient.kind === 'COLLEAGUE'
                              ? (ref.recipient.displayName ?? 'Registered doctor')
                              : ref.recipient.name}
                          </span>
                          {ref.specialty ? <span className="text-slate-500"> · {ref.specialty}</span> : null}
                          <span className="numeric ml-2 text-[10px] text-slate-500">{ref.createdAt.slice(0, 10)}</span>
                          <p className="mt-0.5 text-[11px] text-slate-600">{ref.reason}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Accordion>
            </>
          )}
        </div>
      </ConsultationDraftProvider>
    </Shell>
  )
}

/* -------------------------------------------------------------------------- */
/* View-model builders                                                        */
/* -------------------------------------------------------------------------- */

function toPendingReport(report: ReportWithExtraction): PendingReport {
  const { extraction, upload } = report
  const type: ReportType | 'UNKNOWN' =
    extraction.status === 'READY' ? (extraction.reportType ?? 'UNKNOWN') : 'UNKNOWN'
  const [title, shortTitle] = REPORT_TITLES[type]
  const uploaded = upload.uploadedAt.slice(0, 10)

  const base = {
    uploadId: upload.id,
    contentType: upload.contentType,
    title,
    shortTitle,
    kind: type === 'ULTRASOUND' ? ('SCAN' as const) : ('LAB' as const),
    fromFixture: isFixtureExtraction(extraction),
  }

  if (extraction.status !== 'READY') {
    return {
      ...base,
      date: uploaded,
      status: extraction.status,
      statusNote:
        extraction.status === 'FAILED'
          ? `Could not be read${extraction.errorMessage ? ` — ${extraction.errorMessage}` : ''}. Open Reports to retry.`
          : extraction.status === 'IN_PROGRESS'
            ? 'Being read now.'
            : 'Waiting to be read.',
      values: [],
    }
  }

  const candidates = extraction.candidates.filter((candidate) => !candidate.isDiscarded)
  const category = defaultCategoryFor(extraction.reportType)

  return {
    ...base,
    date: candidates.find((c) => c.observedDate)?.observedDate ?? uploaded,
    status: 'READY',
    statusNote: candidates.length === 0 ? 'Nothing could be read off this slip.' : null,
    values: candidates.map((candidate) => ({
      candidateId: candidate.id,
      correctionVersion: candidate.correctionVersion,
      // The printed label, because that is what the slip in hand says.
      label: candidate.printedLabel ?? candidate.testCode,
      value: formatCandidateValue(candidate.value),
      printedRange: formatReferenceRange(candidate.referenceRange),
      outsidePrintedRange:
        candidate.value.kind === 'NUMERIC'
          ? isOutsidePrintedRange(
              {
                kind: 'NUMERIC',
                value: candidate.value.value,
                unit: candidate.value.unit,
                normalizedUnit: candidate.value.unit,
                normalizedValue: candidate.value.value,
              },
              candidate.referenceRange,
            )
          : null,
      confidence: candidate.confidence,
      defaultCategory: category,
    })),
  }
}

function toQueryView(query: VoiceQuery): QueryView {
  const { processing } = query
  return {
    id: query.id,
    receivedAt: query.receivedAt,
    state: processing.state,
    original: processing.state === 'READY' ? processing.original : null,
    english: processing.state === 'READY' ? processing.english || null : null,
    error: processing.state === 'FAILED' ? processing.error : null,
    routingLabel: describeRouting(query.routingBucket),
    isPriority: query.routingBucket === 'PRIORITY_REVIEW',
    isFixture: processing.state === 'READY' && processing.isFixture,
    resolvedAt: query.resolvedAt,
  }
}

function immunizationSummary(history: PatientHistory, pregnancyId: string): string {
  const current = history.immunizations.filter((r) => r.pregnancyId === pregnancyId)
  const given = current.filter((r) => r.status === 'GIVEN').length
  const pending = current.filter((r) => r.status === 'PLANNED').length
  if (current.length === 0) return 'none recorded'
  return [given > 0 ? `${given} given` : null, pending > 0 ? `${pending} pending` : null]
    .filter(Boolean)
    .join(' · ') || `${current.length} recorded`
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

function LabRow({ observation }: { observation: Observation }) {
  const range = formatReferenceRange(observation.referenceRange)
  const outside = isOutsidePrintedRange(observation.value, observation.referenceRange)
  // Red only because a clinician flagged it — never because of the range.
  const flagged = observation.flaggedByClinician === true

  return (
    <li
      className={`numeric flex items-center justify-between gap-3 rounded border p-2.5 text-xs ${
        flagged ? 'border-alert-200 bg-alert-50/50' : 'border-slate-200/60 bg-slate-50/70'
      }`}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-semibold text-slate-900">
          <span className="truncate">{observation.testName}</span>
          {observation.isPinned ? (
            <Star
              className="h-3.5 w-3.5 shrink-0 fill-caution-600 text-caution-600"
              aria-label="flagged to the cockpit by a clinician"
            />
          ) : null}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-slate-500">
          {observation.observedDate}
          {observation.sourceUploadId ? (
            <ViewOriginalButton uploadId={observation.sourceUploadId} title={observation.testName} />
          ) : null}
        </span>
        {observation.clinicianNote ? (
          <span className="block text-[11px] text-slate-600 italic">{observation.clinicianNote}</span>
        ) : null}
      </span>

      <span className="shrink-0 text-right">
        <span className={`block font-bold ${flagged ? 'text-alert-700' : 'text-slate-900'}`}>
          {formatObservationValue(observation.value)}
        </span>
        {range ? (
          <span className="block text-[10px] text-slate-500">
            lab range {range}
            {/* A comparison against the printed interval, never "abnormal" (PRD §3). */}
            {outside === true ? <span className="ml-1 font-semibold text-caution-700">outside</span> : null}
          </span>
        ) : null}
      </span>
    </li>
  )
}

function ScanRow({ scan, isLatest }: { scan: ScanReport; isLatest: boolean }) {
  const measurements = [
    scan.efwGrams !== null ? `EFW ${scan.efwGrams} g` : null,
    scan.efwCentile !== null ? `${scan.efwCentile}th centile` : null,
    scan.afiCm !== null ? `AFI ${scan.afiCm} cm` : null,
    scan.cervicalLengthMm !== null ? `Cervix ${scan.cervicalLengthMm} mm` : null,
    // Presentation lives with the study that observed it, dated — never on the banner.
    scan.presentation !== 'NOT_ASSESSED' ? scan.presentation.toLowerCase() : null,
    scan.placentaPosition,
  ].filter(Boolean)

  return (
    <li
      className={`flex flex-col gap-1 rounded-lg border p-2.5 text-xs ${
        isLatest ? 'border-brand-200 bg-brand-50/60' : 'border-slate-200/70 bg-slate-50/70'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`numeric flex items-center gap-1.5 font-bold ${isLatest ? 'text-brand-800' : 'text-slate-900'}`}>
          <span className="truncate">{SCAN_TYPE_LABELS[scan.scanType] ?? 'Ultrasound'}</span>
          {scan.isPinned ? (
            <Star className="h-3.5 w-3.5 shrink-0 fill-caution-600 text-caution-600" aria-label="pinned to the cockpit by a clinician" />
          ) : null}
        </span>
        {isLatest ? (
          <span className="numeric shrink-0 rounded bg-brand-800 px-1.5 text-[10px] font-bold text-white">Latest</span>
        ) : null}
      </div>

      <span className="numeric text-[11px] text-slate-500">
        {scan.scanDate}
        {scan.gaDaysAtScan !== null ? ` · ${formatGestationalAge(splitGestationalAge(scan.gaDaysAtScan))}` : ''}
      </span>

      {measurements.length > 0 ? (
        <ul className="numeric mt-0.5 space-y-0.5 text-[11px] font-medium text-slate-700">
          {measurements.map((measurement, index) => (
            <li key={index}>• {measurement}</li>
          ))}
        </ul>
      ) : null}

      {scan.impression ? <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{scan.impression}</p> : null}
    </li>
  )
}

/**
 * A quick-access chip in the cockpit's own nav row. Generic over the route so
 * Next's typed-routes check still happens at the call site.
 */
function NavChip<TRoute>({
  href,
  icon,
  children,
}: {
  href: LinkProps<TRoute>['href']
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100/90 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-brand-800"
    >
      <span aria-hidden className="text-slate-500">
        {icon}
      </span>
      <span className="flex items-center">{children}</span>
    </Link>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  // Wide and dense: this is a 1080p+ clinical screen.
  return <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 sm:p-5">{children}</main>
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="glass rounded-xl border border-slate-200/90 p-5 shadow-xs">{children}</section>
}
