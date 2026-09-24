'use server'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { todayIn } from '@core/obstetrics/dating'
import { ageInYears } from '@modules/patients/patient.types'
import { searchPatients } from '@modules/patients/patient.service'

/**
 * Search-as-you-type for the clinic home.
 *
 * The service shapes the result by role (an assistant gets identity only), so
 * this returns exactly what the actor may see and nothing is filtered here.
 */

export interface FoundPatient {
  readonly id: string
  readonly uhid: string
  readonly fullName: string
  readonly age: number | null
}

export type SearchResult =
  | { readonly ok: true; readonly patients: readonly FoundPatient[] }
  | { readonly ok: false; readonly message: string }

export async function searchPatientsAction(query: string): Promise<SearchResult> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') return { ok: false, message: 'Your session has ended. Sign in again.' }
  if (query.trim().length < 2) return { ok: true, patients: [] }

  try {
    const today = todayIn(session.actor.clinicTimezone)
    const results = await searchPatients(session.actor, { query, limit: 8 })
    return {
      ok: true,
      patients: results.map((r) => ({
        id: r.id,
        uhid: r.uhid,
        fullName: r.fullName,
        age: r.visibility === 'FULL' ? ageInYears(r.age, today) : null,
      })),
    }
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message }
    throw error
  }
}
