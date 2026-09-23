import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'

import './globals.css'

/**
 * Root layout.
 *
 * Thin by rule (ARCH-1): structure and chrome only. No data fetching, no
 * authorization, no clinical vocabulary.
 */

/**
 * The three faces of the Stitch design system, self-hosted.
 *
 * Self-hosted rather than linked from Google's CDN, which matters more here
 * than it usually does: a clinic on a saturated 4G dongle would otherwise get
 * a consultation screen whose numbers reflow a second after it paints, and the
 * cockpit is read in the first two seconds or not at all.
 *
 * `display: 'swap'` for the same reason — fallback metrics are close enough
 * that a swap is less disruptive than a blank banner.
 */

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['500', '600', '700', '800'],
  variable: '--font-jakarta',
})

/**
 * Every clinical number in the product is set in this: gestational ages, blood
 * pressures, doses, lab trends. Tabular figures are the point — see `.numeric`
 * in globals.css.
 */
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
})

export const metadata: Metadata = {
  title: {
    default: 'MaatriSetu',
    template: '%s · MaatriSetu',
  },
  description:
    'Assistive paper-to-digital antenatal consultation cockpit. Organizes existing records; does not diagnose.',
  // This application serves patient data. Nothing in it should ever reach a
  // search index, including the tokenized public referral page.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  formatDetection: {
    // Left on for telephone: staff tap a contact number to call a mother back.
    telephone: true,
    // Off for the rest. A UHID like MH-2026-89412 gets helpfully linkified as a
    // date or an address otherwise, which makes it unselectable on the mobile
    // upload screen.
    date: false,
    address: false,
    email: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deliberately zoomable. Pinch-zoom is how a clinician reads a photographed
  // lab slip on a phone, and disabling it to make the layout feel more
  // app-like would break the report-review workflow outright.
  maximumScale: 5,
  themeColor: '#4f46e5',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jakarta.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen font-sans">
        {children}
      </body>
    </html>
  )
}
