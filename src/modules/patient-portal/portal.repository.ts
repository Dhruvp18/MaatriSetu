import 'server-only'

import type { TypedClient } from '@core/db/clients'
import { internal } from '@core/errors/app-error'

import type { ClinicPatientQuery, PatientQuery, TriageLevel } from './portal.types'

/**
 * The only place that talks to `patient_queries` (migration 0026).
 *
 * Every read is scoped by clinic and, for the portal, by patient. The table is
 * written only by the service role; staff sessions can read it but never
 * write it.
 */

export async function insertPatientQuery(
  db: TypedClient,
  input: {
    clinicId: string
    patientId: string
    pregnancyId: string | null
    queryText: string
    botResponse: string
    triageLevel: TriageLevel
  },
): Promise<void> {
  const { error } = await db.from('patient_queries').insert({
    clinic_id: input.clinicId,
    patient_id: input.patientId,
    pregnancy_id: input.pregnancyId,
    query_text: input.queryText,
    bot_response: input.botResponse,
    triage_level: input.triageLevel,
  })

  if (error) throw internal(`insertPatientQuery failed: ${error.message}`)
}

export async function listQueriesForPatient(
  db: TypedClient,
  clinicId: string,
  patientId: string,
  limit: number,
): Promise<PatientQuery[]> {
  const { data, error } = await db
    .from('patient_queries')
    .select('id, query_text, bot_response, triage_level, created_at')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw internal(`listQueriesForPatient failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    queryText: row.query_text,
    botResponse: row.bot_response,
    triageLevel: row.triage_level,
    createdAt: row.created_at,
  }))
}

export async function listUnreviewedQueries(
  db: TypedClient,
  clinicId: string,
  limit: number,
): Promise<ClinicPatientQuery[]> {
  const { data, error } = await db
    .from('patient_queries')
    .select('id, patient_id, query_text, bot_response, triage_level, created_at, patients!inner ( full_name )')
    .eq('clinic_id', clinicId)
    .eq('is_reviewed', false)
    // Enum order is severity order: CRITICAL first.
    .order('triage_level', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw internal(`listUnreviewedQueries failed: ${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patients?.full_name ?? 'Unknown patient',
    queryText: row.query_text,
    botResponse: row.bot_response,
    triageLevel: row.triage_level,
    createdAt: row.created_at,
  }))
}
