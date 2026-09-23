import {
  Activity,
  ArrowLeft,
  Baby,
  BellRing,
  ClipboardCheck,
  FolderOpen,
  History,
  NotebookPen,
  Pill as PillIcon,
  Star,
  Stethoscope,
} from 'lucide-react'
import Link, { type LinkProps } from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Accordion, AccordionMeta } from '@components/cockpit/accordion'
import { HeaderBanner } from '@components/cockpit/header-banner'
import { QueriesPanel } from '@components/cockpit/queries-panel'
import { Sparkline } from '@components/cockpit/sparkline'
import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { formatGestationalAge, splitGestationalAge, todayIn } from '@core/obstetrics/dating'
import { formatPrescription, type Prescription } from '@modules/orders/order.types'
import { listOngoingPrescriptions } from '@modules/orders/order.service'
import { getPatient } from '@modules/patients/patient.service'
import { getActivePregnancyWithHistory } from '@modules/pregnancies/pregnancy.service'
import { getPregnancyResults, listAwaitingVerification } from '@modules/reports/report.service'
import {
  defaultCategoryFor,
  formatCandidateValue,
  formatObservationValue,
  formatReferenceRange,
  isFixtureExtraction,
  isOutsidePrintedRange,
  type Observation,
  type ScanReport,
} from '@modules/reports/report.types'
import { getOpenVisit, getVisitWithVitals, listVisits } from '@modules/visits/visit.service'
import { listForPatient as listVoiceQueries } from '@modules/voice/voice.service'

import type { VitalsReading } from '@modules/visits/visit.types'

import {
  ConsultationForm,
  type PinnableFinding,
  type VerifiableCandidate,
} from './consultation-form'

