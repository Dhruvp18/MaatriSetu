import 'server-only'

import { randomUUID } from 'node:crypto'

import { type ActorContext, requirePermission } from '@core/auth/actor'
import { serviceClient, userClient } from '@core/db/clients'
import { validation } from '@core/errors/app-error'
import { speechIsFixture, speechProvider } from '@core/speech'
import { getObject, putObject } from '@core/storage/clinical-media'

import { route } from './triage-lexicon'
import * as repo from './voice.repository'
import { AssociateVoiceQuerySchema, UploadVoiceNoteSchema } from './voice.schema'
import type { VoiceQuery } from './voice.types'

/**
 * The voice module's public API.
 *
 * The rule that shapes everything here: association is a human act. There is no
 * code path in this module that moves a message to VERIFIED on the strength of
 * a phone number. Handsets are shared in this population, and attaching a
 * clinical message to the wrong mother is the incident the design exists to
 * prevent.
 *
 * Automated clinical replies do not exist here either, deliberately. Enabling
 * them needs approved wording, a staffed escalation owner and delivery-failure
 * handling — see MESSAGING_PROVIDER in .env.example.
 */

/** Where a note's audio lives. Private; never a public URL. */
function audioObjectKey(clinicId: string, id: string, mimeType: string): string {
  const extension = mimeType.split('/')[1]?.replace('x-', '') ?? 'bin'
  return `voice/${clinicId}/${id}.${extension}`
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Messages for one patient.
 *
 * Held by nurses as well as doctors: the drawer is read at the counter as well
 * as in the consultation.
 */
export async function listForPatient(
  actor: ActorContext,
  patientId: string,
  includeResolved = false,
): Promise<VoiceQuery[]> {
  requirePermission(actor, 'query.read')

  return repo.listForPatient(await userClient(), actor.clinicId, patientId, includeResolved)
}

/** The staffed queue of messages nobody has matched to a patient. */
export async function listUnassociated(
  actor: ActorContext,
  limit = 50,
): Promise<VoiceQuery[]> {
  requirePermission(actor, 'query.associate')

  return repo.listUnassociated(await userClient(), actor.clinicId, limit)
}

/* -------------------------------------------------------------------------- */
/* Intake                                                                     */
/* -------------------------------------------------------------------------- */

export interface RecordedVoiceNote {
  readonly voiceQueryId: string
  readonly audioObjectKey: string
}

/**
 * Accept a voice note uploaded by staff and queue it for transcription.
 *
 * The row is written first so the note exists even if storage misbehaves, then
 * the audio is uploaded. If that upload fails the note is failed immediately
 * with a reason a human can read — the alternative is a row queued forever
 * against audio that is never coming, which looks like a message nobody
 * answered.
 *
 * `patientId` is optional. A note can arrive before anyone has established
 * whose it is, and requiring one here would invite the counter to guess.
 */
export async function recordVoiceNote(
  actor: ActorContext,
  audio: Uint8Array,
  input: unknown,
): Promise<RecordedVoiceNote> {
  requirePermission(actor, 'query.read')

  const parsed = UploadVoiceNoteSchema.safeParse(input)
  if (!parsed.success) {
    throw validation('This voice note could not be accepted.', parsed.error.issues)
  }

  const data = parsed.data

  // Checked against the bytes actually received, not against what the client
  // claimed in the form.
  if (audio.byteLength !== data.byteSize) {
    throw validation('The uploaded audio did not match its stated size.')
  }

  const id = randomUUID()
  const key = audioObjectKey(actor.clinicId, id, data.mimeType)

  const voiceQueryId = await repo.recordVoiceNote(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    // Only ever what the caller established. Never inferred from the number.
    patientId: data.patientId ?? null,
    contactId: null,
    channel: 'IN_APP_UPLOAD',
    // In-app uploads have no provider id; the column stays null and the
    // webhook-dedup index does not apply to them.
    providerMessageId: null,
    fromPhoneE164: data.fromPhone ?? null,
    audioObjectKey: key,
    audioMimeType: data.mimeType,
    audioDurationSeconds: data.durationSeconds ?? null,
  })

  try {
    await putObject(key, audio, data.mimeType)
  } catch (error) {
    // Fail the note rather than leave it queued against audio that will never
    // arrive. A visibly failed message gets looked at; a permanently pending
    // one reads as a message nobody bothered to answer.
    await repo.failTranscription(serviceClient(), {
      clinicId: actor.clinicId,
      worker: 'intake',
      requestId: actor.requestId,
      voiceQueryId,
      reason: 'The audio could not be stored. Ask her to send it again.',
    })
    throw error
  }

  return { voiceQueryId, audioObjectKey: key }
}

