import { GoogleGenAI, Type } from '@google/genai'

import { config } from '../config/env'
import type { SpeechProvider, TranscriptionRequest, TranscriptionResult } from './provider'

export class GeminiSpeechProvider implements SpeechProvider {
  readonly name = 'gemini'
  private ai: GoogleGenAI | null = null

  constructor() {
    if (config.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY })
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
        model: 'gemini-1.5-pro',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are a medical transcription and translation assistant working for an Indian maternal health clinic. 
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
          model: 'gemini-1.5-pro',
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
