'use server'

import { revalidatePath } from 'next/cache'

import { AppError } from '@core/errors/app-error'
import { recordHomeReading } from '@/modules/patient-portal/portal.service'

import { getPatientSession } from '../lib/session'

export type RecordReadingState = { readonly status: 'idle' | 'saved' | 'error'; readonly message: string | null }

export async function recordReading(
  _previous: RecordReadingState,
  formData: FormData,
): Promise<RecordReadingState> {
  const session = await getPatientSession()
  if (!session) return { status: 'error', message: 'Your session has ended. Scan your QR again.' }

  const metric = formData.get('metric')

  try {
    if (metric === 'BLOOD_GLUCOSE') {
      await recordHomeReading(session, {
        metric,
        mgDl: formData.get('mgDl'),
        context: formData.get('context'),
      })
    } else if (metric === 'BLOOD_PRESSURE') {
      await recordHomeReading(session, {
        metric,
        systolicMmHg: formData.get('systolicMmHg'),
        diastolicMmHg: formData.get('diastolicMmHg'),
      })
    } else {
      return { status: 'error', message: 'That reading could not be understood.' }
    }
  } catch (error) {
    if (error instanceof AppError) return { status: 'error', message: error.message }
    throw error
  }

  revalidatePath('/patient/monitoring')
  return { status: 'saved', message: null }
}
