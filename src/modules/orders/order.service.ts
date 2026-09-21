import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { userClient } from '@core/db/clients'
import type { CalendarDate } from '@core/obstetrics/dating'

import * as repo from './order.repository'
import { isOngoingOn, type MedicationAdministration, type Prescription } from './order.types'

/**
 * The orders module's public API.
 *
 * Prescription data is restricted to doctors by the authorization matrix and,
 * independently, by RLS: `prescriptions_clinical_read` in migration 0012 admits
 * only DOCTOR. A cockpit payload built for a doctor must never be handed to an
 * assistant simply because the query was already written.
 */

/** Every prescription for a pregnancy, newest first, including stopped ones. */
export async function listPrescriptions(
  actor: ActorContext,
  pregnancyId: string,
): Promise<Prescription[]> {
  requirePermission(actor, 'prescription.read')

  return repo.listPrescriptions(await userClient(), actor.clinicId, pregnancyId)
}

/**
 * What she is actually taking on a given day.
 *
 * A query, not a stored flag. Stopping a drug therefore never requires editing
 * the past visit that ordered it.
 */
export async function listOngoingPrescriptions(
  actor: ActorContext,
  pregnancyId: string,
  on: CalendarDate,
): Promise<Prescription[]> {
  const all = await listPrescriptions(actor, pregnancyId)
  return all.filter((prescription) => isOngoingOn(prescription, on))
}

/**
 * Doses actually given, most recent first.
 *
 * Held by nurses as well as doctors: in the labour room the nurse is usually
 * the person who gave the dose, and this is the record the referral slip is
 * built from.
 */
export async function listAdministrations(
  actor: ActorContext,
  pregnancyId: string,
): Promise<MedicationAdministration[]> {
  requirePermission(actor, 'medication_administration.record')

  return repo.listAdministrations(await userClient(), actor.clinicId, pregnancyId)
}
