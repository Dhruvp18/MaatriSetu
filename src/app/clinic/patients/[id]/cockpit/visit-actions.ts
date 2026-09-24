'use server'

import { revalidatePath } from 'next/cache'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { cancelAppointment, scheduleAppointment } from '@modules/schedule/schedule.service'
import { openVisit } from '@modules/visits/visit.service'

/**
 * Starting today's consultation and booking the next one, from the cockpit.
 *
 * Opening a visit stays a deliberate click, never a side effect of loading the
 * page: a visit is an encounter with a time and an author, and opening the
 * cockpit to read a record is not one.
 */

export type ActionResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

async function withActor(
  patientId: string,
  write: (actor: Extract<Awaited<ReturnType<typeof resolveSession>>, { status: 'ACTIVE' }>['actor']) => Promise<unknown>,
): Promise<ActionResult> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { ok: false, message: 'Your session has ended. Sign in again.' }
  try {
    await write(session.actor)
  } catch (error) {
    if (error instanceof AppError) {
      const first = Array.isArray(error.details) ? (error.details[0] as { message?: unknown } | undefined) : undefined
      return { ok: false, message: typeof first?.message === 'string' ? `${error.message} ${first.message}` : error.message }
    }
    throw error
  }
  revalidatePath(`/clinic/patients/${patientId}/cockpit`)
  revalidatePath('/clinic')
  return { ok: true }
}

export async function startConsultationAction(patientId: string, pregnancyId: string): Promise<ActionResult> {
  return withActor(patientId, (actor) => openVisit(actor, { pregnancyId, visitType: 'ANC_OPD' }))
}

export async function scheduleVisitAction(input: {
  patientId: string
  pregnancyId: string | null
  scheduledOn: string
  purpose: string | null
}): Promise<ActionResult> {
  return withActor(input.patientId, (actor) => scheduleAppointment(actor, input))
}

export async function cancelAppointmentAction(patientId: string, appointmentId: string): Promise<ActionResult> {
  return withActor(patientId, (actor) => cancelAppointment(actor, appointmentId))
}
