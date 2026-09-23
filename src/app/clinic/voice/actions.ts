'use server'

import { revalidatePath } from 'next/cache'

import { resolveSession } from '@core/auth/session'
import { associateWithPatient, recordVoiceNote } from '@modules/voice/voice.service'
import { ACCEPTED_AUDIO } from '@modules/voice/voice.schema'

export type UploadState =
  | { readonly status: 'idle' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly message: string }

export async function uploadVoiceNoteAction(
  _previous: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.' }
  }

  const file = formData.get('audio') as File | null
  const fromPhone = formData.get('fromPhone') as string | null

  if (!file) {
    return { status: 'error', message: 'No audio file provided.' }
  }

  // Next.js FormData File object has a `type` property containing the mime type
  if (!(ACCEPTED_AUDIO as readonly string[]).includes(file.type)) {
    return { status: 'error', message: `Unsupported audio format: ${file.type}. Supported formats are: ${ACCEPTED_AUDIO.join(', ')}` }
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    await recordVoiceNote(session.actor, uint8Array, {
      mimeType: file.type,
      byteSize: uint8Array.length,
      fromPhone: fromPhone || undefined,
    })

    revalidatePath('/clinic/voice')
    return { status: 'success' }
  } catch (error) {
    console.error('Failed to upload voice note', error)
    return { status: 'error', message: error instanceof Error ? error.message : 'Upload failed' }
  }
}

export type AssociateState =
  | { readonly status: 'idle' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly message: string }

export async function associateVoiceNoteAction(
  _previous: AssociateState,
  formData: FormData,
): Promise<AssociateState> {
  const session = await resolveSession()
  if (session.status !== 'ACTIVE') {
    return { status: 'error', message: 'Your session has ended. Sign in again.' }
  }

  const queryId = formData.get('queryId') as string
  const patientId = formData.get('patientId') as string

  if (!queryId || !patientId) {
    return { status: 'error', message: 'Missing queryId or patientId.' }
  }

  try {
    // Through the service, which holds the permission check and validates the
    // patient id before anything is written (ARCH-1).
    await associateWithPatient(session.actor, queryId, { patientId })

    revalidatePath('/clinic/voice')
    revalidatePath(`/clinic/patients/${patientId}`)
    return { status: 'success' }
  } catch (error) {
    console.error('Failed to associate voice note', error)
    return { status: 'error', message: error instanceof Error ? error.message : 'Association failed' }
  }
}
