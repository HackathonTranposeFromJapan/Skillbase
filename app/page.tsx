'use client'

import dynamic from 'next/dynamic'

/**
 * The dashboard is a client-only app: dither-kit paints to canvas and the
 * avatars are generated in the browser, so there is nothing useful to
 * server-render. Loading it with `ssr: false` keeps the first paint identical
 * to what the judges see after hydration.
 */
const SkillbaseApp = dynamic(() => import('@/components/SkillbaseApp'), {
  ssr: false,
  loading: () => <div className="min-h-svh bg-background" />,
})

export default function Home() {
  return <SkillbaseApp />
}
