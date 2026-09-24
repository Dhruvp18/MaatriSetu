import type { Lang } from '../locales'
import { en, type Dict } from './en'
import { hi } from './hi'
import { mr } from './mr'

export type { Dict }

const DICTIONARIES: Record<Lang, Dict> = { en, hi, mr }

export function getDictionary(lang: Lang): Dict {
  return DICTIONARIES[lang]
}
