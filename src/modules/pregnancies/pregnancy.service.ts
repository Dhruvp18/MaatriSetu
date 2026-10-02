import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { userClient, serviceClient } from '@core/db/clients'
import { AppError, conflict, notFound, validation } from '@core/errors/app-error'
import { type CalendarDate, todayIn } from '@core/obstetrics/dating'

import * as repo from './pregnancy.repository'
import {
  ClosePregnancySchema,
  CreatePregnancySchema,
  SaveBirthPlanSchema,
  UpdateDatingSchema,
  UpdatePregnancyProfileSchema,
  datingIsPlausibleOn,
  toDatingColumns,
} from './pregnancy.schema'
import type { Pregnancy, PregnancyWithHistory } from './pregnancy.types'

/**
 * The pregnancies module's public API.
 *
 * Reads run as the signed-in user so RLS applies independently; writes run
 * through the service role, because the routines in migration 0015 are revoked
 * from `authenticated` and span several tables.
 */

/**
 * The clinic's calendar day.
 *
 * Gestational age is a calendar computation. Taking "today" from the server's
 * UTC clock shifts the displayed POG by a day for several hours each night in
 * IST, and near a milestone boundary — the anomaly-scan window, the steroid
 * window — that day matters.
 *
 * The zone travels on the actor, resolved from `clinics.timezone` when the
 * session is established, so a second site in another zone is correct by
 * construction rather than by remembering to change a constant here.
 */
