import 'server-only'
import { cookies } from 'next/headers'
import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from './locales'
import { getDictionary, type Dict } from './dictionaries'

/** The language the patient picked, or English until she picks one. */
export async function getPatientLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value
  return isLang(value) ? value : DEFAULT_LANG
}

export async function getPatientI18n(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getPatientLang()
  return { lang, t: getDictionary(lang) }
}
