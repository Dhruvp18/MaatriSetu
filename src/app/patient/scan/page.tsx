import { getPatientI18n } from '../lib/i18n/server'
import { Rich } from '../lib/i18n/rich'
import { LoginForm } from '../login/login-form'

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

      {/* Right here, not a click away: a mother without a sticker to scan
          should never need a second page to reach her own dashboard. */}
      <div className="mt-8 w-full max-w-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-rose-100" />
          <span className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{t.scan.orDivider}</span>
          <div className="h-px flex-1 bg-rose-100" />
        </div>

        <h2 className="mb-1 text-center text-base font-bold text-[#8a3c4a] font-serif">{t.login.title}</h2>
        <p className="mb-5 text-center text-xs text-slate-500 italic">{t.login.subtitle}</p>

        <LoginForm
          labels={{
            uhid: t.login.uhidLabel,
            uhidPlaceholder: t.login.uhidPlaceholder,
            password: t.login.passwordLabel,
            signIn: t.login.signIn,
            signingIn: t.login.signingIn,
          }}
        />
      </div>
    </div>
  )
}
