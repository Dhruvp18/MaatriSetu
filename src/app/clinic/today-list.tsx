'use client'

import { Activity, CalendarPlus, ChevronRight, FileUp, Stethoscope } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { type DayListEntry, describeDayStatus } from '@modules/schedule/schedule.types'

import { ScheduleModal } from './patients/[id]/cockpit/visit-buttons'

/**
 * Today's patients: booked, advised to return today, or already seen.
 *
 * The whole row opens her cockpit. The small actions on the right are the
 * counter's jobs — vitals, reports, the next booking — so a nurse can work the
 * list without opening each record.
 */

const REASON_LABELS: Record<DayListEntry['reasons'][number], string> = {
  APPOINTMENT: 'Booked',
  FOLLOW_UP_ADVISED: 'Follow-up due',
  VISIT: 'Visit today',
}

const STATUS_STYLES = {
  Waiting: 'border-caution-200 bg-caution-50 text-caution-900',
  'In consultation': 'border-brand-200 bg-brand-50 text-brand-800',
  Seen: 'border-verified-200 bg-verified-50 text-verified-700',
} as const

export function TodayList({
  entries,
  today,
  canOpenCockpit,
  canRecordVitals,
  canUpload,
  canSchedule,
}: {
  entries: readonly DayListEntry[]
  today: string
  canOpenCockpit: boolean
  canRecordVitals: boolean
  canUpload: boolean
  canSchedule: boolean
}) {
  const router = useRouter()
  const [scheduling, setScheduling] = useState<DayListEntry | null>(null)

  const counts = {
    waiting: entries.filter((e) => describeDayStatus(e) === 'Waiting').length,
    inConsultation: entries.filter((e) => describeDayStatus(e) === 'In consultation').length,
    seen: entries.filter((e) => describeDayStatus(e) === 'Seen').length,
  }

  return (
    <section className="glass overflow-hidden rounded-xl border border-slate-200 shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <h2 className="font-heading text-sm font-bold text-slate-900">Today’s patients</h2>
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
      </header>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          Nobody is booked or has been seen today yet. Find a patient above, scan her card, or register
          a new one.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {entries.map((entry) => {
            const status = describeDayStatus(entry)
            const open = () => canOpenCockpit && router.push(`/clinic/patients/${entry.patientId}/cockpit` as Route)
            return (
              <li
                key={entry.patientId}
                onClick={open}
                className={`flex flex-col gap-2 px-4 py-2.5 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                  canOpenCockpit ? 'cursor-pointer hover:bg-brand-50/40' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-sm font-bold text-slate-900">{entry.fullName}</span>
                    <span className="numeric text-xs text-slate-500">{entry.uhid}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[status]}`}>
                      {status}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    {entry.reasons.map((reason) => (
                      <span key={reason} className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                        {REASON_LABELS[reason]}
                      </span>
                    ))}
                    {entry.purpose ? <span>· {entry.purpose}</span> : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {canRecordVitals ? (
                    <RowAction href={`/clinic/patients/${entry.patientId}/visit` as Route} icon={<Activity className="h-3.5 w-3.5" />}>
                      Vitals
                    </RowAction>
                  ) : null}
                  {canUpload ? (
                    <RowAction href={`/clinic/patients/${entry.patientId}/reports` as Route} icon={<FileUp className="h-3.5 w-3.5" />}>
                      Reports
                    </RowAction>
                  ) : null}
                  {canSchedule ? (
                    <button
                      type="button"
                      onClick={() => setScheduling(entry)}
                      className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-brand-200 hover:text-brand-800"
                    >
                      <CalendarPlus aria-hidden className="h-3.5 w-3.5" />
                      Next visit
                    </button>
                  ) : null}
                  {canOpenCockpit ? (
                    <Link
                      href={`/clinic/patients/${entry.patientId}/cockpit` as Route}
                      className="flex items-center gap-1 rounded-md bg-brand-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-brand-700"
                    >
                      <Stethoscope aria-hidden className="h-3.5 w-3.5" />
                      Cockpit
                      <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {scheduling ? (
        <ScheduleModal
          patientId={scheduling.patientId}
          pregnancyId={null}
          upcoming={[]}
          today={today}
          patientName={scheduling.fullName}
          onClose={() => setScheduling(null)}
        />
      ) : null}
    </section>
  )
}

function RowAction({ href, icon, children }: { href: Route; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-brand-200 hover:text-brand-800"
    >
      <span aria-hidden>{icon}</span>
      {children}
    </Link>
  )
}
