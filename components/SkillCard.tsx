import type { MouseEvent } from 'react'
import { Sparkline } from '@/components/dither-kit'
import { Badge, SkillTags } from '@/components/ui/Badge'
import { AvatarStack } from '@/components/ui/PersonAvatar'
import { accessReason, hasAccess } from '@/demo/access'
import { growthRate, runsLastWeek } from '@/demo/analytics'
import { peopleById } from '@/demo/people'
import { skillsById } from '@/demo/skills'
import { cn } from '@/lib/utils'
import { useApp } from '@/state/app-state'

export function InstallButton({
  skillId,
  size = 'sm',
}: {
  skillId: string
  size?: 'sm' | 'md'
}) {
  const { isInstalled, install, uninstall, userId } = useApp()
  const skill = skillsById[skillId]
  const installed = isInstalled(skillId)
  const allowed = hasAccess(skill, peopleById[userId])

  const onClick = (e: MouseEvent) => {
    e.stopPropagation()
    if (!allowed) return
    if (installed) uninstall(skillId)
    else install(skillId)
  }

  const label = installed ? '✓ Installed' : allowed ? 'Install' : '🔒 Locked'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={installed || !allowed}
      title={
        !allowed
          ? accessReason(skill)
          : installed
            ? 'Already in your collection'
            : `npx skilldrop install ${skill.command}`
      }
      className={cn(
        'shrink-0 rounded-md border font-mono uppercase tracking-wider transition',
        size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3.5 py-1.5 text-[11px]',
        !allowed && 'cursor-not-allowed border-hairline bg-transparent text-muted-foreground/70',
        allowed &&
          installed &&
          'cursor-default border-hairline bg-transparent text-muted-foreground',
        allowed &&
          !installed &&
          'border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 active:translate-y-px',
      )}
    >
      {label}
    </button>
  )
}

export function SkillCard({
  skillId,
  reason,
  variant = 'default',
  spark,
  stat,
  className,
}: {
  skillId: string
  /** Why this surfaced. Recommendations without a reason do not get trusted. */
  reason?: string
  /** `usage` strips everything but the name, one stat line, and the trend. */
  variant?: 'default' | 'usage'
  spark?: number[]
  stat?: string
  className?: string
}) {
  const { openSkill } = useApp()
  const skill = skillsById[skillId]
  if (!skill) return null

  const growth = growthRate(skill)

  const open = () => openSkill(skillId)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }

  if (variant === 'usage') {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={onKeyDown}
        className={cn(
          'group flex cursor-pointer flex-col gap-2 rounded-lg border border-hairline bg-surface-2/50 p-3.5 transition',
          'hover:border-primary/35 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <h4 className="truncate font-medium text-[14px] group-hover:text-primary">
            {skill.name}
          </h4>
          <InstallButton skillId={skillId} />
        </div>
        {stat && <p className="font-mono text-[11px] text-muted-foreground">{stat}</p>}
        {spark && spark.length > 0 && (
          <div className="h-14 w-full">
            <Sparkline data={spark} color={skill.color} className="h-full w-full" />
          </div>
        )}
      </div>
    )
  }

  return (
    // A div, not a button: the card contains its own buttons and avatar buttons.
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKeyDown}
      className={cn(
        'group flex w-full cursor-pointer flex-col gap-3 rounded-lg border border-hairline bg-surface-2/50 p-3.5 text-left transition',
        'hover:border-primary/35 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium text-foreground text-sm group-hover:text-primary">
              {skill.name}
            </h4>
            <Badge>v{skill.version}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SkillTags skill={skill} />
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground leading-relaxed">
            {skill.tagline}
          </p>
        </div>
        <InstallButton skillId={skillId} />
      </div>

      {reason && (
        <p className="flex items-start gap-2 rounded-md border border-primary/15 bg-primary/[0.07] px-2.5 py-1.5 text-[11.5px] text-primary/90">
          <span aria-hidden="true" className="mt-px font-mono text-[10px] opacity-70">
            WHY
          </span>
          <span className="text-foreground/85">{reason}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-hairline border-t pt-2.5 font-mono text-[10.5px] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span>{skill.installs} installs</span>
          <span className="text-white/15">|</span>
          <span>{runsLastWeek(skill)} runs/wk</span>
          <span className="text-white/15">|</span>
          <span className={growth >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}>
            {growth >= 0 ? '▲' : '▼'} {Math.abs(Math.round(growth * 100))}%
          </span>
        </span>
        <AvatarStack personIds={skill.usedBy} max={4} size="xs" />
      </div>
    </div>
  )
}
