import type { Database } from '@core/db/database.types'
import { internal } from '@core/errors/app-error'
import type { PatientAge } from '@modules/patients/patient.types'

import type { RosterEntry, RosterFlag, RosterPregnancy } from './roster.types'

/**
 * Row shapes, and how the roster is assembled from five narrow reads.
 *
 * `assembleRoster` is free of I/O so the merge — one row per patient, her open
 * episode, her latest visit, every recorded flag — is testable without a
 * database.
 */

type Tables = Database['public']['Tables']

export type RosterPatientRow = Pick<
  Tables['patients']['Row'],
  | 'id'
  | 'uhid'
  | 'full_name'
  | 'date_of_birth'
  | 'estimated_age_years'
  | 'age_recorded_on'
  | 'allergy_status'
  | 'blood_group'
>

export type RosterPregnancyRow = Pick<
  Tables['pregnancies']['Row'],
  | 'id'
  | 'patient_id'
  | 'dating_reference_date'
  | 'dating_reference_ga_days'
  | 'gravida'
  | 'parity'
  | 'living'
  | 'abortions'
  | 'created_at'
>

export interface RosterSources {
  readonly patients: readonly RosterPatientRow[]
  /** ACTIVE pregnancies only. */
  readonly pregnancies: readonly RosterPregnancyRow[]
  /** Not-cancelled visits, any order. */
  readonly visits: readonly { patient_id: string; occurred_at: string; diagnosis: string | null }[]
  /** Patients with at least one recorded uterine scar. */
  readonly scarredPatientIds: readonly string[]
  /** Clinician-flagged, current observations. */
  readonly flaggedObservations: readonly { patient_id: string; pregnancy_id: string }[]
}

function toAge(row: RosterPatientRow): PatientAge {
  if (row.date_of_birth !== null) return { kind: 'DATE_OF_BIRTH', dateOfBirth: row.date_of_birth }
  if (row.estimated_age_years === null || row.age_recorded_on === null) {
    throw internal('A patient row carries neither a date of birth nor a dated age estimate.')
  }
  return { kind: 'ESTIMATED', years: row.estimated_age_years, recordedOn: row.age_recorded_on }
}

function toRosterPregnancy(row: RosterPregnancyRow): RosterPregnancy {
  // A half anchor cannot yield a gestational age. The cockpit raises on it;
  // a list of every patient must not fail for one bad row, so it reads here as
  // "not established", which is what the column then says.
  const dating =
    row.dating_reference_date !== null && row.dating_reference_ga_days !== null
      ? { referenceDate: row.dating_reference_date, referenceGaDays: row.dating_reference_ga_days }
      : null
  return {
    id: row.id,
    dating,
    gravidaParity: { gravida: row.gravida, parity: row.parity, living: row.living, abortions: row.abortions },
  }
}

export function assembleRoster(sources: RosterSources): RosterEntry[] {
  // One open episode per patient is a schema invariant; if two ever appear,
  // the newer one is the one being cared for.
  const pregnancyByPatient = new Map<string, RosterPregnancyRow>()
  for (const row of sources.pregnancies) {
    const current = pregnancyByPatient.get(row.patient_id)
    if (!current || row.created_at > current.created_at) pregnancyByPatient.set(row.patient_id, row)
  }

  const lastVisitByPatient = new Map<string, { occurredAt: string, diagnosis: string | null }>()
  for (const visit of sources.visits) {
    const current = lastVisitByPatient.get(visit.patient_id)
    if (!current || visit.occurred_at > current.occurredAt) {
      lastVisitByPatient.set(visit.patient_id, { occurredAt: visit.occurred_at, diagnosis: visit.diagnosis })
    }
  }

  const scarred = new Set(sources.scarredPatientIds)

  return sources.patients.map((row): RosterEntry => {
    const pregnancyRow = pregnancyByPatient.get(row.id) ?? null
    const pregnancy = pregnancyRow ? toRosterPregnancy(pregnancyRow) : null

    const flags: RosterFlag[] = []
    if (row.blood_group?.endsWith('_NEG')) flags.push('RH_NEGATIVE')
    if (row.allergy_status === 'KNOWN') flags.push('ALLERGY')
    if (scarred.has(row.id)) flags.push('UTERINE_SCAR')
    // Only a flag on this episode's results: last pregnancy's flagged Hb is
    // history, not a reason she is on today's flagged list.
    if (pregnancy && sources.flaggedObservations.some((o) => o.pregnancy_id === pregnancy.id)) {
      flags.push('FLAGGED_RESULT')
    }

    return {
      patientId: row.id,
      uhid: row.uhid,
      fullName: row.full_name,
      age: toAge(row),
      bloodGroup: row.blood_group,
      pregnancy,
      lastVisitAt: lastVisitByPatient.get(row.id)?.occurredAt ?? null,
      latestDiagnosis: lastVisitByPatient.get(row.id)?.diagnosis ?? null,
      flags,
    }
  })
}
