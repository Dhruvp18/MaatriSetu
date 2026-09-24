import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import type { Database } from '@core/db/database.types'

import { conflict, internal, retryable } from '@core/errors/app-error'

import {
  hasLiveQrToken,
  type PatientAllergyRow,
  type PatientContactRow,
  type PatientIdentityRow,
  type PatientRow,
  toIdentity,
  toPatient,
} from './patient.mapper'
import type { Patient, PatientIdentity } from './patient.types'

/**
 * The only place that talks to the database about patients.
 *
 * Takes a client rather than creating one: the service decides whether a call
 * runs as the signed-in user (RLS enforced, the default for reads) or as the
 * service role (required for the multi-table write routines in migration
 * 0013). Making that choice visible at the call site is the point.
 *
 * Row shapes and row-to-domain mapping live in `patient.mapper.ts`, which has
 * no I/O and is unit-tested. This file is queries and error translation.
 *
 * It makes no authorization decisions — every exported function assumes the
 * caller has already checked membership and permission (ARCH-5).
 */

/**
 * The columns a search result needs.
 *
 * Listed explicitly rather than selecting `*`: a search runs for an assistant
 * too, and the narrower the row that leaves the database, the less there is for
 * a later refactor to accidentally hand to the wrong role.
 */
const IDENTITY_COLUMNS =
  'id, clinic_id, uhid, full_name, date_of_birth, estimated_age_years, age_recorded_on, qr_token_hash, qr_token_revoked_at, version'

/* -------------------------------------------------------------------------- */
/* Error translation                                                          */
/* -------------------------------------------------------------------------- */

/** Postgres SQLSTATEs this module reacts to by name rather than by number. */
const PG_UNIQUE_VIOLATION = '23505'
const PG_CHECK_VIOLATION = '23514'
const PG_NO_DATA_FOUND = 'P0002'

/**
 * Turn a Postgrest failure into an AppError.
 *
 * A network blip during a two-minute consultation must surface as "try again",
 * not as a generic 500 that invites the clinician to retype everything — hence
 * the retryable branch.
 */
