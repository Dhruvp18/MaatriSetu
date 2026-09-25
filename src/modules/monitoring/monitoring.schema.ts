import { z } from 'zod'

/** What a home-reading submission accepts from a phone. Parsed, never cast (ARCH-6). */

export const RecordGlucoseReadingSchema = z.object({
  metric: z.literal('BLOOD_GLUCOSE'),
  mgDl: z.coerce.number().int().min(20).max(700),
  context: z.enum(['FASTING', 'POST_BREAKFAST', 'POST_LUNCH', 'POST_DINNER', 'RANDOM']),
})

export const RecordBloodPressureReadingSchema = z.object({
  metric: z.literal('BLOOD_PRESSURE'),
  systolicMmHg: z.coerce.number().int().min(50).max(300),
  diastolicMmHg: z.coerce.number().int().min(20).max(200),
})

export const RecordHomeReadingSchema = z.discriminatedUnion('metric', [
  RecordGlucoseReadingSchema,
  RecordBloodPressureReadingSchema,
])

export type RecordHomeReadingInput = z.infer<typeof RecordHomeReadingSchema>