/* -------------------------------------------------------------------------- */
/* Human decisions                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Link a message to a patient.
 *
 * The only route to VERIFIED. The previous association is recorded in the audit
 * payload, because moving a message from one mother to another is exactly the
 * event a record needs to show in full.
 */
export async function associateWithPatient(
  actor: ActorContext,
  voiceQueryId: string,
  input: unknown,
): Promise<void> {
  requirePermission(actor, 'query.associate')

  const parsed = AssociateVoiceQuerySchema.safeParse(input)
  if (!parsed.success) {
    throw validation('That message could not be linked.', parsed.error.issues)
  }

  await repo.associate(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    voiceQueryId,
    patientId: parsed.data.patientId,
    contactId: parsed.data.contactId ?? null,
  })
}

/**
 * A clinician has seen it.
 *
 * Distinct from resolving it: resolution happens inside the consultation
 * commit, so addressing a query and recording the visit cannot come apart.
 */
export async function acknowledge(actor: ActorContext, voiceQueryId: string): Promise<void> {
  requirePermission(actor, 'query.acknowledge')

  await repo.acknowledge(serviceClient(), {
    clinicId: actor.clinicId,
    actorStaffUserId: actor.staffUserId,
    requestId: actor.requestId,
    voiceQueryId,
  })
}

/* -------------------------------------------------------------------------- */
/* Worker                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Transcribe one queued note, and route it.
 *
 * Called by the worker, which holds no session and therefore no `ActorContext`
 * with clinical permissions. It may transcribe and route — both mechanical acts
 * — and nothing else. It cannot verify an observation, resolve a query, or
 * decide whose message this is.
 *
 * Failure is recorded as failure. There is no path here that turns an
 * untranscribable note into a routed one, because a danger sign filed as
 * routine is the outcome this whole module is arranged to avoid.
 */
export async function transcribeQueuedNote(
  voiceQueryId: string,
): Promise<{ ok: boolean; detail: string }> {
  const db = serviceClient()
  const clinicId = await repo.findClinicId(db, voiceQueryId)
  if (!clinicId) return { ok: false, detail: 'Voice note not found.' }

  const note = await repo.findById(db, clinicId, voiceQueryId)
  if (!note?.audioObjectKey) {
    return { ok: false, detail: 'Voice note has no stored audio.' }
  }

  const requestId = `worker-${randomUUID()}`
  const provider = speechProvider()

  // Read here rather than being handed bytes: the worker is the only caller,
  // and passing megabytes of audio through a function signature invites a
  // caller that has already loaded it for some other reason.
  const audio = await getObject(note.audioObjectKey)

  const result = await provider.transcribe({
    audio,
    // The type the file was actually uploaded as. Guessing here would hand
    // Sarvam a mislabelled blob and turn a good recording into a 422.
    mimeType: note.audioMimeType ?? 'audio/ogg',
    fileName: note.audioObjectKey.split('/').pop() ?? 'note.ogg',
  })

  if (!result.ok) {
    await repo.failTranscription(db, {
      clinicId,
      worker: `speech:${provider.name}`,
      requestId,
      voiceQueryId,
      reason: result.message,
    })
    return { ok: false, detail: `${result.code}: ${result.message}` }
  }

  const { transcription } = result

  // Routed from both her own words and the English, so a failed translation
  // does not blind the routing.
  const decision = route(transcription.original, transcription.english)

  await repo.applyTranscription(db, {
    clinicId,
    worker: `speech:${provider.name}`,
    requestId,
    voiceQueryId,
    transcript: transcription.original,
    translationEn: transcription.english || null,
    detectedLanguage: transcription.detectedLanguage,
    confidence: transcription.confidence,
    provider: transcription.provider,
    model: transcription.model,
    routingBucket: decision.bucket,
    matchedPhrases: [...decision.matchedPhrases],
    lexiconVersion: decision.lexiconVersion,
  })

  return {
    ok: true,
    detail: `${decision.bucket}${speechIsFixture() ? ' (fixture)' : ''}`,
  }
}
