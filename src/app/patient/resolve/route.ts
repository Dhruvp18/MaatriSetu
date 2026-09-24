import { type NextRequest, NextResponse } from 'next/server'

import { resolveQr } from '@/modules/patient-portal/portal.service'

import { PATIENT_COOKIE_NAME, PATIENT_SESSION_SECONDS, signPatientSession } from '../lib/session'

/**
 * GET /patient/resolve?clinic=<uuid>&token=<token>
 *
 * Called when a patient scans the QR sticker on her paper file. The token is
 * hashed and looked up — only the hash is stored. On success she gets a signed
 * session cookie and lands on her dashboard.
 *
 * No staff session exists here: like /referral/, the opaque token IS the
 * access mechanism.
 */
export async function GET(request: NextRequest) {
  const self = await resolveQr({
    clinicId: request.nextUrl.searchParams.get('clinic'),
    token: request.nextUrl.searchParams.get('token'),
  })

  if (!self) {
    return NextResponse.redirect(new URL('/patient/scan?error=not_found', request.url))
  }

  const response = NextResponse.redirect(new URL('/patient', request.url))
  response.cookies.set(PATIENT_COOKIE_NAME, signPatientSession(self), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/patient',
    maxAge: PATIENT_SESSION_SECONDS,
  })
  return response
}
