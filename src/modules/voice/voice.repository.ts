import 'server-only'

import type { PostgrestError } from '@supabase/supabase-js'

import type { TypedClient } from '@core/db/clients'
import type { Database } from '@core/db/database.types'
import { internal, notFound, retryable } from '@core/errors/app-error'

import { type VoiceQueryRow, toVoiceQuery } from './voice.mapper'
import type { RoutingBucket, VoiceChannel, VoiceQuery } from './voice.types'

/**
 * The only place that talks to the database about voice queries.
 *
 * Reads run as the signed-in user; every write goes through a routine from
 * migration 0019, which persists and audits in one transaction.
 */

type Fn = Database['public']['Functions']
type Nullable<T, K extends keyof T> = Omit<T, K> & { readonly [P in K]: T[P] | null }

const PG_NO_DATA_FOUND = 'P0002'

function translate(error: PostgrestError, operation: string): never {
  if (error.code === PG_NO_DATA_FOUND) {
    throw notFound('That message is not recorded at this clinic.')
  }
  if (error.code === undefined || error.code.startsWith('08')) {
    throw retryable(`Could not reach the database (${operation}).`, error)
  }
  throw internal(`Database error during ${operation}.`, error)
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Messages for one patient, newest first. Backs the cockpit drawer. */
export async function listForPatient(
  db: TypedClient,
  clinicId: string,
  patientId: string,
  includeResolved: boolean,
): Promise<VoiceQuery[]> {
  let query = db
    .from('voice_queries')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('received_at', { ascending: false })

  if (!includeResolved) query = query.is('resolved_at', null)

  const { data, error } = await query
  if (error) translate(error, 'listForPatient')

  return ((data as VoiceQueryRow[] | null) ?? []).map(toVoiceQuery)
}

/**
 * Messages nobody has matched to a patient yet.
 *
 * The staffed queue. A number that is shared, or not recognised at all, waits
 * here rather than being attached to whichever mother seemed likeliest.
 */
export async function listUnassociated(
  db: TypedClient,
  clinicId: string,
  limit: number,
): Promise<VoiceQuery[]> {
  const { data, error } = await db
    .from('voice_queries')
    .select('*')
    .eq('clinic_id', clinicId)
    .neq('association_status', 'VERIFIED')
    .order('received_at', { ascending: false })
    .limit(limit)

  if (error) translate(error, 'listUnassociated')

  return ((data as VoiceQueryRow[] | null) ?? []).map(toVoiceQuery)
}

/** Queued work for the transcription worker, oldest first. */
export async function listPending(db: TypedClient, limit: number): Promise<VoiceQuery[]> {
  const { data, error } = await db
    .from('voice_queries')
    .select('*')
    .in('processing_state', ['RECEIVED', 'QUEUED'])
    .order('received_at', { ascending: true })
    .limit(limit)

  if (error) translate(error, 'listPending')

  return ((data as VoiceQueryRow[] | null) ?? []).map(toVoiceQuery)
}

export async function findById(
  db: TypedClient,
  clinicId: string,
  id: string,
): Promise<VoiceQuery | null> {
  const { data, error } = await db
    .from('voice_queries')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('id', id)
    .maybeSingle()

  if (error) translate(error, 'findById')
  return data ? toVoiceQuery(data as VoiceQueryRow) : null
}

/** The clinic a message belongs to, for a worker that holds no session. */
export async function findClinicId(db: TypedClient, id: string): Promise<string | null> {
  const { data, error } = await db
    .from('voice_queries')
    .select('clinic_id')
    .eq('id', id)
    .maybeSingle()

  if (error) translate(error, 'findClinicId')
  return data?.clinic_id ?? null
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export interface RecordVoiceNoteInput {
  readonly clinicId: string
  readonly actorStaffUserId: string
  readonly requestId: string
  readonly patientId: string | null
  readonly contactId: string | null
  readonly channel: VoiceChannel
  readonly providerMessageId: string | null
  readonly fromPhoneE164: string | null
  readonly audioObjectKey: string
  readonly audioMimeType: string
  readonly audioDurationSeconds: number | null
}

type RecordArgs = Nullable<
  Fn['record_voice_note']['Args'],
  | 'p_patient_id'
  | 'p_contact_id'
  | 'p_provider_message_id'
  | 'p_from_phone_e164'
  | 'p_audio_duration_seconds'
>

export async function recordVoiceNote(
  db: TypedClient,
  input: RecordVoiceNoteInput,
): Promise<string> {
  const args: RecordArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_patient_id: input.patientId,
    p_contact_id: input.contactId,
    p_channel: input.channel,
    p_provider_message_id: input.providerMessageId,
    p_from_phone_e164: input.fromPhoneE164,
    p_audio_object_key: input.audioObjectKey,
    p_audio_mime_type: input.audioMimeType,
    p_audio_duration_seconds: input.audioDurationSeconds,
  }

  const { data, error } = await db.rpc(
    'record_voice_note',
    args as Fn['record_voice_note']['Args'],
  )

  if (error) translate(error, 'recordVoiceNote')
  if (!data) throw internal('The voice note was recorded but returned no id.')
  return data
}

export interface ApplyTranscriptionInput {
  readonly clinicId: string
  readonly worker: string
  readonly requestId: string
  readonly voiceQueryId: string
  readonly transcript: string
  readonly translationEn: string | null
  readonly detectedLanguage: string | null
  readonly confidence: number | null
  readonly provider: string
  readonly model: string
  readonly routingBucket: RoutingBucket
  readonly matchedPhrases: string[]
  readonly lexiconVersion: string
}

type ApplyArgs = Nullable<
  Fn['apply_voice_transcription']['Args'],
  'p_translation_en' | 'p_detected_language' | 'p_confidence'
>

export async function applyTranscription(
  db: TypedClient,
  input: ApplyTranscriptionInput,
): Promise<void> {
  const args: ApplyArgs = {
    p_clinic_id: input.clinicId,
    p_worker: input.worker,
    p_request_id: input.requestId,
    p_voice_query_id: input.voiceQueryId,
    p_transcript: input.transcript,
    p_translation_en: input.translationEn,
    p_detected_language: input.detectedLanguage,
    p_confidence: input.confidence,
    p_provider: input.provider,
    p_model: input.model,
    p_routing_bucket: input.routingBucket,
    p_matched_phrases: input.matchedPhrases,
    p_lexicon_version: input.lexiconVersion,
  }

  const { error } = await db.rpc(
    'apply_voice_transcription',
    args as Fn['apply_voice_transcription']['Args'],
  )

  if (error) translate(error, 'applyTranscription')
}

export async function failTranscription(
  db: TypedClient,
  input: {
    readonly clinicId: string
    readonly worker: string
    readonly requestId: string
    readonly voiceQueryId: string
    readonly reason: string
  },
): Promise<void> {
  const { error } = await db.rpc('fail_voice_transcription', {
    p_clinic_id: input.clinicId,
    p_worker: input.worker,
    p_request_id: input.requestId,
    p_voice_query_id: input.voiceQueryId,
    p_error: input.reason,
  })

  if (error) translate(error, 'failTranscription')
}

type AssociateArgs = Nullable<Fn['associate_voice_query']['Args'], 'p_contact_id'>

export async function associate(
  db: TypedClient,
  input: {
    readonly clinicId: string
    readonly actorStaffUserId: string
    readonly requestId: string
    readonly voiceQueryId: string
    readonly patientId: string
    readonly contactId: string | null
  },
): Promise<void> {
  const args: AssociateArgs = {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_voice_query_id: input.voiceQueryId,
    p_patient_id: input.patientId,
    p_contact_id: input.contactId,
  }

  const { error } = await db.rpc(
    'associate_voice_query',
    args as Fn['associate_voice_query']['Args'],
  )

  if (error) translate(error, 'associate')
}

export async function acknowledge(
  db: TypedClient,
  input: {
    readonly clinicId: string
    readonly actorStaffUserId: string
    readonly requestId: string
    readonly voiceQueryId: string
  },
): Promise<void> {
  const { error } = await db.rpc('acknowledge_voice_query', {
    p_clinic_id: input.clinicId,
    p_actor_staff_user_id: input.actorStaffUserId,
    p_request_id: input.requestId,
    p_voice_query_id: input.voiceQueryId,
  })

  if (error) translate(error, 'acknowledge')
}
