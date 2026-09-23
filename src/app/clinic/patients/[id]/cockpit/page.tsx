import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { Accordion } from '@components/cockpit/accordion'
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
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
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
          <h1 className="text-lg font-semibold text-slate-900">No open pregnancy</h1>
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
      <div className="no-print mb-3 flex items-center justify-between">
        <Link href={`/clinic/patients/${id}`} className="text-sm text-brand-600 hover:underline">
          ← {patient.fullName}
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href={`/clinic/patients/${id}/reports`}
            className="text-sm text-brand-600 hover:underline"
          >
            Reports
            {/*
              The count is on the link because the verification list is at the
              bottom of the sixth accordion. A doctor who never scrolls that far
              would otherwise not know a slip was waiting.
            */}
            {verifiableCandidates.length > 0 ? ` (${pendingReports.length} new)` : ''}
          </Link>
          <Link
            href={`/clinic/patients/${id}/visit`}
            className="text-sm text-brand-600 hover:underline"
          >
            Today’s visit
          </Link>
        </div>
      </div>

      <HeaderBanner
        patient={patient}
        pregnancy={pregnancy}
        obstetricHistory={obstetricHistory}
        latestVitals={latestVitals}
        today={today}
      />

      {voiceQueries.length > 0 ? (
        <div className="mt-3">
          <QueriesPanel queries={voiceQueries} />
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {/* 1 — Ongoing Rx. Collapsed: it changes least often. */}
        <Accordion
          title="Ongoing medication"
          summary={`${ongoing.length} active`}
          isEmpty={ongoing.length === 0}
          emptyMessage={
            roleHasPermission(actor.role, 'prescription.read')
              ? 'Nothing currently prescribed.'
              : 'Prescriptions are visible to the consulting doctor.'
          }
        >
          <ul className="space-y-2">
            {ongoing.map((prescription) => (
              <li key={prescription.id} className="text-sm text-slate-800">
                {formatPrescription(prescription)}
                <span className="numeric ml-2 text-xs text-slate-500">
                  from {prescription.startDate}
                </span>
              </li>
            ))}
          </ul>
        </Accordion>

        {/* 2 — Labs. Expanded: this is what the consultation turns on. */}
        <Accordion
          title="Significant labs"
          summary={`${labs.length} verified`}
          defaultOpen
          isEmpty={labs.length === 0}
          emptyMessage="No verified results yet."
        >
          {hbTrend ? (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                {hbTrend.testName} trend
              </p>
              <Sparkline series={hbTrend} />
              <p className="mt-1 text-xs text-slate-500">
                Every verified value in this pregnancy, pinned or not.
              </p>
            </div>
          ) : null}

          <ul className="divide-y divide-slate-100">
            {labs.map((observation) => (
              <LabRow key={observation.id} observation={observation} />
            ))}
          </ul>
        </Accordion>

        {/* 3 — Scans. Expanded. */}
        <Accordion
          title="Significant scans"
          summary={`${results.scans.length} on file`}
          defaultOpen
          isEmpty={results.scans.length === 0}
          emptyMessage="No verified scans yet."
        >
          <ul className="space-y-3">
            {results.scans.map((scan) => (
              <ScanRow key={scan.id} scan={scan} />
            ))}
          </ul>
        </Accordion>

        {/* 4 — Previous history. Collapsed. */}
        <Accordion
          title="Previous obstetric history"
          summary={`${obstetricHistory.length} recorded · ${visits.length} visits`}
          isEmpty={obstetricHistory.length === 0 && visits.length === 0}
          emptyMessage="No prior pregnancies recorded, and no earlier visits this episode."
        >
          {obstetricHistory.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {obstetricHistory.map((entry) => (
                <li key={entry.id} className="text-sm text-slate-800">
                  <span className="numeric text-slate-500">
                    {entry.yearOfEvent ?? entry.eventDate ?? '—'}
                  </span>{' '}
                  · {entry.outcome.toLowerCase().replace(/_/g, ' ')} ·{' '}
                  {entry.deliveryMode.toLowerCase().replace(/_/g, ' ')}
                  {entry.birthWeightGrams ? (
                    <span className="numeric"> · {entry.birthWeightGrams} g</span>
                  ) : null}
                  {entry.hasUterineScar ? (
                    <span className="ml-2 rounded bg-caution-50 px-1.5 py-0.5 text-xs text-caution-700">
                      scar
                      {entry.scarIndication ? ` · ${entry.scarIndication}` : ''}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {visits.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase">
                Earlier visits this pregnancy
              </p>
              <ul className="space-y-1">
                {visits.map((visit) => (
                  <li key={visit.id} className="numeric text-sm text-slate-700">
                    {visit.occurredAt.slice(0, 10)}
                    {/* The gestational age frozen at save, not recomputed — a
                        later redating must not rewrite what was reasoned from. */}
                    {visit.gaDaysAtVisit !== null
                      ? ` · ${formatGestationalAge(splitGestationalAge(visit.gaDaysAtVisit))}`
                      : ''}
                    <span className="ml-2 text-xs text-slate-500">
                      {visit.status.toLowerCase()}
                    </span>
                    {/* Offered only once the consultation is saved — the slip
                        is a record of what was decided, and the page refuses an
                        open visit anyway (PRD F8). */}
                    {visit.status === 'SAVED' ? (
                      <Link
                        href={`/clinic/visits/${visit.id}/slip`}
                        className="no-print ml-2 text-xs text-brand-600 hover:underline"
                      >
                        print slip
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Accordion>

        {/* 5 — Impression. Expanded, read-only until Save & Next exists. */}
        <Accordion
          title="Physician impression"
          defaultOpen
          isEmpty={!openVisit?.impression}
          emptyMessage={
            openVisit
              ? 'Nothing recorded for today’s visit yet.'
              : 'No visit is open, so there is nothing to record against.'
          }
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
            {openVisit?.impression}
          </p>
        </Accordion>

        {/* 6 — Fresh orders, and the atomic commit. */}
        <Accordion title="Fresh orders and advice" defaultOpen>
          {!openVisit ? (
            <p className="text-sm leading-relaxed text-slate-600">
              No visit is open, so there is nothing to record against. Orders
              belong to a consultation.
            </p>
          ) : !roleHasPermission(actor.role, 'visit.save') ? (
            <p className="text-sm leading-relaxed text-slate-600">
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
    <li className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <span className="text-slate-800">
        {observation.testName}
        {observation.isPinned ? (
          <span
            className="ml-1.5 text-brand-600"
            title="Pinned to the cockpit by a clinician"
            aria-label="pinned"
          >
            ★
          </span>
        ) : null}
        <span className="numeric ml-2 text-xs text-slate-500">{observation.observedDate}</span>
      </span>

      <span className="shrink-0 text-right">
        <span className="numeric font-medium text-slate-900">
          {formatObservationValue(observation.value)}
        </span>
        {range ? (
          <span className="numeric block text-xs text-slate-500">
            lab range {range}
            {/*
              Worded as a comparison against what the laboratory printed, never
              as "abnormal". The system does not classify findings; only a
              clinician does (PRD §3).
            */}
            {outside === true ? (
              <span className="ml-1 text-caution-700">outside</span>
            ) : null}
          </span>
        ) : null}
      </span>
    </li>
  )
}

function ScanRow({ scan }: { scan: ScanReport }) {
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
    <li className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-900">
          {SCAN_TYPE_LABELS[scan.scanType] ?? 'Ultrasound'}
          {scan.isPinned ? <span className="ml-1.5 text-brand-600">★</span> : null}
        </span>
        <span className="numeric shrink-0 text-xs text-slate-500">
          {scan.scanDate}
          {scan.gaDaysAtScan !== null
            ? ` · ${formatGestationalAge(splitGestationalAge(scan.gaDaysAtScan))}`
            : ''}
        </span>
      </div>

      {measurements.length > 0 ? (
        <p className="numeric mt-1 text-sm text-slate-700">{measurements.join(' · ')}</p>
      ) : null}

      {scan.impression ? (
        <p className="mt-1 text-sm text-slate-600">{scan.impression}</p>
      ) : null}
    </li>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-4xl px-6 py-6">{children}</main>
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5">{children}</section>
}
