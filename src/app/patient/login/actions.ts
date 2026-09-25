'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { loginWithPassword } from '@/modules/patient-portal/portal.service'

import { PATIENT_COOKIE_NAME, PATIENT_SESSION_SECONDS, signPatientSession } from '../lib/session'

export type LoginState = { readonly error: string | null }

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const self = await loginWithPassword({
    uhid: formData.get('uhid'),
    password: formData.get('password'),
  })

  // Deliberately one message for "no such patient", "no password ever set"
  // and "wrong password" alike — distinguishing them tells a guesser which
  // UHIDs are real, the same reasoning the staff sign-in form already follows.
  if (!self) return { error: 'That patient ID and password do not match.' }

  ;(await cookies()).set(PATIENT_COOKIE_NAME, signPatientSession(self), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/patient',
    maxAge: PATIENT_SESSION_SECONDS,
  })

  redirect('/patient')
}
