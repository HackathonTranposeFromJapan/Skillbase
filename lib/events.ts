export type SkillEvent = {
  id: number;
  type: "install" | "run" | "update" | "uninstall";
  slug: string;
  actor: string;
  department: string;
  at: string;
  /** True only for events produced during this session by the real CLI. */
  live: boolean;
};

type Store = { events: SkillEvent[]; nextId: number };

// Survives dev-server module reloads.
const g = globalThis as unknown as { __skillbase?: Store };

const SEED: Array<[SkillEvent["type"], string, string, string, number]> = [
  ["install", "pr-review-standards", "dana@", "Engineering", 41],
  ["run", "design-polish", "mika@", "Design", 37],
  ["install", "sales-email-writer", "ravi@", "Sales", 33],
  ["run", "pr-review-standards", "sam@", "Engineering", 28],
  ["update", "brand-consistency-checker", "brand-bot", "Design", 24],
  ["run", "contract-review", "yuki@", "Legal", 19],
  ["install", "design-polish", "chen@", "Design", 14],
  ["run", "sales-email-writer", "ravi@", "Sales", 11],
  ["run", "incident-postmortem", "ali@", "Engineering", 7],
  ["install", "prd-from-research", "jo@", "Product", 4],
];

function seeded(): Store {
  const now = Date.now();
  const events: SkillEvent[] = SEED.map(([type, slug, actor, department, minsAgo], i) => ({
    id: i + 1,
    type,
    slug,
    actor,
    department,
    at: new Date(now - minsAgo * 60_000).toISOString(),
    live: false,
  })).reverse();
  return { events, nextId: SEED.length + 1 };
}

function store(): Store {
  if (!g.__skillbase) g.__skillbase = seeded();
  return g.__skillbase;
}

export function listEvents(limit = 30): SkillEvent[] {
  return store().events.slice(0, limit);
}

export function recordEvent(input: Omit<SkillEvent, "id" | "at">): SkillEvent {
  const s = store();
  const event: SkillEvent = { ...input, id: s.nextId++, at: new Date().toISOString() };
  s.events.unshift(event);
  return event;
}

export function liveInstallCount(): number {
  return store().events.filter((e) => e.live && e.type === "install").length;
}
