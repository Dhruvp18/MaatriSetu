import 'server-only'

import { providerEnv } from '@core/config/env'

import { createFixtureOcrProvider } from './fixture'
import { createGeminiOcrProvider } from './gemini'
import type { OcrProvider } from './provider'

export type {
  ExtractedField,
  Extraction,
  ExtractionReportType,
  ExtractionRequest,
  ExtractionResult,
  OcrProvider,
} from './provider'

/**
 * The configured extraction provider.
 *
 * Defaults to the fixture so the labelled path is the normal one. Selecting a
 * real provider without its key is a startup error rather than a silent
 * fallback — falling back would put canned values on screen under a label
 * claiming a photograph had been read.
 *
 * Google Document AI is named in the PRD as an alternative and is not
 * implemented; selecting it fails loudly rather than quietly using Gemini.
 */
export function ocrProvider(): OcrProvider {
  const env = providerEnv()

  if (env.OCR_PROVIDER === 'gemini') {
    return createGeminiOcrProvider(env.GEMINI_API_KEY as string, env.GEMINI_MODEL)
  }

  if (env.OCR_PROVIDER === 'google') {
    throw new Error(
      'OCR_PROVIDER is "google", but the Document AI provider is not implemented. Use "gemini" or "fixture".',
    )
  }

  return createFixtureOcrProvider()
}

/** True when extracted values on screen must carry a "not a real reading" label. */
export function ocrIsFixture(): boolean {
  return providerEnv().OCR_PROVIDER !== 'gemini'
}
