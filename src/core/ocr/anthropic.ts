import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import type {
  Extraction,
  ExtractionRequest,
  ExtractionResult,
  OcrProvider,
} from './provider'

/**
 * Extraction with Claude.
 *
 * A vision model rather than classical OCR because Indian lab slips are not a
 * format — they are hundreds of formats, often photographed at an angle on
 * creased paper under a ceiling fan. Tesseract reads characters; the hard part
 * here is knowing that the "11.2" beside "Hb%" is a haemoglobin in g/dL and the
 * "11.0 - 15.0" beside it is the laboratory's range, not a second result.
 *
 * ---------------------------------------------------------------------------
 * The prompt is versioned, and that matters
 * ---------------------------------------------------------------------------
 * `PROMPT_VERSION` is stored on every extraction run. When a clinician disputes
 * a value months later, "which prompt produced this" has to be answerable.
 * Bump it on every change to the instructions or the schema.
 *
 * ---------------------------------------------------------------------------
 * What this is forbidden to do
 * ---------------------------------------------------------------------------
 * Transcribe only. The prompt tells the model not to interpret, not to flag
 * anything as abnormal, and not to fill in a value it cannot actually see. A
 * plausible guess is the single most dangerous output here: a reviewer
 * scanning a screen of confident-looking numbers will not catch an invented
 * one as readily as a blank.
 */

const MODEL = 'claude-opus-5'

/** Bump on every change to the instructions or the schema below. */
const PROMPT_VERSION = 'ocr-v1'

const TIMEOUT_MS = 120_000

const SYSTEM_PROMPT = `You transcribe Indian clinical laboratory and ultrasound reports from photographs.

You are a TRANSCRIBER, not a clinician. Follow these rules exactly:

1. Report only what is printed. Never infer, complete, or correct a value.
2. If a character is unreadable, leave the field out entirely. A missing field is
   safe; a guessed one is not. Do not "best guess" a digit.
3. Copy units exactly as printed (g/dL, g/L, mg/dL, mmol/L, 10^3/uL, lakhs/cumm).
   Never convert, normalise, or supply a unit that is not on the page.
4. A reference interval printed beside a result is a reference interval, not a
   second result. Put it in referenceLow/referenceHigh/referenceText.
5. Never state whether a value is high, low, normal or abnormal. Never add a
   diagnosis, an impression, or advice. If the slip itself prints a remark such
   as "Microcytic hypochromic picture", copy it verbatim into valueText under a
   field whose printedLabel is that remark's label.
6. Set confidence honestly. Low confidence on a smudged digit is useful; uniform
   high confidence is not.
7. testCode: use one of hb, wbc, platelets, rbc, hct, mcv, ogtt_fasting,
   ogtt_1hr, ogtt_2hr, fbs, ppbs, hba1c, tsh, t3, t4, urea, creatinine, bilirubin,
   sgot, sgpt, hiv, hbsag, vdrl, blood_group, urine_albumin, urine_sugar,
   urine_pus_cells, efw, afi, presentation, placenta. If nothing fits, set
   testCode to null and still return the printedLabel and value.

Transcribe every result on the page, including ones you consider unremarkable.`

/* -------------------------------------------------------------------------- */
/* Response schema                                                            */
/* -------------------------------------------------------------------------- */

const FieldSchema = z.object({
  testCode: z.string().nullable(),
  printedLabel: z.string(),
  valueNumeric: z.number().nullable(),
  valueText: z.string().nullable(),
  unit: z.string().nullable(),
  referenceLow: z.number().nullable(),
  referenceHigh: z.number().nullable(),
  referenceText: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
})

const ExtractionSchema = z.object({
  reportType: z.enum([
    'CBC', 'OGTT', 'SEROLOGY', 'URINE', 'BLOOD_GROUP', 'THYROID',
    'LFT', 'RFT', 'HPLC', 'ULTRASOUND', 'OTHER', 'UNRECOGNISED',
  ]),
  reportDate: z.string().nullable(),
  fields: z.array(FieldSchema),
})

/** The same shape, as JSON Schema, for the model's structured output. */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reportType', 'reportDate', 'fields'],
  properties: {
    reportType: {
      type: 'string',
      enum: [
        'CBC', 'OGTT', 'SEROLOGY', 'URINE', 'BLOOD_GROUP', 'THYROID',
        'LFT', 'RFT', 'HPLC', 'ULTRASOUND', 'OTHER', 'UNRECOGNISED',
      ],
    },
    reportDate: {
      type: ['string', 'null'],
      description: 'Collection or report date as printed, ISO YYYY-MM-DD if unambiguous.',
    },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'testCode', 'printedLabel', 'valueNumeric', 'valueText',
          'unit', 'referenceLow', 'referenceHigh', 'referenceText', 'confidence',
        ],
        properties: {
          testCode: { type: ['string', 'null'] },
          printedLabel: { type: 'string' },
          valueNumeric: { type: ['number', 'null'] },
          valueText: { type: ['string', 'null'] },
          unit: { type: ['string', 'null'] },
          referenceLow: { type: ['number', 'null'] },
          referenceHigh: { type: ['number', 'null'] },
          referenceText: { type: ['string', 'null'] },
          confidence: { type: ['number', 'null'] },
        },
      },
    },
  },
} as const

