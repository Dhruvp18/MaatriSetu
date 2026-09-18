import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Clinical data must never be cached by intermediaries. Per-route headers
  // tighten this further; see src/app/referral/[token] for the public page.
  poweredByHeader: false,
  // Typed Route href checking. Moved out of `experimental` in Next 15.5.
  typedRoutes: true,
}

export default nextConfig
