import { z } from 'zod'

/** Validation for everything entering the diagnoses module from outside. */

export const FlagDiagnosesSchema = z
  .object({
    pregnancyId: z.uuid(),
    section: z.enum(['SCANS', 'REPORTS', 'EXAMINATION']),
    labels: z
      .array(z.string().trim().min(1).max(200))
      .min(1, 'Pick or type at least one diagnosis.')
      .max(20),
  })
  .strict()

export type FlagDiagnosesInput = z.infer<typeof FlagDiagnosesSchema>
