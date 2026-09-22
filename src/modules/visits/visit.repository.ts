import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import type { Database } from '@core/db/database.types'
import { conflict, internal, notFound, retryable } from '@core/errors/app-error'

import {
  type VisitAdviceRow,
  type VisitRow,
  type VisitVitalsRow,
  toVisit,
  toVisitAdvice,
  toVitalsReading,
} from './visit.mapper'
import type { Visit, VisitAdvice, VitalsReading } from './visit.types'

/**
 * The only place that talks to the database about visits.
 *
 * Takes a client so the service states at each call site whether it is reading
 * as the signed-in user (RLS enforced) or writing through the service role
 * (required by the routines in migration 0016).
 *
 * Makes no authorization decisions (ARCH-5).
 */

/* -------------------------------------------------------------------------- */
/* Error translation                                                          */
/* -------------------------------------------------------------------------- */

const PG_UNIQUE_VIOLATION = '23505'
const PG_CHECK_VIOLATION = '23514'
const PG_NO_DATA_FOUND = 'P0002'
const PG_SERIALIZATION_FAILURE = '40001'
const PG_RESTRICT_VIOLATION = '23001'
const PG_INVALID_PARAMETER = '22023'

function translate(error: PostgrestError, operation: string): never {
  if (error.code === PG_SERIALIZATION_FAILURE) {
    throw conflict('This visit was changed by someone else. Refresh and try again.', {
      operation,
      code: 'VERSION_CONFLICT',
    })
  }

  if (error.code === PG_UNIQUE_VIOLATION) {
    // The partial unique index on one OPEN visit per pregnancy. Reaching it
    // means two requests raced past `open_or_reuse_visit`'s lock, which the
    // caller handles by re-reading rather than by reporting a failure.
    throw conflict('A consultation is already open for this pregnancy.', {
      operation,
      code: 'VISIT_ALREADY_OPEN',
    })
  }

  if (error.code === PG_RESTRICT_VIOLATION || error.code === PG_INVALID_PARAMETER) {
    throw conflict(error.message, { operation })
  }

  if (error.code === PG_NO_DATA_FOUND) {
    throw notFound('That visit is not recorded at this clinic.')
  }

  if (error.code === PG_CHECK_VIOLATION) {
    throw internal(`Rejected by a database constraint during ${operation}.`, error)
  }

  if (!error.code) {
    throw retryable('The database did not respond. Try again.', error)
  }

  throw internal(`Database error during ${operation}.`, error)
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function findVisitById(
  db: TypedClient,
  clinicId: string,
  visitId: string,
): Promise<Visit | null> {
  const { data, error } = await db
    .from('visits')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('id', visitId)
    .maybeSingle<VisitRow>()

  if (error) translate(error, 'findVisitById')
  return data ? toVisit(data) : null
}

/** The open consultation for a pregnancy, or null when none is in progress. */
export async function findOpenVisit(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<Visit | null> {
  const { data, error } = await db
    .from('visits')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .eq('status', 'OPEN')
    .maybeSingle<VisitRow>()

  if (error) translate(error, 'findOpenVisit')
  return data ? toVisit(data) : null
}

/**
 * The visit history for a pregnancy, most recent first.
 *
 * Cancelled visits are excluded: a consultation opened on the wrong file is not
 * part of this pregnancy's clinical history, and showing it in the timeline
 * invites a reader to count it as an attendance.
 */
export async function listVisitsForPregnancy(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<Visit[]> {
  const { data, error } = await db
    .from('visits')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .neq('status', 'CANCELLED')
    .order('occurred_at', { ascending: false })
    .returns<VisitRow[]>()

  if (error) translate(error, 'listVisitsForPregnancy')
  return (data ?? []).map(toVisit)
}

/** Every reading taken during a visit, in recording order. */
export async function listVitalsForVisit(
  db: TypedClient,
  clinicId: string,
  visitId: string,
): Promise<VitalsReading[]> {
  const { data, error } = await db
    .from('visit_vitals')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('visit_id', visitId)
    .order('sequence_no', { ascending: true })
    .returns<VisitVitalsRow[]>()

  if (error) translate(error, 'listVitalsForVisit')
  return (data ?? []).map(toVitalsReading)
}

/**
 * The advice recorded at a visit, or null when none was.
 *
 * Null is a real answer: a consultation may end with orders and no advice
 * checklist, and `save_visit_consultation` writes no row at all in that case.
 * The caller says so in words rather than printing an empty section.
 */
export async function findAdviceForVisit(
  db: TypedClient,
  clinicId: string,
  visitId: string,
): Promise<VisitAdvice | null> {
  const { data, error } = await db
    .from('visit_advice')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('visit_id', visitId)
    .maybeSingle<VisitAdviceRow>()

  if (error) translate(error, 'findAdviceForVisit')
  return data ? toVisitAdvice(data) : null
}

/* -------------------------------------------------------------------------- */
/* Writes — the transactional routines from migration 0016                    */
/* -------------------------------------------------------------------------- */

type Fn = Database['public']['Functions']
type Nullable<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: T[P] | null }

/**
 * Argument nullability, restored — see the same note in patient.repository.ts.
 *
 * Every measurement is nullable here, and that is the normal case rather than
 * an edge one: a nurse recording only a weight has taken a weight.
 */
type RecordVitalsArgs = Nullable<
  Fn['record_visit_vitals']['Args'],
  | 'p_bp_systolic_mmhg'
  | 'p_bp_diastolic_mmhg'
  | 'p_pulse_bpm'
  | 'p_respiratory_rate_bpm'
  | 'p_temperature_c'
  | 'p_spo2_percent'
  | 'p_weight_kg'
  | 'p_fundal_height_cm'
  | 'p_fetal_heart_rate_bpm'
  | 'p_urine_albumin'
  | 'p_urine_sugar'
  | 'p_note'
>

export interface OpenVisitResult {
  readonly visitId: string
  readonly created: boolean
}

/**
 * Opens a consultation, or returns the one already open.
 *
 * Idempotent by natural key. `created` tells the caller which happened, so a
 * double-clicked "start visit" reopens rather than erroring.
 */
export async function openOrReuseVisit(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    pregnancyId: string
    visitType: Database['public']['Enums']['visit_type']
  },
): Promise<OpenVisitResult> {
  const { data, error } = await db.rpc('open_or_reuse_visit', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_pregnancy_id: params.pregnancyId,
    p_visit_type: params.visitType,
  })

  if (error) translate(error, 'openOrReuseVisit')

  // The routine returns jsonb. Checked rather than cast: this crosses a process
  // boundary, and a shape change should fail loudly here rather than surface as
  // `undefined` somewhere downstream (ARCH-6).
  const result = data as { visit_id?: unknown; created?: unknown } | null
  if (
    !result ||
    typeof result.visit_id !== 'string' ||
    typeof result.created !== 'boolean'
  ) {
    throw internal('open_or_reuse_visit returned an unexpected shape.')
  }

  return { visitId: result.visit_id, created: result.created }
}

