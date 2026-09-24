import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { serviceClient, userClient } from '@core/db/clients'
import { validation } from '@core/errors/app-error'

import * as repo from './diagnosis.repository'
import { FlagDiagnosesSchema } from './diagnosis.schema'
import type { FlaggedDiagnosis } from './diagnosis.types'

/**
 * The diagnoses module's public API.
 *
 * Reading the banner's flags needs `observation.read`, like the rest of the
 * cockpit. Raising or resolving one is a diagnosis, so it needs `visit.save` —
 * the doctor's permission. Unlike the consultation, a flag is written at once:
 * it is a standing fact on her record, not part of one visit's commit, and the
 * doctor expects to see it on the banner the moment she flags it.
 */

export async function listOpenFlaggedDiagnoses(
  actor: ActorContext,
  pregnancyId: string,
): Promise<FlaggedDiagnosis[]> {
  requirePermission(actor, 'observation.read')
  return repo.listOpen(await userClient(), actor.clinicId, pregnancyId)
}

export async function flagDiagnoses(actor: ActorContext, input: unknown): Promise<number> {
  requirePermission(actor, 'visit.save')

  const parsed = FlagDiagnosesSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('These diagnoses could not be flagged.', parsed.error.issues)
  }

  return repo.flag(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    pregnancyId: parsed.data.pregnancyId,
    section: parsed.data.section,
    labels: [...new Set(parsed.data.labels)],
  })
}

export async function resolveFlaggedDiagnosis(actor: ActorContext, flagId: string): Promise<void> {
  requirePermission(actor, 'visit.save')

  const id = typeof flagId === 'string' ? flagId.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw validation('That flag could not be identified.')

  await repo.resolve(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    flagId: id,
  })
}
