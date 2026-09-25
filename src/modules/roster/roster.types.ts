/**
 * The clinic's patient roster: every registered mother, one row each.
 *
 * Pure TypeScript. No zod, no row shapes, no framework.
 *
 * ---------------------------------------------------------------------------
 * Flags are recorded facts, never a risk score
 * ---------------------------------------------------------------------------
 * The clinic home offers a "flagged" list, and it would be easy to call it
 * "high risk". It is not, and must not be (PRD §3): the system never labels a
 * patient high-risk on its own. Every flag below is something a person wrote
 * down — a blood group, an allergy, a prior caesarean, a result a clinician
 * explicitly flagged. The list gathers them; the judgment stays with the
 * doctor.
 */

import type { DatingReference } from '@core/obstetrics/dating'
import type { BloodGroup, PatientAge } from '@modules/patients/patient.types'
import type { GravidaParity } from '@modules/pregnancies/pregnancy.types'

export type RosterFlag = 'RH_NEGATIVE' | 'ALLERGY' | 'UTERINE_SCAR' | 'FLAGGED_RESULT'

export const ROSTER_FLAG_LABELS: Record<RosterFlag, string> = {
  RH_NEGATIVE: 'Rh-negative',
  ALLERGY: 'Allergy',
  UTERINE_SCAR: 'Prior uterine scar',
  FLAGGED_RESULT: 'Result flagged',
}

export interface RosterPregnancy {
  readonly id: string
  /** Null when dating is not established — never a guessed gestational age. */
  readonly dating: DatingReference | null
  readonly gravidaParity: GravidaParity
}

export interface RosterEntry {
  readonly patientId: string
  readonly uhid: string
  readonly fullName: string
  readonly age: PatientAge
  readonly bloodGroup: BloodGroup | null
  /** The open episode, or null when she has none booked. */
  readonly pregnancy: RosterPregnancy | null
  /** When her most recent (not cancelled) visit was opened. */
  readonly lastVisitAt: string | null
  readonly latestDiagnosis: string | null
  readonly flags: readonly RosterFlag[]
}

export function hasRecordedFlags(entry: RosterEntry): boolean {
  return entry.flags.length > 0
}

/** `G2 P1 L1 A0`, with `–` for anything not asked. */
export function formatGravidaParity(gp: GravidaParity): string {
  const part = (letter: string, value: number | null) => `${letter}${value ?? '–'}`
  return [part('G', gp.gravida), part('P', gp.parity), part('L', gp.living), part('A', gp.abortions)].join(' ')
}
