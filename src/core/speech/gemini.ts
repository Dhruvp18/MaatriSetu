import { GoogleGenAI, Type } from '@google/genai'

import { providerEnv } from '../config/env'
import type { SpeechProvider, TranscriptionRequest, TranscriptionResult } from './provider'

export class GeminiSpeechProvider implements SpeechProvider {
  readonly name = 'gemini'
  private ai: GoogleGenAI | null = null
  private readonly model: string

  constructor() {
    const env = providerEnv()
    this.model = env.GEMINI_MODEL
    if (env.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
    }
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!this.ai) {
      return {
        ok: false,
        code: 'AUTH',
        message: 'GEMINI_API_KEY is not configured.',
        retryable: false,
      }
    }

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  request.purpose === 'CLINICIAN_DICTATION'
                    ? `You are a medical transcription assistant for an Indian antenatal clinic.
Listen to the following dictation by a doctor. It may mix English with Hindi or Marathi.
1. Transcribe exactly what was said, as written clinical notes. Keep standard medical abbreviations (P/A, P/V, BP, FHS, GxPxLxAx).
2. Give an English version of the same notes; if the dictation was already in English, repeat it unchanged.
3. Detect the main language code (e.g. en-IN, hi-IN, mr-IN).
Do not add, infer or summarise anything that was not said.`
                    : `You are a medical transcription and translation assistant working for an Indian maternal health clinic.
Please listen to the following voice note from a pregnant patient.
1. Transcribe the patient's original vernacular speech exactly as spoken.
2. Translate the speech into clinical English.
3. Detect the original language code (e.g. mr-IN, hi-IN, gu-IN).`,
              },
              {
                inlineData: {
                  mimeType: request.mimeType,
                  data: Buffer.from(request.audio).toString('base64'),
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              original: {
                type: Type.STRING,
                description: 'The exact transcription of what the patient said in their vernacular language.',
              },
              english: {
                type: Type.STRING,
                description: 'The translation of the patient\'s message into clinical English.',
              },
              detectedLanguage: {
                type: Type.STRING,
                description: 'The BCP-47 language code of the original speech, e.g. hi-IN, mr-IN, gu-IN.',
              },
            },
            required: ['original', 'english', 'detectedLanguage'],
          },
          temperature: 0.2,
        },
      })

      const text = response.text
      if (!text) {
        throw new Error('Gemini returned an empty response.')
      }

      const parsed = JSON.parse(text)

      return {
        ok: true,
        transcription: {
          original: parsed.original,
          english: parsed.english,
          detectedLanguage: parsed.detectedLanguage,
          confidence: null, // Gemini does not provide a direct confidence score for audio parts in JSON schema mode
          provider: 'gemini',
          model: this.model,
        },
      }
    } catch (error) {
      console.error('[speech:gemini] failed', error)
      return {
        ok: false,
        code: 'PROVIDER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown Gemini error',
        retryable: true,
      }
    }
  }
}