/* -------------------------------------------------------------------------- */

export function createAnthropicOcrProvider(apiKey: string): OcrProvider {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS })

  return {
    name: 'anthropic',
    model: MODEL,
    promptVersion: PROMPT_VERSION,

    async extract(request: ExtractionRequest): Promise<ExtractionResult> {
      const mediaType = normaliseMediaType(request.mimeType)
      if (!mediaType) {
        return {
          ok: false,
          code: 'UNSUPPORTED_IMAGE',
          message: `${request.mimeType} cannot be read as an image.`,
          retryable: false,
        }
      }

      let response
      try {
        response = await client.messages.create({
          model: MODEL,
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          // Adaptive thinking: reading a creased slip at an angle benefits from
          // the model working before it answers, and the cost is small against
          // a transcription error reaching a clinician.
          thinking: { type: 'adaptive' },
          output_config: {
            effort: 'high',
            format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
          },
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: Buffer.from(request.image).toString('base64'),
                  },
                },
                {
                  type: 'text',
                  text: request.expectedType
                    ? `Staff believe this is a ${request.expectedType} report. Transcribe what is actually printed; correct them if it is something else.`
                    : 'Transcribe every result printed on this report.',
                },
              ],
            },
          ],
        })
      } catch (error) {
        return mapSdkError(error)
      }

      // A safety decline is not a transcription failure and must not be retried
      // as though the connection dropped.
      if (response.stop_reason === 'refusal') {
        return {
          ok: false,
          code: 'REFUSED',
          message: 'The model declined to read this image.',
          retryable: false,
        }
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      // Provider output is untrusted input, parsed and never cast (ARCH-6).
      // Structured outputs make malformed JSON unlikely, not impossible.
      let parsed
      try {
        parsed = ExtractionSchema.safeParse(JSON.parse(text))
      } catch {
        return {
          ok: false,
          code: 'PROVIDER_ERROR',
          message: 'The model returned a response that could not be read.',
          retryable: true,
        }
      }

      if (!parsed.success) {
        return {
          ok: false,
          code: 'PROVIDER_ERROR',
          message: 'The model returned fields in an unexpected shape.',
          retryable: true,
        }
      }

      // A numeric value whose unit did not come through is dropped rather than
      // shown. It would reach a reviewer as a bare number, which is the one
      // thing a transcription must never present (ARCH-9).
      const fields = parsed.data.fields.filter(
        (field) => field.valueNumeric === null || field.unit !== null,
      )

      const extraction: Extraction = {
        reportType: parsed.data.reportType,
        reportDate: parsed.data.reportDate,
        fields,
        provider: 'anthropic',
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        raw: parsed.data,
      }

      return { ok: true, extraction }
    },
  }
}

function normaliseMediaType(
  mimeType: string,
): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'image/jpeg'
    case 'image/png':
      return 'image/png'
    case 'image/webp':
      return 'image/webp'
    case 'image/gif':
      return 'image/gif'
    default:
      // HEIC from an iPhone and PDF both land here. Converting them is a
      // separate job; failing clearly beats sending bytes the model will reject.
      return null
  }
}

function mapSdkError(error: unknown): Extract<ExtractionResult, { ok: false }> {
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      ok: false,
      code: 'AUTH',
      message: 'The extraction API key was rejected.',
      // Retrying burns the queue against a credential that will not start
      // working on its own.
      retryable: false,
    }
  }

  if (error instanceof Anthropic.RateLimitError) {
    return { ok: false, code: 'RATE_LIMIT', message: 'Extraction rate limit reached.', retryable: true }
  }

  if (error instanceof Anthropic.BadRequestError) {
    return {
      ok: false,
      code: 'UNSUPPORTED_IMAGE',
      message: 'The image was rejected. It may be too large or corrupt.',
      retryable: false,
    }
  }

  if (error instanceof Anthropic.APIError) {
    return {
      ok: false,
      code: 'PROVIDER_ERROR',
      message: `Extraction failed (${error.status}).`,
      retryable: (error.status ?? 500) >= 500,
    }
  }

  return { ok: false, code: 'TIMEOUT', message: 'Extraction did not complete in time.', retryable: true }
}
