import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Clinical data must never be cached by intermediaries. Per-route headers
  // tighten this further; see src/app/referral/[token] for the public page.
  poweredByHeader: false,
  // Typed Route href checking. Moved out of `experimental` in Next 15.5.
  typedRoutes: true,

  /**
   * The tokenized referral page.
   *
   * This is the only route served without a session, and the only one whose URL
   * travels on paper through an ambulance and a receiving unit's phone. Caching
   * it anywhere is a way for a revoked link to keep working:
   *
   *   `no-store` keeps it out of CDNs, corporate proxies and the browser's own
   *   disk cache, so revocation takes effect on the next request rather than
   *   whenever a cached copy happens to expire.
   *
   *   `must-revalidate` and `max-age=0` are stated as well as `no-store`,
   *   because some intermediaries in this deployment's path honour the older
   *   directives and ignore the newer one.
   *
   *   `X-Robots-Tag` repeats the page's own `robots` metadata at the HTTP
   *   level: a crawler that fetches the URL without executing the page — or
   *   that is handed it by a messaging app's link preview — never sees the
   *   meta tag.
   *
   * Set here rather than in the page because a Server Component cannot set
   * response headers, and because this applies to every response for the path,
   * including error pages.
   */
  async headers() {
    return [
      {
        source: '/referral/:token*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, max-age=0, private',
          },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet, noimageindex' },
          // The referral URL itself identifies a patient's document. Sending it
          // in a Referer header to any site linked from the page would leak a
          // working access token.
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
}

export default nextConfig
