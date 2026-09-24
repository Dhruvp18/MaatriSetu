/**
 * The patient portal's own vocabulary.
 *
 * A `PatientSelf` is the portal's actor: a mother who proved she holds the QR
 * sticker on her file. It carries no role and no permissions because it has
 * exactly one — to read and add to her own record. Every portal service call
 * is scoped to `patientId`, never to an id supplied by the browser.
 */

export interface PatientSelf {
  readonly patientId: string
  readonly clinicId: string
}

export type TriageLevel = 'CRITICAL' | 'IMPORTANT' | 'NORMAL'

export interface PatientQuery {
  readonly id: string
  readonly queryText: string
  readonly botResponse: string
  readonly triageLevel: TriageLevel
  readonly createdAt: string
}

/** A query as the clinic sees it, with whose it is. */
export interface ClinicPatientQuery extends PatientQuery {
  readonly patientId: string
  readonly patientName: string
}

export interface PatientDashboard {
  readonly fullName: string
  readonly uhid: string
  readonly gestationalAge: { readonly weeks: number; readonly days: number } | null
  readonly edd: string | null
  readonly trimester: 1 | 2 | 3 | null
  readonly lastVisitDate: string | null
  readonly nextFollowUpDate: string | null
  readonly hasActivePregnancy: boolean
}
