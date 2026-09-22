import type { SpeechProvider, TranscriptionRequest, TranscriptionResult } from './provider'

/**
 * Canned transcriptions, for development and for demos without a key.
 *
 * Every result it returns is marked `provider: 'fixture'`, and the UI renders
 * that as a visible label. `docs/development-foundation.md` §1 is explicit
 * about this: fixtures must never masquerade as a working integration, because
 * the failure mode is discovering at judging time that nothing was ever wired.
 *
 * The samples are drawn from the PRD's own worked examples so the demo exercises
 * the real triage path rather than a happy one.
 */

interface Sample {
  readonly original: string
  readonly english: string
  readonly language: string
}

const SAMPLES: readonly Sample[] = [
  {
    // PRD §6.4's worked example: swelling, which is a routing question rather
    // than a diagnosis. It must reach a human, not an auto-reply.
    original: 'संध्याकाळी पायावर थोडी सूज येते',
    english: 'There is slight swelling of the feet towards evening.',
    language: 'mr-IN',
  },
  {
    original: 'मैडम, क्या मैं कैल्शियम और आयरन साथ में ले सकती हूँ?',
    english: 'Madam, can I take calcium and iron together?',
    language: 'hi-IN',
  },
  {
    // A red-flag phrase, so the lexicon's priority path is exercised in a demo.
    original: 'मला खूप डोकेदुखी आहे आणि डोळ्यांपुढे अंधारी येते',
    english: 'I have a severe headache and my vision is blurring.',
    language: 'mr-IN',
  },
  {
    original: 'બાળકની હલનચલન ઓછી લાગે છે આજે',
    english: 'The baby’s movements feel reduced today.',
    language: 'gu-IN',
  },
]

export function createFixtureProvider(): SpeechProvider {
  return {
    name: 'fixture',

    async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
      // Chosen from the audio's own length so the same file always yields the
      // same sample. A random pick would make a demo unrepeatable and a failing
      // check impossible to reproduce.
      const index = request.audio.byteLength % SAMPLES.length
      const sample = SAMPLES[index] ?? SAMPLES[0]!

      return {
        ok: true,
        transcription: {
          original: sample.original,
          english: sample.english,
          detectedLanguage: sample.language,
          // Deliberately null. A fabricated confidence would be read as the
          // model's own assessment of a transcription it never performed.
          confidence: null,
          provider: 'fixture',
          model: 'fixture',
        },
      }
    },
  }
}
