import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { userClient } from '@core/db/clients'

import { assembleRoster } from './roster.mapper'
import * as repo from './roster.repository'
import type { RosterEntry } from './roster.types'

/**
 * The roster module's public API.
 *
 * The roster shows demographics, the open episode and visit dates side by
 * side, so it needs both the demographics and the visit read permission. An
 * assistant, who holds neither, never sees it.
 */

/** A clinic this size fits on one screen; beyond it, search is the way in. */
const ROSTER_LIMIT = 500

export async function listRoster(actor: ActorContext): Promise<RosterEntry[]> {
  requirePermission(actor, 'patient.read')
  requirePermission(actor, 'visit.read')

  const sources = await repo.readRosterSources(await userClient(), actor.clinicId, ROSTER_LIMIT)
  return assembleRoster(sources)
}
