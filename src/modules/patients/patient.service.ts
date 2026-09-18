import 'server-only'

import { type ActorContext, isStaff, requirePermission } from '@core/auth/actor'
import { type Permission, roleHasPermission } from '@core/auth/permissions'
import { userClient, serviceClient } from '@core/db/clients'
import { AppError, conflict, notFound, validation } from '@core/errors/app-error'
import { hashToken, looksLikeToken, mintToken } from '@core/tokens/opaque-token'

import * as repo from './patient.repository'
import {
  RegisterPatientSchema,
  SearchPatientsSchema,
  classifySearchTerm,
} from './patient.schema'
import type { IssuedPatientQr, Patient, PatientSearchResult } from './patient.types'

/**
 * The patients module's public API.
 *
 * Everything outside this module — route handlers, server components, other
 * modules — comes through here and never through the repository (ARCH-1,
 * ARCH-4).
 *
 * ---------------------------------------------------------------------------
 * Two clients, on purpose
 * ---------------------------------------------------------------------------
 * Reads run as the signed-in user, so RLS is a second, independent check: if a
 * bug in this file let a clinic id through unexamined, the database would still
 * return nothing. Writes run as the service role, because the transactional
 * routines in migration 0013 are revoked from `authenticated` and because a
 * multi-table clinical commit cannot be expressed as an RLS policy.
 *
 * Which one is in use is stated at every call site. A read that quietly used
 * the service client would lose its safety net without anyone noticing.
 */

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Identity search over UHID, name and phone.
 *
 * The result is shaped by role. An assistant holds `patient.search` so she can
 * find the right file to attach a slip to, but not `patient.read` — so her
 * results carry identity and nothing else. That minimization happens here
 * rather than in the UI: a hidden column is not authorization (ARCH-5).
 */
export async function searchPatients(
  actor: ActorContext,
  input: unknown,
): Promise<PatientSearchResult[]> {
  requirePermission(actor, 'patient.search')

  const parsed = SearchPatientsSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('That search could not be understood.', parsed.error.issues)
  }

  const { query, limit } = parsed.data
  const { phone } = classifySearchTerm(query)

  const db = await userClient()
  const matches = await repo.searchPatients(db, actor.clinicId, {
    term: query,
    phoneE164: phone,
    limit,
  })

  // `patient.read` is the demographics permission. Holding only `patient.search`
  // gets a name and a file number — enough to pick the right paper file off the
  // pile, and no more.
  const mayReadDemographics = actorHas(actor, 'patient.read')

  return matches.map((match): PatientSearchResult => {
    if (!mayReadDemographics) {
      return {
        visibility: 'IDENTITY_ONLY',
        id: match.identity.id,
        uhid: match.identity.uhid,
        fullName: match.identity.fullName,
      }
    }

    return {
      visibility: 'FULL',
      id: match.identity.id,
      uhid: match.identity.uhid,
      fullName: match.identity.fullName,
      age: match.identity.age,
      hasActiveQrToken: match.hasActiveQrToken,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Read                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One patient, with allergies and contacts.
 *
 * A patient in another clinic is reported as not found, not as forbidden —
 * otherwise the error itself tells the caller that the id is real (see
 * `httpStatusFor`).
 */
export async function getPatient(actor: ActorContext, patientId: string): Promise<Patient> {
  requirePermission(actor, 'patient.read')

  const db = await userClient()
  const patient = await repo.findPatientById(db, actor.clinicId, patientId)

  if (!patient) throw notFound('That patient is not registered at this clinic.')
  return patient
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Register a mother.
 *
 * Creating the patient, her allergies, her contacts and the registration audit
 * row is one transaction in the database (migration 0013). Doing it as four
 * REST calls would make a patient with no contacts, or a clinical write with no
 * audit trail, a reachable state.
 *
 * ---------------------------------------------------------------------------
 * On idempotency
 * ---------------------------------------------------------------------------
 * The API outline calls this operation idempotent. What is implemented here is
 * the natural key: UHID is unique within a clinic, so a resubmitted form — a
 * double-click, a retried request after a timeout — cannot create a second
 * record for the same file. It returns CONFLICT carrying the existing patient
 * id, so the UI can offer to open her record instead of silently creating or
 * silently reusing.
 *
 * That is deliberately not the request-key idempotency the atomic visit save
 * needs, and `idempotency_requests` is not used here. Registration has a real
 * natural key; a consultation save does not.
 */
export async function registerPatient(actor: ActorContext, input: unknown): Promise<Patient> {
  requirePermission(actor, 'patient.register')

  const parsed = RegisterPatientSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This registration could not be saved.', parsed.error.issues)
  }

  const data = parsed.data

  // Two contacts on the same handset would trip the per-patient uniqueness
  // constraint. Caught here so it reads as a form error rather than as a
  // database failure.
  const phones = data.contacts.map((c) => c.phone)
  if (new Set(phones).size !== phones.length) {
    throw validation('The same number has been entered twice.', { field: 'contacts' })
  }

  const reads = await userClient()
  const existingId = await repo.findPatientIdByUhid(reads, actor.clinicId, data.uhid)
  if (existingId !== null) {
    throw conflict('A patient with this file number is already registered here.', {
      code: 'UHID_TAKEN',
      existingPatientId: existingId,
    })
  }

  const patientId = await repo.insertPatient(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    uhid: data.uhid,
    fullName: data.fullName,
    dateOfBirth: data.age.kind === 'DATE_OF_BIRTH' ? data.age.dateOfBirth : null,
    estimatedAgeYears: data.age.kind === 'ESTIMATED' ? data.age.years : null,
    ageRecordedOn: data.age.kind === 'ESTIMATED' ? data.age.recordedOn : null,
    abhaId: data.abhaId ?? null,
    // A 14-digit number that parses is not a number that has been checked
    // against ABDM. Nothing in this flow talks to ABDM, so nothing here may
    // claim VERIFIED.
    abhaVerification: data.abhaId ? 'SELF_DECLARED' : 'NOT_PROVIDED',
    allergyStatus: data.allergyStatus,
    bloodGroup: data.bloodGroup ?? null,
    bloodGroupSource: data.bloodGroupSource ?? null,
    bloodGroupRecordedOn: data.bloodGroupRecordedOn ?? null,
    allergies: data.allergies.map((a) => ({
      substance: a.substance,
      reaction: a.reaction ?? null,
      severity: a.severity,
      source: a.source,
    })),
    contacts: data.contacts.map((c) => ({
      phone: c.phone,
      relationship: c.relationship,
      contactName: c.contactName ?? null,
      isPrimary: c.isPrimary,
      hasMessagingConsent: c.hasMessagingConsent,
    })),
  })

  // Read back through the user client rather than returning a locally assembled
  // object: what the caller receives is then what the database actually holds,
  // defaults and triggers included.
  const patient = await repo.findPatientById(reads, actor.clinicId, patientId)
  if (!patient) {
    throw new AppError('INTERNAL', 'The patient was registered but could not be read back.')
  }

  return patient
}

/* -------------------------------------------------------------------------- */
/* The file sticker                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Mint a QR token for the mother's paper file.
 *
 * The raw token is returned exactly once, here, because only its hash is
 * stored. Print it or lose it.
 *
 * Issuing again replaces the live sticker rather than adding a second one. One
 * file, one working sticker: a photocopied page must not keep opening her
 * record, and "which of her three stickers is current" is not a question a
 * counter should have to answer.
 */
export async function issuePatientQr(
  actor: ActorContext,
  patientId: string,
): Promise<IssuedPatientQr> {
  requirePermission(actor, 'patient.issue_qr')

  const reads = await userClient()
  const patient = await repo.findPatientById(reads, actor.clinicId, patientId)
  if (!patient) throw notFound('That patient is not registered at this clinic.')

  const token = mintToken()

  const issuedAt = await repo.setQrTokenHash(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    patientId,
    tokenHashHex: token.hashHex,
  })

  return {
    patientId,
    uhid: patient.uhid,
    fullName: patient.fullName,
    token: token.raw,
    issuedAt,
    replacedPrevious: patient.hasActiveQrToken,
  }
}

/**
 * Retire the sticker on a lost or destroyed file.
 *
 * Her identity and her history are untouched; only the lookup key stops
 * working. Returns false when there was no live sticker to retire, which is a
 * no-op rather than an error — revoking twice should not fail.
 */
export async function revokePatientQr(
  actor: ActorContext,
  patientId: string,
  reason: string | null = null,
): Promise<boolean> {
  requirePermission(actor, 'patient.issue_qr')

  return repo.revokeQrToken(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    patientId,
    reason,
  })
}

