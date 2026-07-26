import type { Person } from './types'

/** Seeded so every demo run shows the same numbers. */
function seededRuns(seed: string, skills: string[], base: number): Record<string, number> {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const out: Record<string, number> = {}
  for (const id of skills) {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    out[id] = base + (Math.abs(h) % (base * 3))
  }
  return out
}

type PersonSeed = Omit<Person, 'runsBySkill'> & { runBase: number }

const seeds: PersonSeed[] = [
  {
    id: 'alex',
    name: 'Alex Rivera',
    role: 'Product Designer',
    department: 'Design',
    collection: ['design-polish', 'figma-qa', 'copy-tone', 'release-notes'],
    runBase: 14,
  },
  {
    id: 'mina',
    name: 'Mina Watanabe',
    role: 'Design Lead',
    department: 'Design',
    collection: ['design-polish', 'figma-qa', 'visual-hierarchy', 'brand-check', 'a11y-audit'],
    runBase: 22,
  },
  {
    id: 'jonas',
    name: 'Jonas Berg',
    role: 'Staff Engineer',
    department: 'Engineering',
    collection: ['pr-review', 'test-gen', 'incident-postmortem', 'migration-planner', 'perf-budget'],
    runBase: 31,
  },
  {
    id: 'priya',
    name: 'Priya Nair',
    role: 'Engineering Manager',
    department: 'Engineering',
    collection: ['pr-review', 'incident-postmortem', 'release-notes', 'perf-budget'],
    runBase: 18,
  },
  {
    id: 'tom',
    name: 'Tom Alvarez',
    role: 'Backend Engineer',
    department: 'Engineering',
    collection: ['pr-review', 'test-gen', 'migration-planner', 'api-designer'],
    runBase: 27,
  },
  {
    id: 'sara',
    name: 'Sara Lindqvist',
    role: 'Frontend Engineer',
    department: 'Engineering',
    collection: ['pr-review', 'test-gen', 'design-polish', 'a11y-audit'],
    runBase: 24,
  },
  {
    id: 'kenji',
    name: 'Kenji Sato',
    role: 'Product Manager',
    department: 'Product',
    collection: ['prd-writer', 'user-interview', 'release-notes', 'roadmap-triage'],
    runBase: 19,
  },
  {
    id: 'noor',
    name: 'Noor Haddad',
    role: 'Group PM',
    department: 'Product',
    collection: ['prd-writer', 'roadmap-triage', 'user-interview', 'copy-tone'],
    runBase: 16,
  },
  {
    id: 'lucia',
    name: 'Lucia Ferrari',
    role: 'Brand Designer',
    department: 'Design',
    collection: ['brand-check', 'design-polish', 'copy-tone'],
    runBase: 12,
  },
  {
    id: 'omar',
    name: 'Omar Diallo',
    role: 'Counsel',
    department: 'Legal',
    collection: ['contract-review', 'policy-diff', 'copy-tone'],
    runBase: 9,
  },
  {
    id: 'hana',
    name: 'Hana Kim',
    role: 'Account Executive',
    department: 'Sales',
    collection: ['sales-email', 'deal-brief', 'copy-tone'],
    runBase: 21,
  },
  {
    id: 'ben',
    name: 'Ben Whitfield',
    role: 'Sales Engineer',
    department: 'Sales',
    collection: ['deal-brief', 'sales-email', 'api-designer'],
    runBase: 13,
  },
  {
    id: 'yuki',
    name: 'Yuki Mori',
    role: 'Ops Analyst',
    department: 'Ops',
    collection: ['vendor-audit', 'policy-diff', 'roadmap-triage'],
    runBase: 11,
  },
  {
    id: 'dana',
    name: 'Dana Okoye',
    role: 'Design Systems Engineer',
    department: 'Design',
    collection: ['design-polish', 'a11y-audit', 'visual-hierarchy', 'test-gen'],
    runBase: 17,
  },
]

export const people: Person[] = seeds.map(({ runBase, ...rest }) => ({
  ...rest,
  runsBySkill: seededRuns(rest.id, rest.collection, runBase),
}))

export const peopleById: Record<string, Person> = Object.fromEntries(
  people.map((p) => [p.id, p]),
)

/** The signed-in demo account. */
export const currentUserId = 'alex'
