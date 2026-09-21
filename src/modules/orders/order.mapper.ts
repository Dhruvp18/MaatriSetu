import type { Database } from '@core/db/database.types'
import { internal } from '@core/errors/app-error'

import type { Dose, MedicationAdministration, Prescription } from './order.types'

/**
 * Order rows, and how they become domain objects.
 *
 * `toDose` is what earns this file its own module: the database allows an
 * amount and a unit only together, and if a half-pair ever appeared, rendering
 * "500" with no unit on a prescription line is the kind of thing that gets a
 * dose wrong. It raises instead.
 */

type Tables = Database['public']['Tables']

export type PrescriptionRow = Tables['prescriptions']['Row']
export type MedicationAdministrationRow = Tables['medication_administrations']['Row']

export function toDose(row: Pick<PrescriptionRow, 'dose_amount' | 'dose_unit' | 'id'>): Dose {
  const hasAmount = row.dose_amount !== null
  const hasUnit = row.dose_unit !== null

  if (!hasAmount && !hasUnit) return { kind: 'UNSPECIFIED' }

  if (!hasAmount || !hasUnit) {
    throw internal(
      `Prescription ${row.id} has half a dose recorded. An amount without a unit cannot be rendered safely.`,
    )
  }

  return { kind: 'SPECIFIED', amount: Number(row.dose_amount), unit: row.dose_unit as string }
}

export function toPrescription(row: PrescriptionRow): Prescription {
  return {
    id: row.id,
    visitId: row.visit_id,
    medicineName: row.medicine_name,
    dose: toDose(row),
    form: row.form,
    route: row.route,
    frequency: row.frequency,
    foodRelation: row.food_relation,
    durationDays: row.duration_days,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    instructions: row.instructions,
    stopReason: row.stop_reason,
    prescribedBy: row.prescribed_by,
  }
}

export function toAdministration(row: MedicationAdministrationRow): MedicationAdministration {
  return {
    id: row.id,
    medicineName: row.medicine_name,
    amount: Number(row.dose_amount),
    unit: row.dose_unit,
    route: row.route,
    administeredAt: row.administered_at,
    administeredAtFacility: row.administered_at_facility,
    certainty: row.certainty,
    note: row.note,
    recordedBy: row.recorded_by,
  }
}
