import Link from "next/link";
import { notFound } from "next/navigation";
import { getSkillDetail } from "@/lib/backend/catalog";
import { SKILLS } from "@/lib/skills";
import { BarList } from "../../components/BarList";
import { Sparkline } from "../../components/Sparkline";
import { InstallCommand } from "./InstallCommand";

export function generateStaticParams() {
  return SKILLS.map((s) => ({ slug: s.slug }));
}

export default async function SkillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Resolved through the catalogue rather than the seed file, so skills the
  // registry knows about — including discovered ones the dashboard links to —
  // get a page instead of a 404.
  const skill = await getSkillDetail(slug);
  if (!skill) notFound();

  const adoption = Object.entries(skill.adoptionByDept)
    .map(([label, rate]) => ({ label, value: Math.round(rate * 100) }))
    .sort((a, b) => b.value - a.value);

  return (
    <main className="mx-auto max-w-4xl px-6 pt-10 pb-24">
      <Link href="/" className="text-[12.5px] text-mute-400 transition hover:text-white">
        ← back to search
      </Link>

      <header className="mt-6 mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[30px] font-semibold tracking-[-0.025em] text-white">
            {skill.name}
          </h1>
          {skill.official && (
            <span className="rounded border border-accent-500/25 bg-accent-500/10 px-1.5 py-0.5 font-mono text-[10px] text-accent-400">
              official
            </span>
          )}
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-mute-300">{skill.tagline}</p>
        <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-mute-400">
          {skill.description}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-mute-400">
          <span>v{skill.version}</span>
          <span>updated {skill.updatedAt}</span>
          <span>by {skill.author}</span>
          <span>{skill.department}</span>
          <span
            className={
              skill.requiredRole === "employee" ? "text-mute-400" : "text-amber-400"
            }
          >
            access: {skill.requiredRole}
          </span>
        </div>
      </header>

      <InstallCommand slug={skill.slug} locked={skill.requiredRole !== "employee"} requiredRole={skill.requiredRole} />

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Installs", value: skill.installs.toLocaleString() },
          { label: "Active users", value: skill.activeUsers.toLocaleString() },
          // A discovered skill has no rating and no measured retention. Showing
          // "—" keeps an unknown from reading as a zero.
          { label: "Rating", value: skill.rating > 0 ? `${skill.rating} ★` : "—" },
          {
            label: "30-day retention",
            value: skill.retention30d === null ? "—" : `${Math.round(skill.retention30d * 100)}%`,
          },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-mute-400">
              {s.label}
            </p>
            <p className="mt-2 text-[22px] font-semibold leading-none tracking-tight text-white">
              {s.value}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-1 text-[13px] font-semibold tracking-tight text-white">
            Adoption by department
          </h2>
          <p className="mb-4 text-[11.5px] text-mute-400">Share of the department installed</p>
          <BarList data={adoption} unit="percent" />
        </div>

        <div className="card flex flex-col p-5">
          <h2 className="mb-1 text-[13px] font-semibold tracking-tight text-white">
            Weekly runs
          </h2>
          <p className="mb-4 text-[11.5px] text-mute-400">Last 7 weeks</p>
          <div className="flex flex-1 items-center justify-center">
            <Sparkline data={skill.weeklyUsage} width={280} height={72} />
          </div>
          <p className="mt-3 border-t border-white/6 pt-3 text-[12px] text-mute-300">
            {skill.impact}
          </p>
        </div>
      </section>

      <section className="card mt-3 p-5">
        <h2 className="mb-1 text-[13px] font-semibold tracking-tight text-white">
          What gets installed
        </h2>
        <p className="mb-4 text-[11.5px] text-mute-400">
          The exact file skilldrop writes to{" "}
          <span className="font-mono text-mute-300">.claude/skills/{skill.slug}/SKILL.md</span>
        </p>
        <pre className="max-h-[440px] overflow-auto rounded-lg border border-white/8 bg-ink-950/70 p-4 font-mono text-[11.5px] leading-relaxed text-mute-300">
          {skill.body}
        </pre>
      </section>
    </main>
  );
}
