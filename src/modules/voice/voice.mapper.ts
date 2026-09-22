import type { Database } from '@core/db/database.types'

import type {
  AssociationCandidate,
  PatientAssociation,
  Processing,
  VoiceQuery,
} from './voice.types'

/**
 * Voice query rows, and how they become domain objects.
 *
 * `toProcessing` is the decision that earns this file: the row has a state
 * column, a transcript, an error and a provider, and only certain combinations
 * are coherent. Mapping them into a union here means no screen can render an
 * empty transcript for a message that actually failed.
 */

type Tables = Database['public']['Tables']

export type VoiceQueryRow = Tables['voice_queries']['Row']

export function toProcessing(row: VoiceQueryRow): Processing {
  switch (row.processing_state) {
    case 'READY':
      return {
        state: 'READY',
        original: row.transcript_original ?? '',
        // Empty English is a real state: her words came through, the
        // translation did not. The drawer shows the original and says so.
        english: row.translation_en ?? '',
        detectedLanguage: row.detected_language,
        confidence:
          row.transcription_confidence !== null ? Number(row.transcription_confidence) : null,
        provider: row.transcript_provider ?? 'unknown',
        // Surfaced so the UI can label canned output rather than letting it
        // pass as a real transcription.
        isFixture: row.transcript_provider === 'fixture',
      }

    case 'FAILED':
      return {
        state: 'FAILED',
        // The column CHECK guarantees a reason exists on a failed row.
        error: row.processing_error ?? 'Transcription failed.',
      }

    case 'RECEIVED':
      return { state: 'PENDING', stage: 'RECEIVED' }
    case 'QUEUED':
      return { state: 'PENDING', stage: 'QUEUED' }
    default:
      // TRANSCRIBING and TRANSLATING are both "in flight" to a reader.
      return { state: 'PENDING', stage: 'TRANSCRIBING' }
  }
}

export function toAssociation(row: VoiceQueryRow): PatientAssociation {
  if (row.association_status === 'VERIFIED' && row.patient_id !== null) {
    return { kind: 'VERIFIED', patientId: row.patient_id, contactId: row.contact_id }
  }

  if (row.association_status === 'AMBIGUOUS') {
    const raw = Array.isArray(row.association_candidates) ? row.association_candidates : []

    const candidates: AssociationCandidate[] = raw.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return []
      const candidate = entry as Record<string, unknown>
      if (typeof candidate.patientId !== 'string') return []

      return [{
        patientId: candidate.patientId,
        fullName: typeof candidate.fullName === 'string' ? candidate.fullName : 'Unknown',
        uhid: typeof candidate.uhid === 'string' ? candidate.uhid : '',
      }]
    })

    return { kind: 'AMBIGUOUS', candidates }
  }

  return { kind: 'UNMATCHED' }
}

export function toVoiceQuery(row: VoiceQueryRow): VoiceQuery {
  return {
    id: row.id,
    channel: row.channel,
    association: toAssociation(row),
    processing: toProcessing(row),
    audioObjectKey: row.audio_object_key,
    audioDurationSeconds: row.audio_duration_seconds,
    fromPhoneE164: row.from_phone_e164,
    routingBucket: row.routing_bucket,
    matchedPhrases: row.matched_phrases ?? [],
    lexiconVersion: row.lexicon_version,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    resolvedInVisitId: row.resolved_in_visit_id,
    receivedAt: row.received_at,
  }
}
