import { publicEnv } from '@core/config/env'

/**
 * Development readiness page.
 *
 * Deliberately not a mocked-up cockpit. A screen that looks finished while
 * nothing behind it works is the failure mode `docs/development-foundation.md`
 * §1 calls out: fixtures must be visibly labelled and must never masquerade as
 * a working integration. This page reports what is actually wired, and says so
 * plainly where it is not.
 *
 * It is replaced by the authenticated clinic area once sign-in exists.
 */

export const metadata = { title: 'Setup' }

// Configuration and connectivity are read at request time, not at build time.
export const dynamic = 'force-dynamic'

interface Check {
  readonly label: string
  readonly state: 'ok' | 'missing' | 'failed'
  readonly detail: string
}

/**
 * Whether a variable is set, without revealing what it is set to.
 *
 * Read from `process.env` rather than through `serverEnv()`, which throws when
 * anything is missing — the whole job of this page is to report that calmly
 * rather than crash on it.
 */
function present(name: string): boolean {
  const value = process.env[name]
  return typeof value === 'string' && value.length > 0
}

/**
 * Confirms the project answers, and that an anonymous caller gets nothing.
 *
 * This deliberately treats a 401 as success. Migration 0012 revokes every table
 * privilege from the `anon` role — the tokenized referral page and the webhook
 * are served by server-side code holding the service role, so `anon` needs no
 * access at all. A reply of any kind proves the project is reachable; a refusal
 * proves the posture is intact.
 *
 * The alarming outcome is the opposite one. If this query ever returns rows, a
 * leaked anon key would read every clinic in the database, so that case is
 * reported as a failure in as many words.
 */
async function checkAnonymousAccessDenied(): Promise<Check> {
  const url = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/clinics?select=id&limit=1`

  try {
    const response = await fetch(url, {
      headers: {
        apikey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (response.status === 401 || response.status === 403) {
      return {
        label: 'Database reachable, anonymous access denied',
        state: 'ok',
        detail:
          'The project answered and refused the read. Table privileges are revoked from the anon role (migration 0012), so a leaked browser key reads nothing.',
      }
    }

    if (response.ok) {
      return {
        label: 'Database reachable, anonymous access denied',
        state: 'failed',
        detail:
          'An anonymous caller was able to read the clinics table. Privileges revoked in migration 0012 are not in effect on this project — do not put any data here until that is resolved.',
      }
    }

    return {
      label: 'Database reachable, anonymous access denied',
      state: 'failed',
      detail: `The project answered ${response.status}, which is neither a refusal nor a success. Check the URL and key.`,
    }
  } catch (error) {
    // The message, not the error: a fetch failure can carry the full URL.
    const reason = error instanceof Error ? error.message : 'unknown error'
    return {
      label: 'Database reachable, anonymous access denied',
      state: 'failed',
      detail: `Could not reach the project (${reason}).`,
    }
  }
}

function configurationChecks(): Check[] {
  return [
    {
      label: 'Supabase URL and anon key',
      state: 'ok',
      detail: 'Present — the app would not have started otherwise.',
    },
    {
      label: 'Service role key',
      state: present('SUPABASE_SERVICE_ROLE_KEY') ? 'ok' : 'missing',
      detail: present('SUPABASE_SERVICE_ROLE_KEY')
        ? 'Set. Every clinical write runs through it, after the service layer has checked permission.'
        : 'Not set. Registration, pregnancies and visits cannot be written until it is. Dashboard → Project Settings → API Keys → service_role.',
    },
    {
      label: 'Direct database URL',
      state: present('DATABASE_URL') ? 'ok' : 'missing',
      detail: present('DATABASE_URL')
        ? 'Set. The synthetic seed and the job queue can both connect.'
        : 'Not set, so supabase/seed.sql has not been loaded and the demo patients do not exist. Dashboard → Settings → Database → reset the password, then use the Session pooler URI.',
    },
    {
      label: 'Referral token secret',
      state: present('REFERRAL_TOKEN_SECRET') ? 'ok' : 'missing',
      detail: present('REFERRAL_TOKEN_SECRET')
        ? 'Set. Referral share links are signed and expiring.'
        : 'Not set. Referral links cannot be issued.',
    },
  ]
}

const MODULES: readonly { name: string; status: string; done: boolean }[] = [
  { name: 'Patients — search, register, QR issue and scan', status: 'Built, verified live', done: true },
  { name: 'Pregnancies — episodes, dating, redating, closure', status: 'Built, verified live', done: true },
  { name: 'Visits — open/reuse, vitals, cancellation', status: 'Built, verified live', done: true },
  { name: 'Sign-in and the authenticated clinic area', status: 'Not started', done: false },
  { name: 'Registration form and the consultation cockpit', status: 'Not started', done: false },
  { name: 'Report upload, extraction and clinician review', status: 'Not started', done: false },
  { name: 'Emergency referral and the public handover page', status: 'Not started', done: false },
  { name: 'Voice intake and transcription', status: 'Not started', done: false },
]

const STATE_STYLES: Record<Check['state'], { dot: string; text: string }> = {
  ok: { dot: 'bg-verified-700', text: 'text-verified-700' },
  missing: { dot: 'bg-caution-700', text: 'text-caution-700' },
  failed: { dot: 'bg-alert-600', text: 'text-alert-600' },
}

export default async function SetupPage() {
  const checks = [...configurationChecks(), await checkAnonymousAccessDenied()]
  const blocking = checks.filter((c) => c.state !== 'ok')

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <div className="mb-4 flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-semibold text-white"
          >
            म
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">MaatriSetu</h1>
            <p className="text-sm text-slate-500">Antenatal consultation cockpit — development build</p>
          </div>
        </div>

        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
          This build organizes and surfaces data that already exists in a patient&apos;s records.
          It does not diagnose, score risk, classify a finding as abnormal, or recommend a dose.
          All clinical judgment stays with the clinician, and nothing enters the permanent record
          without a clinician&apos;s explicit verification.
          <strong className="mt-2 block font-medium text-slate-800">
            Synthetic data only. Not cleared for use with real patient data.
          </strong>
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-1 text-sm font-semibold tracking-wide text-slate-900 uppercase">
          Environment
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          {blocking.length === 0
            ? 'Everything this build needs is configured.'
            : `${blocking.length} item${blocking.length === 1 ? '' : 's'} still needed before the first vertical slice can run.`}
        </p>

        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {checks.map((check) => (
            <li key={check.label} className="flex gap-3 p-4">
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATE_STYLES[check.state].dot}`}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {check.label}{' '}
                  <span className={`text-xs font-normal ${STATE_STYLES[check.state].text}`}>
                    {check.state === 'ok' ? 'ready' : check.state === 'missing' ? 'not configured' : 'failed'}
                  </span>
                </p>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{check.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-sm font-semibold tracking-wide text-slate-900 uppercase">
          What is built
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          &ldquo;Verified live&rdquo; means the module&apos;s transactional routines were executed
          against this project&apos;s database, not only unit-tested.
        </p>

        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {MODULES.map((module) => (
            <li key={module.name} className="flex items-baseline justify-between gap-4 p-4">
              <span className="text-sm text-slate-700">{module.name}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  module.done
                    ? 'bg-verified-50 text-verified-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {module.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-400">
        <p>
          Layering rules in <code className="text-slate-500">docs/architecture.md</code>; the
          corrected data model in <code className="text-slate-500">docs/development-foundation.md</code>.
          Run <code className="text-slate-500">pnpm verify:schema</code> before every migration commit.
        </p>
      </footer>
    </main>
  )
}
