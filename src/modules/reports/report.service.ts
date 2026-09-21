import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { userClient } from '@core/db/clients'

import { toTrendSeries } from './report.mapper'
import * as repo from './report.repository'
import type { Observation, PregnancyResults, ScanReport, TrendSeries } from './report.types'

/**
 * The reports module's public API.
 *
 * Reads run as the signed-in user, so RLS applies as an independent second
 * check: a bug here that let another clinic's pregnancy id through would still
 * return nothing.
 *
 * Everything this module returns is already verified — `observations` and
 * `scan_reports` are only written by clinician verification. Extraction output
 * lives in `report_candidates` and never appears here, which is what makes
 * "nothing enters the record without review" true at the read path too.
 */

/**
 * Everything the cockpit's results accordions need, in one call.
 *
 * One call rather than three, because the cockpit must render in a single round
 * trip (PRD §9) and because the trend has to be derived from the same
 * observation set that the table shows. Fetching them separately invites a
 * screen whose sparkline and whose table disagree.
 */
export async function getPregnancyResults(
  actor: ActorContext,
  pregnancyId: string,
): Promise<PregnancyResults> {
  requirePermission(actor, 'observation.read')

  const db = await userClient()

  // Pins are fetched first and then applied as a display flag. They are
  // deliberately not a filter: the trend below is built from every current
  // verified observation, so an unpinned normal value still bends the line.
  const pins = await repo.findActivePins(db, actor.clinicId, pregnancyId)

  const [observations, scans] = await Promise.all([
    repo.listObservations(db, actor.clinicId, pregnancyId, pins.observationIds),
    repo.listScans(db, actor.clinicId, pregnancyId, pins.scanIds),
  ])

  return {
    observations,
    scans,
    trends: toTrendSeries(observations),
  }
}

/** Current verified observations for a pregnancy, newest first. */
export async function listObservations(
  actor: ActorContext,
  pregnancyId: string,
): Promise<Observation[]> {
  requirePermission(actor, 'observation.read')

  const db = await userClient()
  const pins = await repo.findActivePins(db, actor.clinicId, pregnancyId)
  return repo.listObservations(db, actor.clinicId, pregnancyId, pins.observationIds)
}

/** Current verified scans for a pregnancy, most recent study first. */
export async function listScans(
  actor: ActorContext,
  pregnancyId: string,
): Promise<ScanReport[]> {
  requirePermission(actor, 'observation.read')

  const db = await userClient()
  const pins = await repo.findActivePins(db, actor.clinicId, pregnancyId)
  return repo.listScans(db, actor.clinicId, pregnancyId, pins.scanIds)
}

/**
 * The serial values for one test, oldest first.
 *
 * Built from every current verified observation with that code. Pinning does
 * not narrow it — see `TrendSeries` for why that distinction is the whole
 * reason `observations` and `finding_pins` are separate tables.
 */
export async function getTrend(
  actor: ActorContext,
  pregnancyId: string,
  testCode: string,
): Promise<TrendSeries | null> {
  const observations = await listObservations(actor, pregnancyId)
  return toTrendSeries(observations).find((series) => series.testCode === testCode) ?? null
}
