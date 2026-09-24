'use server'

import { cookies } from 'next/headers'
import { LANG_COOKIE, isLang } from './locales'

/**
 * Remember the patient's language. A cookie rather than a DB column so it works
 * before she has scanned her QR, and survives logging out on a shared phone.
 * Setting a cookie in a server action re-renders the current route, so the
 * page switches language without a manual refresh.
 */
export async function setPatientLanguage(lang: string): Promise<void> {
  if (!isLang(lang)) return
  ;(await cookies()).set(LANG_COOKIE, lang, {
    path: '/patient',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
}
