import type { Database } from '@core/db/database.types'
import { internal } from '@core/errors/app-error'

import type { HomeReading } from './monitoring.types'

/**
 * Database rows, and how they become domain objects.
 *
 * Split out of the repository so it can be tested without a database, same as
 * every other mapper in this codebase.
 */

export type HomeReadingRow = Database['public']['Tables']['patient_home_readings']['Row']

/**
 * The shape constraint in migration 0031 guarantees exactly one payload is
 * present for the row's metric; a row that violates it has drifted from the
 * schema, not from a value a form could produce, so it is surfaced as internal
 * rather than silently coerced into one shape or the other.
 */
export function toHomeReading(row: HomeReadingRow): HomeReading {
  if (row.metric === 'BLOOD_GLUCOSE') {
    if (row.glucose_mg_dl === null || row.glucose_context === null) {
      throw internal('A blood-glucose home reading is missing its value or its context.')
    }
    return {
      id: row.id,
      recordedAt: row.recorded_at,
      glucose: { mgDl: row.glucose_mg_dl, context: row.glucose_context },
      bloodPressure: null,
    }
  }

  if (row.systolic_mmhg === null || row.diastolic_mmhg === null) {
    throw internal('A blood-pressure home reading is missing a systolic or diastolic value.')
  }
  return {
    id: row.id,
    recordedAt: row.recorded_at,
    glucose: null,
    bloodPressure: { systolicMmHg: row.systolic_mmhg, diastolicMmHg: row.diastolic_mmhg },
  }
}
