'use server'

import QRCode from 'qrcode'

import { resolveSession } from '@core/auth/session'
import { AppError } from '@core/errors/app-error'
import { issuePatientQr } from '@modules/patients/patient.service'

/**
 * Issue a file sticker and render it, in one round trip.
 *
 * This has to be one action. The raw token exists exactly once — only its hash
 * is stored — so there is no page to navigate to afterwards that could show it
 * again. If the nurse loses this response, the sticker is reissued, not
 * recovered.
 */

export type StickerState =
  | { readonly status: 'idle' }
  | { readonly status: 'error'; readonly message: string }
  | {
      readonly status: 'issued'
      readonly uhid: string
      readonly fullName: string
      readonly issuedAt: string
      readonly replacedPrevious: boolean
      /** Inline SVG markup for the QR. Generated here, never in the browser. */
      readonly qrSvg: string
    }

export async function issueSticker(
  _previous: StickerState,
  formData: FormData,
): Promise<StickerState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.' }
  }

  const patientId = formData.get('patientId')
  if (typeof patientId !== 'string' || patientId.length === 0) {
    return { status: 'error', message: 'No patient was specified.' }
  }

  try {
    const issued = await issuePatientQr(session.actor, patientId)

    const qrSvg = await QRCode.toString(issued.token, {
      type: 'svg',
      // The sticker lives on a paper file that is handled at every visit, so it
      // will be creased, smudged and occasionally torn. Level M recovers 15% of
      // a damaged symbol, which is the practical balance: level Q would survive
      // more damage but needs a larger grid, and at 203 dpi on a thermal label
      // that pushes each module below four printer dots.
      //
      // Revisit once the pilot printer is known — it is still open in PRD §12.
      errorCorrectionLevel: 'M',
      // The quiet zone is applied by the print stylesheet as padding, so the
      // SVG itself is edge to edge and easy to size.
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' },
    })

    return {
      status: 'issued',
      uhid: issued.uhid,
      fullName: issued.fullName,
      issuedAt: issued.issuedAt,
      replacedPrevious: issued.replacedPrevious,
      qrSvg,
    }
  } catch (error) {
    if (error instanceof AppError) return { status: 'error', message: error.message }
    throw error
  }
}
