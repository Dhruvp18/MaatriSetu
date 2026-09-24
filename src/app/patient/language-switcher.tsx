'use client'

import { useTransition } from 'react'
import { Languages } from 'lucide-react'
import { LANGS, LANG_LABELS, type Lang } from './lib/i18n/locales'
import { setPatientLanguage } from './lib/i18n/actions'

export function LanguageSwitcher({ current, label }: { current: Lang; label: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex items-center gap-1 bg-slate-100 rounded-full p-0.5 transition-opacity ${isPending ? 'opacity-60' : ''}`}
    >
      <Languages className="w-3.5 h-3.5 text-slate-400 mx-1.5" aria-hidden />
      {LANGS.map((lang) => {
        const active = lang === current
        return (
          <button
            key={lang}
            type="button"
            role="radio"
            aria-checked={active}
            lang={lang}
            disabled={isPending}
            onClick={() => {
              if (!active) startTransition(() => setPatientLanguage(lang))
            }}
            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
              active ? 'bg-white text-[#b84c63] font-bold shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {LANG_LABELS[lang]}
          </button>
        )
      })}
    </div>
  )
}
