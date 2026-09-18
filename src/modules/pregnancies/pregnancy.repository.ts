import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import type { Database } from '@core/db/database.types'
import { conflict, internal, notFound, retryable } from '@core/errors/app-error'

import {
  type ObstetricHistoryRow,
  type PregnancyRow,
  toObstetricHistoryEntry,
  toPregnancy,
} from './pregnancy.mapper'
import type { ObstetricHistoryEntry, Pregnancy } from './pregnancy.types'

/**
 * The only place that talks to the database about pregnancies.
 *
 * Takes a client rather than creating one, so the service states at each call
 * site whether it is reading as the signed-in user (RLS enforced) or writing
 * through the service role (required by the routines in migration 0015).
 *
 * Makes no authorization decisions (ARCH-5).
 */

const PREGNANCY_COLUMNS = '*'

/* -------------------------------------------------------------------------- */
/* Error translation                                                          */
/* -------------------------------------------------------------------------- */

const PG_UNIQUE_VIOLATION = '23505'
const PG_CHECK_VIOLATION = '23514'
const PG_NO_DATA_FOUND = 'P0002'
/** Raised by the routines when a version check fails. */
const PG_SERIALIZATION_FAILURE = '40001'
const PG_RESTRICT_VIOLATION = '23001'

function translate(error: PostgrestError, operation: string): never {
  if (error.code === PG_SERIALIZATION_FAILURE) {
    // Someone else changed the episode between the read and the write. The UI
    // refreshes and reconciles; it must never discard the clinician's input.
    throw conflict('This pregnancy was changed by someone else. Refresh and try again.', {
      operation,
      code: 'VERSION_CONFLICT',
    })
  }

  if (error.code === PG_UNIQUE_VIOLATION) {
    throw conflict('That record already exists.', { operation, constraint: error.details })
  }

  if (error.code === PG_RESTRICT_VIOLATION) {
    throw conflict(error.message, { operation })
  }

  if (error.code === PG_NO_DATA_FOUND) {
    throw notFound('That pregnancy is not recorded at this clinic.')
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

export async function findPregnancyById(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<Pregnancy | null> {
  const { data, error } = await db
    .from('pregnancies')
    .select(PREGNANCY_COLUMNS)
    .eq('clinic_id', clinicId)
    .eq('id', pregnancyId)
    .maybeSingle<PregnancyRow>()

  if (error) translate(error, 'findPregnancyById')
  return data ? toPregnancy(data) : null
}

/**
 * The patient's current episode, or null.
 *
 * Null is a normal state — a registered patient between pregnancies, or one
 * registered but not yet booked. The caller offers "start a pregnancy"; it does
 * not treat this as an error.
 */
export async function findActivePregnancy(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<Pregnancy | null> {
  const { data, error } = await db
    .from('pregnancies')
    .select(PREGNANCY_COLUMNS)
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .eq('status', 'ACTIVE')
    // The partial unique index from 0004 permits only one, so this is a
    // belt-and-braces guard rather than a real ordering.
    .maybeSingle<PregnancyRow>()

  if (error) translate(error, 'findActivePregnancy')
  return data ? toPregnancy(data) : null
}

/** Every episode for a patient, newest first. */
export async function listPregnanciesForPatient(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<Pregnancy[]> {
  const { data, error } = await db
    .from('pregnancies')
    .select(PREGNANCY_COLUMNS)
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .returns<PregnancyRow[]>()

  if (error) translate(error, 'listPregnanciesForPatient')
  return (data ?? []).map(toPregnancy)
}

/**
 * Prior pregnancies for a patient, in obstetric order.
 *
 * Keyed on the patient, not the episode: her previous caesarean is a fact about
 * her, and it must surface on every future pregnancy without being re-entered.
 */
export async function listObstetricHistory(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<ObstetricHistoryEntry[]> {
  const { data, error } = await db
    .from('obstetric_history')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('sequence_no', { ascending: true })
    .returns<ObstetricHistoryRow[]>()

  if (error) translate(error, 'listObstetricHistory')
  return (data ?? []).map(toObstetricHistoryEntry)
}

/* -------------------------------------------------------------------------- */
/* Writes — the transactional routines from migration 0015                    */
/* -------------------------------------------------------------------------- */

/**
 * Argument nullability, restored — see the same note in patient.repository.ts.
 *
 * A Postgres function's parameters carry no nullability in the catalog, so the
 * generator types them all as non-null. Most of these genuinely accept NULL: a
 * pregnancy may have no dating anchor, no recalled LMP, and no GPLA recorded.
 */
type Fn = Database['public']['Functions']
type Nullable<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: T[P] | null }

type CreatePregnancyArgs = Nullable<
  Fn['create_pregnancy']['Args'],
  | 'p_dating_reference_date'
  | 'p_dating_reference_ga_days'
  | 'p_reported_lmp'
  | 'p_gravida'
  | 'p_parity'
  | 'p_living'
  | 'p_abortions'
  | 'p_pre_pregnancy_weight_kg'
  | 'p_height_cm'
>

type ClosePregnancyArgs = Nullable<
  Fn['close_pregnancy']['Args'],
  'p_outcome' | 'p_outcome_date' | 'p_note'
>

export interface CreatePregnancyRow {
  readonly clinicId: string
  readonly actorStaffUserId: string
  readonly requestId: string
  readonly patientId: string
  readonly datingReferenceDate: string | null
  readonly datingReferenceGaDays: number | null
  readonly datingMethod: Database['public']['Enums']['dating_method']
  readonly datingCertainty: Database['public']['Enums']['dating_certainty']
  readonly reportedLmp: string | null
  readonly reportedLmpCertainty: Database['public']['Enums']['dating_certainty']
  readonly gravida: number | null
  readonly parity: number | null
  readonly living: number | null
  readonly abortions: number | null
  readonly prePregnancyWeightKg: number | null
  readonly heightCm: number | null
  readonly obstetricHistory: readonly ObstetricHistoryRowInput[]
}

/**
 * One prior pregnancy, in the shape `create_pregnancy` reads out of its jsonb
 * argument.
 *
 * Spelled out rather than typed as a loose record: the keys here are read by
 * name in SQL (`h ->> 'sequenceNo'`), so a rename on either side is a silent
 * null in the database. Naming them in the type makes the two sides move
 * together.
 */
export interface ObstetricHistoryRowInput {
  readonly sequenceNo: number
  readonly yearOfEvent: number | null
  readonly eventDate: string | null
  readonly eventDatePrecision: Database['public']['Enums']['date_precision']
  readonly outcome: Database['public']['Enums']['pregnancy_outcome']
  readonly deliveryMode: Database['public']['Enums']['delivery_mode']
  readonly gestationWeeksAtDelivery: number | null
  readonly birthWeightGrams: number | null
  readonly childAlive: Database['public']['Enums']['known_status']
  readonly hasUterineScar: boolean
  readonly scarIndication: string | null
  readonly complications: string | null
  readonly placeOfEvent: string | null
  readonly source: Database['public']['Enums']['data_source']
}

/** Creates the episode, her prior history and the audit row, atomically. */
export async function insertPregnancy(
  db: TypedClient,
  input: CreatePregnancyRow,
): Promise<string> {
  const args: CreatePregnancyArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_patient_id: input.patientId,
    p_dating_reference_date: input.datingReferenceDate,
    p_dating_reference_ga_days: input.datingReferenceGaDays,
    p_dating_method: input.datingMethod,
    p_dating_certainty: input.datingCertainty,
    p_reported_lmp: input.reportedLmp,
    p_reported_lmp_certainty: input.reportedLmpCertainty,
    p_gravida: input.gravida,
    p_parity: input.parity,
    p_living: input.living,
    p_abortions: input.abortions,
    p_pre_pregnancy_weight_kg: input.prePregnancyWeightKg,
    p_height_cm: input.heightCm,
    // Spread into a mutable array of plain objects: the generated `Json`
    // type is mutable, and the domain input is readonly by design.
    p_obstetric_history: input.obstetricHistory.map((entry) => ({ ...entry })),
  }

  const { data, error } = await db.rpc(
    'create_pregnancy',
    args as Fn['create_pregnancy']['Args'],
  )

  if (error) translate(error, 'insertPregnancy')
  if (typeof data !== 'string') {
    throw internal('create_pregnancy did not return a pregnancy id.')
  }

  return data
}

/** Version-checked redating. Returns the new version. */
export async function updateDating(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    pregnancyId: string
    expectedVersion: number
    datingReferenceDate: string
    datingReferenceGaDays: number
    datingMethod: Database['public']['Enums']['dating_method']
    datingCertainty: Database['public']['Enums']['dating_certainty']
    reason: string
  },
): Promise<number> {
  const { data, error } = await db.rpc('update_pregnancy_dating', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_pregnancy_id: params.pregnancyId,
    p_expected_version: params.expectedVersion,
    p_dating_reference_date: params.datingReferenceDate,
    p_dating_reference_ga_days: params.datingReferenceGaDays,
    p_dating_method: params.datingMethod,
    p_dating_certainty: params.datingCertainty,
    p_reason: params.reason,
  })

  if (error) translate(error, 'updateDating')
  if (typeof data !== 'number') {
    throw internal('update_pregnancy_dating did not return a version.')
  }

  return data
}

/** Version-checked closure. Returns the new version. */
export async function closePregnancy(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    pregnancyId: string
    expectedVersion: number
    status: 'COMPLETED' | 'CLOSED_UNKNOWN'
    outcome: Database['public']['Enums']['pregnancy_outcome'] | null
    outcomeDate: string | null
    note: string | null
  },
): Promise<number> {
  const args: ClosePregnancyArgs = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_pregnancy_id: params.pregnancyId,
    p_expected_version: params.expectedVersion,
    p_status: params.status,
    p_outcome: params.outcome,
    p_outcome_date: params.outcomeDate,
    p_note: params.note,
  }

  const { data, error } = await db.rpc(
    'close_pregnancy',
    args as Fn['close_pregnancy']['Args'],
  )

  if (error) translate(error, 'closePregnancy')
  if (typeof data !== 'number') {
    throw internal('close_pregnancy did not return a version.')
  }

  return data
}
