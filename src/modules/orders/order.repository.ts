import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import { internal, retryable } from '@core/errors/app-error'

import {
  type MedicationAdministrationRow,
  type PrescriptionRow,
  toAdministration,
  toPrescription,
} from './order.mapper'
import type { MedicationAdministration, Prescription } from './order.types'

/**
 * The only place that talks to the database about orders.
 *
 * Read-only: prescribing happens inside the consultation commit, which needs
 * the order and its audit row in one transaction.
 */

function translate(error: PostgrestError, operation: string): never {
  if (error.code === undefined || error.code.startsWith('08')) {
    throw retryable(`Could not reach the database (${operation}).`, error)
  }
  throw internal(`Database error during ${operation}.`, error)
}

/**
 * Every prescription for a pregnancy, newest first.
 *
 * Deliberately not filtered to ACTIVE in SQL. "Ongoing" depends on the day
 * being asked about as well as on status, so the decision is made in the domain
 * by `isOngoingOn` where it can be unit-tested, and the caller still has the
 * stopped and completed rows for history.
 */
export async function listPrescriptions(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<Prescription[]> {
  const { data, error } = await db
    .from('prescriptions')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .order('start_date', { ascending: false })

  if (error) translate(error, 'listPrescriptions')

  return (data as PrescriptionRow[] | null ?? []).map(toPrescription)
}

/** Doses actually given during this pregnancy, most recent first. */
export async function listAdministrations(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<MedicationAdministration[]> {
  const { data, error } = await db
    .from('medication_administrations')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .order('administered_at', { ascending: false })

  if (error) translate(error, 'listAdministrations')

  return (data as MedicationAdministrationRow[] | null ?? []).map(toAdministration)
}