export interface RecordVitalsRow {
  readonly clinicId: string
  readonly actorStaffUserId: string
  readonly requestId: string
  readonly visitId: string
  readonly bpSystolicMmHg: number | null
  readonly bpDiastolicMmHg: number | null
  readonly pulseBpm: number | null
  readonly respiratoryRateBpm: number | null
  readonly temperatureC: number | null
  readonly spo2Percent: number | null
  readonly weightKg: number | null
  readonly fundalHeightCm: number | null
  readonly fetalHeartRateBpm: number | null
  readonly urineAlbumin: Database['public']['Enums']['dipstick_grade'] | null
  readonly urineSugar: Database['public']['Enums']['dipstick_grade'] | null
  readonly note: string | null
}

/** Appends a reading. The sequence number is assigned in the database. */
export async function recordVitals(
  db: TypedClient,
  input: RecordVitalsRow,
): Promise<string> {
  const args: RecordVitalsArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_visit_id: input.visitId,
    p_bp_systolic_mmhg: input.bpSystolicMmHg,
    p_bp_diastolic_mmhg: input.bpDiastolicMmHg,
    p_pulse_bpm: input.pulseBpm,
    p_respiratory_rate_bpm: input.respiratoryRateBpm,
    p_temperature_c: input.temperatureC,
    p_spo2_percent: input.spo2Percent,
    p_weight_kg: input.weightKg,
    p_fundal_height_cm: input.fundalHeightCm,
    p_fetal_heart_rate_bpm: input.fetalHeartRateBpm,
    p_urine_albumin: input.urineAlbumin,
    p_urine_sugar: input.urineSugar,
    p_note: input.note,
  }

  const { data, error } = await db.rpc(
    'record_visit_vitals',
    args as Fn['record_visit_vitals']['Args'],
  )

  if (error) translate(error, 'recordVitals')
  if (typeof data !== 'string') {
    throw internal('record_visit_vitals did not return a vitals id.')
  }

  return data
}

