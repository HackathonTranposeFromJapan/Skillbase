import type { DitherColor } from '@/components/dither-kit'

export type Department = 'Design' | 'Engineering' | 'Product' | 'Legal' | 'Sales' | 'Ops'

export type SkillCategory =
  | 'Design'
  | 'Engineering'
  | 'Product'
  | 'Legal'
  | 'Sales'
  | 'Ops'

export type SkillTier = 'official' | 'recommended' | 'experimental'

/** Where the skill came from: pulled off the public web, or written in-house. */
export type SkillSource =
  | { kind: 'internal'; team: Department }
  | { kind: 'public'; origin: string }

/** Who is allowed to install and run it. */
export type SkillAccess =
  | { scope: 'company' }
  | { scope: 'department'; department: Department }
  | { scope: 'managers' }
  | { scope: 'board' }

export type SkillRelease = {
  version: string
  date: string
  note: string
  author: string
}

export type Skill = {
  id: string
  name: string
  command: string
  tagline: string
  description: string
  category: SkillCategory
  tier: SkillTier
  source: SkillSource
  access: SkillAccess
  version: string
  updatedAt: string
  owner: string
  ownerTeam: Department
  installs: number
  activeUsers: number
  /** Runs per week for the last 12 weeks. */
  weeklyRuns: number[]
  /** Retention curve after install: day 1 / 7 / 14 / 30, in percent. */
  retention: number[]
  /** Minutes saved per run, self-reported. */
  minutesSaved: number
  usedBy: string[]
  history: SkillRelease[]
  color: DitherColor
}

export type Person = {
  id: string
  name: string
  role: string
  department: Department
  /** Skill ids in this person's collection. */
  collection: string[]
  /** Runs per skill id over the last 30 days. */
  runsBySkill: Record<string, number>
}
