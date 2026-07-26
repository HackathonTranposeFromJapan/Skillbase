import {
  WEEK_LABELS,
  growthRate,
  relatedSkills,
  runsLastWeek,
  shortLabel,
  topSkills,
  usersOf,
} from '@/demo/analytics'
import { people, peopleById } from '@/demo/people'
import { skills, skillsById } from '@/demo/skills'
import type { Department } from '@/demo/types'
import type { AgentContext, ChartSpec, ChatBlock, SkillbaseAgent } from './types'
import type { ChartConfig } from '@/components/dither-kit'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The three canned prompts on the launcher. Kept here so the UI and the agent agree. */
export const demoPrompts = [
  'I need a skill that makes my designs cleaner',
  'What is the essential skill set the engineering team installs?',
  'How is Design Polish actually being used?',
]

function weeklyChart(skillIds: string[], title: string, caption?: string): ChartSpec {
  const data = WEEK_LABELS.map((week, i) => {
    const row: Record<string, string | number> = { week }
    for (const id of skillIds) row[id] = skillsById[id].weeklyRuns[i]
    return row
  })
  const config: ChartConfig = Object.fromEntries(
    skillIds.map((id) => [id, { label: skillsById[id].name, color: skillsById[id].color }]),
  )
  return { kind: 'area', title, caption, xKey: 'week', data, config, series: skillIds, height: 200 }
}

function installRateChart(dept: Department, skillIds: string[]): ChartSpec {
  const headcount = Math.max(1, people.filter((p) => p.department === dept).length)
  const data = skillIds.map((id) => ({
    skill: shortLabel(skillsById[id].name),
    rate: Math.round(
      (people.filter((p) => p.department === dept && p.collection.includes(id)).length /
        headcount) *
        100,
    ),
  }))
  return {
    kind: 'bar',
    title: `Install rate in ${dept}`,
    caption: 'Share of the team with the skill in their collection.',
    xKey: 'skill',
    data,
    config: { rate: { label: '% of team', color: 'purple' } },
    series: ['rate'],
    height: 190,
  }
}

function departmentSplitChart(skillId: string): ChartSpec {
  const counts = new Map<string, number>()
  for (const person of usersOf(skillId)) {
    counts.set(person.department, (counts.get(person.department) ?? 0) + (person.runsBySkill[skillId] ?? 0))
  }
  const palette = ['purple', 'blue', 'green', 'orange', 'pink', 'red'] as const
  const data = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([dept, runs]) => ({ dept, runs }))
  const config: ChartConfig = Object.fromEntries(
    data.map((d, i) => [d.dept, { label: d.dept, color: palette[i % palette.length] }]),
  )
  return {
    kind: 'pie',
    title: 'Runs by department',
    data,
    dataKey: 'runs',
    nameKey: 'dept',
    config,
    height: 200,
  }
}

function pct(n: number): string {
  return `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`
}

/** Cheap keyword ranking. A real backend would do this with embeddings. */
function search(prompt: string, limit: number) {
  const words = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
  const stop = new Set(['the', 'and', 'for', 'that', 'with', 'skill', 'skills', 'what', 'how', 'are', 'you', 'can', 'find', 'need', 'looking', 'about', 'which', 'does', 'this', 'have', 'give'])
  const terms = words.filter((w) => !stop.has(w))
  const scored = skills.map((s) => {
    const haystack = `${s.name} ${s.command} ${s.tagline} ${s.description} ${s.category}`.toLowerCase()
    let score = 0
    for (const t of terms) {
      if (s.name.toLowerCase().includes(t)) score += 6
      else if (s.command.includes(t)) score += 5
      else if (s.tagline.toLowerCase().includes(t)) score += 3
      else if (haystack.includes(t)) score += 1
    }
    return { skill: s, score }
  })
  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || runsLastWeek(b.skill) - runsLastWeek(a.skill))
    .slice(0, limit)
    .map((r) => r.skill)
}

function reasonFor(skillId: string, ctx: AgentContext): string {
  const me = peopleById[ctx.userId]
  const users = usersOf(skillId)
  const sameTeam = users.filter((p) => p.department === me?.department && p.id !== ctx.userId)
  if (sameTeam.length > 0) {
    return `${sameTeam.length} ${sameTeam.length === 1 ? 'person' : 'people'} in ${me.department} run this weekly`
  }
  const skill = skillsById[skillId]
  const growth = growthRate(skill)
  if (growth > 0.15) return `Usage is up ${pct(growth)} across the company this month`
  return `${skill.activeUsers} active users company-wide, ${skill.retention[3]}% still running it after 30 days`
}

function designAnswer(ctx: AgentContext): ChatBlock[] {
  const picks = ['design-polish', 'figma-qa', 'visual-hierarchy', 'brand-check']
  return [
    {
      type: 'text',
      markdown: [
        'Four skills in the library cover design polish. Ranked by how much the **Design** org actually runs them, not by how they describe themselves.',
      ].join('\n'),
    },
    {
      type: 'skills',
      layout: 'row',
      title: 'Design polish set · 4 skills',
      installAll: true,
      items: [
        { skillId: 'design-polish', reason: reasonFor('design-polish', ctx) },
        { skillId: 'figma-qa', reason: 'Mina and Dana run this on every handoff' },
        { skillId: 'visual-hierarchy', reason: 'Pairs with Design Polish in 9 of 12 collections' },
        { skillId: 'brand-check', reason: 'Owned by Brand, required before anything external ships' },
      ],
    },
    {
      type: 'chart',
      spec: weeklyChart(
        ['design-polish', 'figma-qa'],
        'Weekly runs',
        'Design Polish overtook Figma QA six weeks ago.',
      ),
    },
    {
      type: 'text',
      markdown:
        'Start with **Design Polish**. It is the only one of the four that edits the file instead of handing back a report, and its 30-day retention is 74% — the highest in the Design category.\n\n```bash\nnpx skilldrop install design-polish\n```',
    },
    {
      type: 'people',
      personIds: usersOf(picks[0]).map((p) => p.id).slice(0, 6),
      caption: 'Running Design Polish right now',
    },
  ]
}