function clinicToday(actor: ActorContext): CalendarDate {
  return todayIn(actor.clinicTimezone)
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function getPregnancy(
  actor: ActorContext,
  pregnancyId: string,
): Promise<Pregnancy> {
  requirePermission(actor, 'pregnancy.read')

  const db = await userClient()
  const pregnancy = await repo.findPregnancyById(db, actor.clinicId, pregnancyId)

  if (!pregnancy) throw notFound('That pregnancy is not recorded at this clinic.')
  return pregnancy
}

/**
 * The patient's current episode together with her prior obstetric history.
 *
 * One call because the cockpit needs both, and because the history is a fact
 * about the patient rather than about this episode — fetching it separately
 * invites a screen that renders the pregnancy without it.
 *
 * Returns null when there is no active episode. That is a normal state, not an
 * error: the caller offers "start a pregnancy".
 */
/**
 * The patient's current episode, without her obstetric history.
 *
 * For callers that need only the episode a document or a visit hangs off —
 * report intake, in particular, which an assistant reaches. They hold
 * `pregnancy.read` because attaching a slip requires knowing which episode it
 * belongs to, and that is not a reason to load a woman's prior stillbirths onto
 * the screen of someone who only has to photograph a lab report.
 *
 * Returns null when there is no active episode. A normal state, not an error.
 */
export async function getActivePregnancy(
  actor: ActorContext,
  patientId: string,
): Promise<Pregnancy | null> {
  requirePermission(actor, 'pregnancy.read')

  return repo.findActivePregnancy(await userClient(), actor.clinicId, patientId)
}

export async function getActivePregnancyWithHistory(
  actor: ActorContext,
  patientId: string,
): Promise<PregnancyWithHistory | null> {
  requirePermission(actor, 'pregnancy.read')

  const db = await userClient()
  const pregnancy = await repo.findActivePregnancy(db, actor.clinicId, patientId)
  if (!pregnancy) return null

  const obstetricHistory = await repo.listObstetricHistory(db, actor.clinicId, patientId)
  return { pregnancy, obstetricHistory }
}

/** Every episode for a patient, newest first. */
export async function listPregnancies(
  actor: ActorContext,
  patientId: string,
): Promise<Pregnancy[]> {
  requirePermission(actor, 'pregnancy.read')

  const db = await userClient()
  return repo.listPregnanciesForPatient(db, actor.clinicId, patientId)
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Open a new episode.
 *
 * At most one active pregnancy per patient. The partial unique index in
 * migration 0004 is what makes that true under concurrency; this pre-check
 * exists so the common case returns the existing episode's id rather than a
 * raw constraint violation, letting the UI offer to open it.
 *
 * A second concurrent episode is almost always a data-entry error — the same
 * mother booked twice at a busy counter. Correcting it is a deliberate, audited
 * act (close the wrong one), never a silent replacement.
 */
export async function createPregnancy(
  actor: ActorContext,
  input: unknown,
): Promise<Pregnancy> {
  requirePermission(actor, 'pregnancy.create')

  const parsed = CreatePregnancySchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This pregnancy could not be recorded.', parsed.error.issues)
  }

  const data = parsed.data
  const dating = toDatingColumns(data.dating)

  // Catches the transposed-year LMP: a date thirteen months back satisfies both
  // the date format and the column CHECK, and would otherwise surface only as a
  // nonsensical gestational age on the cockpit.
  if (!datingIsPlausibleOn(dating, clinicToday(actor))) {
    throw validation(
      'That dating implies an impossible gestational age today. Check the date.',
      { field: 'dating' },
    )
  }

  const reads = await userClient()
  const existing = await repo.findActivePregnancy(reads, actor.clinicId, data.patientId)
  if (existing) {
    throw conflict('This patient already has an active pregnancy.', {
      code: 'ACTIVE_PREGNANCY_EXISTS',
      existingPregnancyId: existing.id,
    })
  }

  const pregnancyId = await repo.insertPregnancy(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    patientId: data.patientId,
    datingReferenceDate: dating.referenceDate,
    datingReferenceGaDays: dating.referenceGaDays,
    datingMethod: dating.method,
    datingCertainty: dating.certainty,
    // Kept verbatim even when dating comes from a scan: it is part of the
    // record of what she said. When she is dated by LMP the schema has already
    // checked the two agree.
    reportedLmp: data.reportedLmp ?? (data.dating.method === 'LMP' ? data.dating.lmp : null),
    reportedLmpCertainty: data.reportedLmpCertainty,
    gravida: data.gravidaParity.gravida ?? null,
    parity: data.gravidaParity.parity ?? null,
    living: data.gravidaParity.living ?? null,
    abortions: data.gravidaParity.abortions ?? null,
    prePregnancyWeightKg: data.prePregnancyWeightKg ?? null,
    heightCm: data.heightCm ?? null,
    obstetricHistory: data.obstetricHistory.map((entry) => ({
      sequenceNo: entry.sequenceNo,
      yearOfEvent: entry.yearOfEvent ?? null,
      eventDate: entry.eventDate ?? null,
      eventDatePrecision: entry.eventDatePrecision,
      outcome: entry.outcome,
      deliveryMode: entry.deliveryMode,
      gestationWeeksAtDelivery: entry.gestationWeeksAtDelivery ?? null,
      birthWeightGrams: entry.birthWeightGrams ?? null,
      childAlive: entry.childAlive,
      hasUterineScar: entry.hasUterineScar,
      scarIndication: entry.scarIndication ?? null,
      complications: entry.complications ?? null,
      placeOfEvent: entry.placeOfEvent ?? null,
      source: entry.source,
    })),
  })

  const pregnancy = await repo.findPregnancyById(reads, actor.clinicId, pregnancyId)
  if (!pregnancy) {
    throw new AppError('INTERNAL', 'The pregnancy was created but could not be read back.')
  }

  return pregnancy
}

/* -------------------------------------------------------------------------- */
/* Redating                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Change the dating anchor.
 *
 * Redating from a first-trimester scan is routine practice, and this is the
 * supported way to do it — as opposed to back-calculating a fictional LMP,
 * which would then circulate as though the mother had recalled it.
 *
 * Restricted to `pregnancy.update_dating`, which only a doctor holds: moving
 * the anchor moves the EDD, the POG badge and every milestone window on the
 * record. The version is checked so a concurrent change is a conflict rather
 * than a silent overwrite, and the previous anchor is kept in the audit row.
 *
 * Past saved visits keep the gestational age frozen on them. That is what the
 * clinician reasoned from that day, and rewriting it would misrepresent the
 * record.
 */
