import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { getPatient } from '@modules/patients/patient.service'
import { getActivePregnancy } from '@modules/pregnancies/pregnancy.service'
import { listReports } from '@modules/reports/report.service'
import {
  formatReferenceRange,
  isFixtureExtraction,
  type ReportWithExtraction,
} from '@modules/reports/report.types'
import { getOpenVisit } from '@modules/visits/visit.service'

import { CandidateRow, type CandidateView } from './candidate-row'
import { UploadForm } from './upload-form'

/**
 * Report intake and review (PRD F2).
 *
 * The counter's screen, not the consultation's. An assistant photographs a lab
 * slip, a model reads it, and staff fix what it misread. Everything on this
 * page is a proposal: no value here appears in the patient's history, on the
 * cockpit, in a trend or on a referral slip.
 *
 * The one act this page cannot perform is verification. Turning a candidate
 * into a clinical fact happens in the cockpit, by a doctor, inside Save & Next
 * — so that approving a result and recording the consultation it was approved
 * in cannot come apart. The banner at the bottom says so to whoever is reading.
 *
 * It is reachable by an assistant, who holds `upload.create` and
 * `upload.read` but not `patient.read`. That shapes the header: the page is
 * built to work without demographics, and shows the file number alone when
 * that is all the reader is entitled to.
 */

export const metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect(`/sign-in?next=/clinic/patients/${id}/reports`)

  const { actor } = session

  if (!roleHasPermission(actor.role, 'upload.read')) {
    return (
      <Shell>
        <Panel>
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your role ({actor.role.toLowerCase()}) does not include report intake.
          </p>
        </Panel>
      </Shell>
    )
  }

  // Demographics are a separate permission from report intake, and an assistant
  // holds the second without the first. The page degrades to the file number
  // rather than refusing to open.
  let heading = 'This patient'
  if (roleHasPermission(actor.role, 'patient.read')) {
    try {
      const patient = await getPatient(actor, id)
      heading = `${patient.fullName} · ${patient.uhid}`
    } catch (error) {
      if (error instanceof AppError && (error.kind === 'NOT_FOUND' || error.kind === 'FORBIDDEN')) {
        notFound()
      }
      throw error
    }
  }

  const pregnancy = roleHasPermission(actor.role, 'pregnancy.read')
    ? await getActivePregnancy(actor, id)
    : null

  // Attached to the open consultation when there is one, so the slip
  // photographed during a visit is linked to it. Absence is normal: most
  // reports arrive at the counter, before anyone opens a visit.
  const openVisit =
    pregnancy && roleHasPermission(actor.role, 'visit.read')
      ? await getOpenVisit(actor, pregnancy.id)
      : null

  const reports = pregnancy ? await listReports(actor, pregnancy.id) : []
  const canCorrect = roleHasPermission(actor.role, 'upload.correct_candidates')

  return (
    <Shell>
      <div className="no-print">
        <Link href={`/clinic/patients/${id}`} className="text-sm text-brand-600 hover:underline">
          ← Back to the record
        </Link>
      </div>

      <header className="mt-2 mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">{heading}</p>
      </header>

      <div className="space-y-4">
        <Panel>
          <SectionTitle>Add a report</SectionTitle>
          {pregnancy === null ? (
            <p className="text-sm text-slate-600">
              {roleHasPermission(actor.role, 'pregnancy.read')
                ? 'No pregnancy is open for this patient. Reports belong to an episode, so one has to be opened before a slip can be attached.'
                : 'Reports are attached to a pregnancy episode, which your role cannot see. Ask nursing staff to attach this one.'}
            </p>
          ) : (
            <UploadForm
              patientId={id}
              pregnancyId={pregnancy.id}
              visitId={openVisit?.id ?? null}
            />
          )}
        </Panel>

        <Panel>
          <SectionTitle>On file</SectionTitle>
          {reports.length === 0 ? (
            <p className="text-sm text-slate-600">
              Nothing uploaded for this pregnancy yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {reports.map((report) => (
                <ReportCard
                  key={report.upload.id}
                  report={report}
                  patientId={id}
                  canCorrect={canCorrect}
                />
              ))}
            </ul>
          )}
        </Panel>

        {/*
          Stated on the page rather than only in a doc. Someone correcting a
          digit at a counter should be able to see, without being told, that
          they are not entering a result — and that the reason nothing they do
          here shows up in the record is the design, not a bug.
        */}
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
          Nothing on this page is part of the patient&rsquo;s record. These are
          readings proposed from a photograph. They enter her history only when
          a doctor verifies them while saving a consultation, and the original
          image is kept so any value can be checked against the paper it came
          from.
        </p>
      </div>
    </Shell>
  )
}