function translate(error: PostgrestError, operation: string): never {
  if (error.code === PG_UNIQUE_VIOLATION) {
    throw conflict('That record already exists.', { operation, constraint: error.details })
  }

  if (error.code === PG_CHECK_VIOLATION) {
    // A check violation means the application let through something the schema
    // forbids — a validation gap, not a user error. Surfaced as internal so it
    // is investigated rather than shown to a nurse as her mistake.
    throw internal(`Rejected by a database constraint during ${operation}.`, error)
  }

  if (error.code === PG_NO_DATA_FOUND) {
    throw conflict('That record no longer exists.', { operation })
  }

  // Postgrest reports transport failures with an empty code.
  if (!error.code) {
    throw retryable('The database did not respond. Try again.', error)
  }

  throw internal(`Database error during ${operation}.`, error)
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One patient with her allergies and contacts, or null.
 *
 * Three round trips rather than one embedded select. PostgREST's resource
 * embedding across the composite (clinic_id, patient_id) foreign keys this
 * schema uses is not something we can verify without a live database, and a
 * silently empty embedded array would render as "no allergies".
 */
export async function findPatientById(
  db: TypedClient,
  clinicId: string,
  patientId: string,
): Promise<Patient | null> {
  const patient = await db
    .from('patients')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('id', patientId)
    .maybeSingle<PatientRow>()

  if (patient.error) translate(patient.error, 'findPatientById')
  if (!patient.data) return null

  const [allergies, contacts] = await Promise.all([
    db
      .from('patient_allergies')
      .select('id, patient_id, substance, reaction, severity, source, recorded_at, retracted_at')
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      // A retracted allergy stays in the table because it is clinically
      // relevant that it was once believed; it is not shown as current.
      .is('retracted_at', null)
      .order('recorded_at', { ascending: true })
      .returns<PatientAllergyRow[]>(),
    db
      .from('patient_contacts')
      .select(
        'id, patient_id, phone_e164, relationship, contact_name, is_primary, messaging_consent_at, messaging_consent_withdrawn_at, verified_at',
      )
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .order('is_primary', { ascending: false })
      .returns<PatientContactRow[]>(),
  ])

  if (allergies.error) translate(allergies.error, 'findPatientById.allergies')
  if (contacts.error) translate(contacts.error, 'findPatientById.contacts')

  return toPatient(patient.data, allergies.data ?? [], contacts.data ?? [])
}

/** Whether a UHID is already taken in this clinic, and by whom. */
export async function findPatientIdByUhid(
  db: TypedClient,
  clinicId: string,
  uhid: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('patients')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('uhid', uhid)
    .maybeSingle<{ id: string }>()

  if (error) translate(error, 'findPatientIdByUhid')
  return data?.id ?? null
}

/**
 * Patient ids reachable on a phone number.
 *
 * Returns a list, never a single match, because a shared handset legitimately
 * reaches several mothers. Collapsing that to one would be the phone-based
 * merge the schema goes out of its way to prevent.
 */
async function findPatientIdsByPhone(
  db: TypedClient,
  clinicId: string,
  phoneE164: string,
  limit: number,
): Promise<string[]> {
  const { data, error } = await db
    .from('patient_contacts')
    .select('patient_id')
    .eq('clinic_id', clinicId)
    .eq('phone_e164', phoneE164)
    .limit(limit)
    .returns<{ patient_id: string }[]>()

  if (error) translate(error, 'findPatientIdsByPhone')
  return [...new Set((data ?? []).map((row) => row.patient_id))]
}

/**
 * Characters that would be read as PostgREST filter syntax inside an `or()`.
 *
 * A name containing a comma or a parenthesis would otherwise change the shape
 * of the filter rather than the value being matched.
 */
function escapeForOrFilter(term: string): string {
  return term.replace(/[,()"\\*]/g, ' ').trim()
}

export interface PatientSearchMatch {
  readonly identity: PatientIdentity
  readonly hasActiveQrToken: boolean
}

/**
 * Identity search over UHID, name and phone.
 *
 * This is the fallback path when a sticker is damaged or the file is new, so it
 * has to be forgiving about how the term is typed. Phone matching is done
 * separately because it runs against a different table.
 */
export async function searchPatients(
  db: TypedClient,
  clinicId: string,
  params: { term: string; phoneE164: string | null; limit: number },
): Promise<PatientSearchMatch[]> {
  const byIdOrName = escapeForOrFilter(params.term)

  const phoneMatchIds = params.phoneE164
    ? await findPatientIdsByPhone(db, clinicId, params.phoneE164, params.limit)
    : []

  const filters: string[] = []
  if (byIdOrName.length > 0) {
    filters.push(`uhid.ilike.*${byIdOrName}*`, `full_name.ilike.*${byIdOrName}*`)
  }
  for (const id of phoneMatchIds) {
    filters.push(`id.eq.${id}`)
  }

  if (filters.length === 0) return []

  const { data, error } = await db
    .from('patients')
    .select(IDENTITY_COLUMNS)
    .eq('clinic_id', clinicId)
    .or(filters.join(','))
    .order('full_name', { ascending: true })
    .limit(params.limit)
    .returns<PatientIdentityRow[]>()

  if (error) translate(error, 'searchPatients')

  return (data ?? []).map((row) => ({
    identity: toIdentity(row),
    hasActiveQrToken: hasLiveQrToken(row),
  }))
}

/* -------------------------------------------------------------------------- */
/* Writes — the transactional routines from migration 0013                    */
/* -------------------------------------------------------------------------- */

/**
 * Argument nullability, restored.
 *
 * A Postgres function's parameters carry no nullability in the catalog, so
 * `pnpm db:types` types every argument as non-null. Several of these genuinely
 * accept NULL and must: a mother with a recorded date of birth has no estimated
 * age, one without an ABHA number has no ABHA number, and a sticker may be
 * revoked without a stated reason.
 *
 * So the nullable arguments are widened by name and the call is cast once at
 * the boundary. Every other argument stays checked against the real signature —
 * which is the point of generating these types at all. A blanket cast here
 * would silently accept a renamed or removed parameter.
 */
type Fn = Database['public']['Functions']
type Enums = Database['public']['Enums']
type Nullable<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: T[P] | null }

type RegisterPatientArgs = Nullable<
  Fn['register_patient']['Args'],
  | 'p_date_of_birth'
  | 'p_estimated_age_years'
  | 'p_age_recorded_on'
  | 'p_abha_id'
  | 'p_blood_group'
  | 'p_blood_group_source'
  | 'p_blood_group_recorded_on'
>

type RevokePatientQrArgs = Nullable<Fn['revoke_patient_qr']['Args'], 'p_reason'>

/**
 * Values passed to `register_patient`.
 *
 * Deliberately the database's vocabulary, not the browser's: the service maps
 * validated input into this shape, which keeps the SQL signature and the HTTP
 * payload free to diverge.
 */
export interface RegisterPatientRow {
  readonly clinicId: string
  readonly actorStaffUserId: string
  readonly requestId: string
  readonly uhid: string
  readonly fullName: string
  readonly dateOfBirth: string | null
  readonly estimatedAgeYears: number | null
  readonly ageRecordedOn: string | null
  readonly abhaId: string | null
  readonly abhaVerification: Enums['abha_verification']
  readonly allergyStatus: Enums['known_status']
  readonly bloodGroup: Enums['blood_group'] | null
  readonly bloodGroupSource: Enums['data_source'] | null
  readonly bloodGroupRecordedOn: string | null
  readonly allergies: readonly {
    substance: string
    reaction: string | null
    severity: Enums['allergy_severity']
    source: Enums['data_source']
  }[]
  readonly contacts: readonly {
    phone: string
    relationship: Enums['contact_relationship']
    contactName: string | null
    isPrimary: boolean
    hasMessagingConsent: boolean
  }[]
}

/** Creates the patient, her allergies, her contacts and the audit row, atomically. */
export async function insertPatient(
  db: TypedClient,
  input: RegisterPatientRow,
): Promise<string> {
  const args: RegisterPatientArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_uhid: input.uhid,
    p_full_name: input.fullName,
    p_date_of_birth: input.dateOfBirth,
    p_estimated_age_years: input.estimatedAgeYears,
    p_age_recorded_on: input.ageRecordedOn,
    p_abha_id: input.abhaId,
    p_abha_verification: input.abhaVerification,
    p_allergy_status: input.allergyStatus,
    p_blood_group: input.bloodGroup,
    p_blood_group_source: input.bloodGroupSource,
    p_blood_group_recorded_on: input.bloodGroupRecordedOn,
    // Copied into mutable arrays: the generated `Json` type is mutable, and
    // the domain input is readonly by design.
    p_allergies: [...input.allergies],
    p_contacts: [...input.contacts],
  }

  const { data, error } = await db.rpc(
    'register_patient',
    args as Fn['register_patient']['Args'],
  )

  if (error) translate(error, 'insertPatient')
  if (typeof data !== 'string') {
    throw internal('register_patient did not return a patient id.')
  }

  return data
}

/** Stores a new sticker token hash. Returns when it was issued. */
export async function setQrTokenHash(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    patientId: string
    tokenHashHex: string
  },
): Promise<string> {
  const { data, error } = await db.rpc('issue_patient_qr', {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_patient_id: params.patientId,
    p_token_hash: params.tokenHashHex,
  })

  if (error) translate(error, 'setQrTokenHash')
  if (typeof data !== 'string') {
    throw internal('issue_patient_qr did not return an issue timestamp.')
  }

  return data
}

