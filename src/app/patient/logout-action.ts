'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { PATIENT_COOKIE_NAME } from './lib/session'

/** Shared by every page that offers a way out of the portal (My ANC header, profile). */
export async function logoutPatient() {
  const cookieStore = await cookies()
  cookieStore.delete(PATIENT_COOKIE_NAME)
  redirect('/patient/scan')
}
