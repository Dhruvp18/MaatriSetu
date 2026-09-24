'use client'

import { Activity, CalendarPlus, ChevronRight, FileUp, Stethoscope } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ScheduleModal } from './patients/[id]/cockpit/visit-buttons'

/**
 * One patient list, three views: today's, every patient, and the flagged.
 *
 * The whole row opens her cockpit. The small actions on the right are the
 * counter's jobs — vitals, reports, the next booking — so a nurse can work the
 * list without opening each record.
 *
 * Rows arrive already shaped by the page; this component only lays them out.
 */

export type DayStatus = 'Waiting' | 'In consultation' | 'Seen'

interface Cell {
  readonly text: string
  /** `value` is a recorded number or date; `caution` needs attention; `muted` is an honest absence. */
  readonly tone: 'value' | 'caution' | 'muted'
}

const CELL_STYLES: Record<Cell['tone'], string> = {
  value: 'numeric font-semibold text-slate-800',
  caution: 'text-caution-700',
  muted: 'text-slate-400',
}

export interface PatientTableRow {
  readonly patientId: string
  readonly fullName: string
  readonly uhid: string
  readonly ageLabel: string | null
  readonly gpla: string | null
  /**
   * Null means "not known here", rendered as a dash — never as a negative
   * finding (ARCH-10). "No open pregnancy" is a value, and arrives as one.
   */
  readonly pog: Cell | null
  readonly lastVisit: Cell | null
  readonly flags: readonly { readonly label: string; readonly tone: 'alert' | 'caution' }[]
  /** Where she is in today's flow; null when she is not on today's list. */
  readonly status: DayStatus | null
  readonly reasons: readonly string[]
  readonly purpose: string | null
}

const STATUS_STYLES: Record<DayStatus, string> = {
  Waiting: 'border-caution-200 bg-caution-50 text-caution-900',
  'In consultation': 'border-brand-200 bg-brand-50 text-brand-800',
  Seen: 'border-verified-200 bg-verified-50 text-verified-700',
}

const FLAG_STYLES = {
  alert: 'border-alert-200 bg-alert-50 text-alert-700',
  caution: 'border-caution-200 bg-caution-50 text-caution-700',
} as const

const GRID = 'md:grid md:grid-cols-[2rem_minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_auto] md:items-center md:gap-3'

export function PatientTable({
  title,
  rows,
  emptyText,
  summary,
  today,
  canOpenCockpit,
  canRecordVitals,
  canUpload,
  canSchedule,
}: {
  title: string
  rows: readonly PatientTableRow[]
  emptyText: string
  summary?: React.ReactNode
  today: string
  canOpenCockpit: boolean
  canRecordVitals: boolean
  canUpload: boolean
  canSchedule: boolean
}) {
  const router = useRouter()
  const [scheduling, setScheduling] = useState<PatientTableRow | null>(null)

  return (
    <section className="glass overflow-hidden rounded-xl border border-slate-200 shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h2 className="font-heading text-sm font-bold text-slate-900">{title}</h2>
          <span className="numeric text-xs text-slate-500">
            {rows.length} {rows.length === 1 ? 'patient' : 'patients'}
          </span>
        </div>
        {summary}
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">{emptyText}</p>
      ) : (
        <>
          <div
            aria-hidden
            className={`hidden border-b border-slate-100 px-4 py-2 text-[10px] font-semibold tracking-wider text-slate-500 uppercase ${GRID}`}
          >
            <span>#</span>
            <span>Patient</span>
            <span>POG</span>
            <span>Last visit</span>
            <span>Flags</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </div>

          <ul className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const open = () => canOpenCockpit && router.push(`/clinic/patients/${row.patientId}/cockpit` as Route)
              return (
                <li
                  key={row.patientId}
                  onClick={open}
                  className={`flex flex-col gap-2 px-4 py-3 transition-colors ${GRID} ${
                    canOpenCockpit ? 'cursor-pointer hover:bg-brand-50/40' : ''
                  }`}
                >
                  <span className="numeric hidden text-xs font-bold text-brand-800 md:block">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-heading truncate text-sm font-bold text-slate-900">{row.fullName}</span>
                      <span className="numeric text-[11px] text-slate-500">{row.uhid}</span>
                    </div>
                    <div className="numeric mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      {row.ageLabel ? <span>{row.ageLabel}</span> : null}
                      {row.ageLabel && row.gpla ? <span className="text-slate-300">·</span> : null}
                      {row.gpla ? <span>{row.gpla}</span> : null}
                      {row.reasons.map((reason) => (
                        <span key={reason} className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                          {reason}
                        </span>
                      ))}
                      {row.purpose ? <span>· {row.purpose}</span> : null}
                    </div>
                  </div>

                  <LabelledCell label="POG" cell={row.pog} />
                  <LabelledCell label="Last visit" cell={row.lastVisit} />

                  <div className="flex flex-wrap gap-1">
                    {row.flags.map((flag) => (
                      <span
                        key={flag.label}
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${FLAG_STYLES[flag.tone]}`}
                      >
                        {flag.label}
                      </span>
                    ))}
                  </div>

                  <div>
                    {row.status ? (
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[row.status]}`}>
                        {row.status}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Not due today</span>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 md:justify-end" onClick={(e) => e.stopPropagation()}>
                    {canRecordVitals ? (
                      <RowAction href={`/clinic/patients/${row.patientId}/visit` as Route} icon={<Activity className="h-3.5 w-3.5" />}>
                        Vitals
                      </RowAction>
                    ) : null}
                    {canUpload ? (
                      <RowAction href={`/clinic/patients/${row.patientId}/reports` as Route} icon={<FileUp className="h-3.5 w-3.5" />}>
                        Reports
                      </RowAction>
                    ) : null}
                    {canSchedule ? (
                      <button
                        type="button"
                        onClick={() => setScheduling(row)}
                        className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-brand-200 hover:text-brand-800"
                      >
                        <CalendarPlus aria-hidden className="h-3.5 w-3.5" />
                        Next visit
                      </button>
                    ) : null}
                    {canOpenCockpit ? (
                      <Link
                        href={`/clinic/patients/${row.patientId}/cockpit` as Route}
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
        </>
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

/** A table cell that carries its own label on a phone, where there is no header row. */
function LabelledCell({ label, cell }: { label: string; cell: Cell | null }) {
  return (
    <div className="flex items-baseline gap-2 text-xs md:block">
      <span className="w-16 shrink-0 text-[10px] font-semibold tracking-wider text-slate-400 uppercase md:hidden">
        {label}
      </span>
      {cell ? <span className={CELL_STYLES[cell.tone]}>{cell.text}</span> : <span className="text-slate-400">—</span>}
    </div>
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
