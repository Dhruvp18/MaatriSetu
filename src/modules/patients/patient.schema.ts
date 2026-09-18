import { z } from 'zod'

/**
 * Validation for everything entering the patients module from outside.
 *
 * Schemas validate; they do not contain business rules. "Is this a plausible
 * phone number" lives here. "May this actor register a patient" lives in the
 * service.
 */

/* -------------------------------------------------------------------------- */
/* Phone normalization                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Normalize an Indian mobile number to E.164, or return null.
 *
 * Registration staff type numbers under queue pressure in every format there
 * is: `98331 00001`, `098331-00001`, `+91 98331 00001`, `9198331 00001`.
 * Storing those verbatim means the same handset appears as four different
 * contacts, and inbound message matching silently fails — which, for a system
 * where an unmatched voice note goes to a staffed queue, means real messages
 * pile up unread.
 *
 * Deliberately conservative: anything not clearly a valid Indian mobile returns
 * null so the caller can reject it, rather than being coerced into something
 * plausible-looking and wrong.
 */
export function normalizeIndianMobile(input: string): string | null {
  // Strip everything except digits and a leading plus.
  const cleaned = input.trim().replace(/[\s()\-.]/g, '')
  if (!/^\+?\d+$/.test(cleaned)) return null

  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned

  // Trunk prefix used when dialling domestically.
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  // Country code, with or without the plus.
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  // Some forms carry the trunk zero after the country code.
  if (digits.length === 13 && digits.startsWith('910')) digits = digits.slice(3)

  // Indian mobile numbers are ten digits beginning 6–9. Landlines and short
  // codes are rejected: this field is a WhatsApp identity, not a phone book.
  if (!/^[6-9]\d{9}$/.test(digits)) return null

  return `+91${digits}`
}

/** A phone field that normalizes on parse and fails loudly if it cannot. */
export const IndianMobileSchema = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizeIndianMobile(value)
    if (normalized === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a 10-digit Indian mobile number beginning 6, 7, 8 or 9.',
      })
      return z.NEVER
    }
    return normalized
  })

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

const CalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date in YYYY-MM-DD form.')

export const BloodGroupSchema = z.enum([
  'A_POS', 'A_NEG', 'B_POS', 'B_NEG',
  'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG',
])

export const KnownStatusSchema = z.enum(['UNKNOWN', 'NONE_KNOWN', 'KNOWN'])

export const DataSourceSchema = z.enum([
  'CLINICIAN_ENTERED', 'STAFF_ENTERED', 'EXTRACTED_VERIFIED',
  'PATIENT_REPORTED', 'EXTERNAL_RECORD',
])

export const ContactRelationshipSchema = z.enum([
  'SELF', 'HUSBAND', 'MOTHER', 'MOTHER_IN_LAW',
  'FATHER', 'OTHER_RELATIVE', 'NEIGHBOUR', 'OTHER',
])

/**
 * Age: either a date of birth or a stated estimate.
 *
 * A union rather than two optional fields, so "estimated age with no date it
 * was recorded" is unrepresentable rather than merely discouraged.
 */
export const PatientAgeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('DATE_OF_BIRTH'),
    dateOfBirth: CalendarDateSchema,
  }),
  z.object({
    kind: z.literal('ESTIMATED'),
    years: z.number().int().min(9).max(70),
    recordedOn: CalendarDateSchema,
  }),
])

/**
 * ABHA is 14 digits. Accepted in the hyphenated display form and stored bare.
 *
 * Note this validates *shape* only. A number that looks right has not been
 * verified against ABDM, which is why `abhaVerification` is a separate field
 * and defaults to SELF_DECLARED.
 */
export const AbhaIdSchema = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{14}$/, 'An ABHA number is 14 digits.'))

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

export const AllergyInputSchema = z.object({
  substance: z.string().min(1).max(200),
  reaction: z.string().max(500).nullish(),
  severity: z.enum(['UNKNOWN', 'MILD', 'MODERATE', 'SEVERE']).default('UNKNOWN'),
  source: DataSourceSchema.default('PATIENT_REPORTED'),
})

export const ContactInputSchema = z.object({
  phone: IndianMobileSchema,
  relationship: ContactRelationshipSchema.default('SELF'),
  contactName: z.string().max(200).nullish(),
  isPrimary: z.boolean().default(false),
  hasMessagingConsent: z.boolean().default(false),
})

export const RegisterPatientSchema = z
  .object({
    uhid: z.string().min(1).max(64).trim(),
    fullName: z.string().min(1).max(200).trim(),
    age: PatientAgeSchema,

    abhaId: AbhaIdSchema.nullish(),

    // Defaults to UNKNOWN, never to NONE_KNOWN. A nurse who skips the field has
    // not established that the patient has no allergies.
    allergyStatus: KnownStatusSchema.default('UNKNOWN'),
    allergies: z.array(AllergyInputSchema).default([]),

    bloodGroup: BloodGroupSchema.nullish(),
    bloodGroupSource: DataSourceSchema.nullish(),
    bloodGroupRecordedOn: CalendarDateSchema.nullish(),

    contacts: z.array(ContactInputSchema).default([]),
  })
  // Reject unexpected keys rather than ignoring them: a typo'd field name that
  // silently does nothing is worse than an error.
  .strict()
  .superRefine((value, ctx) => {
    if (value.allergyStatus === 'KNOWN' && value.allergies.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['allergies'],
        message: 'Allergy status is "known" but no allergy has been listed.',
      })
    }

    if (value.allergyStatus !== 'KNOWN' && value.allergies.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['allergyStatus'],
        message: 'Allergies were listed, so allergy status must be "known".',
      })
    }

    // A blood group with no provenance cannot be shown on a referral slip,
    // where the reader needs to know whether it was typed or transcribed.
    if (value.bloodGroup && !value.bloodGroupSource) {
      ctx.addIssue({
        code: 'custom',
        path: ['bloodGroupSource'],
        message: 'Record where the blood group came from.',
      })
    }

    if (value.contacts.filter((c) => c.isPrimary).length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['contacts'],
        message: 'Only one contact may be primary.',
      })
    }
  })

export type RegisterPatientInput = z.infer<typeof RegisterPatientSchema>

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Identity search, used at the counter and as the fallback when a QR sticker is
 * damaged or lost (PRD §11 risk table).
 *
 * A phone term is normalized before matching so that whichever format the
 * patient recites, it finds the same rows.
 */
export const SearchPatientsSchema = z
  .object({
    query: z.string().min(2, 'Enter at least two characters.').max(100).trim(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()

export type SearchPatientsInput = z.infer<typeof SearchPatientsSchema>

/** Classify a search term so the repository knows which columns to match. */
export function classifySearchTerm(query: string): {
  phone: string | null
  looksNumeric: boolean
} {
  return {
    phone: normalizeIndianMobile(query),
    looksNumeric: /^\d+$/.test(query.replace(/[\s\-/]/g, '')),
  }
}
