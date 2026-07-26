import type { Metadata } from 'next'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Skillbase',
  description:
    'Skillbase — the in-company library for AI agent skills: discover, install, and measure what your teams actually run.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // `dark` is fixed: the dashboard is designed as a dev tool, dark only.
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
