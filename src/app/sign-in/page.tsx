import { redirect } from 'next/navigation'

import { resolveSession } from '@core/auth/session'

import { SignInForm } from './sign-in-form'

export const metadata = { title: 'Sign in' }

// Session state is per-request; nothing here may be cached.
export const dynamic = 'force-dynamic'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  // Someone already signed in who lands here — usually via a stale bookmark —
  // is sent on rather than shown a form they do not need.
  const session = await resolveSession()
  if (session.status === 'ACTIVE') redirect('/clinic')

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-semibold text-white"
          >
            M
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">MaatriSetu</h1>
            <p className="text-sm text-slate-500">Antenatal consultation cockpit</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <SignInForm next={next ?? null} />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          For authorised clinic staff. This system organises existing records and
          does not provide diagnosis or clinical advice. All access is audited.
        </p>
      </div>
    </main>
  )
}
