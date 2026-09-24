import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import { internal, retryable } from '@core/errors/app-error'

import type { RosterPatientRow, RosterPregnancyRow, RosterSources } from './roster.mapper'

/**
 * The only place that talks to the database about the roster.
 * Makes no authorization decisions (ARCH-5).
 *
 * Five narrow reads filtered by clinic rather than by a list of patient ids:
 * a few hundred uuids in an `in()` filter would push the request URL past
 * what PostgREST accepts, and RLS scopes every one of these to the clinic
 * anyway.
 */

function translate(error: PostgrestError, operation: string): never {
  if (!error.code) throw retryable('The database did not respond. Try again.', error)
  throw internal(`Database error during ${operation}.`, error)
}

export async function readRosterSources(
  db: TypedClient,
  clinicId: string,
  limit: number,
): Promise<RosterSources> {
  const [patients, pregnancies, visits, scars, flagged] = await Promise.all([
    db
      .from('patients')
      .select('id, uhid, full_name, date_of_birth, estimated_age_years, age_recorded_on, allergy_status, blood_group')
      .eq('clinic_id', clinicId)
      .order('full_name', { ascending: true })
      .limit(limit)
      .returns<RosterPatientRow[]>(),
    db
      .from('pregnancies')
      .select('id, patient_id, dating_reference_date, dating_reference_ga_days, gravida, parity, living, abortions, created_at')
      .eq('clinic_id', clinicId)
      .eq('status', 'ACTIVE')
      .returns<RosterPregnancyRow[]>(),
    db
      .from('visits')
      .select('patient_id, occurred_at')
      .eq('clinic_id', clinicId)
      .neq('status', 'CANCELLED')
      .returns<{ patient_id: string; occurred_at: string }[]>(),
    db
      .from('obstetric_history')
      .select('patient_id')
      .eq('clinic_id', clinicId)
      .eq('has_uterine_scar', true)
      .returns<{ patient_id: string }[]>(),
    db
      .from('observations')
      .select('patient_id, pregnancy_id')
      .eq('clinic_id', clinicId)
      .eq('flagged_by_clinician', true)
      .is('superseded_at', null)
      .returns<{ patient_id: string; pregnancy_id: string }[]>(),
  ])

  if (patients.error) translate(patients.error, 'readRosterSources.patients')
  if (pregnancies.error) translate(pregnancies.error, 'readRosterSources.pregnancies')
  if (visits.error) translate(visits.error, 'readRosterSources.visits')
  if (scars.error) translate(scars.error, 'readRosterSources.obstetricHistory')
  if (flagged.error) translate(flagged.error, 'readRosterSources.observations')

  return {
    patients: patients.data ?? [],
    pregnancies: pregnancies.data ?? [],
    visits: visits.data ?? [],
    scarredPatientIds: [...new Set((scars.data ?? []).map((row) => row.patient_id))],
    flaggedObservations: flagged.data ?? [],
  }
}
