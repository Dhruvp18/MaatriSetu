import { z } from 'zod'

/**
 * Validation for everything entering the orders module from outside.
 *
 * Read-only for now. Prescribing is part of the consultation commit (Save &
 * Next) and its input schema lands with that, so that an order and the audit
 * row recording it are written in the same transaction.
 */

export const PregnancyOrdersQuerySchema = z
  .object({ pregnancyId: z.uuid() })
  .strict()

export type PregnancyOrdersQuery = z.infer<typeof PregnancyOrdersQuerySchema>
