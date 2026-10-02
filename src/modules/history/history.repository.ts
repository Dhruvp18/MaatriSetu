import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import type { Database } from '@core/db/database.types'
import { conflict, internal, notFound, retryable } from '@core/errors/app-error'

import {
  type FamilyHistoryRow,
  type ImmunizationRow,
  type PastHistoryRow,
  toFamilyHistoryEntry,
  toPastHistory,
  type InfantRow,
  type MenstrualHistoryRow,
  type ObstetricHistoryRow,
  toImmunizationRecord,
  toMenstrualHistoryRecord,
  toObstetricHistoryRecord,
} from './history.mapper'
import type {
  FamilyHistoryEntry,
  ImmunizationRecord,
  PastHistory,
  MenstrualHistoryRecord,
  ObstetricHistoryRecord,
} from './history.types'

/**
 * The only place that talks to the database about recorded history.
 *
 * Takes a client so the service states at each call site whether it reads as
 * the signed-in user (RLS enforced) or writes through the service role (the
 * routines in migration 0024 are revoked from `authenticated`).
 *
 * Makes no authorization decisions (ARCH-5).
 */

const PG_SERIALIZATION_FAILURE = '40001'
const PG_NO_DATA_FOUND = 'P0002'
const PG_CHECK_VIOLATION = '23514'
const PG_UNIQUE_VIOLATION = '23505'

