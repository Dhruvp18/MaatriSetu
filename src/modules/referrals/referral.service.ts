import 'server-only'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { serverEnv } from '@core/config/env'
import { serviceClient, userClient } from '@core/db/clients'
import { AppError, notFound, validation } from '@core/errors/app-error'
import { todayIn } from '@core/obstetrics/dating'
import { hashToken, looksLikeToken, mintToken } from '@core/tokens/opaque-token'

import * as repo from './referral.repository'
import {
  CreateReferralDraftSchema,
  CreateReferralLinkSchema,
  IssueReferralSchema,
  RevokeReferralLinkSchema,
  UpdateReferralDraftSchema,
} from './referral.schema'
import {
  type MintedReferralLink,
  type Referral,
  type ReferralAccess,
  type ReferralLink,
  SNAPSHOT_SCHEMA_VERSION,
} from './referral.types'

/**
 * The referrals module's public API.
 *
 * Reads run as the signed-in user so RLS applies as an independent second
 * check; writes run through the service role, because the routines in migration
 * 0021 are revoked from `authenticated`.
 *
 * ---------------------------------------------------------------------------
 * The one function here without an ActorContext
 * ---------------------------------------------------------------------------
 * `openReferralByToken` is the deliberate exception to ARCH-5. It serves a
 * receiving doctor at 2 AM who has no account at this clinic and never will;
 * there is no actor to check because there is no session, and the expiring,
 * revocable, hashed token IS the access decision. Everything that makes that
 * safe is concentrated in one function: it reads nothing but the frozen
 * snapshot, it cannot reach a patient record, and it cannot report why access
 * was refused.
 */

/* -------------------------------------------------------------------------- */
/* Drafting                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Start a referral.
 *
 * Held by nurses as well as doctors. In a labour room the nurse is frequently
 * the person who begins the paperwork while the doctor is with the patient, and
 * making the draft wait on a clinician puts a delay exactly where a transfer
 * cannot afford one. Issuing — the act that freezes a legal document — stays
 * with DOCTOR alone.
 *
 * Deliberately independent of the consultation save. A patient crashing at 2 AM
 * is not inside an OPD visit, and this must not require one to exist.
 */
export async function createDraft(actor: ActorContext, input: unknown): Promise<Referral> {
  requirePermission(actor, 'referral.draft')

  const parsed = CreateReferralDraftSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This referral could not be started.', parsed.error.issues)
  }

  const data = parsed.data

  const referralId = await repo.createReferralDraft(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    pregnancyId: data.pregnancyId,
    originVisitId: data.originVisitId ?? null,
    supersedesId: data.supersedesId ?? null,
    indication: data.indication ?? null,
    receivingFacility: data.receivingFacility ?? null,
  })

  return readBack(actor, referralId, 'The referral was started but could not be read back.')
}

/**
 * Replace the draft's contents.
 *
 * Version-checked: a mismatch is a 409 the UI reconciles, never a silent
 * overwrite. Two people preparing the same transfer from two terminals is
 * routine, and the one who loses the race must be told rather than have their
 * receiving facility quietly replaced.
 */
