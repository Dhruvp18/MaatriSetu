import {
  Activity,
  ArrowLeft,
  Baby,
  CalendarHeart,
  ClipboardList,
  FolderOpen,
  History,
  IdCard,
  ListChecks,
  MessageSquareText,
  Send,
  NotebookPen,
  Pill as PillIcon,
  Stethoscope,
  Syringe,
  Users,
} from 'lucide-react'
import Link, { type LinkProps } from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { annotateObservationAction } from './report-actions'
import { Accordion } from '@components/cockpit/accordion'
import { BirthPlanPanel } from './birth-plan'
import { HeaderBanner } from '@components/cockpit/header-banner'
import { VitalsPanel } from '@components/cockpit/vitals-panel'
import { Sparkline } from '@components/cockpit/sparkline'
import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { TERM_DAYS, addDays, formatGestationalAge, splitGestationalAge, todayIn } from '@core/obstetrics/dating'
import { listOpenFlaggedDiagnoses } from '@modules/diagnoses/diagnosis.service'
import type { FlaggedDiagnosis } from '@modules/diagnoses/diagnosis.types'
import { getPatientHistory, type PatientHistory } from '@modules/history/history.service'
import { listMyMasterPacks } from '@modules/master-packs/master-pack.service'
import type { MasterPack } from '@modules/master-packs/master-pack.types'
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
  listVitalsForVisits,
} from '@modules/visits/visit.service'
import type { Visit, VitalsReading } from '@modules/visits/visit.types'
import { listForPatient as listVoiceQueries } from '@modules/voice/voice.service'
import { listUpcomingAppointments } from '@modules/schedule/schedule.service'
import { describeRouting, type VoiceQuery } from '@modules/voice/voice.types'

import { ConsultationDraftProvider, type PendingReport } from './consultation-draft'
import { ChiefComplaintsSection } from './chief-complaints'
import { ConsultationForm } from './consultation-form'
import { DiagnosticReports, type QueryView, StagedSignificant } from './diagnostic-reports'
import { DiagnosisFlagger, FlaggedDiagnosisPills } from './flagged-diagnoses'
import { ImmunizationPanel } from './immunization-history'
import { MenstrualHistoryPanel } from './menstrual-history'
import { FamilyHistoryPanel } from './family-history'
import { ObstetricHistoryPanel } from './obstetric-history'
import { PastHistoryPanel } from './past-history'
import { PregnancyProfilePanel } from './pregnancy-profile'
import { ViewOriginalButton } from './original-viewer'
import { SectionNav } from './section-nav'
import { ViewAllList } from './view-all-list'
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

