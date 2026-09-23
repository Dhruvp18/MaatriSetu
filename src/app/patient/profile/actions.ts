'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function logoutPatient() {
  const cookieStore = await cookies()
  cookieStore.delete('ms_patient_session')
  redirect('/patient/scan')
}