export async function updateDraft(
  actor: ActorContext,
  referralId: string,
  input: unknown,
): Promise<Referral> {
  requirePermission(actor, 'referral.draft')

  const parsed = UpdateReferralDraftSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This referral could not be saved.', parsed.error.issues)
  }

  const d = parsed.data
  const vitals = d.transferVitals ?? null
  const exam = d.examination ?? null

  await repo.updateReferralDraft(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    referralId,
    expectedVersion: d.expectedVersion,
    referringFacility: d.referringFacility ?? null,
    referringDoctorName: d.referringDoctorName ?? null,
    referringContactPhone: d.referringContactPhone ?? null,
    receivingFacility: d.receivingFacility ?? null,
    receivingContact: d.receivingContact ?? null,
    transportMode: d.transportMode ?? null,
    departureAt: d.departureAt ?? null,
    indication: d.indication ?? null,
    clinicalSummary: d.clinicalSummary ?? null,
    // The nested pair is flattened here, at the boundary with the database. The
    // domain keeps the two halves together so a lone diastolic is
    // unrepresentable above this line.
    transferBpSystolicMmHg: vitals?.bloodPressure?.systolicMmHg ?? null,
    transferBpDiastolicMmHg: vitals?.bloodPressure?.diastolicMmHg ?? null,
    transferPulseBpm: vitals?.pulseBpm ?? null,
    transferRespiratoryRateBpm: vitals?.respiratoryRateBpm ?? null,
    transferSpo2Percent: vitals?.spo2Percent ?? null,
    transferTemperatureC: vitals?.temperatureC ?? null,
    transferUrineAlbumin: vitals?.urineAlbumin ?? null,
    transferFetalHeartRateBpm: vitals?.fetalHeartRateBpm ?? null,
    transferVitalsRecordedAt: vitals?.recordedAt ?? null,
    pvDilatationCm: exam?.dilatationCm ?? null,
    pvEffacementPercent: exam?.effacementPercent ?? null,
    pvStation: exam?.station ?? null,
    pvMembranes: exam?.membranes ?? 'NOT_ASSESSED',
    pvLiquor: exam?.liquor ?? null,
    pvExaminedAt: exam?.examinedAt ?? null,
    // The examiner is the person recording the finding. Taking it from the
    // actor rather than the form means the slip cannot attribute a vaginal
    // examination to someone who did not perform it.
    pvExaminedBy: exam ? actor.staffUserId : null,
    linesAndCatheters: d.linesAndCatheters ?? null,
    accompanyingStaff: d.accompanyingStaff ?? null,
  })

  return readBack(actor, referralId, 'The referral was saved but could not be read back.')
}

/* -------------------------------------------------------------------------- */
/* Issuing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Freeze the document.
 *
 * Reserved to doctors. A referral is a legal handover and the act of issuing it
 * is a clinical decision, so `referral.issue` sits only with DOCTOR — and is in
 * `CLINICIAN_ONLY_PERMISSIONS`, so no worker can ever hold it.
 *
 * Once this returns, the referral is immutable. A correction is a NEW referral
 * carrying `supersedesId`; there is deliberately no path from here back to a
 * draft, because the document is already in a relative's hand.
 */
export async function issueReferral(
  actor: ActorContext,
  referralId: string,
  input: unknown,
): Promise<Referral> {
  requirePermission(actor, 'referral.issue')

  const parsed = IssueReferralSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This referral could not be issued.', parsed.error.issues)
  }

  await repo.issueReferral(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    referralId,
    expectedVersion: parsed.data.expectedVersion,
    // The clinic's calendar day. Gestational age is frozen from it, and the
    // server's UTC clock is the wrong one for several hours each night in IST —
    // which is when most emergency transfers are written.
    asOfDate: todayIn(actor.clinicTimezone),
    snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
  })

  return readBack(actor, referralId, 'The referral was issued but could not be read back.')
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export async function getReferral(actor: ActorContext, referralId: string): Promise<Referral> {
  requirePermission(actor, 'referral.read')

  const referral = await repo.findReferralById(await userClient(), actor.clinicId, referralId)
  if (!referral) throw notFound('That referral is not recorded at this clinic.')

  return referral
}

/** Every referral for a pregnancy, newest first, including superseded ones. */
export async function listForPregnancy(
  actor: ActorContext,
  pregnancyId: string,
): Promise<Referral[]> {
  requirePermission(actor, 'referral.read')

  return repo.listReferralsForPregnancy(await userClient(), actor.clinicId, pregnancyId)
}

/* -------------------------------------------------------------------------- */
/* Links                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Mint a link to an issued referral.
 *
 * The raw token is generated here, hashed, and only the hash is sent to the
 * database. The value in the returned object is the only copy that will ever
 * exist — print it, encode it in a QR, hand it over. A lost link is re-issued,
 * never recovered.
 */
