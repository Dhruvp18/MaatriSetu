import { redirect } from 'next/navigation'

/**
 * The root sends you into the app.
 *
 * This route used to render a development readiness page listing which modules
 * existed. It outlived its usefulness and became actively misleading: it
 * carried a hardcoded status list that nobody updated as the modules landed, so
 * the first screen anyone opened reported a finished cockpit as "Not started".
 *
 * A status board maintained by hand drifts from the truth the moment attention
 * moves elsewhere. What the project actually has is `pnpm verify:schema`,
 * `pnpm test` and `tools/check-pages.mjs`, all of which read the real system,
 * and `docs/WALKTHROUGH.md`, which is written to be read rather than to be
 * accurate at a glance.
 *
 * Unauthenticated visitors are bounced to sign-in by the middleware, so this
 * redirect is correct for both cases.
 */
export default function RootPage() {
  redirect('/clinic')
}
