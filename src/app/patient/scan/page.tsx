import type { Route } from 'next'
import Link from 'next/link'

import { getPatientI18n } from '../lib/i18n/server'
import { Rich } from '../lib/i18n/rich'

export default async function QRScanLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { t } = await getPatientI18n()

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#fdfcfa] p-8 text-center">
      <div className="text-5xl mb-6">🤰</div>
      <h1 className="text-2xl font-bold text-[#8a3c4a] font-serif mb-3">{t.brand}</h1>

      <div className="bg-rose-50 rounded-2xl p-6 max-w-sm w-full shadow-sm border border-rose-100">
        <p className="text-slate-700 text-base leading-relaxed mb-4">
          <Rich text={t.scan.body} />
        </p>
        <p className="text-sm text-slate-500 italic">
          {t.scan.hint}
        </p>
      </div>

      <p className="mt-8 text-xs text-slate-400 italic">
        {t.scan.tagline}
      </p>

      <p className="mt-4 text-xs text-slate-400">
        {t.scan.noSticker}{' '}
        <Link href={'/patient/login' as Route} className="font-semibold text-[#8a3c4a] hover:underline">
          {t.scan.chooseInstead}
        </Link>
      </p>
    </div>
  )
}
