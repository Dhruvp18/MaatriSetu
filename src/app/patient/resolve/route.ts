import { type NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { serviceClient } from '@core/db/clients'
import { findPatientIdByQrHash } from '@/modules/patients/patient.repository'

/**
 * GET /patient/resolve?token=<uuid>
 *
 * Called when a patient scans the QR sticker on their paper file. The URL
 * carries a plain token; we hash it and look it up — only the hash is stored.
 * On success we set a session cookie and redirect to the patient dashboard.
 *
 * No staff session exists here: this is the same public-route pattern as
 * /referral/ — the signed, opaque token IS the access mechanism.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token || token.length < 16) {
    return NextResponse.redirect(new URL('/patient/scan?error=invalid', request.url))
  }

  const tokenHashHex = createHash('sha256').update(token).digest('hex')

  // We need a clinic to scope the lookup. For a hackathon prototype we pull the
  // clinic id from the token itself — in production the QR would embed the
  // clinic id alongside the token.
  const clinicId = request.nextUrl.searchParams.get('clinic')

  if (!clinicId) {
    return NextResponse.redirect(new URL('/patient/scan?error=no_clinic', request.url))
  }

  const db = serviceClient()

  // Use a synthetic actor id (all zeros) since this is a public action — the
  // real implementation in the clinic uses a staff session here.
  const patientId = await findPatientIdByQrHash(db, {
    clinicId,
    actorStaffUserId: '00000000-0000-0000-0000-000000000000',
    requestId: crypto.randomUUID(),
    tokenHashHex,
  })

  if (!patientId) {
    return NextResponse.redirect(new URL('/patient/scan?error=not_found', request.url))
  }

  const sessionPayload = Buffer.from(
    JSON.stringify({ patientId, clinicId }),
    'utf-8',
  ).toString('base64')

  const response = NextResponse.redirect(new URL('/patient', request.url))
  response.cookies.set('ms_patient_session', sessionPayload, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/patient',
    // 8 hours — a full OPD day
    maxAge: 8 * 60 * 60,
  })
  return response
}
