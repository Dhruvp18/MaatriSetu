import type {
  SpeechProvider,
  Transcription,
  TranscriptionRequest,
  TranscriptionResult,
} from './provider'

/**
 * Sarvam AI Saaras.
 *
 * ---------------------------------------------------------------------------
 * Why two calls
 * ---------------------------------------------------------------------------
 * PRD F12 needs the original-language transcript AND a clinical English
 * translation, and the clinician must be able to compare them — a translation
 * that reads oddly is the signal to check what she actually said.
 *
 * `saaras:v3` produces one or the other depending on `mode`, so this issues two
 * requests against the same audio: `transcribe` for her own words, `translate`
 * for English. `saaras:v4` is newer but does not accept `mode`, so it cannot
 * produce both.
 *
 * If the translate call fails but the transcribe call succeeded, the transcript
 * is still returned with an empty English field rather than the whole note
 * being discarded. Her words reaching a clinician untranslated is far better
 * than her words not arriving at all.
 * ---------------------------------------------------------------------------
 */

const ENDPOINT = 'https://api.sarvam.ai/speech-to-text'
const MODEL = 'saaras:v3'

/** Beyond this the worker gives up and the note surfaces as FAILED. */
const TIMEOUT_MS = 60_000

interface SarvamResponse {
  request_id?: string | null
  transcript?: string
  language_code?: string | null
  language_probability?: number | null
}

export function createSarvamProvider(apiKey: string): SpeechProvider {
  return {
    name: 'sarvam',

    async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
      // Her own words first. If this fails there is nothing worth translating.
      const verbatim = await call(apiKey, request, 'transcribe')
      if (!verbatim.ok) return verbatim

      const translated = await call(apiKey, request, 'translate')

      const transcription: Transcription = {
        original: verbatim.body.transcript ?? '',
        // Empty rather than a fallback to the original: an untranslated string
        // sitting in the English field would be read as a translation.
        english: translated.ok ? (translated.body.transcript ?? '') : '',
        detectedLanguage: verbatim.body.language_code ?? null,
        confidence: normaliseConfidence(verbatim.body.language_probability),
        provider: 'sarvam',
        model: MODEL,
      }

      return { ok: true, transcription }
    },
  }
}

type CallResult =
  | { ok: true; body: SarvamResponse }
  | Extract<TranscriptionResult, { ok: false }>

async function call(
  apiKey: string,
  request: TranscriptionRequest,
  mode: 'transcribe' | 'translate',
): Promise<CallResult> {
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array(request.audio)], { type: request.mimeType }),
    request.fileName,
  )
  form.append('model', MODEL)
  form.append('mode', mode)
  // Auto-detection is the normal path: the mother picks her language, not the
  // clinic, and a wrong hint is worse than none.
  form.append('language_code', request.languageHint ?? 'unknown')

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return {
      ok: false,
      code: timedOut ? 'TIMEOUT' : 'PROVIDER_ERROR',
      message: timedOut ? 'Sarvam did not respond in time.' : 'Could not reach Sarvam.',
      retryable: true,
    }
  }

  if (!response.ok) return mapHttpError(response.status)

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      message: 'Sarvam returned a response that could not be read.',
      retryable: true,
    }
  }

  // Provider output is untrusted input (ARCH-6). Shape-checked rather than
  // cast, so a changed response does not surface as `undefined` inside a
  // clinician's queue.
  if (typeof body !== 'object' || body === null || typeof (body as SarvamResponse).transcript !== 'string') {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      message: 'Sarvam returned no transcript.',
      retryable: false,
    }
  }

  return { ok: true, body: body as SarvamResponse }
}

function mapHttpError(status: number): Extract<TranscriptionResult, { ok: false }> {
  // 403 is the documented code for a bad key. Retrying it would burn the queue
  // against a credential that will not start working on its own.
  if (status === 401 || status === 403) {
    return {
      ok: false,
      code: 'AUTH',
      message: 'Sarvam rejected the API key.',
      retryable: false,
    }
  }

  if (status === 429) {
    return {
      ok: false,
      code: 'RATE_LIMIT',
      message: 'Sarvam rate limit reached.',
      retryable: true,
    }
  }

  // 422 means the audio itself was unacceptable; sending it again will not help.
  if (status === 400 || status === 422) {
    return {
      ok: false,
      code: 'UNSUPPORTED_AUDIO',
      message: 'Sarvam could not process this audio file.',
      retryable: false,
    }
  }

  return {
    ok: false,
    code: 'PROVIDER_ERROR',
    message: `Sarvam returned ${status}.`,
    retryable: status >= 500,
  }
}

/**
 * Clamp a reported probability into 0..1, or null.
 *
 * The column has a CHECK on that range. A provider reporting something outside
 * it is a reason to record no confidence rather than to fail the whole note —
 * but it must not be stored as a number the schema forbids.
 */
export function normaliseConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > 1) return null
  return value
}
