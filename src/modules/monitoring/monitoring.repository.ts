import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import { internal, retryable } from '@core/errors/app-error'

import { toHomeReading, type HomeReadingRow } from './monitoring.mapper'
import type { HomeReading, HomeReadingMetric } from './monitoring.types'
import type { RecordHomeReadingInput } from './monitoring.schema'

/**
 * The only place that talks to `patient_home_readings` (migration 0031).
 *
 * Written only by the patient portal's service role — there is no staff
 * session on that side, same as `patient_queries`. Staff read it (via RLS)
 * but never write it; a clinician's own measurement belongs in `visit_vitals`,
 * not here.
 */

function translate(error: PostgrestError, operation: string): never {
  if (!error.code) throw retryable('The database did not respond. Try again.', error)
  throw internal(`Database error during ${operation}.`, error)
}

/** Every reading for one metric, oldest first — what a trend chart needs. */
export async function listReadings(
  db: TypedClient,
  params: { clinicId: string; patientId: string; pregnancyId: string; metric: HomeReadingMetric },
): Promise<HomeReading[]> {
  const { data, error } = await db
    .from('patient_home_readings')
    .select('*')
    .eq('clinic_id', params.clinicId)
    .eq('patient_id', params.patientId)
    .eq('pregnancy_id', params.pregnancyId)
    .eq('metric', params.metric)
    .order('recorded_at', { ascending: true })
    .returns<HomeReadingRow[]>()

  if (error) translate(error, 'listReadings')
  return (data ?? []).map(toHomeReading)
}

/** Logs one reading against the pregnancy she is being monitored for. */
export async function insertReading(
  db: TypedClient,
  params: { clinicId: string; patientId: string; pregnancyId: string; input: RecordHomeReadingInput },
): Promise<void> {
  const { input } = params
  const { error } = await db.from('patient_home_readings').insert({
    clinic_id: params.clinicId,
    patient_id: params.patientId,
    pregnancy_id: params.pregnancyId,
    metric: input.metric,
    glucose_mg_dl: input.metric === 'BLOOD_GLUCOSE' ? input.mgDl : null,
    glucose_context: input.metric === 'BLOOD_GLUCOSE' ? input.context : null,
    systolic_mmhg: input.metric === 'BLOOD_PRESSURE' ? input.systolicMmHg : null,
    diastolic_mmhg: input.metric === 'BLOOD_PRESSURE' ? input.diastolicMmHg : null,
  })

  if (error) translate(error, 'insertReading')
}