function translate(error: PostgrestError, operation: string): never {
  if (error.code === PG_SERIALIZATION_FAILURE) {
    throw conflict('This record was changed by someone else. Close it, reopen it and try again.', {
      operation,
      code: 'VERSION_CONFLICT',
    })
  }
  if (error.code === PG_NO_DATA_FOUND) throw notFound('That record is not held at this clinic.')
  if (error.code === PG_UNIQUE_VIOLATION) throw conflict('That record already exists.', { operation })
  if (error.code === PG_CHECK_VIOLATION) {
    throw internal(`Rejected by a database constraint during ${operation}.`, error)
  }
  if (!error.code) throw retryable('The database did not respond. Try again.', error)
  throw internal(`Database error during ${operation}.`, error)
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Prior pregnancies with their babies, in gravida order. */
export async function listObstetricHistory(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<ObstetricHistoryRecord[]> {
  const { data, error } = await db
    .from('obstetric_history')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('sequence_no', { ascending: true })
    .returns<ObstetricHistoryRow[]>()

  if (error) translate(error, 'listObstetricHistory')
  const rows = data ?? []
  if (rows.length === 0) return []

  const { data: infants, error: infantError } = await db
    .from('obstetric_history_infants')
    .select('*')
    .eq('clinic_id', clinicId)
    .in(
      'history_id',
      rows.map((row) => row.id),
    )
    .returns<InfantRow[]>()

  if (infantError) translate(infantError, 'listObstetricHistory.infants')
  return rows.map((row) => toObstetricHistoryRecord(row, infants ?? []))
}

/** Every menstrual history taken, newest first. */
export async function listMenstrualHistory(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<MenstrualHistoryRecord[]> {
  const { data, error } = await db
    .from('menstrual_histories')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('recorded_on', { ascending: false })
    .order('created_at', { ascending: false })
    .returns<MenstrualHistoryRow[]>()

  if (error) translate(error, 'listMenstrualHistory')
  return (data ?? []).map(toMenstrualHistoryRecord)
}

/** Every immunization recorded for this patient, across her pregnancies. */
export async function listImmunizations(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<ImmunizationRecord[]> {
  const { data, error } = await db
    .from('immunizations')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('administered_on', { ascending: true, nullsFirst: false })
    .returns<ImmunizationRow[]>()

  if (error) translate(error, 'listImmunizations')
  return (data ?? []).map(toImmunizationRecord)
}

/** Current family-history rows, in the order they were recorded. Removed rows are not shown. */
export async function listFamilyHistory(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<FamilyHistoryEntry[]> {
  const { data, error } = await db
    .from('family_histories')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .is('removed_at', null)
    .order('created_at', { ascending: true })
    .returns<FamilyHistoryRow[]>()

  if (error) translate(error, 'listFamilyHistory')
  return (data ?? []).map(toFamilyHistoryEntry)
}

export async function findPastHistory(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<PastHistory | null> {
  const { data, error } = await db
    .from('patient_past_histories')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .maybeSingle<PastHistoryRow>()

  if (error) translate(error, 'findPastHistory')
  return data ? toPastHistory(data) : null
}

/* -------------------------------------------------------------------------- */
/* Writes — the routines from migration 0024                                  */
/* -------------------------------------------------------------------------- */

type Fn = Database['public']['Functions']
type Nullable<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: T[P] | null }

interface WriteContext {
  readonly clinicId: string
  readonly actorStaffUserId: string
  readonly requestId: string
}

export async function saveObstetricHistoryEntry(
  db: TypedClient,
  params: WriteContext & {
    patientId: string
    historyId: string | null
    expectedVersion: number | null
    /** Keys are read by name in SQL (`p_entry ->> 'eventDate'`). */
    entry: Record<string, unknown>
  },
): Promise<string> {
  const args: Nullable<
    Fn['save_obstetric_history_entry']['Args'],
    'p_history_id' | 'p_expected_version'
  > = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_patient_id: params.patientId,
    p_history_id: params.historyId,
    p_expected_version: params.expectedVersion,
    p_entry: params.entry as never,
  }

  const { data, error } = await db.rpc(
    'save_obstetric_history_entry',
    args as Fn['save_obstetric_history_entry']['Args'],
  )
  if (error) translate(error, 'saveObstetricHistoryEntry')
  if (typeof data !== 'string') throw internal('save_obstetric_history_entry returned no id.')
  return data
}

export async function saveMenstrualHistory(
  db: TypedClient,
  params: WriteContext & {
    patientId: string
    historyId: string | null
    expectedVersion: number | null
    recordedOn: string
    entry: Record<string, unknown>
  },
): Promise<string> {
  const args: Nullable<
    Fn['save_menstrual_history']['Args'],
    'p_history_id' | 'p_expected_version'
  > = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_patient_id: params.patientId,
    p_history_id: params.historyId,
    p_expected_version: params.expectedVersion,
    p_recorded_on: params.recordedOn,
    p_entry: params.entry as never,
  }

  const { data, error } = await db.rpc(
    'save_menstrual_history',
    args as Fn['save_menstrual_history']['Args'],
  )
  if (error) translate(error, 'saveMenstrualHistory')
  if (typeof data !== 'string') throw internal('save_menstrual_history returned no id.')
  return data
}

export async function recordImmunization(
  db: TypedClient,
  params: WriteContext & {
    pregnancyId: string
    vaccine: string
    status: Database['public']['Enums']['immunization_status']
    administeredOn: string | null
    facility: string | null
    batchNumber: string | null
    source: Database['public']['Enums']['data_source']
  },
): Promise<string> {
  const args: Nullable<
    Fn['record_immunization']['Args'],
    'p_administered_on' | 'p_facility' | 'p_batch_number'
  > = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_pregnancy_id: params.pregnancyId,
    p_vaccine: params.vaccine,
    p_status: params.status,
    p_administered_on: params.administeredOn,
    p_facility: params.facility,
    p_batch_number: params.batchNumber,
    p_source: params.source,
  }

  const { data, error } = await db.rpc(
    'record_immunization',
    args as Fn['record_immunization']['Args'],
  )
  if (error) translate(error, 'recordImmunization')
  if (typeof data !== 'string') throw internal('record_immunization returned no id.')
  return data
}

export async function saveFamilyHistoryEntry(
  db: TypedClient,
  params: WriteContext & {
    patientId: string
    entryId: string | null
    expectedVersion: number | null
    entry: Record<string, unknown>
  },
): Promise<string> {
  const args: Nullable<Fn['save_family_history_entry']['Args'], 'p_entry_id' | 'p_expected_version'> = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_patient_id: params.patientId,
    p_entry_id: params.entryId,
    p_expected_version: params.expectedVersion,
    p_entry: params.entry as never,
  }

  const { data, error } = await db.rpc(
    'save_family_history_entry',
    args as Fn['save_family_history_entry']['Args'],
  )
  if (error) translate(error, 'saveFamilyHistoryEntry')
  if (typeof data !== 'string') throw internal('save_family_history_entry returned no id.')
  return data
}

export async function removeFamilyHistoryEntry(
  db: TypedClient,
  params: WriteContext & { patientId: string; entryId: string; expectedVersion: number },
): Promise<void> {
  const { error } = await db.rpc('remove_family_history_entry', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_patient_id: params.patientId,
    p_entry_id: params.entryId,
    p_expected_version: params.expectedVersion,
  })
  if (error) translate(error, 'removeFamilyHistoryEntry')
}

export async function savePastHistory(
  db: TypedClient,
  params: WriteContext & { patientId: string; expectedVersion: number | null; notes: string | null },
): Promise<number> {
  const args: Nullable<Fn['save_past_history']['Args'], 'p_expected_version' | 'p_notes'> = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_patient_id: params.patientId,
    p_expected_version: params.expectedVersion,
    p_notes: params.notes,
  }

  const { data, error } = await db.rpc('save_past_history', args as Fn['save_past_history']['Args'])
  if (error) translate(error, 'savePastHistory')
  if (typeof data !== 'number') throw internal('save_past_history returned no version.')
  return data
}

/** Flag or unflag one history entry. Not version-checked: a flag is a toggle, not an edit. */
export async function setHistoryFlag(
  db: TypedClient,
  params: WriteContext & {
    patientId: string
    kind: 'OBSTETRIC' | 'MENSTRUAL' | 'FAMILY' | 'PAST'
    entryId: string
    flagged: boolean
  },
): Promise<void> {
  const { error } = await db.rpc('set_history_flag', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_patient_id: params.patientId,
    p_kind: params.kind,
    p_entry_id: params.entryId,
    p_flagged: params.flagged,
  })
  if (error) translate(error, 'setHistoryFlag')
}
