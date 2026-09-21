import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import { internal, retryable } from '@core/errors/app-error'

import {
  type ObservationRow,
  type ScanReportRow,
  toObservation,
  toScanReport,
} from './report.mapper'
import type { Observation, ScanReport } from './report.types'

/**
 * The only place that talks to the database about results.
 *
 * Read-only for now: observations and scans are created by clinician
 * verification inside the consultation commit, which lands with Save & Next.
 *
 * Every query filters `superseded_at is null`. A correction supersedes rather
 * than overwrites, so without that filter the cockpit would show both the
 * mistaken value and its correction side by side with nothing to tell them
 * apart.
 */

function translate(error: PostgrestError, operation: string): never {
  // Connection-level failures are worth retrying; a malformed query is not.
  if (error.code === undefined || error.code.startsWith('08')) {
    throw retryable(`Could not reach the database (${operation}).`, error)
  }
  throw internal(`Database error during ${operation}.`, error)
}

/* -------------------------------------------------------------------------- */
/* Pins                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Which results the clinician has pinned to the cockpit.
 *
 * Returned as two sets of ids, used only to mark rows for display. Never used
 * to filter what is fetched — pinning decides what is surfaced first, not what
 * exists (see `TrendSeries`).
 */
export async function findActivePins(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<{ observationIds: Set<string>; scanIds: Set<string> }> {
  const { data, error } = await db
    .from('finding_pins')
    .select('observation_id, scan_report_id')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .is('unpinned_at', null)

  if (error) translate(error, 'findActivePins')

  const observationIds = new Set<string>()
  const scanIds = new Set<string>()

  for (const row of data ?? []) {
    if (row.observation_id) observationIds.add(row.observation_id)
    if (row.scan_report_id) scanIds.add(row.scan_report_id)
  }

  return { observationIds, scanIds }
}

/* -------------------------------------------------------------------------- */
/* Observations                                                               */
/* -------------------------------------------------------------------------- */

/** Every current verified observation for a pregnancy, newest first. */
export async function listObservations(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
  pinnedIds: ReadonlySet<string>,
): Promise<Observation[]> {
  const { data, error } = await db
    .from('observations')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .is('superseded_at', null)
    .order('observed_date', { ascending: false })

  if (error) translate(error, 'listObservations')

  return (data as ObservationRow[] | null ?? []).map((row) => toObservation(row, pinnedIds))
}

/* -------------------------------------------------------------------------- */
/* Scans                                                                      */
/* -------------------------------------------------------------------------- */

/** Every current verified scan for a pregnancy, most recent study first. */
export async function listScans(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
  pinnedIds: ReadonlySet<string>,
): Promise<ScanReport[]> {
  const { data, error } = await db
    .from('scan_reports')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .is('superseded_at', null)
    // Ordered by the date the study was performed, never by when it was
    // uploaded — a scan photographed weeks late still belongs where it happened.
    .order('scan_date', { ascending: false })

  if (error) translate(error, 'listScans')

  return (data as ScanReportRow[] | null ?? []).map((row) => toScanReport(row, pinnedIds))
}
