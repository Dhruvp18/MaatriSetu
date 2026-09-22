import 'server-only'

import { providerEnv } from '@core/config/env'

import { createFixtureProvider } from './fixture'
import type { SpeechProvider } from './provider'
import { createSarvamProvider } from './sarvam'

export type {
  LanguageCode,
  SpeechProvider,
  Transcription,
  TranscriptionRequest,
  TranscriptionResult,
} from './provider'

/**
 * The configured speech provider.
 *
 * Defaults to the fixture, so the labelled path is the normal one. Selecting
 * `sarvam` without a key is a startup error rather than a silent fallback —
 * falling back would produce canned data under a label claiming it was real
 * (see `providerEnv`).
 */
export function speechProvider(): SpeechProvider {
  const env = providerEnv()

  if (env.SPEECH_PROVIDER === 'sarvam') {
    // providerEnv() has already refused this combination if the key is absent.
    return createSarvamProvider(env.SARVAM_API_KEY as string)
  }

  return createFixtureProvider()
}

/** True when transcripts on screen must carry a "not a real transcription" label. */
export function speechIsFixture(): boolean {
  return providerEnv().SPEECH_PROVIDER !== 'sarvam'
}
