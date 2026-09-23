import 'server-only'
import { serviceClient } from '@core/db/clients'
import { findPatientById } from '@/modules/patients/patient.repository'
import { findActivePregnancy } from '@/modules/pregnancies/pregnancy.repository'
import { listVisitsForPregnancy, findAdviceForVisit } from '@/modules/visits/visit.repository'
import { gestationalAgeOn, expectedDueDate } from '@/modules/pregnancies/pregnancy.types'
import type { PatientSession } from './session'

export interface PatientDashboardData {
  fullName: string
  uhid: string
  gestationalAge: { weeks: number; days: number } | null
  edd: string | null
  trimester: 1 | 2 | 3 | null
  lastVisitDate: string | null
  nextFollowUpDate: string | null
  hasActivePregnancy: boolean
}

export async function getPatientDashboard(
  session: PatientSession,
): Promise<PatientDashboardData> {
  const db = serviceClient()
  const today = new Date().toISOString().slice(0, 10) as `${number}-${number}-${number}`

  const [patient, pregnancy] = await Promise.all([
    findPatientById(db, session.clinicId, session.patientId),
    findActivePregnancy(db, session.clinicId, session.patientId),
  ])

  if (!patient) {
    return {
      fullName: 'Patient',
      uhid: '',
      gestationalAge: null,
      edd: null,
      trimester: null,
      lastVisitDate: null,
      nextFollowUpDate: null,
      hasActivePregnancy: false,
    }
  }

  if (!pregnancy) {
    return {
      fullName: patient.fullName,
      uhid: patient.uhid,
      gestationalAge: null,
      edd: null,
      trimester: null,
      lastVisitDate: null,
      nextFollowUpDate: null,
      hasActivePregnancy: false,
    }
  }

  const gaResult = gestationalAgeOn(pregnancy.dating, today)
  const eddResult = expectedDueDate(pregnancy.dating)

  // Get last saved visit and its advice for next follow-up date
  const visits = await listVisitsForPregnancy(db, session.clinicId, pregnancy.id)
  const lastSavedVisit = visits.find((v) => v.status === 'SAVED') ?? null

  let nextFollowUpDate: string | null = null
  if (lastSavedVisit) {
    const advice = await findAdviceForVisit(db, session.clinicId, lastSavedVisit.id)
    nextFollowUpDate = advice?.nextFollowupDate ?? null
  }

  // Determine trimester
  let trimester: 1 | 2 | 3 | null = null
  if (gaResult) {
    const totalDays = gaResult.totalDays
    if (totalDays < 98) trimester = 1
    else if (totalDays < 196) trimester = 2
    else trimester = 3
  }

  return {
    fullName: patient.fullName,
    uhid: patient.uhid,
    gestationalAge: gaResult ? { weeks: gaResult.weeks, days: gaResult.days } : null,
    edd: eddResult,
    trimester,
    lastVisitDate: lastSavedVisit ? lastSavedVisit.occurredAt.slice(0, 10) : null,
    nextFollowUpDate,
    hasActivePregnancy: true,
  }
}

export interface PatientQueryRow {
  id: string
  queryText: string
  botResponse: string
  triageLevel: 'CRITICAL' | 'IMPORTANT' | 'NORMAL'
  createdAt: string
}

export async function getPatientChatHistory(
  session: PatientSession,
): Promise<PatientQueryRow[]> {
  const db = serviceClient()
  const { data, error } = await db
    .from('patient_queries')
    .select('id, query_text, bot_response, triage_level, created_at')
    .eq('patient_id', session.patientId)
    .order('created_at', { ascending: true })
    .limit(50)

  if (error || !data) return []

  return data.map((row: any) => ({
    id: row.id as string,
    queryText: row.query_text as string,
    botResponse: row.bot_response as string,
    triageLevel: row.triage_level as 'CRITICAL' | 'IMPORTANT' | 'NORMAL',
    createdAt: row.created_at as string,
  }))
}
