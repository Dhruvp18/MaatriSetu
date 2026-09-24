'use client'

import { CalendarPlus, Loader2, PlayCircle, X } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Modal } from '@components/cockpit/modal'
import type { Appointment } from '@modules/schedule/schedule.types'

import { cancelAppointmentAction, scheduleVisitAction, startConsultationAction } from './visit-actions'

/** Opens today's visit. Idempotent: a second click returns the same visit. */
export function StartConsultationButton({
  patientId,
  pregnancyId,
  label = 'Start today’s consultation',
}: {
  patientId: string
  pregnancyId: string
  label?: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await startConsultationAction(patientId, pregnancyId)
            if (!result.ok) setError(result.message)
          })
        }
        className="font-heading flex items-center gap-2 rounded-lg bg-brand-800 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60 sm:text-sm"
      >
        {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <PlayCircle aria-hidden className="h-4.5 w-4.5" />}
        {label}
      </button>
      {error ? <span className="text-[11px] text-alert-700">{error}</span> : null}
    </span>
  )
}

/** The next booking, and a way to make or change one. */
export function NextVisitChip({
  patientId,
  pregnancyId,
  upcoming,
  canSchedule,
  today,
}: {
  patientId: string
  pregnancyId: string | null
  upcoming: readonly Appointment[]
  canSchedule: boolean
  today: string
}) {
  const [open, setOpen] = useState(false)
  const next = upcoming[0] ?? null

  return (
    <>
      <button
        type="button"
        onClick={() => canSchedule && setOpen(true)}
        disabled={!canSchedule}
        className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100/90 px-2.5 py-1 text-xs text-slate-600 transition-colors enabled:hover:bg-slate-200 enabled:hover:text-brand-800"
      >
        <CalendarPlus aria-hidden className="h-4 w-4 text-slate-500" />
        {next ? (
          <span>
            Next visit <strong className="numeric font-semibold text-slate-800">{next.scheduledOn}</strong>
          </span>
        ) : (
          <span>Schedule next visit</span>
        )}
      </button>
      {open ? (
        <ScheduleModal
          patientId={patientId}
          pregnancyId={pregnancyId}
          upcoming={upcoming}
          today={today}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

export function ScheduleModal({
  patientId,
  pregnancyId,
  upcoming,
  today,
  patientName,
  onClose,
}: {
  patientId: string
  pregnancyId: string | null
  upcoming: readonly Appointment[]
  today: string
  patientName?: string
  onClose: () => void
}) {
  const [date, setDate] = useState('')
  const [purpose, setPurpose] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const inDays = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }

  const save = () =>
    startTransition(async () => {
      setError(null)
      const result = await scheduleVisitAction({ patientId, pregnancyId, scheduledOn: date, purpose: purpose || null })
      if (result.ok) onClose()
      else setError(result.message)
    })

  const cancel = (appointmentId: string) =>
    startTransition(async () => {
      const result = await cancelAppointmentAction(patientId, appointmentId)
      if (!result.ok) setError(result.message)
    })

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={patientName ? `Next visit · ${patientName}` : 'Schedule next visit'}
      subtitle="A booking, not a visit. She appears on that day’s list."
      footer={
        <>
          {error ? <p className="mr-auto text-[11px] text-alert-700">{error}</p> : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || !date}
            className="rounded-md bg-brand-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Book visit'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            ['1 week', 7],
            ['2 weeks', 14],
            ['4 weeks', 28],
          ].map(([label, days]) => (
            <button
              key={label}
              type="button"
              onClick={() => setDate(inDays(days as number))}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-brand-200 hover:text-brand-800"
            >
              in {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Date</span>
          <input
            type="date"
            min={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="numeric rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Purpose (optional)</span>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Routine ANC, scan review, reports…"
            className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
        </label>

        {upcoming.length > 0 ? (
          <div>
            <p className="mb-1 text-[11px] font-semibold text-slate-600">Already booked</p>
            <ul className="flex flex-col gap-1">
              {upcoming.map((a) => (
                <li key={a.id} className="numeric flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs">
                  <span>
                    {a.scheduledOn}
                    {a.purpose ? <span className="text-slate-500"> · {a.purpose}</span> : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => cancel(a.id)}
                    disabled={pending}
                    className="flex items-center gap-0.5 text-[11px] text-slate-500 hover:text-alert-700"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" /> Cancel
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
