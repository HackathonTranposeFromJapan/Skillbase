import { ChartBlock } from '@/components/charts/ChartBlock'
import { SkillCard } from '@/components/SkillCard'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PersonAvatar } from '@/components/ui/PersonAvatar'
import { personSkillSpark, personUsageSeries } from '@/demo/analytics'
import { peopleById } from '@/demo/people'
import { skillsById } from '@/demo/skills'
import type { ChartSpec } from '@/lib/ai/types'
import { useApp } from '@/state/app-state'

export function PersonModal({
  personId,
  depth,
  onClose,
}: {
  personId: string
  depth: number
  onClose: () => void
}) {
  const { userId } = useApp()
  const person = peopleById[personId]
  if (!person) return null

  const usage = personUsageSeries(personId)
  const totalRuns = usage.data.reduce((sum, d) => sum + d.runs, 0)
  const favourite = usage.data[0]
  const hoursSaved = Math.round(
    usage.data.reduce((sum, d) => sum + d.runs * skillsById[d.id].minutesSaved, 0) / 60,
  )

  const usageSpec: ChartSpec = {
    kind: 'pie',
    title: 'Usage',
    caption: `${totalRuns} runs in the last 30 days`,
    data: usage.data.map((d) => ({ skill: d.skill, runs: d.runs })),
    dataKey: 'runs',
    nameKey: 'skill',
    config: usage.config,
    height: 220,
  }

  return (
    <Modal onClose={onClose} depth={depth}>
      <header className="flex flex-wrap items-center gap-4 border-hairline border-b px-5 py-4 pr-16">
        <PersonAvatar personId={personId} size="xl" clickable={false} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium text-[18px]">{person.name}</h2>
            {personId === userId && <Badge tone="accent">you</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{person.role}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="muted">{person.department}</Badge>
            <Badge>{person.collection.length} skills</Badge>
            <Badge>{totalRuns} runs / 30d</Badge>
            <Badge tone="success">~{hoursSaved}h saved</Badge>
          </p>
        </div>
      </header>

      <div className="space-y-4 px-5 py-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartBlock spec={usageSpec} />
          <div className="rounded-lg border border-hairline bg-surface-2/40 p-3">
            <p className="label">Signal</p>
            <ul className="mt-2 space-y-2 text-[12.5px] text-foreground/85 leading-relaxed">
              <li>
                Runs <span className="text-foreground">{favourite?.skill}</span> more than anything
                else — {Math.round(((favourite?.runs ?? 0) / Math.max(1, totalRuns)) * 100)}% of all
                activity.
              </li>
              <li>
                Collection leans <span className="text-foreground">{person.department}</span>, with{' '}
                {person.collection.filter((id) => skillsById[id].category !== person.department).length}{' '}
                skills borrowed from other orgs.
              </li>
              <li>
                Installed but idle:{' '}
                <span className="text-foreground">
                  {usage.data.filter((d) => d.runs < 12).length}
                </span>{' '}
                skills under 12 runs this month.
              </li>
            </ul>
          </div>
        </div>

        <section>
          <h3 className="label mb-2">Collection · {person.collection.length}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {usage.data.map((entry) => (
              <SkillCard
                key={entry.id}
                skillId={entry.id}
                variant="usage"
                spark={personSkillSpark(personId, entry.id)}
                stat={`${entry.runs} runs · ${Math.round((entry.runs / Math.max(1, totalRuns)) * 100)}% of activity`}
              />
            ))}
          </div>
        </section>
      </div>
    </Modal>
  )
}
