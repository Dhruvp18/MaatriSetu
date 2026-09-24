/**
 * Patient-app languages. Client-safe: no dictionaries are imported here, so a
 * client component pulling in `formatDate` does not ship every translation.
 */

export const LANGS = ['en', 'hi', 'mr'] as const
export type Lang = (typeof LANGS)[number]

export const DEFAULT_LANG: Lang = 'en'
export const LANG_COOKIE = 'ms_patient_lang'

/** Each language named in its own script, so a mother can find hers. */
export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  hi: 'हिन्दी',
  mr: 'मराठी',
}

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

// Marathi defaults to Devanagari digits. Keep Latin digits everywhere so dates
// read the same as the doses and values printed on her ANC file.
const DATE_LOCALES: Record<Lang, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN-u-nu-latn',
}

export function formatDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(DATE_LOCALES[lang], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Fill `{name}` placeholders. Templates rather than functions so strings can cross to client components. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

export const GUIDE_SLUGS = ['nutrition', 'tips', 'myths', 'breastfeeding', 'vaccines', 'hospital-bag'] as const
export type GuideSlug = (typeof GUIDE_SLUGS)[number]

export function isGuideSlug(value: string): value is GuideSlug {
  return (GUIDE_SLUGS as readonly string[]).includes(value)
}

/**
 * A guide article as data, so each language supplies its own words while the
 * layout stays in one place. `**text**` inside any string renders bold.
 */
export type ArticleBlock =
  | { kind: 'lead'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'tip'; title: string; text: string }
  | { kind: 'myth'; myth: string; fact: string }
  | { kind: 'card'; title: string; items: string[] }
  | { kind: 'group'; title: string; items: string[] }
  | { kind: 'note'; text: string }

export interface Article {
  title: string
  blocks: ArticleBlock[]
}
