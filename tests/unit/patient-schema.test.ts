import { describe, expect, it } from 'vitest'

import {
  RegisterPatientSchema,
  AbhaIdSchema,
  classifySearchTerm,
  normalizeIndianMobile,
} from '@modules/patients/patient.schema'
import { ageInYears, describeAllergies, formatBloodGroup, isRhNegative } from '@modules/patients/patient.types'

describe('Indian mobile normalization', () => {
  it('accepts the formats registration staff actually type', () => {
    // Every one of these is the same handset. Storing them verbatim would
    // create four contacts and break inbound message matching.
    const variants = [
      '9833100001',
      '98331 00001',
      '98331-00001',
      '098331 00001',
      '+919833100001',
      '+91 98331 00001',
      '919833100001',
      '  +91-98331-00001  ',
    ]

    for (const variant of variants) {
      expect(normalizeIndianMobile(variant)).toBe('+919833100001')
    }
  })

  it('accepts every valid leading digit', () => {
    for (const lead of ['6', '7', '8', '9']) {
      expect(normalizeIndianMobile(`${lead}833100001`)).toBe(`+91${lead}833100001`)
    }
  })

  it('rejects rather than coerces anything not clearly a mobile number', () => {
    const invalid = [
      '',
      '5833100001', // landline range
      '983310000', // nine digits
      '98331000012', // eleven digits
      '022 24071000', // landline
      'nine eight three',
      '+1 415 555 0123', // not Indian
      '+9198331000011', // too long with country code
    ]

    for (const value of invalid) {
      expect(normalizeIndianMobile(value)).toBeNull()
    }
  })

  it('classifies a search term so phone lookups still work when typed loosely', () => {
    expect(classifySearchTerm('98331 00001').phone).toBe('+919833100001')
    expect(classifySearchTerm('Sunita').phone).toBeNull()
    expect(classifySearchTerm('MH-2026-89412').looksNumeric).toBe(false)
  })
})

describe('ABHA identifiers', () => {
  it('accepts the hyphenated display form and stores it bare', () => {
    expect(AbhaIdSchema.parse('91-8273-1928-4412')).toBe('91827319284412')
    expect(AbhaIdSchema.parse('91827319284412')).toBe('91827319284412')
  })

  it('rejects anything that is not 14 digits', () => {
    expect(() => AbhaIdSchema.parse('9182731928441')).toThrow()
    expect(() => AbhaIdSchema.parse('91-8273-1928-441X')).toThrow()
  })
})

describe('patient registration input', () => {
  const valid = {
    uhid: 'MH-2026-89412',
    fullName: 'Sunita Devi',
    age: { kind: 'ESTIMATED' as const, years: 26, recordedOn: '2026-09-18' },
  }

  it('defaults allergy status to UNKNOWN, never to NONE_KNOWN', () => {
    // The whole point of the tri-state. A nurse who skipped the field has not
    // established that the patient has no allergies.
    const parsed = RegisterPatientSchema.parse(valid)
    expect(parsed.allergyStatus).toBe('UNKNOWN')
    expect(parsed.allergies).toEqual([])
  })

  it('rejects a KNOWN allergy status with nothing listed', () => {
    expect(() =>
      RegisterPatientSchema.parse({ ...valid, allergyStatus: 'KNOWN' }),
    ).toThrow()
  })

  it('rejects listed allergies without a KNOWN status', () => {
    expect(() =>
      RegisterPatientSchema.parse({
        ...valid,
        allergyStatus: 'NONE_KNOWN',
        allergies: [{ substance: 'Penicillin' }],
      }),
    ).toThrow()
  })

  it('rejects a blood group with no provenance', () => {
    expect(() =>
      RegisterPatientSchema.parse({ ...valid, bloodGroup: 'O_NEG' }),
    ).toThrow()

    expect(
      RegisterPatientSchema.parse({
        ...valid,
        bloodGroup: 'O_NEG',
        bloodGroupSource: 'EXTRACTED_VERIFIED',
      }).bloodGroup,
    ).toBe('O_NEG')
  })

  it('rejects two primary contacts', () => {
    expect(() =>
      RegisterPatientSchema.parse({
        ...valid,
        contacts: [
          { phone: '9833100001', isPrimary: true },
          { phone: '9833100002', isPrimary: true },
        ],
      }),
    ).toThrow()
  })

  it('normalizes contact numbers during parse', () => {
    const parsed = RegisterPatientSchema.parse({
      ...valid,
      contacts: [{ phone: '098331 00001', relationship: 'HUSBAND' }],
    })
    expect(parsed.contacts[0]?.phone).toBe('+919833100001')
  })

  it('rejects unknown fields instead of ignoring them', () => {
    expect(() =>
      RegisterPatientSchema.parse({ ...valid, lmp: '2026-02-02' }),
    ).toThrow()
  })

  it('makes an estimated age without a recording date unrepresentable', () => {
    expect(() =>
      RegisterPatientSchema.parse({
        ...valid,
        age: { kind: 'ESTIMATED', years: 26 },
      }),
    ).toThrow()
  })
})

describe('clinical display helpers', () => {
  it('renders Rh sign with a true minus for printed legibility', () => {
    expect(formatBloodGroup('O_NEG')).toBe('O−')
    expect(formatBloodGroup('AB_POS')).toBe('AB+')
  })

  it('identifies Rh-negative groups', () => {
    expect(isRhNegative('O_NEG')).toBe(true)
    expect(isRhNegative('O_POS')).toBe(false)
  })

  it('never renders "not asked" as reassurance', () => {
    expect(describeAllergies({ status: 'UNKNOWN' })).toBe('Allergies not recorded')
    expect(describeAllergies({ status: 'NONE_KNOWN' })).toBe('No known allergies')
    expect(
      describeAllergies({
        status: 'KNOWN',
        allergies: [
          {
            id: '1',
            substance: 'Penicillin',
            reaction: null,
            severity: 'MODERATE',
            source: 'PATIENT_REPORTED',
            recordedAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    ).toBe('Penicillin')
  })

  it('does not age an estimate forward', () => {
    // Stating 26 two years ago does not make her 28 today; manufacturing that
    // precision would misrepresent the record.
    const age = { kind: 'ESTIMATED' as const, years: 26, recordedOn: '2024-09-18' }
    expect(ageInYears(age, '2026-09-18')).toBe(26)
  })

  it('computes age from a date of birth, respecting the birthday', () => {
    const age = { kind: 'DATE_OF_BIRTH' as const, dateOfBirth: '2000-12-25' }
    expect(ageInYears(age, '2026-12-24')).toBe(25)
    expect(ageInYears(age, '2026-12-25')).toBe(26)
  })
})
