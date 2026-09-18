import { z } from 'zod'

/**
 * Validated environment configuration.
 *
 * Environment variables are untrusted input like any other (ARCH-6), and a
 * missing one should fail at startup with a clear message rather than surface
 * as `undefined` inside a request handler at 2 AM.
 *
 * The file is split into three exports on purpose:
 *
 *   publicEnv    safe to send to the browser
 *   serverEnv    secrets; throws if read from the client bundle
 *   providerEnv  pluggable integrations, each defaulting to a labelled fixture
 *
 * Nothing here reads `process.env` at module scope beyond the parse, so an
 * import of this module from a client component cannot leak a secret: the
 * server getters throw instead.
 */

const nonEmpty = z.string().min(1)

/* -------------------------------------------------------------------------- */
/* Public — safe in the browser bundle                                        */
/* -------------------------------------------------------------------------- */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
})

// Next.js inlines NEXT_PUBLIC_* at build time only when referenced literally,
// so these cannot be read through a computed key.
const publicResult = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
})

if (!publicResult.success) {
  throw new Error(
    `Invalid public environment configuration.\n${formatIssues(publicResult.error)}\n` +
      'Copy .env.example to .env.local and fill in the values printed by `pnpm db:start`.',
  )
}

export const publicEnv = Object.freeze(publicResult.data)

/* -------------------------------------------------------------------------- */
/* Server — secrets                                                            */
/* -------------------------------------------------------------------------- */

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  DATABASE_URL: nonEmpty,
  APP_BASE_URL: z.url(),

  // Referral tokens are signed and short-lived. A weak secret here means a
  // guessable link to a patient's handover document, so a floor is enforced.
  REFERRAL_TOKEN_SECRET: z
    .string()
    .min(32, 'REFERRAL_TOKEN_SECRET must be at least 32 characters.'),
  REFERRAL_TOKEN_TTL_HOURS: z.coerce.number().int().positive().max(168).default(24),
})

export type ServerEnv = z.infer<typeof serverSchema>

let cachedServerEnv: Readonly<ServerEnv> | null = null

/**
 * Server-only configuration.
 *
 * Lazily parsed so that importing this module from shared code does not force
 * every consumer to have secrets present. Throws loudly if called in a browser.
 */
export function serverEnv(): Readonly<ServerEnv> {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. Secrets must never reach the client.')
  }

  if (cachedServerEnv) return cachedServerEnv

  const result = serverSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(`Invalid server environment configuration.\n${formatIssues(result.error)}`)
  }

  cachedServerEnv = Object.freeze(result.data)
  return cachedServerEnv
}

/* -------------------------------------------------------------------------- */
/* Providers — pluggable integrations                                          */
/* -------------------------------------------------------------------------- */

/**
 * Each integration defaults to `fixture` / `disabled`.
 *
 * This is deliberate. A demo that silently falls back to canned data while
 * appearing live is the failure mode the foundation document calls out: fixture
 * output must be visibly labelled in the UI and must never masquerade as a real
 * integration. Defaulting to `fixture` makes the labelled path the normal one,
 * so nobody discovers at judging time that a key was missing.
 */
const providerSchema = z.object({
  OCR_PROVIDER: z.enum(['fixture', 'anthropic', 'google']).default('fixture'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  SPEECH_PROVIDER: z.enum(['fixture', 'sarvam']).default('fixture'),
  SARVAM_API_KEY: z.string().optional(),

  MESSAGING_PROVIDER: z.enum(['disabled', 'whatsapp']).default('disabled'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
})

export type ProviderEnv = z.infer<typeof providerSchema>

let cachedProviderEnv: Readonly<ProviderEnv> | null = null

export function providerEnv(): Readonly<ProviderEnv> {
  if (typeof window !== 'undefined') {
    throw new Error('providerEnv() was called in the browser.')
  }

  if (cachedProviderEnv) return cachedProviderEnv

  const result = providerSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(`Invalid provider configuration.\n${formatIssues(result.error)}`)
  }

  const env = result.data

  // A selected provider without its credential is a misconfiguration, not a
  // reason to quietly fall back — falling back would produce fixture data under
  // a label claiming it was real.
  if (env.OCR_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new Error('OCR_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set.')
  }
  if (env.OCR_PROVIDER === 'google' && !env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('OCR_PROVIDER is "google" but GOOGLE_APPLICATION_CREDENTIALS is not set.')
  }
  if (env.SPEECH_PROVIDER === 'sarvam' && !env.SARVAM_API_KEY) {
    throw new Error('SPEECH_PROVIDER is "sarvam" but SARVAM_API_KEY is not set.')
  }
  if (env.MESSAGING_PROVIDER === 'whatsapp') {
    const missing = (
      [
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
        // Required to verify inbound webhook signatures. Accepting unsigned
        // webhooks would let anyone inject a patient message.
        'WHATSAPP_APP_SECRET',
      ] as const
    ).filter((key) => !env[key])

    if (missing.length > 0) {
      throw new Error(
        `MESSAGING_PROVIDER is "whatsapp" but these are not set: ${missing.join(', ')}.`,
      )
    }
  }

  cachedProviderEnv = Object.freeze(env)
  return cachedProviderEnv
}

/** True when a provider is running on canned data that the UI must label. */
export function isFixtureMode(): {
  ocr: boolean
  speech: boolean
  messaging: boolean
} {
  const env = providerEnv()
  return {
    ocr: env.OCR_PROVIDER === 'fixture',
    speech: env.SPEECH_PROVIDER === 'fixture',
    messaging: env.MESSAGING_PROVIDER === 'disabled',
  }
}

/* -------------------------------------------------------------------------- */

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`).join('\n')
}
