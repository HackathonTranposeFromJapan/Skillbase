import Link from "next/link";
import { getCatalog } from "@/lib/backend/catalog";
import { BarList } from "../components/BarList";
import { LiveFeed } from "../components/LiveFeed";
import { Sparkline } from "../components/Sparkline";

export const dynamic = "force-dynamic";

function growth(series: number[]): number {
  const first = series[0] || 1;
  const last = series[series.length - 1];
  return Math.round(((last - first) / first) * 100);
}

function ago(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export default async function Dashboard() {
  const { skills: SKILLS, shadow, source } = await getCatalog();

  const totalInstalls = SKILLS.reduce((n, s) => n + s.installs, 0);
  const totalActive = SKILLS.reduce((n, s) => n + s.activeUsers, 0);
  const weeklyRuns = SKILLS.reduce((n, s) => n + s.weeklyUsage[s.weeklyUsage.length - 1], 0);

  const mostInstalled = [...SKILLS]
    .sort((a, b) => b.installs - a.installs)
    .slice(0, 8)
    .map((s) => ({
      label: s.name,
      value: s.installs,
      note: `${s.activeUsers} active · ${Math.round(s.retention30d * 100)}% still using it after 30 days`,
    }));

  const fastestGrowing = [...SKILLS]
    .sort((a, b) => growth(b.weeklyUsage) - growth(a.weeklyUsage))
    .slice(0, 6);

  // Adoption = share of the department that has the skill installed, averaged
  // across every skill that department touches.
  const deptTotals = new Map<string, { sum: number; n: number }>();
  for (const s of SKILLS) {
    for (const [dept, rate] of Object.entries(s.adoptionByDept)) {
      const cur = deptTotals.get(dept) ?? { sum: 0, n: 0 };
      deptTotals.set(dept, { sum: cur.sum + rate, n: cur.n + 1 });
    }
  }
  const deptAdoption = [...deptTotals.entries()]
    .map(([label, { sum, n }]) => ({
      label,
      value: Math.round((sum / n) * 100),
      note: `average install rate across ${n} skills`,
    }))
    .sort((a, b) => b.value - a.value);

  // Skills where installs are high but retention is low — the ones to fix.
  const atRisk = [...SKILLS]
    .filter((s) => s.retention30d < 0.6)
    .sort((a, b) => a.retention30d - b.retention30d)
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-6xl px-6 pt-10 pb-24">
      <div className="mb-8">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">
          Company skill adoption
        </h1>
        <p className="mt-1.5 text-[13.5px] text-mute-400">
          Which internal AI workflows are actually spreading — and which ones people quietly
          abandon.
        </p>
        <p className="mt-2 font-mono text-[10.5px] uppercase tracking-wider text-mute-400">
          {source === "db"
            ? "live · measured from collected agent telemetry"
            : "sample data · start the collector to see measured usage"}
        </p>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Skills published", value: SKILLS.length, sub: `${SKILLS.filter((s) => s.official).length} official` },
          { label: "Total installs", value: totalInstalls.toLocaleString(), sub: "all departments" },
          { label: "Active users", value: totalActive.toLocaleString(), sub: "past 30 days" },
          { label: "Runs this week", value: weeklyRuns.toLocaleString(), sub: "across all skills" },
        ].map((stat) => (
          <div key={stat.label} className="card p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-mute-400">
              {stat.label}
            </p>
            <p className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em] text-white">
              {stat.value}
            </p>
            <p className="mt-1.5 text-[11.5px] text-mute-400">{stat.sub}</p>
          </div>
        ))}
      </section>

      <section className="card mb-6 overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_auto]">
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-violet-400/20 bg-violet-400/8 px-2.5 py-1 font-mono text-[9.5px] text-violet-300">
                KNOWLEDGE CONTINUITY
              </span>
              <span className="rounded-full border border-rose-400/20 bg-rose-400/8 px-2.5 py-1 font-mono text-[9.5px] text-rose-300">
                3 single-owner skills
              </span>
            </div>
            <h2 className="mt-3 text-[17px] font-semibold tracking-tight text-white">
              Alex starts Monday. Maya owns the workflows he needs.
            </h2>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-mute-400">
              Turn the team&apos;s proven skills into a first-week plan, run the first real task,
              and remove a single point of failure.
            </p>
          </div>
          <div className="flex items-center border-t border-white/6 p-5 lg:border-t-0 lg:border-l">
            <Link
              href="/onboarding"
              className="rounded-lg bg-accent-500 px-4 py-2.5 text-[12.5px] font-semibold text-ink-950 transition hover:bg-accent-400"
            >
              Open onboarding demo →
            </Link>
          </div>
        </div>
      </section>

      {shadow.length > 0 && (
        <section className="card mb-6 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-semibold tracking-tight text-white">
              Discovered in use — not in the library
            </h2>
            <span className="rounded-full border border-amber-400/20 bg-amber-400/8 px-2.5 py-1 font-mono text-[9.5px] text-amber-300">
              {shadow.length} UNREGISTERED
            </span>
          </div>
          <p className="mb-4 mt-1 text-[11.5px] text-mute-400">
            Skills people are already running that nobody published. Found by reading agent
            telemetry — no one had to report them.
          </p>
          <ul className="space-y-1">
            {shadow.slice(0, 8).map((s) => (
              <li
                key={`${s.agentKind}:${s.name}`}
                className="flex items-center gap-3 border-b border-white/5 py-2 text-[12.5px] last:border-0"
              >
                <span className="w-14 shrink-0 text-right font-mono text-[11px] text-amber-400">
                  {s.invocations.toLocaleString()}
                </span>
                <span className="min-w-0 flex-1 truncate text-mute-200">{s.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-mute-400">{s.agentKind}</span>
                <span className="w-20 shrink-0 text-right text-[11px] text-mute-400">
                  {ago(s.lastSeen)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6 grid gap-3 lg:grid-cols-[1.15fr_1fr]">
        <div className="card p-5">
          <h2 className="mb-1 text-[13px] font-semibold tracking-tight text-white">
            Most installed skills
          </h2>
          <p className="mb-4 text-[11.5px] text-mute-400">Installs, all time</p>
          <BarList data={mostInstalled} />
        </div>

        <div className="min-h-[300px]">
          <LiveFeed />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_1.15fr]">
        <div className="card p-5">
          <h2 className="mb-1 text-[13px] font-semibold tracking-tight text-white">
            Adoption by department
          </h2>
          <p className="mb-4 text-[11.5px] text-mute-400">
            Average adoption across the skills each department uses
          </p>
          <BarList data={deptAdoption} unit="percent" />
        </div>

        <div className="card p-5">
          <h2 className="mb-1 text-[13px] font-semibold tracking-tight text-white">
            Fastest growing
          </h2>
          <p className="mb-4 text-[11.5px] text-mute-400">Weekly runs, last 7 weeks</p>
          <ul className="space-y-1">
            {fastestGrowing.map((s) => (
              <li
                key={s.slug}
                className="flex items-center gap-3 border-b border-white/5 py-2 last:border-0"
              >
                <Link
                  href={`/skill/${s.slug}`}
                  className="min-w-0 flex-1 truncate text-[12.5px] text-mute-200 hover:text-white"
                >
                  {s.name}
                </Link>
                <Sparkline data={s.weeklyUsage} width={72} height={20} />
                <span className="w-12 shrink-0 text-right font-mono text-[11px] text-accent-400">
                  +{growth(s.weeklyUsage)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {atRisk.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="mb-1 text-[13px] font-semibold tracking-tight text-white">
            Installed, then abandoned
          </h2>
          <p className="mb-4 text-[11.5px] text-mute-400">
            Under 60% retention 30 days after install — the signal a skill needs work, or was
            only ever needed once
          </p>
          <ul className="space-y-2.5">
            {atRisk.map((s) => (
              <li key={s.slug} className="flex items-baseline gap-3 text-[12.5px]">
                <span className="w-16 shrink-0 font-mono text-[11px] text-amber-400">
                  {Math.round(s.retention30d * 100)}%
                </span>
                <Link href={`/skill/${s.slug}`} className="text-mute-200 hover:text-white">
                  {s.name}
                </Link>
                <span className="truncate text-mute-400">{s.impact}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
