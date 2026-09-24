import { z } from 'zod'

const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD form.')

export const ScheduleAppointmentSchema = z
  .object({
    patientId: z.uuid(),
    pregnancyId: z.uuid().nullish(),
    scheduledOn: CalendarDateSchema,
    purpose: z.string().trim().max(200).nullish(),
  })
  .strict()

export type ScheduleAppointmentInput = z.infer<typeof ScheduleAppointmentSchema>
