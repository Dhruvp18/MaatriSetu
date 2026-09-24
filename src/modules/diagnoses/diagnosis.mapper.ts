import type { Database } from '@core/db/database.types'

import type { DiagnosisSection, FlaggedDiagnosis } from './diagnosis.types'

export type FlaggedDiagnosisRow = Database['public']['Tables']['flagged_diagnoses']['Row']

const SECTIONS: readonly DiagnosisSection[] = ['SCANS', 'REPORTS', 'EXAMINATION']

export function toFlaggedDiagnosis(row: FlaggedDiagnosisRow): FlaggedDiagnosis {
  return {
    id: row.id,
    pregnancyId: row.pregnancy_id,
    label: row.label,
    // The column CHECK makes anything else unreachable; EXAMINATION is the
    // least specific place to attribute a flag if the two ever drift.
    section: (SECTIONS as readonly string[]).includes(row.section) ? (row.section as DiagnosisSection) : 'EXAMINATION',
    flaggedAt: row.flagged_at,
  }
}
