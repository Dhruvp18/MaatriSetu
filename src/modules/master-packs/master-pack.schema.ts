import { z } from 'zod'

/**
 * Validation for master packs.
 *
 * A medicine line is held to the same rules the consultation applies when it
 * is saved (visit.schema.ts): a pack line that could not be prescribed as it
 * stands would only fail later, at Save & Next, with the patient in the room.
 */

const Text = (max: number) => z.string().trim().max(max)

export const PackMedicineSchema = z
  .object({
    medicineName: Text(200).min(1, 'Name the medicine.'),
    form: Text(32).nullish(),
    doseAmount: z.number().positive().max(100000).nullish(),
    doseUnit: Text(32).min(1).nullish(),
    frequency: z.enum(['OD', 'BD', 'TDS', 'QID', 'HS', 'SOS', 'PRN', 'STAT', 'WEEKLY', 'OTHER']),
    foodRelation: z.enum(['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'NOT_SPECIFIED']).default('NOT_SPECIFIED'),
    durationDays: z.number().int().positive().max(400).nullish(),
    instructions: Text(1000).nullish(),
  })
  .strict()
  .refine((rx) => (rx.doseAmount == null) === (rx.doseUnit == null), {
    message: 'A dose needs both an amount and a unit, or neither.',
    path: ['doseUnit'],
  })

export const CounsellingKeySchema = z.enum(['DFKC', 'NUTRITION', 'LEFT_LATERAL_REST', 'DANGER_SIGNS'])

export const MasterPackInputSchema = z
  .object({
    name: Text(80).min(1, 'Give the pack a name.'),
    medicines: z.array(PackMedicineSchema).max(30).default([]),
    labOrders: z.array(Text(200).min(1)).max(30).default([]),
    scanOrders: z.array(Text(200).min(1)).max(30).default([]),
    counselling: z.array(CounsellingKeySchema).max(4).default([]),
    advice: Text(2000).nullish(),
  })
  .strict()
  .refine(
    (pack) =>
      pack.medicines.length + pack.labOrders.length + pack.scanOrders.length + pack.counselling.length > 0 ||
      !!pack.advice?.trim(),
    { message: 'Add at least one medicine, order, counselling point or advice.', path: ['medicines'] },
  )

export type MasterPackInput = z.infer<typeof MasterPackInputSchema>

export const SaveMasterPackSchema = z
  .object({
    /** Absent for a new pack. With it, `expectedVersion` is required. */
    packId: z.uuid().nullish(),
    expectedVersion: z.number().int().min(1).nullish(),
    pack: MasterPackInputSchema,
  })
  .strict()
  .refine((v) => (v.packId == null) === (v.expectedVersion == null), {
    message: 'An edit needs the version it was read at.',
    path: ['expectedVersion'],
  })

export const DeleteMasterPackSchema = z
  .object({
    packId: z.uuid(),
    expectedVersion: z.number().int().min(1),
  })
  .strict()
