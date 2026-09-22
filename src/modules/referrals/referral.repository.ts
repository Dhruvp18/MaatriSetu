import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import type { Database } from '@core/db/database.types'
import { conflict, internal, notFound, retryable } from '@core/errors/app-error'

import {
  type ReferralAccessTokenRow,
  type ReferralRow,
  parseSnapshotJson,
  toReferral,
  toReferralLink,
} from './referral.mapper'
import type { Referral, ReferralAccess, ReferralLink } from './referral.types'

/**
 * The only place that talks to the database about referrals.
 *
 * Takes a client so the service states at each call site whether it is reading
 * as the signed-in user (RLS enforced) or acting through the service role.
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
    throw conflict('This referral was changed by someone else. Refresh and try again.', {
      operation,
      code: 'VERSION_CONFLICT',
    })
  }

  if (error.code === PG_RESTRICT_VIOLATION || error.code === PG_INVALID_PARAMETER) {
    // Covers "already issued", "only a draft can be edited", a missing
    // indication and a transfer observation with no time. Every one of these is
    // a sentence written for a clinician, so it is surfaced rather than
    // replaced with a generic message.
    throw conflict(error.message, { operation })
  }

  if (error.code === PG_UNIQUE_VIOLATION) {
    // The unique index on `token_hash`. Reaching it means 32 bytes of entropy
    // collided, which is not a thing that happens; treat it as retryable so a
    // fresh token is minted rather than reporting a failure to the clinician.
    throw retryable('Could not create the link. Try again.', error)
  }

  if (error.code === PG_NO_DATA_FOUND) {
    throw notFound('That referral is not recorded at this clinic.')
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

export async function findReferralById(
  db: TypedClient,
  clinicId: string,
  referralId: string,
): Promise<Referral | null> {
  const { data, error } = await db
    .from('referrals')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('id', referralId)
    .maybeSingle<ReferralRow>()

  if (error) translate(error, 'findReferralById')
  return data ? toReferral(data) : null
}

/**
 * Every referral for a pregnancy, most recent first.
 *
 * Superseded and cancelled referrals are included on purpose. A receiving unit
 * ringing back about "the slip from last night" may be holding the one that was
 * replaced, and the record has to be able to show it.
 */
export async function listReferralsForPregnancy(
  db: TypedClient,
  clinicId: string,
  pregnancyId: string,
): Promise<Referral[]> {
  const { data, error } = await db
    .from('referrals')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('pregnancy_id', pregnancyId)
    .order('created_at', { ascending: false })
    .returns<ReferralRow[]>()

  if (error) translate(error, 'listReferralsForPregnancy')
  return (data ?? []).map(toReferral)
}

/**
 * The links issued for a referral, newest first.
 *
 * `referral_access_tokens` is service-role only (0012) — the table holds lookup
 * keys, and no browser session may read it even under RLS. The mapper never
 * carries `token_hash` into the domain, so a hash cannot reach a page by
 * accident either.
 */
export async function listLinksForReferral(
  db: TypedClient,
  clinicId: string,
  referralId: string,
): Promise<ReferralLink[]> {
  const { data, error } = await db
    .from('referral_access_tokens')
    .select('id, clinic_id, referral_id, expires_at, revoked_at, revoked_by, issued_by, created_at')
    .eq('clinic_id', clinicId)
    .eq('referral_id', referralId)
    .order('created_at', { ascending: false })
    .returns<ReferralAccessTokenRow[]>()

  if (error) translate(error, 'listLinksForReferral')
  return (data ?? []).map(toReferralLink)
}

/* -------------------------------------------------------------------------- */
/* Writes — the routines from migration 0021                                  */
/* -------------------------------------------------------------------------- */

type Fn = Database['public']['Functions']
type Nullable<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: T[P] | null }

/**
 * Argument nullability, restored — see the same note in visit.repository.ts.
 *
 * Postgres catalogs carry no parameter nullability, so every generated RPC arg
 * type is non-null. Almost everything on a referral draft is genuinely optional
 * while the transfer is still being arranged.
 */
type CreateDraftArgs = Nullable<
  Fn['create_referral_draft']['Args'],
  'p_origin_visit_id' | 'p_supersedes_id' | 'p_indication' | 'p_receiving_facility'
>

export async function createReferralDraft(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    pregnancyId: string
    originVisitId: string | null
    supersedesId: string | null
    indication: string | null
    receivingFacility: string | null
  },
): Promise<string> {
  const args: CreateDraftArgs = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    // No patient id: the routine derives it from the pregnancy, so two
    // arguments in the wrong order cannot file a referral against the wrong
    // mother.
    p_pregnancy_id: params.pregnancyId,
    p_origin_visit_id: params.originVisitId,
    p_supersedes_id: params.supersedesId,
    p_indication: params.indication,
    p_receiving_facility: params.receivingFacility,
  }

  const { data, error } = await db.rpc(
    'create_referral_draft',
    args as Fn['create_referral_draft']['Args'],
  )

  if (error) translate(error, 'createReferralDraft')
  if (typeof data !== 'string') {
    throw internal('create_referral_draft did not return a referral id.')
  }

  return data
}