/**
 * Resolve a scanned sticker to a patient.
 *
 * Scanning is a read of her whole record, so it needs `patient.read` — the same
 * permission as opening her by id. A sticker is a faster way to reach a record,
 * never a way to reach one you could not otherwise open.
 *
 * Every outcome that is not a live sticker in this clinic returns the same
 * not-found: unknown token, revoked token, another clinic's token. Telling
 * those apart would turn the scanner into an oracle.
 */
export async function getPatientByQrToken(
  actor: ActorContext,
  rawToken: string,
): Promise<Patient> {
  requirePermission(actor, 'patient.read')

  if (!looksLikeToken(rawToken)) {
    throw notFound('That code is not a patient file sticker.')
  }

  // The lookup routine is service-role only: `patients.qr_token_hash` must not
  // be queryable from a browser session, or a leaked anon key could test
  // guessed tokens.
  const patientId = await repo.findPatientIdByQrHash(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    tokenHashHex: hashToken(rawToken),
  })

  if (patientId === null) {
    throw notFound('That sticker does not match a file at this clinic.')
  }

  const patient = await repo.findPatientById(await userClient(), actor.clinicId, patientId)
  if (!patient) throw notFound('That sticker does not match a file at this clinic.')

  return patient
}

/* -------------------------------------------------------------------------- */

/**
 * Non-throwing permission test, for shaping a payload rather than guarding one.
 *
 * `requirePermission` is the guard, and stays the guard. This answers the
 * narrower question of how much of an already-authorized result the caller may
 * see, where throwing would be wrong — an assistant's search is permitted, it
 * is just smaller. Both read the same matrix, so the two can never disagree.
 */
function actorHas(actor: ActorContext, permission: Permission): boolean {
  return isStaff(actor) && roleHasPermission(actor.role, permission)
}
