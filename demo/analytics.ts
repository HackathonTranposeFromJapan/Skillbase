import { people } from './people'
import { skills, skillsById } from './skills'
import type { Department, Skill } from './types'
import type { ChartConfig, DitherColor } from '@/components/dither-kit'

export const WEEK_LABELS = ['W-11', 'W-10', 'W-9', 'W-8', 'W-7', 'W-6', 'W-5', 'W-4', 'W-3', 'W-2', 'W-1', 'Now']

/** Headcount per department — the denominator for adoption rates. */
export const departmentSize: Record<Department, number> = {
  Design: 18,
  Engineering: 54,
  Product: 16,
  Legal: 6,
  Sales: 22,
  Ops: 9,
}

export const departments = Object.keys(departmentSize) as Department[]

export const totalRuns = (skill: Skill) => skill.weeklyRuns.reduce((a, b) => a + b, 0)

export const runsLastWeek = (skill: Skill) => skill.weeklyRuns[skill.weeklyRuns.length - 1]

export const topSkills = (n: number): Skill[] =>
  [...skills].sort((a, b) => runsLastWeek(b) - runsLastWeek(a)).slice(0, n)

export const trendingSkills = (n: number): Skill[] =>
  [...skills]
    .map((s) => {
      const recent = s.weeklyRuns.slice(-4).reduce((a, b) => a + b, 0)
      const prior = s.weeklyRuns.slice(-8, -4).reduce((a, b) => a + b, 0)
      return { skill: s, growth: prior === 0 ? 0 : (recent - prior) / prior }
    })
    .sort((a, b) => b.growth - a.growth)
    .slice(0, n)
    .map((r) => r.skill)

export const growthRate = (skill: Skill): number => {
  const recent = skill.weeklyRuns.slice(-4).reduce((a, b) => a + b, 0)
  const prior = skill.weeklyRuns.slice(-8, -4).reduce((a, b) => a + b, 0)
  return prior === 0 ? 0 : (recent - prior) / prior
}

/** Company-wide runs per week. */
export const weeklyTotals = WEEK_LABELS.map((week, i) => ({
  week,
  runs: skills.reduce((sum, s) => sum + s.weeklyRuns[i], 0),
}))

/** Activity of the three busiest skills, week by week. */
export function activitySeries() {
  const top = topSkills(3)
  const data = WEEK_LABELS.map((week, i) => {
    const row: Record<string, string | number> = { week }
    for (const s of top) row[s.id] = s.weeklyRuns[i]
    return row
  })
  const config: ChartConfig = Object.fromEntries(
    top.map((s) => [s.id, { label: s.name, color: s.color }]),
  )
  return { data, config, skills: top }
}

/** First word of a skill name, capped so axis ticks never collide. */
export function shortLabel(name: string, max = 8): string {
  const first = name.split(' ')[0]
  return first.length > max ? `${first.slice(0, max - 1)}.` : first
}

/** Runs last week for the busiest skills — the leaderboard. */
export function leaderboardSeries(n = 7) {
  const data = topSkills(n).map((s) => ({
    skill: shortLabel(s.name),
    id: s.id,
    runs: runsLastWeek(s),
  }))
  const config: ChartConfig = { runs: { label: 'Runs last week', color: 'purple' } }
  return { data, config }
}

/** How often two skills show up in the same person's collection. */
export function pairings(n = 6) {
  const counts = new Map<string, number>()
  for (const person of people) {
    const ids = [...person.collection].sort()
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|${ids[j]}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split('|')
      return { a, b, count, aName: skillsById[a].name, bName: skillsById[b].name }
    })
    .sort((x, y) => y.count - x.count || x.aName.localeCompare(y.aName))
    .slice(0, n)
}

/** Bar-chart shape for the pairing panel. */
export function pairingSeries(n = 6) {
  const data = pairings(n).map((p) => ({
    pair: `${shortLabel(p.aName, 6)}+${shortLabel(p.bName, 6)}`,
    people: p.count,
    a: p.a,
    b: p.b,
  }))
  const config: ChartConfig = { people: { label: 'People running both', color: 'blue' } }
  return { data, config }
}

/**
 * Adoption rate per department. The 14 sampled people are too few to divide
 * directly, so company-wide install rate is weighted by how close the
 * department sits to the skill's home team.
 */
