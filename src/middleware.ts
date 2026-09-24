import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Session refresh, and a first-pass redirect for signed-out visitors.
 *
 * ---------------------------------------------------------------------------
 * Why this file has to exist
 * ---------------------------------------------------------------------------
 * Supabase access tokens are short-lived. A Server Component can read cookies
 * but cannot write them, so it can never persist a refreshed token — only
 * middleware can. Without this, a nurse signed in at the start of an OPD list
 * is silently signed out partway through it, mid-consultation, with a draft on
 * screen.
 *
 * ---------------------------------------------------------------------------
 * What this file is NOT
 * ---------------------------------------------------------------------------
 * It is not authorization. The redirect below is a convenience so that a
 * signed-out visitor sees the sign-in form instead of an empty screen. Every
 * actual permission check happens in a domain service against a `StaffActor`
 * (ARCH-5), and RLS applies underneath that. Middleware runs on paths that are
 * easy to mis-specify in a matcher, so treating it as a security boundary
 * would place the whole product's access control on the least reliable rung.
 */

/** Paths served without a session, deliberately. */
const PUBLIC_PREFIXES = [
  '/sign-in',
  '/patient',
  // QR token resolver — the token IS the auth mechanism, no session needed.
  '/patient/resolve',
  // The tokenized emergency handover page. A receiving doctor at 2 AM has no
  // account here; the signed, expiring token is the entire access mechanism.
  '/referral/',
  // Provider callbacks authenticate by signature, not by cookie.
  '/api/webhooks/',
  // pg_cron's queue trigger authenticates by bearer secret, not by cookie.
  '/api/queue/',
]

const isPublic = (pathname: string): boolean =>
  pathname === '/' || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))

export async function middleware(request: NextRequest) {
  // Mutated in the cookie handler below, then returned, so that refreshed
  // tokens reach the browser.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // This call is the refresh. Do not remove it or replace it with getSession():
  // getSession only decodes the existing cookie and never rotates the token.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const signIn = request.nextUrl.clone()
    signIn.pathname = '/sign-in'
    // Return the user where they were headed. Same-origin by construction: the
    // value is a pathname from this request, never attacker-supplied input, and
    // the sign-in action rejects anything that is not a relative path.
    signIn.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(signIn)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Spelled as an exclusion
     * so that a new route is protected by default: forgetting to add a path
     * here fails closed (it runs middleware) rather than open.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
