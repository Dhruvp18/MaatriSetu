import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import type { Database } from '@core/db/database.types'
import { internal, notFound, retryable } from '@core/errors/app-error'

import { type AppointmentRow, toAppointment } from './schedule.mapper'
import type { Appointment } from './schedule.types'

/**
 * The only place that talks to the database about the clinic day.
 * Makes no authorization decisions (ARCH-5).
 */

function translate(error: PostgrestError, operation: string): never {
  if (error.code === 'P0002') throw notFound('That appointment is not scheduled at this clinic.')
  if (!error.code) throw retryable('The database did not respond. Try again.', error)
  throw internal(`Database error during ${operation}.`, error)
}

export async function listAppointmentsOn(
  db: TypedClient,
  clinicId: string,
  day: string,
): Promise<Appointment[]> {
  const { data, error } = await db
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('scheduled_on', day)
    .eq('status', 'SCHEDULED')
    .returns<AppointmentRow[]>()

  if (error) translate(error, 'listAppointmentsOn')
  return (data ?? []).map(toAppointment)
}

export async function listUpcomingForPatient(
  db: TypedClient,
  clinicId: string,
  patientId: string,
  fromDay: string,
): Promise<Appointment[]> {
  const { data, error } = await db
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .eq('status', 'SCHEDULED')
    .gte('scheduled_on', fromDay)
    .order('scheduled_on', { ascending: true })
    .limit(5)
    .returns<AppointmentRow[]>()

  if (error) translate(error, 'listUpcomingForPatient')
  return (data ?? []).map(toAppointment)
}

/** Patients whose last consultation advised a follow-up on this day. */
export async function listFollowUpPatientIds(
  db: TypedClient,
  clinicId: string,
  day: string,
): Promise<string[]> {
  const { data, error } = await db
    .from('visit_advice')
    .select('visit_id')
    .eq('clinic_id', clinicId)
    .eq('next_followup_date', day)
    .returns<{ visit_id: string }[]>()

  if (error) translate(error, 'listFollowUpPatientIds')
  const visitIds = (data ?? []).map((row) => row.visit_id)
  if (visitIds.length === 0) return []

  const { data: visits, error: visitError } = await db
    .from('visits')
    .select('patient_id')
    .eq('clinic_id', clinicId)
    .in('id', visitIds)
    .returns<{ patient_id: string }[]>()

  if (visitError) translate(visitError, 'listFollowUpPatientIds.visits')
  return [...new Set((visits ?? []).map((v) => v.patient_id))]
}

/** Visits opened since the given instant, excluding cancelled ones. */
export async function listVisitsSince(
  db: TypedClient,
  clinicId: string,
  sinceIso: string,
): Promise<{ patient_id: string; status: 'OPEN' | 'SAVED'; occurred_at: string }[]> {
  const { data, error } = await db
    .from('visits')
    .select('patient_id, status, occurred_at')
    .eq('clinic_id', clinicId)
    .gte('occurred_at', sinceIso)
    .neq('status', 'CANCELLED')
    .returns<{ patient_id: string; status: 'OPEN' | 'SAVED'; occurred_at: string }[]>()

  if (error) translate(error, 'listVisitsSince')
  return data ?? []
}

export async function findPatientNames(
  db: TypedClient,
  clinicId: string,
  patientIds: readonly string[],
): Promise<Map<string, { fullName: string; uhid: string }>> {
  if (patientIds.length === 0) return new Map()
  const { data, error } = await db
    .from('patients')
    .select('id, full_name, uhid')
    .eq('clinic_id', clinicId)
    .in('id', [...patientIds])
    .returns<{ id: string; full_name: string; uhid: string }[]>()

  if (error) translate(error, 'findPatientNames')
  return new Map((data ?? []).map((p) => [p.id, { fullName: p.full_name, uhid: p.uhid }]))
}

type Fn = Database['public']['Functions']
type Nullable<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: T[P] | null }

export async function scheduleAppointment(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    patientId: string
    pregnancyId: string | null
    scheduledOn: string
    purpose: string | null
  },
): Promise<string> {
  const args: Nullable<Fn['schedule_appointment']['Args'], 'p_pregnancy_id' | 'p_purpose'> = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_patient_id: params.patientId,
    p_pregnancy_id: params.pregnancyId,
    p_scheduled_on: params.scheduledOn,
    p_purpose: params.purpose,
  }
  const { data, error } = await db.rpc('schedule_appointment', args as Fn['schedule_appointment']['Args'])
  if (error) translate(error, 'scheduleAppointment')
  if (typeof data !== 'string') throw internal('schedule_appointment returned no id.')
  return data
}

export async function cancelAppointment(
  db: TypedClient,
  params: { clinicId: string; actorStaffUserId: string; requestId: string; appointmentId: string },
): Promise<void> {
  const { error } = await db.rpc('cancel_appointment', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_appointment_id: params.appointmentId,
  })
  if (error) translate(error, 'cancelAppointment')
}