export function adoptionSeries(skillIds = ['pr-review', 'copy-tone', 'design-polish']) {
  const seats = Object.values(departmentSize).reduce((a, b) => a + b, 0)
  const data = departments.map((dept) => {
    const row: Record<string, string | number> = { dept }
    for (const id of skillIds) {
      const skill = skillsById[id]
      const base = skill.installs / seats
      const affinity =
        dept === skill.ownerTeam ? 1.7 : (dept as string) === skill.category ? 1.4 : 0.55
      row[id] = Math.min(96, Math.max(6, Math.round(base * affinity * 100)))
    }
    return row
  })
  const config: ChartConfig = Object.fromEntries(
    skillIds.map((id) => [id, { label: skillsById[id].name, color: skillsById[id].color }]),
  )
  return { data, config }
}

const categoryColor: Record<string, DitherColor> = {
  Engineering: 'purple',
  Design: 'pink',
  Product: 'blue',
  Sales: 'green',
  Legal: 'red',
  Ops: 'orange',
}

/** Share of all runs by skill category. */
export function categorySeries() {
  const totals = new Map<string, number>()
  for (const s of skills) {
    totals.set(s.category, (totals.get(s.category) ?? 0) + totalRuns(s))
  }
  const data = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, runs]) => ({ category, runs }))
  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.category, { label: d.category, color: categoryColor[d.category] ?? 'grey' }]),
  )
  return { data, config }
}

/** Retention after install — the honest measure of whether a skill stuck. */
export function retentionSeries(skillIds = ['pr-review', 'copy-tone', 'a11y-audit', 'api-designer']) {
  const days = ['D1', 'D7', 'D14', 'D30']
  const data = days.map((day, i) => {
    const row: Record<string, string | number> = { day }
    for (const id of skillIds) row[id] = skillsById[id].retention[i]
    return row
  })
  const config: ChartConfig = Object.fromEntries(
    skillIds.map((id) => [id, { label: skillsById[id].name, color: skillsById[id].color }]),
  )
  return { data, config }
}

/** Minutes saved per week, company-wide, from self-reported per-run savings. */
export const hoursSavedWeekly = WEEK_LABELS.map((week, i) => ({
  week,
  hours: Math.round(skills.reduce((sum, s) => sum + s.weeklyRuns[i] * s.minutesSaved, 0) / 60),
}))

export const companyStats = {
  runsThisWeek: weeklyTotals[weeklyTotals.length - 1].runs,
  runsLastWeek: weeklyTotals[weeklyTotals.length - 2].runs,
  skillCount: skills.length,
  activeUsers: 187,
  seats: Object.values(departmentSize).reduce((a, b) => a + b, 0),
  hoursSaved: hoursSavedWeekly[hoursSavedWeekly.length - 1].hours,
}

/** Usage split for one person, ready for the pie chart. */
export function personUsageSeries(personId: string) {
  const person = people.find((p) => p.id === personId)
  if (!person) return { data: [], config: {} as ChartConfig }
  const data = person.collection
    .map((id) => ({ skill: skillsById[id].name, runs: person.runsBySkill[id] ?? 0, id }))
    .sort((a, b) => b.runs - a.runs)
  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.skill, { label: d.skill, color: skillsById[d.id].color }]),
  )
  return { data, config }
}

/** Weekly runs for one skill, scaled down to one person's share. */
export function personSkillSpark(personId: string, skillId: string): number[] {
  const person = people.find((p) => p.id === personId)
  const skill = skillsById[skillId]
  if (!person || !skill) return []
  const share = (person.runsBySkill[skillId] ?? 0) / Math.max(1, totalRuns(skill) / 12)
  return skill.weeklyRuns.map((v) => Math.max(1, Math.round(v * share * 0.35)))
}

export function usersOf(skillId: string) {
  return people.filter((p) => p.collection.includes(skillId))
}

/** "Often used with" for a single skill, ranked. */
export function relatedSkills(skillId: string, n = 4) {
  const counts = new Map<string, number>()
  for (const person of people) {
    if (!person.collection.includes(skillId)) continue
    for (const other of person.collection) {
      if (other === skillId) continue
      counts.set(other, (counts.get(other) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || skillsById[a[0]].name.localeCompare(skillsById[b[0]].name))
    .slice(0, n)
    .map(([id, count]) => ({ skill: skillsById[id], count }))
}
