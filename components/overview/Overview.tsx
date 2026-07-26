import { useMemo } from 'react'
import { ChartBlock } from '@/components/charts/ChartBlock'
import { Panel } from '@/components/ui/Panel'
import { PersonAvatar } from '@/components/ui/PersonAvatar'
import { Badge } from '@/components/ui/Badge'
import { InstallButton } from '@/components/SkillCard'
import {
  adoptionSeries,
  categorySeries,
  companyStats,
  growthRate,
  hoursSavedWeekly,
  leaderboardSeries,
  pairingSeries,
  pairings,
  retentionSeries,
  runsLastWeek,
  topSkills,
  trendingSkills,
} from '@/demo/analytics'
import { people } from '@/demo/people'
import { skillsById } from '@/demo/skills'
import type { ChartSpec } from '@/lib/ai/types'
import { useApp } from '@/state/app-state'

export function Overview() {
  const { openSkill } = useApp()

  const specs = useMemo(() => {
    const leaderboard = leaderboardSeries(7)
    const pairs = pairingSeries(6)
    const adoption = adoptionSeries()
    const category = categorySeries()
    const retention = retentionSeries()

    const leaderboardSpec: ChartSpec = {
      kind: 'bar',
      title: 'Most used skills',
      caption: 'Runs in the last 7 days',
      xKey: 'skill',
      data: leaderboard.data,
      config: leaderboard.config,
      series: ['runs'],
      height: 230,
    }
    const pairSpec: ChartSpec = {
      kind: 'bar',
      title: 'Skills used together',
      caption: 'People running both',
      xKey: 'pair',
      data: pairs.data,
      config: pairs.config,
      series: ['people'],
      height: 210,
    }
    const adoptionSpec: ChartSpec = {
      kind: 'radar',
      title: 'Adoption by department',
      caption: '% of team with the skill installed',
      nameKey: 'dept',
      data: adoption.data,
      config: adoption.config,
      series: Object.keys(adoption.config),
      height: 260,
    }
    const categorySpec: ChartSpec = {
      kind: 'pie',
      title: 'Runs by category',
      data: category.data,
      dataKey: 'runs',
      nameKey: 'category',
      config: category.config,
      height: 210,
    }
    const retentionSpec: ChartSpec = {
      kind: 'line',
      title: 'Retention after install',
      caption: 'Still running the skill, by day',
      xKey: 'day',
      data: retention.data,
      config: retention.config,
      series: Object.keys(retention.config),
      height: 210,
    }
    const savedSpec: ChartSpec = {
      kind: 'area',
      title: 'Hours saved per week',
      caption: 'Self-reported, company-wide',
      xKey: 'week',
      data: hoursSavedWeekly,
      config: { hours: { label: 'Hours', color: 'green' } },
      series: ['hours'],
      height: 260,
    }

    return {
      leaderboard: leaderboardSpec,
      pairs: pairSpec,
      adoption: adoptionSpec,
      category: categorySpec,
      retention: retentionSpec,
      saved: savedSpec,
    }
  }, [])

  const top = topSkills(6)
  const trending = trendingSkills(4)
  const pairList = pairings(5)

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-medium text-[15px]">Company overview</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {companyStats.skillCount} skills across {companyStats.seats} seats. Last sync 4 min ago.
          </p>
        </div>
      </div>

      <Panel title="People" kicker="Click anyone to see their collection">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="flex flex-1 flex-wrap gap-2.5">
            {people.map((person) => (
              <PersonAvatar key={person.id} personId={person.id} size="md" />
            ))}
          </div>
          <div className="grid gap-3 border-hairline border-t pt-4 md:grid-cols-3 xl:w-[390px] xl:shrink-0 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-5">
            <p className="min-w-0 font-mono text-[10.5px] text-muted-foreground">
              <span className="block">Most installed</span>
              <span className="mt-1 block truncate text-foreground">
                {skillsById['copy-tone'].name} · 118
              </span>
            </p>
            <p className="min-w-0 font-mono text-[10.5px] text-muted-foreground">
              <span className="block">Highest retention</span>
              <span className="mt-1 block truncate text-foreground">
                {skillsById['pr-review'].name} · 86% at D30
              </span>
            </p>
            <p className="min-w-0 font-mono text-[10.5px] text-muted-foreground">
              <span className="block">Lowest retention</span>
              <span className="mt-1 block truncate text-foreground">
                {skillsById['vendor-audit'].name} · 36% at D30
              </span>
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartBlock spec={specs.leaderboard} className="lg:col-span-2" />
        <Panel title="Leaderboard" kicker="Runs in the last 7 days" bodyClassName="p-0">
          <ol className="divide-y divide-white/[0.06]">
            {top.map((skill, i) => (
              <li key={skill.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-4 font-mono text-[11px] text-muted-foreground">{i + 1}</span>
                <button
                  type="button"
                  onClick={() => openSkill(skill.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[13px] hover:text-primary">{skill.name}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {runsLastWeek(skill)} runs
                  </span>
                </button>
                <InstallButton skillId={skill.id} />
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartBlock spec={specs.pairs} className="lg:col-span-2" />
        <Panel title="Combination insight" kicker="What installing one predicts about the next">
          <ul className="space-y-2">
            {pairList.map((pair) => (
              <li
                key={`${pair.a}-${pair.b}`}
                className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface-2/40 px-3 py-2"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12.5px]">
                  <button
                    type="button"
                    onClick={() => openSkill(pair.a)}
                    className="truncate hover:text-primary"
                  >
                    {pair.aName}
                  </button>
                  <span className="font-mono text-[10px] text-muted-foreground">+</span>
                  <button
                    type="button"
                    onClick={() => openSkill(pair.b)}
                    className="truncate hover:text-primary"
                  >
                    {pair.bName}
                  </button>
                </span>
                <Badge tone={pair.count >= 4 ? 'accent' : 'default'}>{pair.count} people</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11.5px] text-muted-foreground leading-relaxed">
            Pairs are computed from installed collections, not co-runs. A strong pair is the best
            signal for what to recommend next.
          </p>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <ChartBlock spec={specs.adoption} />
        <ChartBlock spec={specs.retention} />
        <ChartBlock spec={specs.category} />
      </div>

      {/* items-start so the chart keeps its own height instead of stretching to
          match the two stacked panels beside it. */}
      <div className="grid items-start gap-3 lg:grid-cols-3">
        <ChartBlock spec={specs.saved} className="lg:col-span-2" />
        <div className="grid gap-3">
          <Panel title="Trending this month" kicker="Fastest growing by run count">
            <ul className="space-y-2.5">
              {trending.map((skill) => (
                <li key={skill.id}>
                  <button
                    type="button"
                    onClick={() => openSkill(skill.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left transition hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-foreground">{skill.name}</span>
                      <span className="font-mono text-[10.5px] text-muted-foreground">
                        {skill.category} · {skill.activeUsers} active
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-emerald-400/90">
                      +{Math.round(growthRate(skill) * 100)}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}
