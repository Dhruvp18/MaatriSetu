import { BottomNav } from './bottom-nav'
import { LanguageSwitcher } from './language-switcher'
import { getPatientI18n } from './lib/i18n/server'

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await getPatientI18n()

  return (
    <div lang={lang} className="flex flex-col h-[100dvh] bg-[#fdfcfa] font-sans max-w-md mx-auto">
      <header className="h-11 shrink-0 flex items-center justify-between px-4 bg-white border-b border-slate-100">
        <span className="text-sm font-bold text-[#8a3c4a] font-serif">{t.brand}</span>
        <LanguageSwitcher current={lang} label={t.languageLabel} />
      </header>
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>
      <BottomNav labels={t.nav} />
    </div>
  )
}