function ReportCard({
  report,
  patientId,
  canCorrect,
}: {
  report: ReportWithExtraction
  patientId: string
  canCorrect: boolean
}) {
  const { upload, extraction } = report

  return (
    <li className="rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-2.5">
        <span className="text-sm font-medium text-slate-900">
          {extraction.status === 'READY' && extraction.reportType
            ? REPORT_TYPE_LABELS[extraction.reportType]
            : 'Report'}
        </span>
        <span className="numeric text-xs text-slate-500">
          {upload.uploadedAt.slice(0, 10)} · {Math.round(upload.byteSize / 1024)} KB
        </span>
      </div>

      <div className="px-4 py-3">
        {/*
          The four extraction states each get their own sentence. "Not started"
          and "read nothing" are different facts, and collapsing them is how a
          screen tells a clinician a slip was blank when it was merely queued.
        */}
        {extraction.status === 'NOT_STARTED' ? (
          <p className="text-sm text-slate-600">
            Waiting to be read. Nothing has been proposed from it yet.
          </p>
        ) : null}

        {extraction.status === 'IN_PROGRESS' ? (
          <p className="text-sm text-slate-600">
            Being read now (attempt {extraction.attemptNo}).
          </p>
        ) : null}

        {extraction.status === 'FAILED' ? (
          <p className="rounded-lg border border-caution-700/30 bg-caution-50 px-3 py-2 text-sm text-caution-700">
            Could not be read ({extraction.errorCode.toLowerCase().replace(/_/g, ' ')}).
            {extraction.errorMessage ? ` ${extraction.errorMessage}` : ''} Enter
            the values by hand, or photograph the slip again.
          </p>
        ) : null}

        {extraction.status === 'READY' ? (
          <>
            {isFixtureExtraction(extraction) ? (
              <p className="mb-2 rounded-lg border border-caution-700/30 bg-caution-50 px-3 py-2 text-sm text-caution-700">
                Sample output. No image was read — these values are canned
                demonstration data, not a reading of this photograph.
              </p>
            ) : null}

            {report.reviewedAt !== null ? (
              <p className="mb-2 text-sm text-slate-600">
                Verified by a doctor on {report.reviewedAt.slice(0, 10)}. The
                accepted values are in her record.
              </p>
            ) : null}

            {extraction.candidates.length === 0 ? (
              <p className="text-sm text-slate-600">
                Read, but no values were found on it. Check the photograph shows
                the whole printed area.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {extraction.candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={toView(candidate)}
                    patientId={patientId}
                    canCorrect={canCorrect && report.reviewedAt === null}
                  />
                ))}
              </ul>
            )}

            <p className="mt-2 text-xs text-slate-400">
              {extraction.provider} · {extraction.model} · {extraction.promptVersion}
            </p>
          </>
        ) : null}
      </div>
    </li>
  )
}

/** Flatten a candidate for the client component, which cannot take a union. */
function toView(
  candidate: Extract<ReportWithExtraction['extraction'], { status: 'READY' }>['candidates'][number],
): CandidateView {
  return {
    id: candidate.id,
    testCode: candidate.testCode,
    printedLabel: candidate.printedLabel,
    valueNumeric: candidate.value.kind === 'NUMERIC' ? candidate.value.value : null,
    valueText: candidate.value.kind === 'TEXT' ? candidate.value.text : null,
    unit: candidate.value.kind === 'NUMERIC' ? candidate.value.unit : null,
    observedDate: candidate.observedDate,
    referenceRange: formatReferenceRange(candidate.referenceRange),
    confidence: candidate.confidence,
    correctionVersion: candidate.correctionVersion,
  }
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  CBC: 'Complete blood count',
  OGTT: 'Glucose tolerance',
  SEROLOGY: 'Serology',
  URINE: 'Urine',
  BLOOD_GROUP: 'Blood group',
  THYROID: 'Thyroid',
  LFT: 'Liver function',
  RFT: 'Renal function',
  HPLC: 'HPLC',
  ULTRASOUND: 'Ultrasound',
  OTHER: 'Report',
  UNRECOGNISED: 'Unrecognised report',
}

/* -------------------------------------------------------------------------- */

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5">{children}</section>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
      {children}
    </h2>
  )
}
