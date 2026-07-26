import Link from "next/link";
import { SKILLS } from "@/lib/skills";
import { BarList } from "../components/BarList";
import { LiveFeed } from "../components/LiveFeed";
import { Sparkline } from "../components/Sparkline";

export const dynamic = "force-dynamic";

function growth(series: number[]): number {
  const first = series[0] || 1;
  const last = series[series.length - 1];
  return Math.round(((last - first) / first) * 100);
}

export default function Dashboard() {
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
