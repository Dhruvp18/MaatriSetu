import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import type { Database, Json } from '@core/db/database.types'
import { conflict, internal, notFound, retryable } from '@core/errors/app-error'

import { CounsellingKeySchema, type MasterPackInput, PackMedicineSchema } from './master-pack.schema'
import type { CounsellingKey, MasterPack, PackMedicine } from './master-pack.types'

/**
 * The only place that talks to the database about master packs.
 *
 * Reads take the signed-in user's client, so RLS confines them to the caller's
 * own packs. Writes go through the routines in migration 0031, which are
 * revoked from `authenticated` and check ownership themselves.
 *
 * Makes no authorization decisions (ARCH-5).
 */

type Row = Database['public']['Tables']['master_packs']['Row']
type Fn = Database['public']['Functions']
type Nullable<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: T[P] | null }

const PG_SERIALIZATION_FAILURE = '40001'
const PG_NO_DATA_FOUND = 'P0002'
const PG_CHECK_VIOLATION = '23514'
const PG_UNIQUE_VIOLATION = '23505'

function translate(error: PostgrestError, operation: string): never {
  if (error.code === PG_SERIALIZATION_FAILURE) {
    throw conflict('This pack was changed in another window. Close it, reopen it and try again.', {
      operation,
      code: 'VERSION_CONFLICT',
    })
  }
  if (error.code === PG_NO_DATA_FOUND) throw notFound('That pack is not one of yours.')
  if (error.code === PG_UNIQUE_VIOLATION) throw conflict('You already have a pack with that name.', { operation })
  if (error.code === PG_CHECK_VIOLATION) {
    throw internal(`Rejected by a database constraint during ${operation}.`, error)
  }
  if (!error.code) throw retryable('The database did not respond. Try again.', error)
  throw internal(`Database error during ${operation}.`, error)
}

/**
 * A stored line that no longer passes validation is left out rather than
 * breaking the doctor's whole list; she sees the pack without it and can fix it.
 */
function toMedicines(value: Json): PackMedicine[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((line) => {
    const parsed = PackMedicineSchema.safeParse(line)
    if (!parsed.success) return []
    const rx = parsed.data
    return [
      {
        medicineName: rx.medicineName,
        form: rx.form ?? null,
        doseAmount: rx.doseAmount ?? null,
        doseUnit: rx.doseUnit ?? null,
        frequency: rx.frequency,
        foodRelation: rx.foodRelation,
        durationDays: rx.durationDays ?? null,
        instructions: rx.instructions ?? null,
      },
    ]
  })
}

function toMasterPack(row: Row): MasterPack {
  return {
    id: row.id,
    name: row.name,
    medicines: toMedicines(row.medicines),
    labOrders: row.lab_orders,
    scanOrders: row.scan_orders,
    counselling: row.counselling.filter(
      (key): key is CounsellingKey => CounsellingKeySchema.safeParse(key).success,
    ),
    advice: row.advice,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

/**
 * The caller's packs in this clinic, oldest first — the order she built them
 * in, which is the order they sit on the strip.
 *
 * `everHad` counts deleted packs too, so the starter set is seeded only into a
 * doctor who has never had a pack.
 */
export async function listOwnPacks(
  db: TypedClient,
  clinicId: string,
  ownerStaffUserId: string,
): Promise<{ packs: MasterPack[]; everHad: boolean }> {
  const { data, error } = await db
    .from('master_packs')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('owner_staff_user_id', ownerStaffUserId)
    .order('created_at', { ascending: true })

  if (error) translate(error, 'listOwnPacks')
  const rows = data ?? []
  return {
    packs: rows.filter((row) => row.deleted_at === null).map(toMasterPack),
    everHad: rows.length > 0,
  }
}

interface WriteContext {
  readonly clinicId: string
  readonly actorStaffUserId: string
  readonly requestId: string
}

export async function savePack(
  db: TypedClient,
  params: WriteContext & { packId: string | null; expectedVersion: number | null; pack: MasterPackInput },
): Promise<string> {
  const args: Nullable<Fn['save_master_pack']['Args'], 'p_pack_id' | 'p_expected_version'> = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_pack_id: params.packId,
    p_expected_version: params.expectedVersion,
    p_pack: params.pack as unknown as Json,
  }

  const { data, error } = await db.rpc('save_master_pack', args as Fn['save_master_pack']['Args'])
  if (error) translate(error, 'savePack')
  if (typeof data !== 'string') throw internal('save_master_pack returned no id.')
  return data
}

export async function deletePack(
  db: TypedClient,
  params: WriteContext & { packId: string; expectedVersion: number },
): Promise<void> {
  const { error } = await db.rpc('delete_master_pack', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_pack_id: params.packId,
    p_expected_version: params.expectedVersion,
  })
  if (error) translate(error, 'deletePack')
}

export async function seedPacks(
  db: TypedClient,
  params: WriteContext & { packs: readonly MasterPackInput[] },
): Promise<number> {
  const { data, error } = await db.rpc('seed_master_packs', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_packs: params.packs as unknown as Json,
  })
  if (error) translate(error, 'seedPacks')
  return typeof data === 'number' ? data : 0
}
