import type { Metadata, Viewport } from 'next'

import './globals.css'

/**
 * Root layout.
 *
 * Thin by rule (ARCH-1): structure and chrome only. No data fetching, no
 * authorization, no clinical vocabulary.
 */

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
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  )
}
