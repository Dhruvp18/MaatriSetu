import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { serviceClient, userClient } from '@core/db/clients'
import { validation } from '@core/errors/app-error'
import { todayIn } from '@core/obstetrics/dating'

import * as repo from './history.repository'
import {
  RecordImmunizationSchema,
  RemoveFamilyHistorySchema,
  SaveFamilyHistorySchema,
  SavePastHistorySchema,
  SaveMenstrualHistorySchema,
  SaveObstetricHistorySchema,
} from './history.schema'
import type {
  FamilyHistoryEntry,
  ImmunizationRecord,
  PastHistory,
  MenstrualHistoryRecord,
  ObstetricHistoryRecord,
} from './history.types'

/**
 * The history module's public API.
 *
 * Reads run as the signed-in user so RLS applies independently. Writes run
 * through the service role, because the routines in migration 0024 persist and
 * audit in one transaction and are revoked from `authenticated`.
 *
 * Permissions reuse the existing matrix rather than inventing new ones:
 *
 *   reading history      `patient.read` — the same people who see her record.
 *   writing obstetric /  `patient.update` — history is taken at the counter by
 *   menstrual history    a nurse as often as by the doctor, like registration.
 *   recording a vaccine  `medication_administration.record` — it is a dose
 *                        given, and the nurse who gave it records it.
 */

export interface PatientHistory {
  readonly obstetric: readonly ObstetricHistoryRecord[]
  readonly menstrual: readonly MenstrualHistoryRecord[]
  readonly immunizations: readonly ImmunizationRecord[]
  readonly family: readonly FamilyHistoryEntry[]
  /** Null until a past history has been written for her. */
  readonly past: PastHistory | null
}

/** Everything the cockpit's history accordions show, in one call. */
export async function getPatientHistory(
  actor: ActorContext,
  patientId: string,
): Promise<PatientHistory> {
  requirePermission(actor, 'patient.read')

  const db = await userClient()
  const [obstetric, menstrual, immunizations, family, past] = await Promise.all([
    repo.listObstetricHistory(db, actor.clinicId, patientId),
    repo.listMenstrualHistory(db, actor.clinicId, patientId),
    repo.listImmunizations(db, actor.clinicId, patientId),
    repo.listFamilyHistory(db, actor.clinicId, patientId),
    repo.findPastHistory(db, actor.clinicId, patientId),
  ])

  return { obstetric, menstrual, immunizations, family, past }
}

/**
 * Record a prior pregnancy, or correct one.
 *
 * An edit is version-checked: two people correcting the same pregnancy at two
 * terminals is a conflict to reconcile, never a silent last-write-wins.
 */
export async function saveObstetricHistory(actor: ActorContext, input: unknown): Promise<string> {
  requirePermission(actor, 'patient.update')

  const parsed = SaveObstetricHistorySchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This pregnancy history could not be saved.', parsed.error.issues)
  }

  const { patientId, historyId, expectedVersion, entry } = parsed.data

  return repo.saveObstetricHistoryEntry(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    patientId,
    historyId: historyId ?? null,
    expectedVersion: expectedVersion ?? null,
    entry: { ...entry, infants: entry.infants.map((infant) => ({ ...infant })) },
  })
}

/** Record a menstrual history, or correct one. Dated to the clinic's today. */
export async function saveMenstrualHistory(actor: ActorContext, input: unknown): Promise<string> {
  requirePermission(actor, 'patient.update')

  const parsed = SaveMenstrualHistorySchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This menstrual history could not be saved.', parsed.error.issues)
  }

  const { patientId, historyId, expectedVersion, entry } = parsed.data
  const today = todayIn(actor.clinicTimezone)

  if (entry.lmp && entry.lmp > today) {
    throw validation('An LMP cannot be in the future. Check the date.', { field: 'lmp' })
  }
  if (entry.lastPapSmearOn && entry.lastPapSmearOn > today) {
    throw validation('A Pap smear cannot be dated in the future. Check the date.', { field: 'lastPapSmearOn' })
  }

  return repo.saveMenstrualHistory(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    patientId,
    historyId: historyId ?? null,
    expectedVersion: expectedVersion ?? null,
    recordedOn: today,
    entry: { ...entry },
  })
}

/** Record a vaccine for this pregnancy. A second record for the same vaccine updates it. */
export async function recordImmunization(actor: ActorContext, input: unknown): Promise<string> {
  requirePermission(actor, 'medication_administration.record')

  const parsed = RecordImmunizationSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This immunization could not be recorded.', parsed.error.issues)
  }

  const data = parsed.data
  if (data.administeredOn && data.administeredOn > todayIn(actor.clinicTimezone)) {
    throw validation('A dose cannot be recorded as given on a future date.', {
      field: 'administeredOn',
    })
  }

  return repo.recordImmunization(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    pregnancyId: data.pregnancyId,
    vaccine: data.vaccine,
    status: data.status,
    // A planned or declined dose has no administration date, whatever the form sent.
    administeredOn: data.status === 'GIVEN' ? (data.administeredOn ?? null) : null,
    facility: data.facility ?? null,
    batchNumber: data.batchNumber ?? null,
    source: data.source,
  })
}

/** Add a relative's illness to her family history, or correct one. */
export async function saveFamilyHistory(actor: ActorContext, input: unknown): Promise<string> {
  requirePermission(actor, 'patient.update')

  const parsed = SaveFamilyHistorySchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This family history could not be saved.', parsed.error.issues)
  }

  const { patientId, entryId, expectedVersion, entry } = parsed.data
  return repo.saveFamilyHistoryEntry(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    patientId,
    entryId: entryId ?? null,
    expectedVersion: expectedVersion ?? null,
    entry: { ...entry },
  })
}

/** Take a row off her family history. It is kept, marked removed, and audited. */
export async function removeFamilyHistory(actor: ActorContext, input: unknown): Promise<void> {
  requirePermission(actor, 'patient.update')

  const parsed = RemoveFamilyHistorySchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This family history row could not be removed.', parsed.error.issues)
  }

  await repo.removeFamilyHistoryEntry(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    ...parsed.data,
  })
}

/** Write her past history. Version-checked, so two people editing it conflict rather than overwrite. */
export async function savePastHistory(actor: ActorContext, input: unknown): Promise<number> {
  requirePermission(actor, 'patient.update')

  const parsed = SavePastHistorySchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This past history could not be saved.', parsed.error.issues)
  }

  return repo.savePastHistory(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    patientId: parsed.data.patientId,
    expectedVersion: parsed.data.expectedVersion,
    notes: parsed.data.notes?.trim() || null,
  })
}
