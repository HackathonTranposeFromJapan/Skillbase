import NiceAvatar, { genConfig } from 'react-nice-avatar'
import { cn } from '@/lib/utils'
import { peopleById } from '@/demo/people'
import { useApp } from '@/state/app-state'

/** genConfig is deterministic per seed; cache so re-renders never reshuffle a face. */
const configCache = new Map<string, ReturnType<typeof genConfig>>()

function configFor(personId: string) {
  const cached = configCache.get(personId)
  if (cached) return cached
  const person = peopleById[personId]
  const config = genConfig(`${personId}-${person?.name ?? personId}`)
  configCache.set(personId, config)
  return config
}

const sizes = {
  xs: 'size-6',
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-14',
  xl: 'size-20',
}

/** Mosaic cell size in px per avatar size — keep the blocks readable, not destructive. */
const mosaic: Record<keyof typeof sizes, 'fine' | 'coarse'> = {
  xs: 'fine',
  sm: 'fine',
  md: 'fine',
  lg: 'coarse',
  xl: 'coarse',
}

/**
 * SVG pixelation filters, mounted once at the app root.
 * feFlood paints one dot per cell, feTile repeats it, feComposite samples the
 * source only under the dots, and feMorphology grows each sample back to a block.
 */
export function AvatarFilterDefs() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute">
      <title>Avatar mosaic filters</title>
      <defs>
        <filter id="avatar-mosaic-fine" x="0" y="0" width="100%" height="100%">
          <feFlood x="1" y="1" width="1" height="1" />
          <feComposite width="3" height="3" />
          <feTile result="cells" />
          <feComposite in="SourceGraphic" in2="cells" operator="in" />
          <feMorphology operator="dilate" radius="1.5" />
        </filter>
        <filter id="avatar-mosaic-coarse" x="0" y="0" width="100%" height="100%">
          <feFlood x="2" y="2" width="1" height="1" />
          <feComposite width="5" height="5" />
          <feTile result="cells" />
          <feComposite in="SourceGraphic" in2="cells" operator="in" />
          <feMorphology operator="dilate" radius="2.5" />
        </filter>
      </defs>
    </svg>
  )
}

/**
 * Wraps the generated face so it sits back into the dark UI: brightness and
 * saturation pulled down, a light mosaic pass, and a dither dot veil on top.
 */
function MosaicFrame({
  size,
  className,
  children,
}: {
  size: keyof typeof sizes
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={cn('relative block overflow-hidden rounded-full', sizes[size], className)}>
      <span
        className="block size-full"
        style={{
          filter: `url(#avatar-mosaic-${mosaic[size]}) brightness(0.72) saturate(0.62) contrast(1.08)`,
        }}
      >
        {children}
      </span>
      {/* Dither veil: a 2px dot grid, same texture language as the charts. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full opacity-45 mix-blend-overlay"
        style={{
          backgroundImage: 'radial-gradient(oklch(0 0 0 / 55%) 0.5px, transparent 0.6px)',
          backgroundSize: '2px 2px',
        }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full bg-background/10 ring-1 ring-white/10 ring-inset"
      />
    </span>
  )
}

export function PersonAvatar({
  personId,
  size = 'sm',
  clickable = true,
  className,
}: {
  personId: string
  size?: keyof typeof sizes
  clickable?: boolean
  className?: string
}) {
  const { openPerson } = useApp()
  const person = peopleById[personId]

  const face = (
    <MosaicFrame size={size} className={className}>
      <NiceAvatar className="size-full" shape="circle" {...configFor(personId)} />
    </MosaicFrame>
  )

  if (!clickable) return face

  return (
    <button
      type="button"
      title={person ? `${person.name} — ${person.role}` : personId}
      aria-label={person ? `Open ${person.name}` : 'Open person'}
      onClick={() => openPerson(personId)}
      className="rounded-full transition hover:-translate-y-0.5 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {face}
    </button>
  )
}

export function AvatarStack({
  personIds,
  max = 6,
  size = 'sm',
}: {
  personIds: string[]
  max?: number
  size?: keyof typeof sizes
}) {
  const shown = personIds.slice(0, max)
  const rest = personIds.length - shown.length
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((id) => (
          <PersonAvatar key={id} personId={id} size={size} />
        ))}
      </div>
      {rest > 0 && (
        <span className="ml-3 font-mono text-[11px] text-muted-foreground">+{rest} more</span>
      )}
    </div>
  )
}
