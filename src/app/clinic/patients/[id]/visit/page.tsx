import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { roleHasPermission } from '@core/auth/permissions'
import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { formatGestationalAge, gestationalAge, todayIn } from '@core/obstetrics/dating'
import { getPatient } from '@modules/patients/patient.service'
import { getActivePregnancyWithHistory } from '@modules/pregnancies/pregnancy.service'
import type { VitalsReading } from '@modules/visits/visit.types'
import { getOpenVisit, getVisitWithVitals } from '@modules/visits/visit.service'

import { StartVisitButton, VitalsForm } from './vitals-form'

/**
 * Today's visit, and the observations taken during it.
 *
 * The nurse's screen. She opens the visit and records vitals before the doctor
 * ever sees the patient — which is the point: making that wait on a clinician
 * puts the bottleneck exactly where the product is trying to remove it.
 */

export const metadata = { title: 'Visit' }
export const dynamic = 'force-dynamic'

const DIPSTICK_LABELS: Record<string, string> = {
  NIL: 'Nil',
  TRACE: 'Trace',
  ONE_PLUS: '1+',
  TWO_PLUS: '2+',
  THREE_PLUS: '3+',
  FOUR_PLUS: '4+',
}

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const session = await resolveSession()
  if (session.status !== 'ACTIVE') redirect(`/sign-in?next=/clinic/patients/${id}/visit`)

  const { actor } = session

  if (!roleHasPermission(actor.role, 'visit.read')) {
    return (
      <Shell>
        <Panel>
          <h1 className="text-lg font-semibold text-slate-900">Not available to you</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your role ({actor.role.toLowerCase()}) cannot open a visit.
          </p>
        </Panel>
      </Shell>
    )
  }

  let patientName: string
  try {
    patientName = (await getPatient(actor, id)).fullName
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
        <Back id={id} name={patientName} />
        <Panel>
          <h1 className="text-lg font-semibold text-slate-900">No open pregnancy</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            A visit belongs to a pregnancy episode, so one has to be opened
            first.
          </p>
          {roleHasPermission(actor.role, 'pregnancy.create') ? (
            <Link
              href={`/clinic/patients/${id}/pregnancy/new`}
              className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Open a pregnancy
            </Link>
          ) : null}
        </Panel>
      </Shell>
    )
  }

  const { pregnancy } = episode
  const openVisit = await getOpenVisit(actor, pregnancy.id)
  const today = todayIn(actor.clinicTimezone)

  // Computed live, not read from the visit: `gaDaysAtVisit` is null until the
  // consultation is saved, and that null means "compute from current dating"
  // rather than "missing".
  const gestation =
    pregnancy.dating.status === 'ESTABLISHED'
      ? formatGestationalAge(gestationalAge(pregnancy.dating.reference, today))
      : null

  const readings: readonly VitalsReading[] = openVisit
    ? (await getVisitWithVitals(actor, openVisit.id)).vitals
    : []

  return (
    <Shell>
      <Back id={id} name={patientName} />

      <header className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Today’s visit</h1>
        <p className="mt-1 text-sm text-slate-500">
          {patientName}
          {gestation ? ` · ${gestation}` : ' · dating not established'}
        </p>
      </header>

      {!openVisit ? (
        <Panel>
          <h2 className="text-sm font-semibold text-slate-900">No visit open</h2>
          <p className="mt-1 mb-4 text-sm text-slate-600">
            Starting a visit records an encounter with today’s date, attributed
            to you.
          </p>
          {roleHasPermission(actor.role, 'visit.open') ? (
            <StartVisitButton pregnancyId={pregnancy.id} patientId={id} />
          ) : (
            <p className="text-sm text-slate-600">
              Your role cannot start a visit.
            </p>
          )}
        </Panel>
      ) : (
        <div className="space-y-4">
          {readings.length > 0 ? (
            <Panel>
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Recorded this visit
              </h2>
              <ul className="space-y-3">
                {readings.map((reading) => (
                  <li
                    key={reading.id}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-slate-900">
                        Reading {reading.sequenceNo}
                      </span>
                      <span className="numeric text-xs text-slate-500">
                        {new Date(reading.recordedAt).toLocaleTimeString('en-IN', {
                          timeZone: actor.clinicTimezone,
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="numeric text-slate-700">{summarise(reading)}</p>
                    {reading.note ? (
                      <p className="mt-1 text-slate-500">{reading.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {roleHasPermission(actor.role, 'visit.record_vitals') ? (
            <Panel>
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                {readings.length === 0 ? 'Record vitals' : 'Record another reading'}
              </h2>
              <VitalsForm
                visitId={openVisit.id}
                patientId={id}
                readingNumber={readings.length + 1}
              />
            </Panel>
          ) : null}
        </div>
      )}
    </Shell>
  )
}

/**
 * One line per reading, listing only what was actually measured.
 *
 * Absent values are omitted rather than shown as dashes or zeros: a chart line
 * reading "BP —/— " invites the eye to treat it as a measurement that was taken
 * and found unremarkable.
 */
function summarise(reading: VitalsReading): string {
  const parts: string[] = []

  if (reading.bloodPressure) {
    parts.push(
      `BP ${reading.bloodPressure.systolicMmHg}/${reading.bloodPressure.diastolicMmHg} mmHg`,
    )
  }
  if (reading.pulseBpm !== null) parts.push(`Pulse ${reading.pulseBpm} bpm`)
  if (reading.weightKg !== null) parts.push(`Weight ${reading.weightKg} kg`)
  if (reading.fundalHeightCm !== null) parts.push(`SFH ${reading.fundalHeightCm} cm`)
  if (reading.fetalHeartRateBpm !== null) parts.push(`FHR ${reading.fetalHeartRateBpm} bpm`)
  if (reading.temperatureC !== null) parts.push(`Temp ${reading.temperatureC} °C`)
  if (reading.spo2Percent !== null) parts.push(`SpO₂ ${reading.spo2Percent}%`)
  if (reading.urineAlbumin) {
    parts.push(`Albumin ${DIPSTICK_LABELS[reading.urineAlbumin] ?? reading.urineAlbumin}`)
  }
  if (reading.urineSugar) {
    parts.push(`Sugar ${DIPSTICK_LABELS[reading.urineSugar] ?? reading.urineSugar}`)
  }

  return parts.join(' · ')
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-6 py-10">{children}</main>
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5">{children}</section>
}

function Back({ id, name }: { id: string; name: string }) {
  return (
    <div className="mb-2">
      <Link href={`/clinic/patients/${id}`} className="text-sm text-brand-600 hover:underline">
        ← {name}
      </Link>
    </div>
  )
}