export interface UpdateDraftRow {
  readonly clinicId: string
  readonly actorStaffUserId: string
  readonly requestId: string
  readonly referralId: string
  readonly expectedVersion: number
  readonly referringFacility: string | null
  readonly referringDoctorName: string | null
  readonly referringContactPhone: string | null
  readonly receivingFacility: string | null
  readonly receivingContact: string | null
  readonly transportMode: string | null
  readonly departureAt: string | null
  readonly indication: string | null
  readonly clinicalSummary: string | null
  readonly transferBpSystolicMmHg: number | null
  readonly transferBpDiastolicMmHg: number | null
  readonly transferPulseBpm: number | null
  readonly transferRespiratoryRateBpm: number | null
  readonly transferSpo2Percent: number | null
  readonly transferTemperatureC: number | null
  readonly transferUrineAlbumin: Database['public']['Enums']['dipstick_grade'] | null
  readonly transferFetalHeartRateBpm: number | null
  readonly transferVitalsRecordedAt: string | null
  readonly pvDilatationCm: number | null
  readonly pvEffacementPercent: number | null
  readonly pvStation: string | null
  readonly pvMembranes: Database['public']['Enums']['membrane_status']
  readonly pvLiquor: string | null
  readonly pvExaminedAt: string | null
  readonly pvExaminedBy: string | null
  readonly linesAndCatheters: string | null
  readonly accompanyingStaff: string | null
}

type UpdateDraftArgs = Nullable<
  Fn['update_referral_draft']['Args'],
  | 'p_referring_facility'
  | 'p_referring_doctor_name'
  | 'p_referring_contact_phone'
  | 'p_receiving_facility'
  | 'p_receiving_contact'
  | 'p_transport_mode'
  | 'p_departure_at'
  | 'p_indication'
  | 'p_clinical_summary'
  | 'p_transfer_bp_systolic_mmhg'
  | 'p_transfer_bp_diastolic_mmhg'
  | 'p_transfer_pulse_bpm'
  | 'p_transfer_respiratory_rate_bpm'
  | 'p_transfer_spo2_percent'
  | 'p_transfer_temperature_c'
  | 'p_transfer_urine_albumin'
  | 'p_transfer_fetal_heart_rate_bpm'
  | 'p_transfer_vitals_recorded_at'
  | 'p_pv_dilatation_cm'
  | 'p_pv_effacement_percent'
  | 'p_pv_station'
  | 'p_pv_liquor'
  | 'p_pv_examined_at'
  | 'p_pv_examined_by'
  | 'p_lines_and_catheters'
  | 'p_accompanying_staff'
>

/** Version-checked whole-document replace. Returns the new version. */
export async function updateReferralDraft(
  db: TypedClient,
  input: UpdateDraftRow,
): Promise<number> {
  const args: UpdateDraftArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_referral_id: input.referralId,
    p_expected_version: input.expectedVersion,
    p_referring_facility: input.referringFacility,
    p_referring_doctor_name: input.referringDoctorName,
    p_referring_contact_phone: input.referringContactPhone,
    p_receiving_facility: input.receivingFacility,
    p_receiving_contact: input.receivingContact,
    p_transport_mode: input.transportMode,
    p_departure_at: input.departureAt,
    p_indication: input.indication,
    p_clinical_summary: input.clinicalSummary,
    p_transfer_bp_systolic_mmhg: input.transferBpSystolicMmHg,
    p_transfer_bp_diastolic_mmhg: input.transferBpDiastolicMmHg,
    p_transfer_pulse_bpm: input.transferPulseBpm,
    p_transfer_respiratory_rate_bpm: input.transferRespiratoryRateBpm,
    p_transfer_spo2_percent: input.transferSpo2Percent,
    p_transfer_temperature_c: input.transferTemperatureC,
    p_transfer_urine_albumin: input.transferUrineAlbumin,
    p_transfer_fetal_heart_rate_bpm: input.transferFetalHeartRateBpm,
    p_transfer_vitals_recorded_at: input.transferVitalsRecordedAt,
    p_pv_dilatation_cm: input.pvDilatationCm,
    p_pv_effacement_percent: input.pvEffacementPercent,
    p_pv_station: input.pvStation,
    p_pv_membranes: input.pvMembranes,
    p_pv_liquor: input.pvLiquor,
    p_pv_examined_at: input.pvExaminedAt,
    p_pv_examined_by: input.pvExaminedBy,
    p_lines_and_catheters: input.linesAndCatheters,
    p_accompanying_staff: input.accompanyingStaff,
  }

  const { data, error } = await db.rpc(
    'update_referral_draft',
    args as Fn['update_referral_draft']['Args'],
  )

  if (error) translate(error, 'updateReferralDraft')
  if (typeof data !== 'number') {
    throw internal('update_referral_draft did not return a version.')
  }

  return data
}