export async function updatePregnancyDating(
  actor: ActorContext,
  pregnancyId: string,
  input: unknown,
): Promise<Pregnancy> {
  requirePermission(actor, 'pregnancy.update_dating')

  const parsed = UpdateDatingSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('The dating could not be changed.', parsed.error.issues)
  }

  const { dating: datingInput, expectedVersion, reason } = parsed.data
  const dating = toDatingColumns(datingInput)

  if (dating.referenceDate === null || dating.referenceGaDays === null) {
    // UpdateDatingSchema already rejects the NONE method; this keeps the
    // repository call honest about its non-null arguments.
    throw validation('A dating change needs an anchor date and a gestational age.', {
      field: 'dating',
    })
  }

  if (!datingIsPlausibleOn(dating, clinicToday(actor))) {
    throw validation(
      'That dating implies an impossible gestational age today. Check the date.',
      { field: 'dating' },
    )
  }

  await repo.updateDating(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    pregnancyId,
    expectedVersion,
    datingReferenceDate: dating.referenceDate,
    datingReferenceGaDays: dating.referenceGaDays,
    datingMethod: dating.method,
    datingCertainty: dating.certainty,
    reason,
  })

  const pregnancy = await repo.findPregnancyById(await userClient(), actor.clinicId, pregnancyId)
  if (!pregnancy) throw notFound('That pregnancy is not recorded at this clinic.')

  return pregnancy
}

/**
 * Height, marriage and how this pregnancy was conceived.
 *
 * Held by `patient.update`, like the rest of the history taken at the counter:
 * a nurse asks these as often as the doctor does.
 */
export async function updatePregnancyProfile(actor: ActorContext, input: unknown): Promise<number> {
  requirePermission(actor, 'patient.update')

  const parsed = UpdatePregnancyProfileSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('These pregnancy details could not be saved.', parsed.error.issues)
  }

  const { pregnancyId, expectedVersion, ...profile } = parsed.data
  return repo.updateProfile(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    pregnancyId,
    expectedVersion,
    profile,
  })
}

/** The birth preparedness plan, saved whole. Empty answers are dropped rather than stored blank. */
export async function saveBirthPlan(actor: ActorContext, input: unknown): Promise<number> {
  requirePermission(actor, 'patient.update')

  const parsed = SaveBirthPlanSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This birth plan could not be saved.', parsed.error.issues)
  }

  const { pregnancyId, expectedVersion, plan } = parsed.data
  const kept = Object.fromEntries(Object.entries(plan).filter(([, value]) => value !== undefined && value !== ''))
  return repo.saveBirthPlan(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    pregnancyId,
    expectedVersion,
    plan: kept,
  })
}

/* -------------------------------------------------------------------------- */
/* Close                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Close an episode.
 *
 * `CLOSED_UNKNOWN` exists so a clinic that genuinely does not know what
 * happened can say so. Forcing every closure through `COMPLETED` with an
 * outcome of `UNKNOWN` would record an observation the clinic never made — the
 * same defect as rendering an empty allergy field as "no allergies".
 */
export async function closePregnancy(
  actor: ActorContext,
  pregnancyId: string,
  input: unknown,
): Promise<Pregnancy> {
  requirePermission(actor, 'pregnancy.close')

  const parsed = ClosePregnancySchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This pregnancy could not be closed.', parsed.error.issues)
  }

  const data = parsed.data

  if (data.status === 'COMPLETED' && data.outcomeDate > clinicToday(actor)) {
    throw validation('An outcome cannot be recorded for a future date.', {
      field: 'outcomeDate',
    })
  }

  await repo.closePregnancy(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    pregnancyId,
    expectedVersion: data.expectedVersion,
    status: data.status,
    outcome: data.status === 'COMPLETED' ? data.outcome : null,
    outcomeDate: data.status === 'COMPLETED' ? data.outcomeDate : null,
    note: data.note ?? null,
  })

  const pregnancy = await repo.findPregnancyById(await userClient(), actor.clinicId, pregnancyId)
  if (!pregnancy) throw notFound('That pregnancy is not recorded at this clinic.')

  return pregnancy
}