/** Ties Chief complaints, rendered high on the page, to the consultation <form> below. */
const CONSULTATION_FORM_ID = 'consultation-form'
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
  const [patientResult, episode, voiceQueries, history, upcoming, doctors, masterPacks] = await Promise.all([
    getPatient(actor, id).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    getActivePregnancyWithHistory(actor, id),
    // Addressed ones too: the widget counts both, purple and green.
    roleHasPermission(actor.role, 'query.read') ? listVoiceQueries(actor, id, true) : Promise.resolve([]),
    roleHasPermission(actor.role, 'patient.read')
      ? getPatientHistory(actor, id)
      : Promise.resolve<PatientHistory>({ obstetric: [], menstrual: [], immunizations: [], family: [], past: null }),
    listUpcomingAppointments(actor, id),
    canSave ? listClinicDoctors(actor) : Promise.resolve([]),
    // The doctor's own packs — only ever hers, and only for someone who prescribes.
    roleHasPermission(actor.role, 'prescription.write')
      ? listMyMasterPacks(actor)
      : Promise.resolve<MasterPack[]>([]),
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
  const [results, visits, openVisitWithVitals, pendingReports, references, firstWeightKg, allOngoing, openFlags] =
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
      listOpenFlaggedDiagnoses(actor, pregnancy.id),
    ])

  // One line per medicine: once today's Rx carries an ongoing drug forward, the
  // earlier order and the new one are both current until the earlier one ends.
  // The newest is the one in force.
  const ongoing = [...allOngoing]
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .filter((rx, i, all) => all.findIndex((o) => o.medicineName.toLowerCase() === rx.medicineName.toLowerCase()) === i)

  // The husband's blood group, from the most recent verified report that carries it.
  const husbandObservation = results.observations
    .filter((o) => o.testCode === 'husband_blood_group')
    .sort((a, b) => b.observedDate.localeCompare(a.observedDate))[0]
  const husbandBloodGroup = husbandObservation ? formatObservationValue(husbandObservation.value) : null

  const canFlag = canSave
  const flagger = (section: FlaggedDiagnosis['section']) => (
    <DiagnosisFlagger
      patientId={patient.id}
      pregnancyId={pregnancy.id}
      section={section}
      openFlags={openFlags}
      canFlag={canFlag}
    />
  )

  const openVisit = openVisitWithVitals.visit
  const latestVitals: VitalsReading | null = openVisitWithVitals.latest

  const baselineWeightKg = pregnancy.prePregnancyWeightKg ?? firstWeightKg

  const labs = results.observations.filter((o) => o.category !== 'OTHER')
  // Significant means a doctor flagged or pinned it — never that a value fell
  // outside the printed range. Everything else is one click away in "View all".
  const serology = serologySlots(labs)
  const serologyIds = new Set(serology.flatMap((slot) => (slot.observation ? [slot.observation.id] : [])))
  const significantLabs = labs.filter((o) => (o.isPinned || o.flaggedByClinician) && !serologyIds.has(o.id))
  const flaggedScanFindings = results.observations.filter((o) => o.category === 'OTHER' && (o.isPinned || o.flaggedByClinician))
  const newestScanId = [...results.scans].sort((a, b) => b.scanDate.localeCompare(a.scanDate))[0]?.id
  // Significant scans are three kinds only: the latest study, the anomaly scan
  // (TIFFA), and any a clinician flagged as abnormal. Whether a scan is
  // abnormal is her call, never this screen's (PRD §3).
  const significantScans = results.scans
    .filter((scan) => scan.id === newestScanId || scan.scanType === 'TIFFA' || scan.isPinned)
    .sort((a, b) => b.scanDate.localeCompare(a.scanDate))

  // EDD by scan: the pregnancy's own dating when that is an ultrasound;
  // otherwise the earliest scan that printed a gestational age — the earliest
  // is the one that dates a pregnancy best.
  const datingScan = [...results.scans]
    .filter((scan) => scan.gaDaysAtScan !== null)
    .sort((a, b) => a.scanDate.localeCompare(b.scanDate))[0]
  const eddByScan =
    pregnancy.dating.status === 'ESTABLISHED' && pregnancy.dating.method === 'ULTRASOUND'
      ? {
          date: addDays(pregnancy.dating.reference.referenceDate, TERM_DAYS - pregnancy.dating.reference.referenceGaDays),
          scanDate: pregnancy.dating.reference.referenceDate,
        }
      : datingScan && datingScan.gaDaysAtScan !== null
        ? { date: addDays(datingScan.scanDate, TERM_DAYS - datingScan.gaDaysAtScan), scanDate: datingScan.scanDate }
        : null
  const hbRawTrend = results.trends.find((t) => t.testCode === 'hb' || t.testCode.toLowerCase() === 'haemoglobin')
  const hbTrend = hbRawTrend && hbRawTrend.points.some(p => p.value < 11.0 || p.value > 16.0) ? hbRawTrend : undefined

  // AFI Trend (Oligo/Poly)
  const afiPoints = results.scans
    .filter((s) => s.afiCm !== null)
    .sort((a: ScanReport, b: ScanReport) => a.scanDate.localeCompare(b.scanDate))
    .map((s) => ({ observationId: s.id, value: s.afiCm!, unit: 'cm', observedDate: s.scanDate }))

  const afiTrendData = afiPoints.length > 0 ? {
    testCode: 'afi', testName: 'Amniotic Fluid Index (AFI)', unit: 'cm', points: afiPoints
  } : null
  const afiTrend = afiTrendData && afiTrendData.points.some(p => p.value < 5 || p.value > 24) ? afiTrendData : null

  // SDP Trend (Oligo/Poly alternative)
  const sdpPoints = results.scans
    .filter((s) => s.deepestPocketCm !== null)
    .sort((a: ScanReport, b: ScanReport) => a.scanDate.localeCompare(b.scanDate))
    .map((s) => ({ observationId: s.id, value: s.deepestPocketCm!, unit: 'cm', observedDate: s.scanDate }))

  const sdpTrendData = sdpPoints.length > 0 ? {
    testCode: 'sdp', testName: 'Single Deepest Pocket (SDP)', unit: 'cm', points: sdpPoints
  } : null
  const sdpTrend = sdpTrendData && sdpTrendData.points.some(p => p.value < 2 || p.value > 8) ? sdpTrendData : null

  // EFW Centile Trend (IUGR/FGR)
  const efwPoints = results.scans
    .filter((s) => s.efwCentile !== null)
    .sort((a: ScanReport, b: ScanReport) => a.scanDate.localeCompare(b.scanDate))
    .map((s) => ({ observationId: s.id, value: s.efwCentile!, unit: 'th', observedDate: s.scanDate }))

  const efwTrendData = efwPoints.length > 0 ? {
    testCode: 'efw', testName: 'Estimated Fetal Wt (Centile)', unit: 'centile', points: efwPoints
  } : null
  const efwTrend = efwTrendData && efwTrendData.points.some(p => p.value < 10) ? efwTrendData : null

  // AC Centile Trend (IUGR/FGR) from observations
  const acRawTrend = results.trends.find((t) => t.testCode.toLowerCase() === 'ac' || t.testCode.toLowerCase() === 'ac_centile')
  const acTrend = acRawTrend && acRawTrend.points.some(p => p.value < 10) ? acRawTrend : undefined

  // BP Trend (Hypertension)
  const vitalsHistory = await listVitalsForVisits(actor, visits.map((v: Visit) => v.id))

  const bpPoints = vitalsHistory
    .flatMap(({ visitId, reading }) => {
      const bp = reading.bloodPressure
      if (bp === null) return []
      const visit = visits.find((visit: Visit) => visit.id === visitId)
      return [{
        observationId: visitId, value: bp.systolicMmHg, diastolic: bp.diastolicMmHg, unit: 'mmHg', observedDate: visit?.occurredAt || ''
      }]
    })
    .filter((p) => p.observedDate)
    .sort((a, b) => a.observedDate.localeCompare(b.observedDate))

  const bpTrendData = bpPoints.length > 0 ? {
    testCode: 'bp', testName: 'Blood Pressure (Systolic)', unit: 'mmHg', points: bpPoints
  } : null
  // The BP trajectory lives only in the Examination panel, where the doctor
  // reads her vitals and writes her findings — not in the reports section. It
  // draws whenever any BP was recorded this pregnancy.
  const bpTrajectory = bpTrendData ? (
    <div className="w-full rounded-lg border border-slate-200/60 bg-slate-50/70 p-3">
      <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
        {bpTrendData.testName} trajectory
      </p>
      <Sparkline series={bpTrendData} threshold={140} thresholdLabel="Normal < 140 mmHg" />
      <p className="mt-1.5 text-[11px] text-slate-500">Systolic Blood Pressure across this pregnancy&apos;s visits.</p>
    </div>
  ) : null

  // Glucose Trends (Diabetes)
  const glucoseCodes = ['fbs', 'ppbs', 'rbs', 'glucose', 'blood glucose', 'hba1c', 'hba1c (%)', 'bs', 'b/s']
  const glucoseRawTrends = results.trends.filter((t) => glucoseCodes.includes(t.testCode.toLowerCase()))
  const glucoseTrends = glucoseRawTrends.filter(t => {
    const isHbA1c = t.testCode.toLowerCase().includes('hba1c')
    if (isHbA1c) return t.points.some(p => p.value >= 6.5)
    return t.points.some(p => p.value >= 140 || (t.testCode.toLowerCase() === 'fbs' && p.value >= 95))
  })

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
        husbandBloodGroup={husbandBloodGroup}
        eddByScan={eddByScan}
        flaggedDiagnoses={<FlaggedDiagnosisPills patientId={patient.id} flags={openFlags} canResolve={canFlag} />}
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
        <aside className="no-print hidden lg:sticky lg:top-3 lg:block">
          <SectionNav />
        </aside>
        <div className="flex min-w-0 flex-col gap-3">
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

              {/* Chief complaints sit here, above the record, but commit with Save & Next:
                  the hidden field is tied to the consultation <form> by its id. */}
              {openVisit && canSave ? (
                <ChiefComplaintsSection formId={CONSULTATION_FORM_ID} current={openVisit.chiefComplaints} />
              ) : (
                <Accordion title="Chief complaints" icon={<MessageSquareText className="h-4.75 w-4.75" />}>
                  <p className="text-xs text-slate-600">
                    {!openVisit
                      ? 'Chief complaints are recorded against today’s consultation. Start it to record them.'
                      : 'Recording chief complaints is part of the doctor’s consultation.'}
                  </p>
                </Accordion>
              )}

              {/* Significant labs: what a clinician flagged. The trend still draws
                  on every verified value, pinned or not. */}
              <Accordion
                title="Significant blood & urine reports"
                summary={`${significantLabs.length} flagged · ${labs.length} verified`}
                icon={<Activity className="h-4.75 w-4.75" />}
                defaultOpen
              >
                <div className="flex flex-col gap-2.5">
                  <StagedSignificant reports={reports} kind="LAB" />
                  {flagger('REPORTS')}
                  {labs.length === 0 ? <p className="text-xs text-slate-500">No verified results yet.</p> : null}
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    {hbTrend || glucoseTrends.length > 0 ? (
                      <div className="flex flex-col gap-3 flex-1 w-full">
                        {hbTrend ? (
                          <div className="w-full rounded-lg border border-slate-200/60 bg-slate-50/70 p-3">
                            <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                              {hbTrend.testName} trajectory
                            </p>
                            <Sparkline series={hbTrend} threshold={11.0} thresholdLabel="Normal ≥ 11 g/dL" />
                            <p className="mt-1.5 text-[11px] text-slate-500">Every verified value in this pregnancy, flagged or not.</p>
                          </div>
                        ) : null}

                        {glucoseTrends.map(t => (
                          <div key={t.testCode} className="w-full rounded-lg border border-slate-200/60 bg-slate-50/70 p-3">
                            <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                              {t.testName} trajectory
                            </p>
                            <Sparkline 
                              series={t} 
                              threshold={t.testCode.toLowerCase().includes('hba1c') ? 6.5 : (t.testCode.toLowerCase() === 'fbs' ? 95 : 140)} 
                              thresholdLabel={t.testCode.toLowerCase().includes('hba1c') ? "Normal < 6.5 %" : (t.testCode.toLowerCase() === 'fbs' ? "Normal < 95 mg/dL" : "Normal < 140 mg/dL")}
                            />
                            <p className="mt-1.5 text-[11px] text-slate-500">Every verified value in this pregnancy for this glucose metric.</p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex-1 w-full flex flex-col gap-2">
                      <ViewAllList
                        noun="results"
                        items={labs.map((observation) => ({
                          id: observation.id,
                          name: observation.testName,
                          date: observation.observedDate,
                          node: <LabRow key={observation.id} observation={observation} patientId={patient.id} />,
                        }))}
                      />

                      {/* Always on view, flagged or not: the three results the OPD
                          checks at every antenatal visit. */}
                      <ul className="grid grid-cols-1 gap-2 md:grid-cols-3" aria-label="Serology">
                        {serology.map((slot) =>
                          slot.observation ? (
                            <LabRow key={slot.label} observation={slot.observation} patientId={patient.id} />
                          ) : (
                            <li
                              key={slot.label}
                              className="flex items-center justify-between gap-3 rounded border border-dashed border-slate-300 bg-white p-2.5 text-xs"
                            >
                              <span className="font-semibold text-slate-900">{slot.label}</span>
                              <span className="text-[11px] text-slate-400">not on file</span>
                            </li>
                          ),
                        )}
                      </ul>

                      {significantLabs.length > 0 ? (
                        <ul className="flex flex-col gap-2">
                          {significantLabs.map((observation) => (
                            <LabRow key={observation.id} observation={observation} patientId={patient.id} />
                          ))}
                        </ul>
                      ) : labs.length > 0 ? (
                        <p className="text-xs text-slate-500">
                          Nothing flagged as significant yet. Flag a report from the panel above to bring it here.
                        </p>
                      ) : null}

                    </div>
                  </div>
                </div>
              </Accordion>

              <Accordion
                title="Significant scans (milestones)"
                summary={`${significantScans.length} shown · ${results.scans.length} on file`}
                icon={<Baby className="h-4.75 w-4.75" />}
                defaultOpen
              >
                <div className="flex flex-col gap-2.5">
                  <StagedSignificant reports={reports} kind="SCAN" />
                  {flagger('SCANS')}
                  {afiTrend || sdpTrend || efwTrend || acTrend ? (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {afiTrend ? (
                        <div className="w-full rounded-lg border border-slate-200/60 bg-slate-50/70 p-3">
                          <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                            {afiTrend.testName} trajectory
                          </p>
                          <Sparkline series={afiTrend} threshold={5} thresholdLabel="Normal ≥ 5 cm" />
                          <p className="mt-1.5 text-[11px] text-slate-500">Every verified AFI in this pregnancy, mapped from scans.</p>
                        </div>
                      ) : null}

                      {sdpTrend ? (
                        <div className="w-full rounded-lg border border-slate-200/60 bg-slate-50/70 p-3">
                          <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                            {sdpTrend.testName} trajectory
                          </p>
                          <Sparkline series={sdpTrend} threshold={2} thresholdLabel="Normal ≥ 2 cm" />
                          <p className="mt-1.5 text-[11px] text-slate-500">Every verified Single Deepest Pocket mapped from scans.</p>
                        </div>
                      ) : null}

                      {efwTrend ? (
                        <div className="w-full rounded-lg border border-slate-200/60 bg-slate-50/70 p-3">
                          <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                            {efwTrend.testName} trajectory
                          </p>
                          <Sparkline series={efwTrend} threshold={10} thresholdLabel="Normal ≥ 10th centile" />
                          <p className="mt-1.5 text-[11px] text-slate-500">Estimated Fetal Weight percentiles mapped from scans.</p>
                        </div>
                      ) : null}

                      {acTrend ? (
                        <div className="w-full rounded-lg border border-slate-200/60 bg-slate-50/70 p-3">
                          <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                            Abdominal Circumference trajectory
                          </p>
                          <Sparkline series={acTrend} threshold={10} thresholdLabel="Normal ≥ 10th centile" />
                          <p className="mt-1.5 text-[11px] text-slate-500">Abdominal Circumference percentiles mapped from observations.</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <ViewAllList
                    noun="scans"
                    layout="grid"
                    items={results.scans.map((scan) => ({
                      id: scan.id,
                      name: `${SCAN_TYPE_LABELS[scan.scanType] ?? 'Ultrasound'} ${scan.impression ?? ''}`,
                      date: scan.scanDate,
                      // The most recent study is tinted — a statement about recency and nothing else.
                      node: <ScanRow key={scan.id} scan={scan} isLatest={scan.id === newestScanId} />,
                    }))}
                  />
                  {results.scans.length === 0 && flaggedScanFindings.length === 0 ? (
                    <p className="text-xs text-slate-500">No verified scans yet.</p>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      The latest scan, the anomaly scan, and scans flagged as abnormal. Everything else is in View all.
                    </p>
                  )}
                  {significantScans.length > 0 ? (
                    <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                      {significantScans.map((scan) => (
                        <ScanRow key={scan.id} scan={scan} isLatest={scan.id === newestScanId} />
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
                          <LabRow key={observation.id} observation={observation} patientId={patient.id} />
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </Accordion>

              <Accordion
                title="Immunization, marriage & conception"
                summary={immunizationSummary(history, pregnancy.id)}
                icon={<Syringe className="h-4.75 w-4.75" />}
              >
                <div className="mb-2.5">
                  <PregnancyProfilePanel
                    patientId={patient.id}
                    pregnancy={pregnancy}
                    canEdit={roleHasPermission(actor.role, 'patient.update')}
                  />
                </div>
                <ImmunizationPanel
                  patientId={patient.id}
                  pregnancyId={pregnancy.id}
                  records={history.immunizations}
                  canRecord={roleHasPermission(actor.role, 'medication_administration.record')}
                />
              </Accordion>

              <Accordion
                title="Previous obstetric history"
                summary={`${history.obstetric.length} recorded`}
                flagCount={history.obstetric.filter((entry) => entry.flagged).length}
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
                flagCount={history.menstrual.filter((entry) => entry.flagged).length}
                icon={<CalendarHeart className="h-4.75 w-4.75" />}
              >
                <MenstrualHistoryPanel
                  patientId={patient.id}
                  history={history.menstrual}
                  canEdit={roleHasPermission(actor.role, 'patient.update')}
                />
              </Accordion>

              <Accordion
                title="Past history"
                summary={history.past?.notes ? 'recorded' : 'not recorded'}
                flagCount={history.past?.flagged ? 1 : 0}
                icon={<ClipboardList className="h-4.75 w-4.75" />}
              >
                <PastHistoryPanel
                  // Re-mounted when the record changes, so a delete clears the box.
                  key={history.past ? `${history.past.version}` : 'none'}
                  patientId={patient.id}
                  past={history.past}
                  canEdit={roleHasPermission(actor.role, 'patient.update')}
                />
              </Accordion>

              <Accordion
                title="Family history"
                summary={`${history.family.length} recorded`}
                flagCount={history.family.filter((entry) => entry.flagged).length}
                icon={<Users className="h-4.75 w-4.75" />}
              >
                <FamilyHistoryPanel
                  patientId={patient.id}
                  entries={history.family}
                  canEdit={roleHasPermission(actor.role, 'patient.update')}
                />
              </Accordion>

              <Accordion
                title="Birth Preparedness Plan"
                summary={pregnancy.birthPlan && Object.keys(pregnancy.birthPlan).length > 0 ? 'Recorded' : 'Not recorded'}
                icon={<ListChecks className="h-4.75 w-4.75" />}
              >
                <BirthPlanPanel
                  patientId={patient.id}
                  pregnancyId={pregnancy.id}
                  version={pregnancy.version}
                  plan={pregnancy.birthPlan || {}}
                  canEdit={roleHasPermission(actor.role, 'patient.update')}
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
                        <div className="no-print ml-auto flex gap-3">
                          <Link
                            href={`/clinic/visits/${visit.id}/slip`}
                            className="text-[11px] font-medium text-brand-600 hover:underline"
                          >
                            preview
                          </Link>
                          <Link
                            href={`/clinic/visits/${visit.id}/slip?print=true`}
                            className="text-[11px] font-medium text-brand-600 hover:underline"
                          >
                            print
                          </Link>
                        </div>
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
                  }}
                  reports={reports}
                  doctors={doctors}
                  priorReferences={references}
                  formId={CONSULTATION_FORM_ID}
                  systemicExamination={openVisit.systemicExamination}
                  ongoing={ongoing}
                  masterPacks={masterPacks}
                  examinationFlagger={flagger('EXAMINATION')}
                  vitals={
                    <>
                      <VitalsPanel latestVitals={latestVitals} baselineWeightKg={baselineWeightKg} />
                      {bpTrajectory}
                    </>
                  }
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
                      <div className="w-full">
                        <VitalsPanel latestVitals={latestVitals} baselineWeightKg={baselineWeightKg} />
                      </div>
                      {bpTrajectory}
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
        </div>
      </div>
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
      testCode: candidate.testCode ?? null,
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

/**
 * HIV 1, HIV 2 and HBsAg — the three results the cockpit always shows.
 *
 * Matched on the test code or the printed name, latest result first. A slip
 * that reports "HIV 1 & 2" as one result fills both HIV slots with it; an
 * empty slot says "not on file", never "negative".
 */
function serologySlots(labs: readonly Observation[]): { label: string; observation: Observation | null }[] {
  const newest = (matches: (o: Observation) => boolean) =>
    [...labs].filter(matches).sort((a, b) => b.observedDate.localeCompare(a.observedDate))[0] ?? null

  const hivTypes = (o: Observation): { one: boolean; two: boolean } | null => {
    const name = o.testName.toLowerCase()
    if (o.testCode.toLowerCase() !== 'hiv' && !/\bhiv\b/.test(name)) return null
    const rest = name.includes('hiv') ? name.slice(name.indexOf('hiv') + 3) : name
    const one = /(^|[^\d])1([^\d]|$)|\bi\b/.test(rest)
    const two = /(^|[^\d])2([^\d]|$)|\bii\b/.test(rest)
    // "HIV" alone, or "HIV 1 & 2": the one result stands for both.
    return one || two ? { one, two } : { one: true, two: true }
  }

  return [
    { label: 'HIV 1', observation: newest((o) => hivTypes(o)?.one === true) },
    { label: 'HIV 2', observation: newest((o) => hivTypes(o)?.two === true) },
    {
      label: 'HBsAg',
      observation: newest((o) => o.testCode.toLowerCase() === 'hbsag' || /hbs\s*ag/i.test(o.testName)),
    },
  ]
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

function LabRow({ observation, patientId }: { observation: Observation; patientId: string }) {
  const range = formatReferenceRange(observation.referenceRange)
  const outside = isOutsidePrintedRange(observation.value, observation.referenceRange)
  // Red only because a clinician flagged it — never because of the range.
  const flagged = observation.flaggedByClinician === true
  
  const onAnnotate = async (formData: FormData) => {
    'use server'
    await annotateObservationAction(observation.id, patientId, formData)
  }

  return (
    <li
      className={`numeric flex items-center justify-between gap-3 rounded border p-2.5 text-xs ${
        flagged ? 'border-alert-200 bg-alert-50/50' : 'border-slate-200/60 bg-slate-50/70'
      }`}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-semibold text-slate-900">
          <span className="truncate">{observation.testName}</span>
        </span>
        <span className="flex items-center gap-2 text-[11px] text-slate-500">
          {observation.observedDate}
          {observation.sourceUploadId ? (
            <ViewOriginalButton uploadId={observation.sourceUploadId} title={observation.testName} />
          ) : null}
        </span>
        {observation.clinicianNote ? (
          <span className="block text-[11px] text-slate-600 italic mt-0.5">{observation.clinicianNote}</span>
        ) : outside || flagged ? (
          <form action={onAnnotate} className="mt-1">
            <button className="text-[10px] font-medium text-brand-600 hover:underline">
              Mark as &ldquo;Does not require treatment&rdquo;
            </button>
          </form>
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
  return <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-3 p-3 sm:p-5">{children}</main>
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="glass rounded-xl border border-slate-200/90 p-5 shadow-xs">{children}</section>
}