export interface IssueReferralResult {
  readonly referralId: string
  /**
   * True when the referral was already issued and the frozen document was
   * handed back unchanged. A double-tapped Issue is not an error.
   */
  readonly replayed: boolean
  readonly issuedAt: string
  readonly snapshotSchemaVersion: number
}

/** Freezes the document. The snapshot is built inside the routine's transaction. */
export async function issueReferral(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    referralId: string
    expectedVersion: number
    asOfDate: string
    snapshotSchemaVersion: number
  },
): Promise<IssueReferralResult> {
  const { data, error } = await db.rpc('issue_referral', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_referral_id: params.referralId,
    p_expected_version: params.expectedVersion,
    p_as_of_date: params.asOfDate,
    p_snapshot_schema_version: params.snapshotSchemaVersion,
  })

  if (error) translate(error, 'issueReferral')

  // Checked rather than cast: this crosses a process boundary, and a shape
  // change must fail here rather than surface as `undefined` on a slip.
  const result = data as {
    referral_id?: unknown
    replayed?: unknown
    issued_at?: unknown
    snapshot_schema_version?: unknown
  } | null

  if (
    !result ||
    typeof result.referral_id !== 'string' ||
    typeof result.replayed !== 'boolean' ||
    typeof result.issued_at !== 'string' ||
    typeof result.snapshot_schema_version !== 'number'
  ) {
    throw internal('issue_referral returned an unexpected shape.')
  }

  return {
    referralId: result.referral_id,
    replayed: result.replayed,
    issuedAt: result.issued_at,
    snapshotSchemaVersion: result.snapshot_schema_version,
  }
}

export interface CreatedLink {
  readonly tokenId: string
  readonly expiresAt: string
}

/** Stores the hash of a token minted by the caller. The raw value never arrives. */
export async function createReferralToken(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    referralId: string
    tokenHashHex: string
    ttlMinutes: number
  },
): Promise<CreatedLink> {
  const { data, error } = await db.rpc('create_referral_token', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_referral_id: params.referralId,
    p_token_hash: params.tokenHashHex,
    p_ttl_minutes: params.ttlMinutes,
  })

  if (error) translate(error, 'createReferralToken')

  const result = data as { token_id?: unknown; expires_at?: unknown } | null
  if (
    !result ||
    typeof result.token_id !== 'string' ||
    typeof result.expires_at !== 'string'
  ) {
    throw internal('create_referral_token returned an unexpected shape.')
  }

  return { tokenId: result.token_id, expiresAt: result.expires_at }
}

/** Revoking an already-revoked link returns false rather than raising. */
export async function revokeReferralToken(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    tokenId: string
    reason: string | null
  },
): Promise<boolean> {
  type RevokeArgs = Nullable<Fn['revoke_referral_token']['Args'], 'p_reason'>

  const args: RevokeArgs = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_token_id: params.tokenId,
    p_reason: params.reason,
  }

  const { data, error } = await db.rpc(
    'revoke_referral_token',
    args as Fn['revoke_referral_token']['Args'],
  )

  if (error) translate(error, 'revokeReferralToken')
  return data === true
}

/**
 * The public page's only read path.
 *
 * Resolving the token, recording the access and returning the document happen
 * in one transaction inside the routine, so a referral cannot be served without
 * the access having been logged. "Who opened this woman's handover document"
 * has to be answerable after the fact, and the only way to guarantee that is to
 * make the answer a precondition of the read.
 */
export async function logReferralAccess(
  db: TypedClient,
  params: {
    tokenHashHex: string
    clientIpHashHex: string | null
    userAgent: string | null
  },
): Promise<ReferralAccess> {
  type AccessArgs = Nullable<
    Fn['log_referral_access']['Args'],
    'p_client_ip_hash' | 'p_user_agent'
  >

  const args: AccessArgs = {
    p_token_hash: params.tokenHashHex,
    p_client_ip_hash: params.clientIpHashHex,
    p_user_agent: params.userAgent,
  }

  const { data, error } = await db.rpc(
    'log_referral_access',
    args as Fn['log_referral_access']['Args'],
  )

  if (error) translate(error, 'logReferralAccess')

  const result = data as {
    granted?: unknown
    referral_id?: unknown
    issued_snapshot?: unknown
  } | null

  if (!result || typeof result.granted !== 'boolean') {
    throw internal('log_referral_access returned an unexpected shape.')
  }

  // Expired, revoked and unknown all arrive here as the same `{granted: false}`.
  // The routine does not tell this process which it was, so no caller can leak
  // the difference to whoever is holding the link.
  if (!result.granted) return { outcome: 'DENIED' }

  if (typeof result.referral_id !== 'string') {
    throw internal('log_referral_access granted access without a referral id.')
  }

  return {
    outcome: 'GRANTED',
    referralId: result.referral_id,
    snapshot: parseSnapshotJson(result.issued_snapshot, result.referral_id),
  }
}
