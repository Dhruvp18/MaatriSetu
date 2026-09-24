import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, CalendarHeart, Info } from 'lucide-react'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { todayIn } from '@core/obstetrics/dating'
import { getTodayList } from '@modules/schedule/schedule.service'

import { PatientFinder } from './patient-finder'
import { listUnreviewedQueries } from '@/modules/patient-portal/portal.service'
import { TodayList } from './today-list'

/**
 * Clinic home — the start of the clinic day.
 *
 * One screen per role, built around the same three things: today's list, a
 * search that finds her by name, file number or phone, and her card's QR.
 * Choosing a patient goes straight to her cockpit; everything about her lives
 * there. The counter's jobs — vitals, reports, the next booking — sit on each
 * row of the list for the roles that do them.
 *
 * Every control is gated on the permission the server enforces for it, so a
 * button never leads to a refusal.
 */

export const metadata = { title: 'Clinic' }
export const dynamic = 'force-dynamic'

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
  const can = (permission: Parameters<typeof roleHasPermission>[1]) => roleHasPermission(actor.role, permission)
  const today = todayIn(actor.clinicTimezone)

  const [entries, patientQueries] = await Promise.all([
    can('visit.read') ? getTodayList(actor) : Promise.resolve([]),
    // Non-fatal: the home list must render even if this read fails.
    can('query.read') ? listUnreviewedQueries(actor).catch(() => []) : Promise.resolve([]),
  ])

  const dateLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone: actor.clinicTimezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-heading text-xl font-bold text-slate-900">Good day, {actor.displayName}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {dateLabel} · acting as <span className="lowercase">{actor.role}</span>
          </p>
        </div>
        {can('query.associate') ? (
          <Link href="/clinic/voice" className="text-sm font-semibold text-brand-700 hover:underline">
            Voice intake queue →
          </Link>
        ) : null}
      </header>

      {can('patient.search') ? (
        <PatientFinder
          canRegister={can('patient.register')}
          canScan={can('patient.read')}
          openTarget={can('observation.read') ? 'cockpit' : 'reports'}
        />
      ) : null}

      {can('visit.read') ? (
        <TodayList
          entries={entries}
          today={today}
          canOpenCockpit={can('observation.read')}
          canRecordVitals={can('visit.record_vitals') && !can('visit.save')}
          canUpload={can('upload.create') && !can('visit.save')}
          canSchedule={can('visit.open')}
        />
      ) : null}

      {patientQueries.length > 0 ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold tracking-wide text-slate-900 uppercase">
            Patient queries — needs review
          </h2>
          <p className="mb-3 text-sm text-slate-500">
            Questions submitted by patients via the mobile app. Review before their consultation.
          </p>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {patientQueries.map((q) => (
              <li key={q.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                {triageIcon[q.triageLevel]}
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{q.patientName}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${triageBadge[q.triageLevel]}`}>
                      {q.triageLevel}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">{formatTime(q.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 italic">&ldquo;{q.queryText}&rdquo;</p>
                  <p className="mt-0.5 text-xs text-slate-400">Bot: {q.botResponse}</p>
                </div>
                <Link
                  href={`/clinic/patients/${q.patientId}/cockpit` as Route}
                  className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700"
                >
                  Open cockpit
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!can('patient.search') ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Your role has no clinical workflows. Administrators manage clinic membership and can review the
          audit log, but do not have access to patient records.
        </p>
      ) : null}
    </main>
  )
}
