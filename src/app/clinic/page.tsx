import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, CalendarHeart, Info } from 'lucide-react'

import type { Permission } from '@core/auth/permissions'
import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { getUnreviewedPatientQueries } from './patient-queries'

/**
 * Clinic home.
 *
 * Deliberately not a mocked-up dashboard. It reports what this signed-in actor
 * may actually do, derived from the authorization matrix rather than
 * hand-written per screen, and marks the workflows that are not built yet as
 * not built. A screen that looks finished while nothing behind it works is the
 * failure mode `docs/development-foundation.md` §1 calls out.
 */

export const metadata = { title: 'Clinic' }
export const dynamic = 'force-dynamic'

interface Workflow {
  readonly label: string
  readonly description: string
  readonly permission: Permission
  readonly href: Route | null
}

/**
 * The staff workflows, each gated on the permission it genuinely needs.
 *
 * Reading the gate from the same matrix the services enforce means this list
 * cannot drift from what the server will actually allow — a button that leads
 * to a refusal is worse than no button.
 */
const WORKFLOWS: readonly Workflow[] = [
  {
    label: 'Scan a file',
    description: 'Point a scanner at the sticker to open her record.',
    permission: 'patient.read',
    href: '/clinic/scan',
  },
  {
    label: 'Find a patient',
    description: 'Search by file number, name or phone. Also the fallback when a sticker will not scan.',
    permission: 'patient.search',
    href: '/clinic/patients',
  },
  {
    label: 'Register a patient',
    description: 'New mother, or a returning one with a new pregnancy.',
    permission: 'patient.register',
    href: '/clinic/patients/new',
  },
  {
    label: 'Record visit vitals',
    description: 'Open today\u2019s visit and enter observations. Reached through her record.',
    permission: 'visit.record_vitals',
    href: '/clinic/patients',
  },
  {
    label: 'Voice Intake Queue',
    description: 'Listen to and assign pending vernacular voice notes to patients.',
    permission: 'query.associate',
    href: '/clinic/voice',
  },
  {
    label: 'Upload a report',
    description: 'Photograph a lab slip or scan for review.',
    permission: 'upload.create',
    href: null,
  },
  {
    label: 'Consultation cockpit',
    description: 'The full record on one screen. Reached by scanning her file, or through her record.',
    permission: 'observation.read',
    href: '/clinic/scan',
  },
  {
    label: 'Emergency referral',
    description: 'Issue a handover document for a transfer.',
    permission: 'referral.issue',
    href: null,
  },
]

const triageIcon = {
  CRITICAL: <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />,
  IMPORTANT: <CalendarHeart className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />,
  NORMAL: <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />,
}

const triageBadge: Record<string, string> = {
  CRITICAL: 'bg-rose-100 text-rose-700',
  IMPORTANT: 'bg-amber-100 text-amber-700',
  NORMAL: 'bg-blue-100 text-blue-700',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export default async function ClinicHomePage() {
  const session = await resolveSession()

  // The layout has already handled every other outcome; this narrows the type
  // and is unreachable in practice.
  if (session.status !== 'ACTIVE') redirect('/sign-in?next=/clinic')

  const { actor } = session
  const permitted = WORKFLOWS.filter((w) => roleHasPermission(actor.role, w.permission))

  // Fetch patient triage queries for this clinic — non-fatal if the table isn't ready yet
  const patientQueries = await getUnreviewedPatientQueries(actor.clinicId).catch(() => [])

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900">
          Good day, {actor.displayName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Acting as <span className="lowercase">{actor.role}</span>. Everything
          you record is attributed to you and audited.
        </p>
      </header>

      {/* Patient Queries (Triage) Panel */}
      {patientQueries.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold tracking-wide text-slate-900 uppercase">
            Patient Queries — Needs Review
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Questions submitted by patients via the mobile app. Review before their consultation.
          </p>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {patientQueries.map((q) => (
              <li key={q.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                {triageIcon[q.triageLevel]}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900 truncate">{q.patientName}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${triageBadge[q.triageLevel]}`}>
                      {q.triageLevel}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400 ml-auto">{formatTime(q.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 italic">&ldquo;{q.queryText}&rdquo;</p>
                  <p className="text-xs text-slate-400 mt-0.5">Bot: {q.botResponse}</p>
                </div>
                <Link
                  href={`/clinic/patients/${q.patientId}/cockpit` as Route}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700"
                >
                  Open File
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold tracking-wide text-slate-900 uppercase">
          Available to you
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Derived from your role, not from this page. The server enforces the
          same list.
        </p>

        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {permitted.map((workflow) => (
            <li key={workflow.label} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{workflow.label}</p>
                <p className="text-sm text-slate-500">{workflow.description}</p>
              </div>
              {/*
                Honest state. A workflow with no screen behind it says so
                rather than offering a link that goes nowhere — a fixture
                masquerading as a feature is the thing to avoid here.
              */}
              {workflow.href ? (
                <Link
                  href={workflow.href}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
                >
                  Open
                </Link>
              ) : (
                <span className="shrink-0 rounded-full bg-caution-100 px-2.5 py-1 text-xs font-medium text-caution-700">
                  Not built yet
                </span>
              )}
            </li>
          ))}
        </ul>

        {permitted.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Your role has no clinical workflows. Administrators manage clinic
            membership and can review the audit log, but do not have access to
            patient records.
          </p>
        ) : null}
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Session</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Clinic</dt>
          <dd className="numeric text-slate-800">{actor.clinicId}</dd>
          <dt className="text-slate-500">Staff record</dt>
          <dd className="numeric text-slate-800">{actor.staffUserId}</dd>
          <dt className="text-slate-500">Request</dt>
          <dd className="numeric text-slate-800">{actor.requestId}</dd>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Shown during development to confirm the actor resolves from the
          database on every request. The request identifier correlates the audit
          rows a single action writes.
        </p>
      </section>
    </main>
  )
}
