import type { ExtractionRequest, ExtractionResult, OcrProvider } from './provider'

/**
 * Canned extractions, for development and for demos without a key.
 *
 * Every run it produces is marked `provider: 'fixture'`, which the review
 * screen renders as a visible label. Fixture output must never be mistaken for
 * a real reading of the photograph the assistant just took
 * (docs/development-foundation.md §1).
 *
 * The sample is the PRD's worked case: a CBC showing the haemoglobin that the
 * seeded trend falls to. It deliberately includes a low-confidence field, so
 * the review UI's uncertainty treatment is exercised rather than assumed.
 */

export function createFixtureOcrProvider(): OcrProvider {
  return {
    name: 'fixture',
    model: 'fixture',
    promptVersion: 'fixture-v1',

    async extract(request: ExtractionRequest): Promise<ExtractionResult> {
      // Derived from the image size so the same photograph always yields the
      // same candidates. Random output would make a demo unrepeatable and a
      // failing check impossible to reproduce.
      const smudged = request.image.byteLength % 2 === 0

      return {
        ok: true,
        extraction: {
          reportType: 'CBC',
          reportDate: null,
          fields: [
            {
              testCode: 'hb',
              printedLabel: 'Haemoglobin (Hb%)',
              valueNumeric: 8.6,
              valueText: null,
              unit: 'g/dL',
              referenceLow: 11,
              referenceHigh: 15,
              referenceText: null,
              confidence: 0.97,
            },
            {
              testCode: 'wbc',
              printedLabel: 'Total WBC count',
              valueNumeric: 4200,
              valueText: null,
              unit: '/uL',
              referenceLow: 4000,
              referenceHigh: 11000,
              referenceText: null,
              confidence: 0.94,
            },
            {
              testCode: 'platelets',
              printedLabel: 'Platelet count',
              valueNumeric: 1.85,
              valueText: null,
              unit: 'lakhs/cumm',
              referenceLow: 1.5,
              referenceHigh: 4.1,
              referenceText: null,
              // Deliberately low: the reviewer should be drawn to this one, and
              // the unit here is the Indian convention rather than 10^9/L,
              // which is exactly the sort of thing a human must confirm.
              confidence: smudged ? 0.41 : 0.62,
            },
            {
              // A printed remark, copied verbatim, with no interpretation.
              testCode: null,
              printedLabel: 'Peripheral smear',
              valueNumeric: null,
              valueText: 'Microcytic hypochromic picture',
              unit: null,
              referenceLow: null,
              referenceHigh: null,
              referenceText: null,
              confidence: 0.88,
            },
          ],
          provider: 'fixture',
          model: 'fixture',
          promptVersion: 'fixture-v1',
          raw: { note: 'Canned sample. No image was read.' },
        },
      }
    },
  }
}
