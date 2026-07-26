import type { ReactNode } from 'react'
import { ChartBlock } from '@/components/charts/ChartBlock'
import { InstallButton } from '@/components/SkillCard'
import { Badge, SkillTags } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PersonAvatar } from '@/components/ui/PersonAvatar'
import { accessReason, sourceDetail } from '@/demo/access'
import { WEEK_LABELS, growthRate, relatedSkills, runsLastWeek, usersOf } from '@/demo/analytics'
import { peopleById } from '@/demo/people'
import { skillsById } from '@/demo/skills'
import type { ChartSpec } from '@/lib/ai/types'
import { useApp } from '@/state/app-state'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="label mb-2.5">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-[11.5px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[12.5px] text-foreground">
        {value}
      </dd>
    </div>
  )
}

export function SkillModal({
  skillId,
  depth,
  onClose,
}: {
  skillId: string
  depth: number
  onClose: () => void
}) {
  const { openSkill } = useApp()
  const skill = skillsById[skillId]
  if (!skill) return null

  const users = usersOf(skillId)
  const related = relatedSkills(skillId, 4)
  const owner = peopleById[skill.owner]
  const growth = growthRate(skill)

  const runsSpec: ChartSpec = {
    kind: 'area',
    title: 'Runs per week',
    caption: '12 weeks',
    xKey: 'week',
    data: WEEK_LABELS.map((week, i) => ({ week, runs: skill.weeklyRuns[i] })),
    config: { runs: { label: skill.name, color: skill.color } },
    series: ['runs'],
    height: 165,
  }

  const retentionSpec: ChartSpec = {
    kind: 'line',
    title: 'Retention after install',
    caption: 'D1 → D30',
    xKey: 'day',
    data: ['D1', 'D7', 'D14', 'D30'].map((day, i) => ({ day, retained: skill.retention[i] })),
    config: { retained: { label: '% retained', color: 'green' } },
    series: ['retained'],
    height: 165,
  }

  return (
    <Modal onClose={onClose} depth={depth} className="max-w-5xl">
      <header className="border-hairline border-b px-6 py-5 pr-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium text-[19px] tracking-tight">{skill.name}</h2>
              <Badge>v{skill.version}</Badge>
              <Badge tone="muted">{skill.category}</Badge>
            </div>
            <p className="mt-1.5 max-w-xl text-[13px] text-muted-foreground leading-relaxed">
              {skill.tagline}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <SkillTags skill={skill} />
            </div>
          </div>
          <InstallButton skillId={skillId} size="md" />
        </div>
      </header>

      <div className="grid lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6 border-hairline px-6 py-5 lg:border-r">
          <p className="text-[13.5px] text-foreground/85 leading-relaxed">{skill.description}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <ChartBlock spec={runsSpec} />
            <ChartBlock spec={retentionSpec} />
          </div>

          <Section title="Often used with">
            <ul className="divide-y divide-white/[0.06] border-hairline border-y">
              {related.map(({ skill: other, count }) => (
                <li key={other.id}>
                  <button
                    type="button"
                    onClick={() => openSkill(other.id)}
                    className="flex w-full items-center justify-between gap-4 py-2.5 text-left transition hover:text-primary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px]">{other.name}</span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">
                        {other.tagline}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {count} shared
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Update history">
            <ol className="space-y-3">
              {skill.history.map((release) => (
                <li key={release.version} className="flex gap-3">
                  <span className="w-14 shrink-0 font-mono text-[12px] text-foreground">
                    v{release.version}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] text-foreground/80 leading-relaxed">
                      {release.note}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">
                      {release.date} · {peopleById[release.author]?.name}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="space-y-5 bg-surface-2/25 px-6 py-5">
          <dl className="divide-y divide-white/[0.06]">
            <Row label="Installs" value={skill.installs} />
            <Row label="Active users" value={skill.activeUsers} />
            <Row label="Runs last week" value={runsLastWeek(skill)} />
            <Row
              label="Month over month"
              value={
                <span className={growth >= 0 ? 'text-emerald-400/90' : 'text-red-400/90'}>
                  {growth >= 0 ? '+' : ''}
                  {Math.round(growth * 100)}%
                </span>
              }
            />
            <Row label="D30 retention" value={`${skill.retention[3]}%`} />
            <Row label="Saved per run" value={`${skill.minutesSaved} min`} />
          </dl>

          <dl className="divide-y divide-white/[0.06] border-hairline border-t pt-1">
            <Row
              label="Owner"
              value={
                <span className="flex items-center justify-end gap-1.5">
                  <PersonAvatar personId={skill.owner} size="xs" />
                  {owner?.name}
                </span>
              }
            />
            <Row label="Team" value={skill.ownerTeam} />
            <Row label="Updated" value={skill.updatedAt} />
          </dl>

          <div className="space-y-2">
            <code className="block overflow-x-auto rounded-md border border-hairline bg-background/60 px-2.5 py-2 font-mono text-[11.5px] text-emerald-300/90">
              npx skilldrop install {skill.command}
            </code>
            <p className="text-[11.5px] text-muted-foreground leading-relaxed">
              {sourceDetail(skill)}. {accessReason(skill)}
            </p>
          </div>

          <Section title={`Used by · ${users.length}`}>
            <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {users.map((person) => (
                <li key={person.id} className="flex items-center gap-2">
                  <PersonAvatar personId={person.id} size="xs" />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[12px]">{person.name}</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {person.role}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </Modal>
  )
}