function engineeringAnswer(ctx: AgentContext): ChatBlock[] {
  const core = ['pr-review', 'test-gen', 'incident-postmortem', 'migration-planner']
  return [
    {
      type: 'text',
      markdown:
        'Engineering converged on a four-skill baseline. Every engineer with more than a month of tenure has the first two; the last two are role-dependent.',
    },
    {
      type: 'skills',
      layout: 'row',
      title: 'Engineering baseline · 4 skills',
      installAll: true,
      items: [
        { skillId: 'pr-review', reason: '88 of 104 installs are active — the highest retention in the company' },
        { skillId: 'test-gen', reason: 'Installed by 4 of 4 engineers on your neighbouring team' },
        { skillId: 'incident-postmortem', reason: 'Required by the on-call runbook since June' },
        { skillId: 'migration-planner', reason: 'Trending with staff engineers, up 22% this month' },
      ],
    },
    { type: 'chart', spec: installRateChart('Engineering', core) },
    {
      type: 'text',
      markdown:
        'The pairing that matters: **PR Review Agent** plus **Test Generator**. Engineers who run both merge with 41% fewer follow-up fixes than those running review alone.\n\n```bash\nnpx skilldrop install pr-review test-gen\n```',
    },
    {
      type: 'people',
      personIds: people.filter((p) => p.department === 'Engineering').map((p) => p.id),
      caption: `Engineering, ${ctx.installed.includes('pr-review') ? 'including you' : 'your neighbours'}`,
    },
  ]
}

function usageAnswer(skillId: string): ChatBlock[] {
  const skill = skillsById[skillId]
  const related = relatedSkills(skillId, 3)
  const growth = growthRate(skill)
  return [
    {
      type: 'text',
      markdown: `**${skill.name}** \`v${skill.version}\` — ${skill.installs} installs, ${skill.activeUsers} active this week, ${pct(growth)} month over month.`,
    },
    {
      type: 'chart',
      spec: weeklyChart([skillId], 'Runs per week', `Last week: ${runsLastWeek(skill)} runs.`),
    },
    {
      type: 'text',
      markdown: [
        '| Metric | Value |',
        '| --- | --- |',
        `| Active users | ${skill.activeUsers} of ${skill.installs} installs |`,
        `| 30-day retention | ${skill.retention[3]}% |`,
        `| Self-reported saving | ${skill.minutesSaved} min per run |`,
        `| Owner | ${peopleById[skill.owner].name}, ${skill.ownerTeam} |`,
        '',
        `Most runs come from ${skill.ownerTeam}, but adoption is leaking into other orgs — usually right after someone sees the output in a review.`,
      ].join('\n'),
    },
    { type: 'chart', spec: departmentSplitChart(skillId) },
    {
      type: 'text',
      markdown: `People who install it rarely stop at one. It shows up with ${related
        .map((r) => `**${r.skill.name}**`)
        .join(', ')} in most collections.`,
    },
    { type: 'skills', items: [{ skillId, reason: `${skill.retention[3]}% still running it 30 days after install` }] },
  ]
}

function fallbackAnswer(prompt: string, ctx: AgentContext): ChatBlock[] {
  const found = search(prompt, 3)
  if (found.length === 0) {
    const trending = topSkills(3)
    return [
      {
        type: 'text',
        markdown:
          'Nothing in the library matches that closely. Here is what the company is running most this week — or try describing the outcome you want instead of the tool.',
      },
      {
        type: 'skills',
        items: trending.map((s) => ({ skillId: s.id, reason: reasonFor(s.id, ctx) })),
      },
      { type: 'chart', spec: weeklyChart(trending.map((s) => s.id), 'Weekly runs, top 3') },
    ]
  }
  return [
    {
      type: 'text',
      markdown: `${found.length} ${found.length === 1 ? 'skill matches' : 'skills match'} that. Ranked by usage in the last week.`,
    },
    {
      type: 'skills',
      items: found.map((s) => ({ skillId: s.id, reason: reasonFor(s.id, ctx) })),
    },
    { type: 'chart', spec: weeklyChart(found.map((s) => s.id), 'Weekly runs') },
  ]
}

function route(prompt: string, ctx: AgentContext): ChatBlock[] {
  const p = prompt.toLowerCase()
  if (/(design|polish|clean|ui|visual|figma|brand)/.test(p) && !/usage|used|using|adoption/.test(p)) {
    return designAnswer(ctx)
  }
  if (/(engineer|dev|eng team|essential|must have|must-have|baseline|standard set|onboard)/.test(p)) {
    return engineeringAnswer(ctx)
  }
  if (/(usage|used|using|adoption|how is|how many|stats|metrics)/.test(p)) {
    const named = skills.find((s) => p.includes(s.name.toLowerCase()) || p.includes(s.command))
    return usageAnswer(named ? named.id : 'design-polish')
  }
  return fallbackAnswer(prompt, ctx)
}

/**
 * Canned intelligence for the demo. Same interface as a real backend, so
 * swapping in `httpAgent` changes nothing above this file.
 */
export const mockAgent: SkillbaseAgent = {
  id: 'mock',
  async *respond(prompt, ctx) {
    const blocks = route(prompt, ctx)
    await sleep(420)
    for (const block of blocks) {
      yield block
      await sleep(block.type === 'text' ? 260 : 380)
    }
  },
}
