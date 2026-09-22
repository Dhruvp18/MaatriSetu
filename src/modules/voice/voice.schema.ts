import { z } from 'zod'

/**
 * Validation for everything entering the voice module from outside.
 *
 * The WhatsApp webhook is not here. It authenticates by signature rather than
 * by session and needs its own verification contract, and automated clinical
 * replies stay disabled until wording, escalation ownership and
 * delivery-failure handling are approved. In-app upload is the path that works
 * today.
 */

/** Audio formats Sarvam accepts, narrowed to what a phone actually produces. */
const ACCEPTED_AUDIO = [
  'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp4', 'audio/m4a',
  'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/amr',
] as const

/** Ten minutes of voice note is already far beyond a clinical question. */
const MAX_AUDIO_BYTES = 15 * 1024 * 1024

export const UploadVoiceNoteSchema = z
  .object({
    /**
     * Whose message this is, when staff already know.
     *
     * Optional on purpose: a note can arrive before anyone has matched it, and
     * forcing a patient here would invite the counter to guess.
     */
    patientId: z.uuid().nullish(),
    mimeType: z.enum(ACCEPTED_AUDIO),
    byteSize: z.number().int().positive().max(MAX_AUDIO_BYTES),
    durationSeconds: z.number().int().min(0).max(1800).nullish(),
    fromPhone: z.string().max(20).nullish(),
  })
  .strict()

export type UploadVoiceNoteInput = z.infer<typeof UploadVoiceNoteSchema>

/**
 * A clinician linking a message to a patient.
 *
 * Always explicit. The system never resolves an ambiguous number on its own —
 * handsets are shared, and picking the likelier mother is exactly the guess
 * that attaches clinical content to the wrong record.
 */
export const AssociateVoiceQuerySchema = z
  .object({
    patientId: z.uuid(),
    contactId: z.uuid().nullish(),
  })
  .strict()

export const AcknowledgeVoiceQuerySchema = z
  .object({
    note: z.string().max(2000).nullish(),
  })
  .strict()

export { ACCEPTED_AUDIO, MAX_AUDIO_BYTES }
