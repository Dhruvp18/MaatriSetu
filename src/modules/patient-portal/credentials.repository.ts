import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import { internal, retryable } from '@core/errors/app-error'

/**
 * The only place that talks to `patient_credentials` (migration 0032).
 *
 * Reached only through the service role: there is no SELECT policy on this
 * table at all (0032), so a `userClient()` read would return nothing even for
 * a signed-in staff member. Password hashes are not clinic staff's business.
 */

function translate(error: PostgrestError, operation: string): never {
  if (!error.code) throw retryable('The database did not respond. Try again.', error)
  throw internal(`Database error during ${operation}.`, error)
}

/** Her stored hash, or null when portal access has never been set up for her. */
export async function findPasswordHash(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('patient_credentials')
    .select('password_hash')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .maybeSingle<{ password_hash: string }>()

  if (error) translate(error, 'findPasswordHash')
  return data?.password_hash ?? null
}

/** Sets or replaces her password. */
export async function upsertPassword(
  db: TypedClient,
  params: { clinicId: string; patientId: string; passwordHash: string },
): Promise<void> {
  const { error } = await db
    .from('patient_credentials')
    .upsert(
      {
        clinic_id: params.clinicId,
        patient_id: params.patientId,
        password_hash: params.passwordHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'patient_id' },
    )

  if (error) translate(error, 'upsertPassword')
}