/** Version-checked cancellation. Returns the new version. */
export async function cancelVisit(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    visitId: string
    expectedVersion: number
    reason: string
  },
): Promise<number> {
  const { data, error } = await db.rpc('cancel_visit', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_visit_id: params.visitId,
    p_expected_version: params.expectedVersion,
    p_reason: params.reason,
  })

  if (error) translate(error, 'cancelVisit')
  if (typeof data !== 'number') {
    throw internal('cancel_visit did not return a version.')
  }

  return data
}

/* -------------------------------------------------------------------------- */
/* Save & Next                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Argument nullability, restored — see the note beside `RecordVitalsArgs`.
 *
 * `p_impression` and `p_advice` are genuinely optional: a consultation may end
 * with orders and no narrative, or a narrative and no advice checklist.
 */
type SaveConsultationArgs = Nullable<
  Fn['save_visit_consultation']['Args'],
  'p_impression' | 'p_advice'
>

export interface SaveConsultationResult {
  readonly visitId: string
  /** True when this request had already been committed and was replayed. */
  readonly replayed: boolean
  readonly gaDaysAtVisit: number | null
  readonly prescriptions: number
  /** Candidates turned into verified observations by this commit. */
  readonly observationsVerified: number
  readonly pinned: number
  readonly unpinned: number
  readonly queriesResolved: number
}

/**
 * Commit the consultation.
 *
 * Everything the routine needs travels in one call, because everything it
 * writes lands in one transaction. The idempotency key and payload hash are
 * part of that payload rather than headers: they are checked inside the same
 * transaction that does the work, so a crash between the check and the write is
 * not a state this can reach.
 */
export async function saveConsultation(
  db: TypedClient,
  input: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    visitId: string
    expectedVersion: number
    asOfDate: string
    impression: string | null
    prescriptions: unknown
    advice: unknown
    verifyCandidates: unknown
    pinObservationIds: string[]
    unpinObservationIds: string[]
    resolveQueryIds: string[]
    idempotencyKey: string
    payloadHashHex: string
  },
): Promise<SaveConsultationResult> {
  const args: SaveConsultationArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_visit_id: input.visitId,
    p_expected_version: input.expectedVersion,
    p_as_of_date: input.asOfDate,
    p_impression: input.impression,
    p_prescriptions: input.prescriptions as never,
    p_advice: input.advice as never,
    p_verify_candidates: input.verifyCandidates as never,
    p_pin_observation_ids: input.pinObservationIds,
    p_unpin_observation_ids: input.unpinObservationIds,
    p_resolve_query_ids: input.resolveQueryIds,
    p_idempotency_key: input.idempotencyKey,
    // Postgres accepts a hex string for bytea through this encoding.
    p_payload_hash: `\\x${input.payloadHashHex}`,
  }

  const { data, error } = await db.rpc(
    'save_visit_consultation',
    args as Fn['save_visit_consultation']['Args'],
  )

  // `translate` maps serialization_failure to a 409 conflict, which is what
  // both a stale version and a concurrent duplicate raise.
  if (error) translate(error, 'saveConsultation')

  const result = data as {
    visit_id: string
    replayed: boolean
    ga_days_at_visit: number | null
    prescriptions: number
    observations_verified: number
    pinned: number
    unpinned: number
    queries_resolved: number
  } | null

  if (!result) throw internal('The consultation was saved but returned no result.')

  return {
    visitId: result.visit_id,
    replayed: result.replayed,
    // A replay returns only the visit id; the counts belong to the original
    // commit and are not re-derived here.
    gaDaysAtVisit: result.ga_days_at_visit ?? null,
    prescriptions: result.prescriptions ?? 0,
    observationsVerified: result.observations_verified ?? 0,
    pinned: result.pinned ?? 0,
    unpinned: result.unpinned ?? 0,
    queriesResolved: result.queries_resolved ?? 0,
  }
}
