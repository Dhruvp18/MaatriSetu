/**
 * Proves resolveSession()'s queries succeed under RLS for every seeded role.
 *
 * The risk being tested: staff_users and clinic_memberships both have RLS
 * policies, and the membership query includes a join to `clinics`. If any of
 * those policies refuses, sign-in "works" but every user lands on the
 * NO_MEMBERSHIP screen — a failure that would look like a data problem.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const ACCOUNTS = [
  ['doctor@maatrisetu.local', 'DOCTOR'],
  ['nurse@maatrisetu.local', 'NURSE'],
  ['assistant@maatrisetu.local', 'ASSISTANT'],
  ['admin@maatrisetu.local', 'ADMIN'],
]

let failures = 0

for (const [email, expectedRole] of ACCOUNTS) {
  const db = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: auth, error: authError } = await db.auth.signInWithPassword({
    email,
    password: 'maatrisetu',
  })

  if (authError || !auth.user) {
    console.log(`FAIL  ${email}  sign-in: ${authError?.message ?? 'no user'}`)
    failures++
    continue
  }

  // Exactly the queries resolveSession() issues, in the same order.
  const { data: staff, error: staffError } = await db
    .from('staff_users')
    .select('id, display_name, is_active')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()

  if (staffError || !staff) {
    console.log(`FAIL  ${email}  staff_users: ${staffError?.message ?? 'no row (RLS?)'}`)
    failures++
    continue
  }

  const { data: memberships, error: memberError } = await db
    .from('clinic_memberships')
    .select('clinic_id, role, clinics(name, timezone)')
    .eq('user_id', staff.id)
    .eq('is_active', true)

  if (memberError) {
    console.log(`FAIL  ${email}  clinic_memberships: ${memberError.message}`)
    failures++
    continue
  }

  if (!memberships?.length) {
    console.log(`FAIL  ${email}  no active membership visible (RLS?)`)
    failures++
    continue
  }

  const m = memberships[0]
  const clinicName = m.clinics?.name ?? null
  const clinicTz = m.clinics?.timezone ?? null
  const roleOk = m.role === expectedRole
  const nameOk = Boolean(clinicName) && Boolean(clinicTz)

  console.log(
    `${roleOk && nameOk ? 'ok  ' : 'FAIL'}  ${email.padEnd(30)} role=${m.role.padEnd(9)} clinic=${clinicName ?? 'UNREADABLE'} tz=${clinicTz ?? 'MISSING'}`,
  )
  if (!roleOk || !nameOk) failures++

  await db.auth.signOut()
}

console.log(failures === 0 ? '\nAll roles resolve to an actor.' : `\n${failures} failure(s).`)
process.exit(failures === 0 ? 0 : 1)
