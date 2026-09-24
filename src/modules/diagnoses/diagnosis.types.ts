/**
 * Diagnoses a clinician flags onto the patient banner.
 *
 * Pure TypeScript. No zod, no row shapes, no framework.
 *
 * Every flag is the clinician's own statement, picked from a list or typed.
 * The lists below are the OPD's vocabulary for each section — suggestions for
 * her words, never something the system concludes from a value (PRD §3). A flag
 * stays on the banner until a clinician marks it resolved.
 */

export type DiagnosisSection = 'SCANS' | 'REPORTS' | 'EXAMINATION'

export interface FlaggedDiagnosis {
  readonly id: string
  readonly pregnancyId: string
  readonly label: string
  readonly section: DiagnosisSection
  readonly flaggedAt: string
}

export const DIAGNOSIS_OPTIONS: Record<DiagnosisSection, readonly string[]> = {
  SCANS: [
    'Multifetal pregnancy',
    'IUGR',
    'Molar pregnancy',
    'Ectopic pregnancy',
    'Placenta previa',
    'Placenta accreta',
    'Breech presentation',
    'Post-term pregnancy',
    'Oligohydramnios',
    'Polyhydramnios',
  ],
  REPORTS: [
    'Anaemia',
    'Rh negative pregnancy',
    'Gestational diabetes',
    'Overt diabetes',
    'Thyroid disorder',
    'APLA',
    'Breech presentation',
    'Transverse lie',
  ],
  EXAMINATION: ['Breech presentation', 'Small for gestational age', 'Transverse lie'],
}

export const DIAGNOSIS_SECTION_LABELS: Record<DiagnosisSection, string> = {
  SCANS: 'Scans',
  REPORTS: 'Reports',
  EXAMINATION: 'Examination',
}
