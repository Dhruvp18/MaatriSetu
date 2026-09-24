import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { serviceClient, userClient } from '@core/db/clients'
import { validation } from '@core/errors/app-error'
import { todayIn } from '@core/obstetrics/dating'

import { assembleDayList } from './schedule.mapper'
import * as repo from './schedule.repository'
import { ScheduleAppointmentSchema } from './schedule.schema'
import type { Appointment, DayListEntry } from './schedule.types'

/**
 * The schedule module's public API.
 *
 * Reads run as the signed-in user (RLS applies); writes go through the routines
 * in migration 0025. Booking is held by whoever may open a visit — doctor and
 * nurse — because booking the next one is the same kind of act.
 */

/** The calendar day of an instant, in the clinic's zone. */
function dayOf(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant))
}

/**
 * Today's list: booked, advised to return today, or already seen today.
 *
 * "Today" is the clinic's calendar day, never the server's UTC one.
 */
export async function getTodayList(actor: ActorContext): Promise<DayListEntry[]> {
  requirePermission(actor, 'visit.read')

  const db = await userClient()
  const today = todayIn(actor.clinicTimezone)
  // A 36-hour window, then filtered by the clinic's calendar day, so the query
  // needs no timezone arithmetic and still never misses an early-morning visit.
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString()

  const [appointments, followUpPatientIds, recentVisits] = await Promise.all([
    repo.listAppointmentsOn(db, actor.clinicId, today),
    repo.listFollowUpPatientIds(db, actor.clinicId, today),
    repo.listVisitsSince(db, actor.clinicId, since),
  ])

  const visits = recentVisits
    .filter((v) => dayOf(v.occurred_at, actor.clinicTimezone) === today)
    .map((v) => ({ patientId: v.patient_id, status: v.status, openedAt: v.occurred_at }))

  const ids = new Set([
    ...appointments.map((a) => a.patientId),
    ...followUpPatientIds,
    ...visits.map((v) => v.patientId),
  ])
  const patients = await repo.findPatientNames(db, actor.clinicId, [...ids])

  return assembleDayList({ appointments, followUpPatientIds, visits, patients })
}

/** Her next bookings, soonest first. */
export async function listUpcomingAppointments(
  actor: ActorContext,
  patientId: string,
): Promise<Appointment[]> {
  requirePermission(actor, 'visit.read')
  return repo.listUpcomingForPatient(
    await userClient(),
    actor.clinicId,
    patientId,
    todayIn(actor.clinicTimezone),
  )
}

export async function scheduleAppointment(actor: ActorContext, input: unknown): Promise<string> {
  requirePermission(actor, 'visit.open')

  const parsed = ScheduleAppointmentSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This appointment could not be booked.', parsed.error.issues)
  }
  if (parsed.data.scheduledOn < todayIn(actor.clinicTimezone)) {
    throw validation('An appointment cannot be booked in the past.', { field: 'scheduledOn' })
  }

  return repo.scheduleAppointment(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    patientId: parsed.data.patientId,
    pregnancyId: parsed.data.pregnancyId ?? null,
    scheduledOn: parsed.data.scheduledOn,
    purpose: parsed.data.purpose ?? null,
  })
}

export async function cancelAppointment(actor: ActorContext, appointmentId: string): Promise<void> {
  requirePermission(actor, 'visit.open')
  await repo.cancelAppointment(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    appointmentId,
  })
}
