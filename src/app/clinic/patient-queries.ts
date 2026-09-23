import 'server-only'
import { serviceClient } from '@core/db/clients'

export interface PatientQueryRecord {
  id: string
  patientId: string
  patientName: string
  queryText: string
  botResponse: string
  triageLevel: 'CRITICAL' | 'IMPORTANT' | 'NORMAL'
  createdAt: string
}

export async function getUnreviewedPatientQueries(clinicId: string): Promise<PatientQueryRecord[]> {
  const db = serviceClient()

  const { data, error } = await db
    .from('patient_queries')
    .select(`
      id,
      patient_id,
      query_text,
      bot_response,
      triage_level,
      created_at,
      patients!inner ( full_name )
    `)
    .eq('clinic_id', clinicId)
    .eq('is_reviewed', false)
    .order('triage_level', { ascending: true }) // CRITICAL sorts first alphabetically
    .order('created_at', { ascending: false })
    .limit(20)

  if (error || !data) return []

  return data.map((row: any) => ({
    id: row.id as string,
    patientId: row.patient_id as string,
    patientName: row.patients?.full_name ?? 'Unknown Patient',
    queryText: row.query_text as string,
    botResponse: row.bot_response as string,
    triageLevel: row.triage_level as 'CRITICAL' | 'IMPORTANT' | 'NORMAL',
    createdAt: row.created_at as string,
  }))
}

export async function markQueryReviewed(
  queryId: string,
  reviewedByStaffUserId: string,
): Promise<void> {
  const db = serviceClient()
  await db
    .from('patient_queries')
    .update({ is_reviewed: true, reviewed_by: reviewedByStaffUserId, reviewed_at: new Date().toISOString() })
    .eq('id', queryId)
}