/** Retires the live sticker. False when there was nothing to retire. */
export async function revokeQrToken(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string
    requestId: string
    patientId: string
    reason: string | null
  },
): Promise<boolean> {
  const args: RevokePatientQrArgs = {
    p_clinic_id: params.clinicId,
    p_actor_staff_user_id: params.actorStaffUserId,
    p_request_id: params.requestId,
    p_patient_id: params.patientId,
    p_reason: params.reason,
  }

  const { data, error } = await db.rpc(
    'revoke_patient_qr',
    args as Fn['revoke_patient_qr']['Args'],
  )

  if (error) translate(error, 'revokeQrToken')
  return data === true
}

/**
 * The patient a scanned sticker belongs to, or null.
 *
 * Null covers "no such token", "revoked" and "belongs to another clinic"
 * alike — a scanned value must not be usable to learn which of those it was.
 *
 * A null actor is the patient scanning her own sticker; the routine audits it
 * as `patient-portal` (migration 0027).
 */
export async function findPatientIdByQrHash(
  db: TypedClient,
  params: {
    clinicId: string
    actorStaffUserId: string | null
    requestId: string
    tokenHashHex: string
  },
): Promise<string | null> {
  const { data, error } = await db.rpc('find_patient_by_qr', {
    p_clinic_id: params.clinicId,
    // The generated Args type cannot express a nullable parameter.
    p_actor_staff_user_id: params.actorStaffUserId as string,
    p_request_id: params.requestId,
    p_token_hash: params.tokenHashHex,
  })

  if (error) translate(error, 'findPatientIdByQrHash')
  return typeof data === 'string' ? data : null
}
