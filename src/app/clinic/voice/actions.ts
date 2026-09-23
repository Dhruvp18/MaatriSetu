'use server'

import { revalidatePath } from 'next'

import { resolveSession } from '@core/auth/session'
import { recordVoiceNote } from '@modules/voice/voice.service'
import * as repo from '@modules/voice/voice.repository'
import { serviceClient, userClient } from '@core/db/clients'
import { AssociateVoiceQuerySchema, ACCEPTED_AUDIO } from '@modules/voice/voice.schema'
import { requirePermission } from '@core/auth/actor'

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
  if (!ACCEPTED_AUDIO.includes(file.type as any)) {
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
    requirePermission(session.actor, 'query.associate')

    // Call the repository to associate the query with the patient
    const db = await userClient()
    await repo.associate(db, {
      clinicId: session.actor.clinicId,
      actorStaffUserId: session.actor.staffUserId,
      requestId: session.actor.requestId,
      voiceQueryId: queryId,
      patientId,
      contactId: null,
    })

    revalidatePath('/clinic/voice')
    revalidatePath(`/clinic/patients/${patientId}`)
    return { status: 'success' }
  } catch (error) {
    console.error('Failed to associate voice note', error)
    return { status: 'error', message: error instanceof Error ? error.message : 'Association failed' }
  }
}
