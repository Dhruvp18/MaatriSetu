'use server'

import { revalidatePath } from 'next/cache'
import QRCode from 'qrcode'

import { resolveSession } from '@core/auth/session'
import { serverEnv } from '@core/config/env'
import { AppError } from '@core/errors/app-error'
import { createLink, revokeLink } from '@modules/referrals/referral.service'

/**
 * Minting and retiring the link to an issued referral.
 *
 * Minting has to be one round trip that also renders the QR. The raw token
 * exists exactly once — only its hash is stored — so there is no page to
 * navigate to afterwards that could show it again. If this response is lost,
 * the link is re-issued, not recovered.
 *
 * The document itself is untouched either way. Revoking a link withdraws
 * access; it does not alter what the receiving unit was told, because the
 * record of that has to outlive their ability to read it.
 */

export type LinkState =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'created'
      /** The full URL. Shown once, then gone. */
      readonly url: string
      readonly expiresAt: string
      /** Inline SVG markup for the QR. Generated here, never in the browser. */
      readonly qrSvg: string
    }
  | { readonly status: 'revoked' }

export async function createReferralLink(
  _previous: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.' }
  }

  const referralId = formData.get('referralId')
  if (typeof referralId !== 'string' || referralId.length === 0) {
    return { status: 'error', message: 'No referral was specified.' }
  }

  try {
    const minted = await createLink(session.actor, referralId, {})

    // Absolute, because this is printed and scanned from paper by a phone that
    // has never visited this origin.
    const url = `${serverEnv().APP_BASE_URL.replace(/\/$/, '')}/referral/${minted.token}`

    const qrSvg = await QRCode.toString(url, {
      // The QR goes on a slip that is folded into a file, carried in an
      // ambulance and handled by several people. Level M recovers 15% of a
      // damaged symbol, which is the practical balance between resilience and
      // the grid size a phone camera can resolve in poor light.
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' },
    })

    return { status: 'created', url, expiresAt: minted.expiresAt, qrSvg }
  } catch (error) {
    if (error instanceof AppError) return { status: 'error', message: error.message }
    throw error
  }
}

export async function revokeReferralLink(
  _previous: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.' }
  }

  const tokenId = formData.get('tokenId')
  const patientId = formData.get('patientId')
  const referralId = formData.get('referralId')
  if (typeof tokenId !== 'string' || tokenId.length === 0) {
    return { status: 'error', message: 'No link was specified.' }
  }

  try {
    // Revoking an already-dead link reports success: the caller asked for it to
    // stop working, and it has.
    await revokeLink(session.actor, {
      tokenId,
      reason: typeof formData.get('reason') === 'string' ? String(formData.get('reason')) : null,
    })
  } catch (error) {
    if (error instanceof AppError) return { status: 'error', message: error.message }
    throw error
  }

  if (typeof patientId === 'string' && typeof referralId === 'string') {
    revalidatePath(`/clinic/patients/${patientId}/referral/${referralId}`)
  }

  return { status: 'revoked' }
}