export async function createLink(
  actor: ActorContext,
  referralId: string,
  input: unknown,
): Promise<MintedReferralLink> {
  requirePermission(actor, 'referral.issue_token')

  const parsed = CreateReferralLinkSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This link could not be created.', parsed.error.issues)
  }

  const token = mintToken()

  const created = await repo.createReferralToken(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    referralId,
    tokenHashHex: token.hashHex,
    // How long a handover link should live is a deployment's answer, not a
    // constant in this file: a district hospital taking transfers from four
    // hours away needs a different number from an urban clinic.
    ttlMinutes: parsed.data.ttlMinutes ?? serverEnv().REFERRAL_TOKEN_TTL_HOURS * 60,
  })

  return { tokenId: created.tokenId, token: token.raw, expiresAt: created.expiresAt }
}

/**
 * Stop a link working.
 *
 * For a slip handed to the wrong relative, or a link that has been forwarded
 * further than intended. It does not touch the document: the referral itself
 * stays exactly as issued, because the record of what a receiving unit was told
 * must survive the withdrawal of their access to it.
 */
export async function revokeLink(actor: ActorContext, input: unknown): Promise<boolean> {
  requirePermission(actor, 'referral.revoke_token')

  const parsed = RevokeReferralLinkSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This link could not be revoked.', parsed.error.issues)
  }

  return repo.revokeReferralToken(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    tokenId: parsed.data.tokenId,
    reason: parsed.data.reason ?? null,
  })
}

/**
 * The links issued for a referral.
 *
 * Reads through the service role, not `userClient()`: `referral_access_tokens`
 * has RLS enabled with no policy and is revoked from `authenticated` (0012),
 * because the table holds lookup keys and no browser session may read it. The
 * permission check above is therefore the only gate, which is why it is the
 * first line of the function.
 */
export async function listLinks(
  actor: ActorContext,
  referralId: string,
): Promise<ReferralLink[]> {
  requirePermission(actor, 'referral.issue_token')

  return repo.listLinksForReferral(serviceClient(), actor.clinicId, referralId)
}

/* -------------------------------------------------------------------------- */
/* The public page                                                            */
/* -------------------------------------------------------------------------- */

/** What the public page can tell us about the request, and nothing more. */
export interface PublicAccessContext {
  /** Raw client address, hashed here and never stored or logged as given. */
  readonly clientIp: string | null
  readonly userAgent: string | null
}

/**
 * Open an issued referral with a link token.
 *
 * NO ActorContext, by design — see the file header. Runs through the service
 * role because no session exists, which makes the checks inside the routine the
 * entire access control for this path:
 *
 *   * the token is looked up by hash, so the database never holds a working key;
 *   * expiry, revocation and the referral's own status are all evaluated there;
 *   * the access is written to `referral_access_log` in the same transaction
 *     that returns the document, so an open cannot go unrecorded;
 *   * expired, revoked and unknown come back identically. This function cannot
 *     tell them apart even if a caller wanted to, because saying "that link has
 *     expired" confirms to a guesser that the link was real.
 *
 * What comes back is the frozen snapshot and nothing else. There is no path
 * from here to a patient record, a pregnancy, or any other referral.
 */
export async function openReferralByToken(
  rawToken: string,
  context: PublicAccessContext,
): Promise<ReferralAccess> {
  // A product barcode, a URL fragment, another hospital's sticker. Rejected
  // before it reaches the database, and with the same answer as a valid token
  // that has expired.
  if (!looksLikeToken(rawToken)) return { outcome: 'DENIED' }

  const tokenHashHex = hashToken(rawToken)

  return repo.logReferralAccess(serviceClient(), {
    tokenHashHex,
    // Salted with the token's own hash, deliberately. A bare SHA-256 of an IPv4
    // address is reversible by brute force in seconds — the address space is
    // tiny — so an unsalted hash would be a network identifier stored next to
    // health data in all but name. Salting per token still answers the question
    // the column exists for ("is this the same reader coming back"), while
    // making the value useless for correlating across referrals or recovering
    // the address.
    clientIpHashHex:
      context.clientIp === null ? null : hashToken(`${tokenHashHex}:${context.clientIp}`),
    userAgent: context.userAgent,
  })
}

/* -------------------------------------------------------------------------- */

async function readBack(
  actor: ActorContext,
  referralId: string,
  failure: string,
): Promise<Referral> {
  const referral = await repo.findReferralById(await userClient(), actor.clinicId, referralId)
  if (!referral) throw new AppError('INTERNAL', failure)
  return referral
}
