import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { accessLabel, accessReason, sourceDetail, sourceLabel } from '@/demo/access'
import type { Skill, SkillTier } from '@/demo/types'

const tones = {
  default: 'border-hairline bg-surface-2 text-muted-foreground',
  accent: 'border-primary/30 bg-primary/10 text-primary',
  info: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
  warn: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  danger: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  muted: 'border-transparent bg-white/5 text-muted-foreground',
}

export function Badge({
  children,
  tone = 'default',
  title,
  className,
}: {
  children: ReactNode
  tone?: keyof typeof tones
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function TierBadge({ tier }: { tier: SkillTier }) {
  if (tier === 'official') return <Badge tone="accent">official</Badge>
  if (tier === 'experimental') return <Badge tone="warn">beta</Badge>
  return <Badge tone="muted">recommended</Badge>
}

/** Where it came from: pulled off the public web, or written in-house. */
export function SourceBadge({ skill }: { skill: Skill }) {
  const isPublic = skill.source.kind === 'public'
  return (
    <Badge tone={isPublic ? 'info' : 'muted'} title={sourceDetail(skill)}>
      <span aria-hidden="true">{isPublic ? '⇱' : '⌂'}</span>
      {sourceLabel(skill)}
    </Badge>
  )
}

/** Who is allowed to install it. Restricted scopes read louder than company-wide. */
export function AccessBadge({ skill }: { skill: Skill }) {
  const scope = skill.access.scope
  const tone = scope === 'board' ? 'danger' : scope === 'company' ? 'muted' : 'warn'
  return (
    <Badge tone={tone} title={accessReason(skill)}>
      {scope !== 'company' && <span aria-hidden="true">🔒</span>}
      {accessLabel(skill)}
    </Badge>
  )
}

export function SkillTags({ skill, showTier = true }: { skill: Skill; showTier?: boolean }) {
  return (
    <>
      {showTier && <TierBadge tier={skill.tier} />}
      <SourceBadge skill={skill} />
      <AccessBadge skill={skill} />
    </>
  )
}