/**
 * The consultation cockpit (PRD F3–F7).
 *
 * One screen, six accordions, everything read in a single pass so the whole
 * record is on screen inside the two minutes the consultation actually has.
 *
 * Accordions one to five read; the sixth writes. Impression, orders, advice,
 * follow-up date and pin decisions all commit in one transaction through
 * `saveConsultation`, so a consultation is never half-recorded.
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

export default async function CockpitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect(`/sign-in?next=/clinic/patients/${id}/cockpit`)

  const { actor } = session

  if (!roleHasPermission(actor.role, 'observation.read')) {
    return (
      <Shell>
        <Panel>
          <h1 className="font-heading text-lg font-bold tracking-tight text-slate-900">
            Not available to you
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            The cockpit shows a patient&rsquo;s full clinical record. Your role
            ({actor.role.toLowerCase()}) does not include it.
          </p>
        </Panel>
      </Shell>
    )
  }

  let patient
  try {
    patient = await getPatient(actor, id)
  } catch (error) {
    if (error instanceof AppError && (error.kind === 'NOT_FOUND' || error.kind === 'FORBIDDEN')) {
      notFound()
    }
    throw error
  }

  const episode = await getActivePregnancyWithHistory(actor, id)

  if (!episode) {
    return (
      <Shell>
        <Panel>
          <h1 className="font-heading text-lg font-bold tracking-tight text-slate-900">
            No open pregnancy
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            The cockpit shows one antenatal episode. {patient.fullName} has none
            open.
          </p>
          <Link
            href={`/clinic/patients/${id}`}
            className="mt-4 inline-block text-sm text-brand-600 hover:underline"
          >
            Back to her record
          </Link>
        </Panel>
      </Shell>
    )
  }

  const { pregnancy, obstetricHistory } = episode
  const today = todayIn(actor.clinicTimezone)

  // Fetched together: the cockpit has to arrive in one pass, and the trend must
  // be derived from the same observation set the tables show.
  const [results, visits, openVisit, voiceQueries, pendingReports] = await Promise.all([
    getPregnancyResults(actor, pregnancy.id),
    listVisits(actor, pregnancy.id),
    getOpenVisit(actor, pregnancy.id),
    // Unresolved only. A message she sent three visits ago and had answered is
    // history, not something demanding attention now.
    roleHasPermission(actor.role, 'query.read')
      ? listVoiceQueries(actor, patient.id, false)
      : Promise.resolve([]),
    // Read, unreviewed reports. Only a clinician can act on these, so a role
    // that cannot save a consultation is not shown a verification list it would
    // be unable to submit.
    roleHasPermission(actor.role, 'observation.verify')
      ? listAwaitingVerification(actor, pregnancy.id)
      : Promise.resolve([]),
  ])

  // Prescription data is doctor-only, by the matrix and independently by RLS.
  const ongoing: Prescription[] = roleHasPermission(actor.role, 'prescription.read')
    ? await listOngoingPrescriptions(actor, pregnancy.id, today)
    : []

  const latestVitals: VitalsReading | null = openVisit
    ? ((await getVisitWithVitals(actor, openVisit.id)).vitals.at(-1) ?? null)
    : null

  const labs = results.observations.filter((o) => o.category !== 'OTHER')
  const hbTrend = results.trends.find((t) => t.testCode === 'hb')

  // Offered for pinning: the most recent results, which is what a clinician
  // actually decides about. The full list would be a wall of checkboxes in a
  // two-minute consultation.
  const pinnableFindings: PinnableFinding[] = results.observations
    .slice(0, 12)
    .map((observation) => ({
      id: observation.id,
      label: `${observation.testName} ${formatObservationValue(observation.value)} (${observation.observedDate})`,
      isPinned: observation.isPinned,
    }))

  // Flattened here rather than in the client component, which cannot be handed
  // a discriminated union across the server boundary. The correction version
  // travels with each row: it is what the clinician is looking at, and the save
  // is refused if it has moved.
  const verifiableCandidates: VerifiableCandidate[] = pendingReports.flatMap((report) => {
    // Bound to a local so the narrowing survives into the callback below.
    const extraction = report.extraction
    if (extraction.status !== 'READY') return []

    return extraction.candidates.map((candidate) => ({
      id: candidate.id,
      correctionVersion: candidate.correctionVersion,
      // The printed label is preferred over the canonical code: it is what the
      // slip in the clinician's hand actually says.
      testName: candidate.printedLabel ?? candidate.testCode,
      value: formatCandidateValue(candidate.value),
      printedRange: formatReferenceRange(candidate.referenceRange),
      observedDate: candidate.observedDate,
      confidence: candidate.confidence,
      defaultCategory: defaultCategoryFor(extraction.reportType),
      reportLabel: `uploaded ${report.upload.uploadedAt.slice(0, 10)}`,
      fromFixture: isFixtureExtraction(extraction),
    }))
  })

  return (
    <Shell>
      <div className="no-print flex items-center justify-between gap-3">
        <Link
          href={`/clinic/patients/${id}`}
          className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100/90 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-200 hover:text-brand-800"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          <span className="truncate">{patient.fullName}</span>
        </Link>

        <div className="flex items-center gap-2">
          <NavChip href={`/clinic/patients/${id}/reports`} icon={<FolderOpen className="h-4 w-4" />}>
            Reports
            {/*
              The count is on the link because the verification list is at the
              bottom of the sixth accordion. A doctor who never scrolls that far
              would otherwise not know a slip was waiting.
            */}
            {verifiableCandidates.length > 0 ? (
              <span className="numeric ml-1.5 rounded-full bg-brand-800 px-1.5 text-[10px] font-bold text-white">
                {pendingReports.length} new
              </span>
            ) : null}
          </NavChip>
          <NavChip href={`/clinic/patients/${id}/visit`} icon={<Stethoscope className="h-4 w-4" />}>
            Today’s visit
          </NavChip>
        </div>
      </div>

      <HeaderBanner
        patient={patient}
        pregnancy={pregnancy}
        obstetricHistory={obstetricHistory}
        latestVitals={latestVitals}
        today={today}
      />

      {/*
        The review pipeline strip. It says a slip has been read and is waiting
        on a clinician — a statement about where a document is in the workflow,
        not about what is on it.
      */}
      {pendingReports.length > 0 ? (
        <section className="no-print flex flex-col justify-between gap-2 rounded-lg border border-caution-200/80 bg-linear-to-r from-caution-50/90 via-brand-50/50 to-caution-50/70 px-3 py-2.5 shadow-2xs md:flex-row md:items-center">
          <span className="flex shrink-0 items-center gap-2">
            <BellRing aria-hidden className="h-4.5 w-4.5 text-caution-600" />
            <span className="font-heading text-xs font-semibold text-caution-900">
              {pendingReports.length} report{pendingReports.length === 1 ? '' : 's'} read and
              awaiting your verification
            </span>
          </span>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs md:pb-0">
            {pendingReports.map((report) => (
              <span
                key={report.upload.id}
                className="numeric flex shrink-0 items-center gap-2 rounded border border-slate-200 bg-white/90 px-2 py-1 font-semibold text-slate-800 shadow-2xs"
              >
                {report.upload.uploadedAt.slice(0, 10)}
                <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-600">
                  {report.extraction.status === 'READY'
                    ? `${report.extraction.candidates.length} value${
                        report.extraction.candidates.length === 1 ? '' : 's'
                      }`
                    : report.extraction.status.toLowerCase()}
                </span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {voiceQueries.length > 0 ? <QueriesPanel queries={voiceQueries} /> : null}

      <div className="flex flex-col gap-2.5">
        {/* 1 — Ongoing Rx. Collapsed: it changes least often. */}
        <Accordion
          title="Ongoing medication"
          summary={`${ongoing.length} active`}
          icon={<PillIcon className="h-4.75 w-4.75" />}
          isEmpty={ongoing.length === 0}
          emptyMessage={
            roleHasPermission(actor.role, 'prescription.read')
              ? 'Nothing currently prescribed.'
              : 'Prescriptions are visible to the consulting doctor.'
          }
        >
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200/60 bg-slate-50/60 p-3">
            <span className="font-heading text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
              Active daily medications
            </span>
            <ul className="numeric flex flex-col gap-1.5 text-xs">
              {ongoing.map((prescription) => (
                <li
                  key={prescription.id}
                  className="flex items-center justify-between gap-3 rounded border border-slate-100 bg-white p-1.5"
                >
                  <span className="font-medium text-slate-900">
                    {formatPrescription(prescription)}
                  </span>
                  <span className="shrink-0 rounded bg-brand-50 px-1.5 text-[10px] font-semibold text-brand-800">
                    from {prescription.startDate}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Accordion>

        {/* 2 — Labs. Expanded: this is what the consultation turns on. */}
        <Accordion
          title="Significant blood & urine reports"
          summary={`${labs.length} verified`}
          icon={<Activity className="h-4.75 w-4.75" />}
          defaultOpen
          isEmpty={labs.length === 0}
          emptyMessage="No verified results yet."
        >
          <div className="flex flex-col gap-2.5">
            {hbTrend ? (
              <div className="rounded-lg border border-slate-200/60 bg-slate-50/70 p-3">
                <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                  {hbTrend.testName} trajectory
                </p>
                <Sparkline series={hbTrend} />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Every verified value in this pregnancy, pinned or not.
                </p>
              </div>
            ) : null}

            <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {labs.map((observation) => (
                <LabRow key={observation.id} observation={observation} />
              ))}
            </ul>
          </div>
        </Accordion>

        {/* 3 — Scans. Expanded. */}
        <Accordion
          title="Significant scans (milestones)"
          summary={`${results.scans.length} on file`}
          icon={<Baby className="h-4.75 w-4.75" />}
          defaultOpen
          isEmpty={results.scans.length === 0}
          emptyMessage="No verified scans yet."
        >
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {results.scans.map((scan, index) => (
              // The most recent study is tinted, which is a statement about
              // recency and nothing else.
              <ScanRow key={scan.id} scan={scan} isLatest={index === 0} />
            ))}
          </ul>
        </Accordion>

        {/* 4 — Previous history. Collapsed. */}
        <Accordion
          title="Previous obstetric history"
          summary={`${obstetricHistory.length} recorded · ${visits.length} visits`}
          icon={<History className="h-4.75 w-4.75" />}
          isEmpty={obstetricHistory.length === 0 && visits.length === 0}
          emptyMessage="No prior pregnancies recorded, and no earlier visits this episode."
        >
          <div className="flex flex-col gap-2.5">
            {obstetricHistory.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {obstetricHistory.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-slate-200/70 bg-slate-50/70 p-3 text-xs"
                  >
                    <div className="numeric flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">
                        {entry.yearOfEvent ?? entry.eventDate ?? '—'}
                      </span>
                      <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {entry.outcome.toLowerCase().replace(/_/g, ' ')}
                      </span>
                      <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {entry.deliveryMode.toLowerCase().replace(/_/g, ' ')}
                      </span>
                      {entry.birthWeightGrams ? (
                        <span className="text-slate-500">
                          birth wt: {entry.birthWeightGrams} g
                        </span>
                      ) : null}
                      {entry.hasUterineScar ? (
                        <span className="rounded border border-caution-200 bg-caution-50 px-1.5 py-0.5 text-[10px] font-bold text-caution-900">
                          scar
                          {entry.scarIndication ? ` · ${entry.scarIndication}` : ''}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {visits.length > 0 ? (
              <div className="rounded-lg border border-slate-200/60 bg-slate-50/60 p-3">
                <p className="font-heading mb-1.5 text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                  Earlier visits this pregnancy
                </p>
                <ul className="numeric flex flex-col gap-1">
                  {visits.map((visit) => (
                    <li
                      key={visit.id}
                      className="flex flex-wrap items-center gap-2 rounded border border-slate-100 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      <span className="font-semibold text-slate-900">
                        {visit.occurredAt.slice(0, 10)}
                      </span>
                      {/* The gestational age frozen at save, not recomputed — a
                          later redating must not rewrite what was reasoned from. */}
                      {visit.gaDaysAtVisit !== null ? (
                        <span>{formatGestationalAge(splitGestationalAge(visit.gaDaysAtVisit))}</span>
                      ) : null}
                      <span className="text-[10px] text-slate-500">
                        {visit.status.toLowerCase()}
                      </span>
                      {/* Offered only once the consultation is saved — the slip
                          is a record of what was decided, and the page refuses an
                          open visit anyway (PRD F8). */}
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
              </div>
            ) : null}
          </div>
        </Accordion>

        {/* 5 — Impression. Expanded, read-only until Save & Next exists. */}
        <Accordion
          title="Physician impression & clinical notes"
          icon={<NotebookPen className="h-4.75 w-4.75" />}
          defaultOpen
          isEmpty={!openVisit?.impression}
          emptyMessage={
            openVisit
              ? 'Nothing recorded for today’s visit yet.'
              : 'No visit is open, so there is nothing to record against.'
          }
        >
          <p className="numeric rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
            {openVisit?.impression}
          </p>
        </Accordion>

        {/* 6 — Fresh orders, and the atomic commit. */}
        <Accordion
          title="Fresh orders & advice (active plan)"
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone="emphasis"
          meta={
            openVisit ? (
              <AccordionMeta>visit {openVisit.occurredAt.slice(0, 10)}</AccordionMeta>
            ) : null
          }
          defaultOpen
        >
          {!openVisit ? (
            <p className="text-xs leading-relaxed text-slate-600">
              No visit is open, so there is nothing to record against. Orders
              belong to a consultation.
            </p>
          ) : !roleHasPermission(actor.role, 'visit.save') ? (
            <p className="text-xs leading-relaxed text-slate-600">
              Finishing a consultation is a clinician act. Your role
              ({actor.role.toLowerCase()}) can record vitals and upload reports,
              but not prescribe or save the consultation.
            </p>
          ) : (
            <ConsultationForm
              visitId={openVisit.id}
              expectedVersion={openVisit.version}
              currentImpression={openVisit.impression}
              findings={pinnableFindings}
              queries={voiceQueries.map((q) => ({
                id: q.id,
                summary:
                  q.processing.state === 'READY'
                    ? q.processing.english || q.processing.original
                    : 'Not transcribed',
              }))}
              candidates={verifiableCandidates}
            />
          )}
        </Accordion>
      </div>
    </Shell>
  )
}

function LabRow({ observation }: { observation: Observation }) {
  const range = formatReferenceRange(observation.referenceRange)
  const outside = isOutsidePrintedRange(observation.value, observation.referenceRange)

  return (
    <li className="numeric flex items-center justify-between gap-3 rounded border border-slate-200/60 bg-slate-50/70 p-2.5 text-xs">
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-semibold text-slate-900">
          <span className="truncate">{observation.testName}</span>
          {observation.isPinned ? (
            <Star
              className="h-3.5 w-3.5 shrink-0 fill-caution-600 text-caution-600"
              aria-label="pinned to the cockpit by a clinician"
            />
          ) : null}
        </span>
        <span className="block text-[11px] text-slate-500">{observation.observedDate}</span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block font-bold text-slate-900">
          {formatObservationValue(observation.value)}
        </span>
        {range ? (
          <span className="block text-[10px] text-slate-500">
            lab range {range}
            {/*
              Worded as a comparison against what the laboratory printed, never
              as "abnormal". The system does not classify findings; only a
              clinician does (PRD §3). The reference screen prints "[Low]" in
              red here; that is a classification, so it is not reproduced.
            */}
            {outside === true ? (
              <span className="ml-1 font-semibold text-caution-700">outside</span>
            ) : null}
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
    // Presentation appears here, with the study that observed it and its date —
    // never on the persistent banner, where it would go stale unnoticed.
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
        <span
          className={`numeric flex items-center gap-1.5 font-bold ${
            isLatest ? 'text-brand-800' : 'text-slate-900'
          }`}
        >
          <span className="truncate">{SCAN_TYPE_LABELS[scan.scanType] ?? 'Ultrasound'}</span>
          {scan.isPinned ? (
            <Star
              className="h-3.5 w-3.5 shrink-0 fill-caution-600 text-caution-600"
              aria-label="pinned to the cockpit by a clinician"
            />
          ) : null}
        </span>
        {isLatest ? (
          <span className="numeric shrink-0 rounded bg-brand-800 px-1.5 text-[10px] font-bold text-white">
            Latest
          </span>
        ) : null}
      </div>

      <span className="numeric text-[11px] text-slate-500">
        {scan.scanDate}
        {scan.gaDaysAtScan !== null
          ? ` · ${formatGestationalAge(splitGestationalAge(scan.gaDaysAtScan))}`
          : ''}
      </span>

      {measurements.length > 0 ? (
        <ul className="numeric mt-0.5 space-y-0.5 text-[11px] font-medium text-slate-700">
          {measurements.map((measurement, index) => (
            <li key={index}>• {measurement}</li>
          ))}
        </ul>
      ) : null}

      {scan.impression ? (
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{scan.impression}</p>
      ) : null}
    </li>
  )
}

/**
 * A quick-access chip in the cockpit's own nav row.
 *
 * Generic over the route so that Next's typed-routes check still happens at
 * the call site; a plain `string` here would silently turn it off.
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
  // Wide and dense, per the design system: this is a 1080p+ clinical screen,
  // and a 4xl column would waste half of it.
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-3 sm:p-5">{children}</main>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="glass rounded-xl border border-slate-200/90 p-5 shadow-xs">
      {children}
    </section>
  )
}
