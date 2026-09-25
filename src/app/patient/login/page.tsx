import { getPatientI18n } from '../lib/i18n/server'

import { LoginForm } from './login-form'

/**
 * Username/password login for the patient portal.
 *
 * "Username" is her UHID — printed on her card and not secret by itself, the
 * way a bank account number is not secret. The password is what actually
 * authenticates her (see `loginWithPassword` in `portal.service.ts`).
 */
export default async function PatientLoginPage() {
  const { t } = await getPatientI18n()

  return (
    <div className="flex flex-col items-center min-h-screen bg-[#fdfcfa] p-6 pt-16 text-center">
      <div className="text-5xl mb-4">🤰</div>
      <h1 className="text-xl font-bold text-[#8a3c4a] font-serif mb-1">{t.login.title}</h1>
      <p className="text-sm text-slate-500 italic mb-8 max-w-xs">{t.login.subtitle}</p>

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
  )
}
