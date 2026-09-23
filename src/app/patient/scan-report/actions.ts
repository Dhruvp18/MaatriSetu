'use server'

import { getPatientSession } from '../lib/session'
import { serviceClient } from '@core/db/clients'
import { findActivePregnancy } from '@/modules/pregnancies/pregnancy.repository'
import { putObject } from '@core/storage/clinical-media'
import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'

export async function uploadPatientReport(formData: FormData) {
  const session = await getPatientSession()
  if (!session) {
    throw new Error('Not authenticated')
  }

  const file = formData.get('reportImage') as File | null
  if (!file || file.size === 0) {
    throw new Error('No file selected')
  }

  const db = serviceClient()
  const pregnancy = await findActivePregnancy(db, session.clinicId, session.patientId)
  
  if (!pregnancy) {
    throw new Error('No active pregnancy found')
  }

  // Read file bytes
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const contentType = file.type || 'image/jpeg'
  const extension = contentType.split('/')[1]?.replace('x-', '') || 'bin'
  
  const uploadId = randomUUID()
  const objectKey = `reports/${session.clinicId}/${uploadId}.${extension}`
  
  // Calculate hash
  const hashHex = createHash('sha256').update(bytes).digest('hex')

  // Upload to storage bucket
  await putObject(objectKey, bytes, contentType)

  // Insert into DB
  const { error } = await db.from('report_uploads').insert({
    id: uploadId,
    clinic_id: session.clinicId,
    patient_id: session.patientId,
    pregnancy_id: pregnancy.id,
    object_key: objectKey,
    content_type: contentType,
    byte_size: bytes.length,
    sha256: `\\x${hashHex}`,
    assignment_status: 'assigned', // Automatically assign it since we know the pregnancy
  })

  if (error) {
    console.error('Failed to insert report record', error)
    throw new Error('Failed to save report record')
  }

  redirect('/patient/reports')
}
