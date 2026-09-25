import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlertTriangle, CalendarHeart, Info, UserPlus } from 'lucide-react'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { formatGestationalAge, gestationalAge, todayIn } from '@core/obstetrics/dating'
import { ageInYears } from '@modules/patients/patient.types'
import { listRoster } from '@modules/roster/roster.service'
import {
  ROSTER_FLAG_LABELS,
  type RosterEntry,
  type RosterFlag,
  formatGravidaParity,
  hasRecordedFlags,
} from '@modules/roster/roster.types'
import { getTodayList } from '@modules/schedule/schedule.service'
import { type DayListEntry, describeDayStatus } from '@modules/schedule/schedule.types'

import { PatientFinder } from './patient-finder'
import { listUnreviewedQueries } from '@/modules/patient-portal/portal.service'
import { PatientTable, type PatientTableRow } from './patient-table'

/**
 * Clinic home — the start of the clinic day.
 *
 * Three counts across the top — every patient, the flagged, today's — each of
 * which opens its list below. Under them, a search that finds her by name, file
 * number or phone. Choosing a patient goes straight to her cockpit; everything
 * about her lives there. The counter's jobs — vitals, reports, the next booking
 * — sit on each row of the list for the roles that do them.
 *
 * The view lives in the URL (`?view=`), so a list survives a refresh and the
 * back button returns to it.
 *
 * Every control is gated on the permission the server enforces for it, so a
 * button never leads to a refusal.
 */

type View = 'today' | 'all' | 'flagged'

const VIEWS: readonly View[] = ['all', 'flagged', 'today']

const REASON_LABELS: Record<DayListEntry['reasons'][number], string> = {
  APPOINTMENT: 'Booked',
  FOLLOW_UP_ADVISED: 'Follow-up due',
  VISIT: 'Visit today',
}

/** Rh status and allergies are the facts the banner shows in red; the rest are cautions. */
const FLAG_TONE: Record<RosterFlag, 'alert' | 'caution'> = {
  RH_NEGATIVE: 'alert',
  ALLERGY: 'alert',
  UTERINE_SCAR: 'caution',
  FLAGGED_RESULT: 'caution',
}

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

