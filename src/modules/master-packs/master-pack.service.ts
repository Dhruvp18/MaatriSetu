import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { serviceClient, userClient } from '@core/db/clients'
import { validation } from '@core/errors/app-error'

import * as repo from './master-pack.repository'
import { DeleteMasterPackSchema, SaveMasterPackSchema } from './master-pack.schema'
import type { MasterPack } from './master-pack.types'
import { STARTER_PACKS } from './starter-packs'

/**
 * The master-packs module's public API.
 *
 * Every call needs `prescription.write`: a pack is prescription shorthand, and
 * the matrix already confines prescribing to doctors. Every call also works on
 * the caller's own packs only — there is no reading or editing another
 * doctor's, by design (packs are private).
 *
 * Reads run as the signed-in user, so RLS independently confines them to her
 * own packs. Writes run through the service role, because the routines in
 * migration 0031 persist and audit in one transaction.
 */

/**
 * The doctor's packs. The first time she has none — ever — the starter set is
 * copied in for her to edit, so the strip is never empty on day one.
 */
export async function listMyMasterPacks(actor: ActorContext): Promise<MasterPack[]> {
  requirePermission(actor, 'prescription.write')

  const db = await userClient()
  const first = await repo.listOwnPacks(db, actor.clinicId, actor.staffUserId)
  if (first.everHad) return first.packs

  await repo.seedPacks(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    packs: STARTER_PACKS,
  })
  return (await repo.listOwnPacks(db, actor.clinicId, actor.staffUserId)).packs
}

/** Create a pack, or edit one of hers. An edit is version-checked. */
export async function saveMasterPack(actor: ActorContext, input: unknown): Promise<string> {
  requirePermission(actor, 'prescription.write')

  const parsed = SaveMasterPackSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This pack could not be saved.', parsed.error.issues)
  }

  const { packId, expectedVersion, pack } = parsed.data
  return repo.savePack(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    packId: packId ?? null,
    expectedVersion: expectedVersion ?? null,
    pack,
  })
}

/** Delete one of her packs. It is kept, marked deleted, and audited. */
export async function deleteMasterPack(actor: ActorContext, input: unknown): Promise<void> {
  requirePermission(actor, 'prescription.write')

  const parsed = DeleteMasterPackSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This pack could not be deleted.', parsed.error.issues)
  }

  await repo.deletePack(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    ...parsed.data,
  })
}
