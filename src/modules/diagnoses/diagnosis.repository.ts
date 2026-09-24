import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import { internal, notFound, retryable } from '@core/errors/app-error'

import { type FlaggedDiagnosisRow, toFlaggedDiagnosis } from './diagnosis.mapper'
import type { DiagnosisSection, FlaggedDiagnosis } from './diagnosis.types'

/**
 * The only place that talks to the database about flagged diagnoses.
 * Makes no authorization decisions (ARCH-5).
 */

function translate(error: PostgrestError, operation: string): never {
  if (error.code === 'P0002') throw notFound('That pregnancy is not recorded at this clinic.')
  if (!error.code) throw retryable('The database did not respond. Try again.', error)
  throw internal(`Database error during ${operation}.`, error)
}

/** Open flags on a pregnancy, oldest first — the order they were raised. */
export async function listOpen(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<FlaggedDiagnosis[]> {
  const { data, error } = await db
    .from('flagged_diagnoses')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .is('resolved_at', null)
    .order('flagged_at', { ascending: true })
    .returns<FlaggedDiagnosisRow[]>()

  if (error) translate(error, 'listOpen')
  return (data ?? []).map(toFlaggedDiagnosis)
}

/** Returns how many were newly flagged; an already-open label is left as it is. */
export async function flag(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    pregnancyId: string
    section: DiagnosisSection
    labels: string[]
  },
): Promise<number> {
  const { data, error } = await db.rpc('flag_diagnoses', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_pregnancy_id: params.pregnancyId,
    p_section: params.section,
    p_labels: params.labels,
  })

  if (error) translate(error, 'flag')
  return typeof data === 'number' ? data : 0
}

export async function resolve(
  db: TypedClient,
  params: { clinicId: string; actorStaffUserId: string; requestId: string; flagId: string },
): Promise<void> {
  const { error } = await db.rpc('resolve_flagged_diagnosis', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_flag_id: params.flagId,
  })

  if (error) translate(error, 'resolve')
}