export default async function ClinicHomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const session = await resolveSession()

  // The layout has already handled every other outcome; this narrows the type
  // and is unreachable in practice.
  if (session.status !== 'ACTIVE') redirect('/sign-in?next=/clinic')

  const { actor } = session
  const can = (permission: Parameters<typeof roleHasPermission>[1]) => roleHasPermission(actor.role, permission)
  const today = todayIn(actor.clinicTimezone)
  const canSeeRoster = can('patient.read') && can('visit.read')

  const requested = (await searchParams).view
  const view: View =
    typeof requested === 'string' && (VIEWS as readonly string[]).includes(requested) && canSeeRoster
      ? (requested as View)
      : 'today'

  const [entries, roster, patientQueries] = await Promise.all([
    can('visit.read') ? getTodayList(actor) : Promise.resolve([]),
    canSeeRoster ? listRoster(actor) : Promise.resolve([]),
    // Non-fatal: the home list must render even if this read fails.
    can('query.read') ? listUnreviewedQueries(actor).catch(() => []) : Promise.resolve([]),
  ])

  const dateLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone: actor.clinicTimezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const flagged = roster.filter(hasRecordedFlags)
  const rosterById = new Map(roster.map((entry) => [entry.patientId, entry]))
  const todayById = new Map(entries.map((entry) => [entry.patientId, entry]))
  const toRow = (entry: RosterEntry | undefined, day: DayListEntry | undefined, id: string): PatientTableRow =>
    shapeRow({ entry, day, patientId: id, today, timeZone: actor.clinicTimezone })

  const rows: PatientTableRow[] =
    view === 'today'
      ? entries.map((day) => toRow(rosterById.get(day.patientId), day, day.patientId))
      : (view === 'all' ? roster : flagged).map((entry) => toRow(entry, todayById.get(entry.patientId), entry.patientId))

  const counts = {
    waiting: entries.filter((e) => describeDayStatus(e) === 'Waiting').length,
    inConsultation: entries.filter((e) => describeDayStatus(e) === 'In consultation').length,
    seen: entries.filter((e) => describeDayStatus(e) === 'Seen').length,
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold text-slate-900">Good day, {actor.displayName}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {dateLabel} · acting as <span className="lowercase">{actor.role}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can('query.associate') ? (
            <Link href="/clinic/voice" className="text-sm font-semibold text-brand-700 hover:underline">
              Voice intake queue →
            </Link>
          ) : null}
          {can('patient.register') ? (
            <Link
              href="/clinic/patients/new"
              className="flex items-center gap-1.5 rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700"
            >
              <UserPlus aria-hidden className="h-4 w-4" />
              Add new patient
            </Link>
          ) : null}
        </div>
      </header>

      {canSeeRoster ? (
        <nav aria-label="Patient lists" className="grid gap-3 sm:grid-cols-3">
          <CountCard
            view="all"
            active={view === 'all'}
            count={roster.length}
            label="All patients"
            sub="Every mother registered at this clinic"
            accent="border-t-brand-600"
            countClass="text-brand-800"
          />
          <CountCard
            view="flagged"
            active={view === 'flagged'}
            count={flagged.length}
            label="Recorded flags"
            sub="Rh-negative, allergy, prior scar or a result a clinician flagged"
            accent="border-t-alert-600"
            countClass="text-alert-700"
          />
          <CountCard
            view="today"
            active={view === 'today'}
            count={entries.length}
            label="Today’s patients"
            sub={`Booked, follow-up due or seen · ${new Intl.DateTimeFormat('en-IN', {
              timeZone: actor.clinicTimezone,
              day: 'numeric',
              month: 'short',
            }).format(new Date())}`}
            accent="border-t-caution-600"
            countClass="text-caution-700"
          />
        </nav>
      ) : null}

      {can('patient.search') ? (
        <PatientFinder
          canRegister={can('patient.register')}
          canScan={can('patient.read')}
          openTarget={can('observation.read') ? 'cockpit' : 'reports'}
        />
      ) : null}

      {can('visit.read') ? (
        <PatientTable
          title={view === 'all' ? 'All patients' : view === 'flagged' ? 'Patients with recorded flags' : 'Today’s patients'}
          rows={rows}
          emptyText={
            view === 'all'
              ? 'No patients are registered at this clinic yet. Register the first one to begin.'
              : view === 'flagged'
                ? 'No patient has an Rh-negative group, a recorded allergy, a prior uterine scar or a clinician-flagged result.'
                : 'Nobody is booked or has been seen today yet. Find a patient above, scan her card, or register a new one.'
          }
          summary={
            view === 'today' ? (
              <div className="numeric flex gap-1.5 text-[11px] font-semibold">
                <span className="rounded-full border border-caution-200 bg-caution-50 px-2 py-0.5 text-caution-900">
                  {counts.waiting} waiting
                </span>
                <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-brand-800">
                  {counts.inConsultation} in consultation
                </span>
                <span className="rounded-full border border-verified-200 bg-verified-50 px-2 py-0.5 text-verified-700">
                  {counts.seen} seen
                </span>
              </div>
            ) : view === 'flagged' ? (
              <span className="text-[11px] text-slate-500">Recorded facts only — not a risk score</span>
            ) : null
          }
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

function CountCard({
  view,
  active,
  count,
  label,
  sub,
  accent,
  countClass,
}: {
  view: View
  active: boolean
  count: number
  label: string
  sub: string
  accent: string
  countClass: string
}) {
  return (
    <Link
      href={`/clinic?view=${view}` as Route}
      aria-current={active ? 'page' : undefined}
      className={`glass block rounded-xl border border-t-4 px-4 py-4 shadow-xs transition hover:shadow-md ${accent} ${
        active ? 'border-x-brand-200 border-b-brand-200 ring-2 ring-brand-600/20' : 'border-x-slate-200 border-b-slate-200'
      }`}
    >
      <div className={`numeric font-heading text-3xl leading-none font-bold ${countClass}`}>{count}</div>
      <div className="font-heading mt-2 text-sm font-bold text-slate-900">{label}</div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </Link>
  )
}

/** The calendar day of an instant, in the clinic's zone. */
function dayOf(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(instant),
  )
}

/**
 * One table row from whatever is known about her.
 *
 * A patient on today's list may be missing from the roster (it is capped), so
 * every roster-derived cell falls back to nothing rather than to a guess.
 */
function shapeRow({
  entry,
  day,
  patientId,
  today,
  timeZone,
}: {
  entry: RosterEntry | undefined
  day: DayListEntry | undefined
  patientId: string
  today: string
  timeZone: string
}): PatientTableRow {
  const age = entry ? ageInYears(entry.age, today) : null
  const pregnancy = entry?.pregnancy ?? null

  let lastVisit: PatientTableRow['lastVisit'] = null
  if (entry) {
    lastVisit = !entry.lastVisitAt
      ? { text: 'No visits yet', tone: 'muted' }
      : dayOf(entry.lastVisitAt, timeZone) === today
        ? { text: 'Today', tone: 'value' }
        : {
            text: new Intl.DateTimeFormat('en-IN', { timeZone, day: '2-digit', month: 'short', year: 'numeric' }).format(
              new Date(entry.lastVisitAt),
            ),
            tone: 'value',
          }
  }

  let pog: PatientTableRow['pog'] = null
  if (entry) {
    pog = !pregnancy
      ? { text: 'No open pregnancy', tone: 'muted' }
      : pregnancy.dating
        ? { text: formatGestationalAge(gestationalAge(pregnancy.dating, today)), tone: 'value' }
        : { text: 'Dating not established', tone: 'caution' }
  }

  const flags = (entry?.flags ?? []).map((flag) => ({ label: ROSTER_FLAG_LABELS[flag], tone: FLAG_TONE[flag] as 'alert' | 'caution' | 'neutral' }))
  
  if (entry) {
    const isNormal = !entry.latestDiagnosis || entry.latestDiagnosis.trim() === '' || entry.latestDiagnosis.toLowerCase() === 'normal anc' || entry.latestDiagnosis.toLowerCase() === 'normal'
    if (isNormal) {
      flags.push({ label: 'Normal', tone: 'neutral' })
    } else {
      flags.push({ label: entry.latestDiagnosis!, tone: 'alert' })
    }
  }

  return {
    patientId,
    fullName: entry?.fullName ?? day?.fullName ?? 'Unknown patient',
    uhid: entry?.uhid ?? day?.uhid ?? '—',
    ageLabel: age !== null ? `${age}Y / F` : null,
    gpla: pregnancy ? formatGravidaParity(pregnancy.gravidaParity) : null,
    pog,
    lastVisit,
    flags,
    status: day ? describeDayStatus(day) : null,
    reasons: day ? day.reasons.map((reason) => REASON_LABELS[reason]) : [],
    purpose: day?.purpose ?? null,
  }
}
