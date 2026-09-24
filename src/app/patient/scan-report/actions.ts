'use server'

import { redirect } from 'next/navigation'

import { uploadOwnReport } from '@/modules/patient-portal/portal.service'

import { getPatientSession } from '../lib/session'

export async function uploadPatientReport(formData: FormData) {
  const session = await getPatientSession()
  if (!session) {
    throw new Error('Not authenticated')
  }

  const file = formData.get('reportImage')
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('No file selected')
  }

  await uploadOwnReport(session, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    // The service checks this against the accepted formats.
    contentType: file.type || 'image/jpeg',
  })

  redirect('/patient/reports')
}
