import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

import { serverEnv } from '@core/config/env'
import { SEEDED_CLINIC_ID, type PatientSelf } from '@/modules/patient-portal/portal.types'

export const PATIENT_COOKIE_NAME = 'ms_patient_session'

/** 8 hours — a full OPD day. */
export const PATIENT_SESSION_SECONDS = 8 * 60 * 60

/** The seeded demo patient, Sunita Devi. Only with PATIENT_DEMO_SESSION=true. */
const DEMO_SESSION: PatientSelf = {
  patientId: '44444444-4444-4444-8444-00000000000a',
  clinicId: SEEDED_CLINIC_ID,
}

export type PatientSession = PatientSelf

/**
 * `<payload>.<signature>`, both base64url. The payload carries its own expiry
 * so a copied cookie stops working even if the browser keeps it.
 */
export function signPatientSession(self: PatientSelf): string {
  const payload = Buffer.from(
    JSON.stringify({ ...self, exp: Math.floor(Date.now() / 1000) + PATIENT_SESSION_SECONDS }),
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/**
 * The patient this request is acting as, or null.
 *
 * A cookie that is malformed, unsigned, re-signed with another key or expired
 * is treated exactly like no cookie at all.
 */
export async function getPatientSession(): Promise<PatientSession | null> {
  const raw = (await cookies()).get(PATIENT_COOKIE_NAME)?.value
  const verified = raw ? verify(raw) : null
  if (verified) return verified

  return serverEnv().PATIENT_DEMO_SESSION ? DEMO_SESSION : null
}

function sign(payload: string): string {
  return createHmac('sha256', serverEnv().PATIENT_SESSION_SECRET).update(payload).digest('base64url')
}

function verify(raw: string): PatientSession | null {
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'))
    if (
      typeof parsed === 'object' && parsed !== null &&
      'patientId' in parsed && typeof parsed.patientId === 'string' &&
      'clinicId' in parsed && typeof parsed.clinicId === 'string' &&
      'exp' in parsed && typeof parsed.exp === 'number' &&
      parsed.exp > Date.now() / 1000
    ) {
      return { patientId: parsed.patientId, clinicId: parsed.clinicId }
    }
  } catch {
    // Malformed payload: unauthenticated.
  }
  return null
}
