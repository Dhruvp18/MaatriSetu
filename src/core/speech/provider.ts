/**
 * Speech-to-text, behind an interface.
 *
 * Transcription is a *transcription* tool here, not a clinical one. It produces
 * text and a confidence, and nothing downstream may treat that text as a
 * finding. A note whose transcription failed stays FAILED and reaches a human;
 * it is never defaulted to "routine", because the failure mode of defaulting is
 * a missed red flag (PRD §3, and migration 0009's header).
 *
 * Two implementations, selected by `SPEECH_PROVIDER`:
 *
 *   fixture  canned output, visibly labelled in the UI. The default, so the
 *            labelled path is the normal one and nobody discovers at judging
 *            time that a key was missing.
 *   sarvam   Sarvam AI Saaras, the hackathon partner's model.
 *
 * No domain knowledge (ARCH-3): this module knows about audio and text, not
 * about mothers, pregnancies or red flags.
 */

/** BCP-47 as Sarvam reports it, e.g. `mr-IN`. */
export type LanguageCode = string

export interface TranscriptionRequest {
  readonly audio: Uint8Array
  readonly mimeType: string
  readonly fileName: string
  /**
   * A hint, never a constraint. Auto-detection is the normal path because the
   * mother chooses her language, not the clinic.
   */
  readonly languageHint?: LanguageCode
  /**
   * Who is speaking. A patient's voice note is transcribed and translated; a
   * clinician's dictation is transcribed as clinical notes. Defaults to
   * PATIENT_MESSAGE, the original use.
   */
  readonly purpose?: 'PATIENT_MESSAGE' | 'CLINICIAN_DICTATION'
}

/**
 * What a provider returns.
 *
 * `original` and `english` are separate fields rather than one "text", because
 * the clinician must see both: the translation is what they read quickly, and
 * the original is what they check when the translation reads oddly. Collapsing
 * them would remove the ability to notice a mistranslation at all.
 */
export interface Transcription {
  readonly original: string
  readonly english: string
  readonly detectedLanguage: LanguageCode | null
  /**
   * Provider-reported confidence, 0..1, or null when it reports none.
   *
   * Displayed to the reader as uncertainty. It never gates anything
   * automatically — a low-confidence note still reaches a human.
   */
  readonly confidence: number | null
  readonly provider: string
  readonly model: string
}

export type TranscriptionResult =
  | { readonly ok: true; readonly transcription: Transcription }
  | {
      readonly ok: false
      /** Stable code for the UI and the retry logic. */
      readonly code: 'AUTH' | 'RATE_LIMIT' | 'UNSUPPORTED_AUDIO' | 'PROVIDER_ERROR' | 'TIMEOUT'
      readonly message: string
      /** Whether the worker should try this audio again. */
      readonly retryable: boolean
    }

export interface SpeechProvider {
  readonly name: string
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>
}
