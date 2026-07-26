"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Sparkline } from "./Sparkline";

type Result = {
  slug: string;
  name: string;
  tagline: string;
  department: string;
  tags: string[];
  official: boolean;
  version: string;
  updatedAt: string;
  installs: number;
  activeUsers: number;
  rating: number;
  weeklyUsage: number[];
  impact: string;
  requiredRole: string;
  locked: boolean;
  reason: string;
};

const EXAMPLES = [
  "I want a skill that makes product designs look cleaner and more consistent",
  "Find a skill for legal contract review",
  "Recommend a sales email writing workflow",
  "Which skills should a new engineer install first?",
];

const ROLES = ["designer", "frontend-engineer", "sales", "legal", "product-manager"];

export function SearchClient() {
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [role, setRole] = useState(params.get("role") ?? "designer");
  const [results, setResults] = useState<Result[] | null>(null);
  const [engine, setEngine] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const ranInitial = useRef(false);

  // ?q=… runs the search on load, so a demo can be driven from a bookmark.
  useEffect(() => {
    const q = params.get("q");
    if (q && !ranInitial.current) {
      ranInitial.current = true;
      search(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function search(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: trimmed, role }),
      });
      const json = await res.json();
      setResults(json.results ?? []);
      setEngine(json.engine ?? "");
    } catch {
      setResults([]);
      setEngine("error");
    } finally {
      setLoading(false);
    }
  }

  function copy(slug: string) {
    navigator.clipboard?.writeText(`skillbase install ${slug}`);
    setCopied(slug);
    setTimeout(() => setCopied((c) => (c === slug ? null : c)), 1600);
  }

  return (
    <main className="mx-auto max-w-6xl px-6 pb-24">
      <section className={results ? "pt-12 pb-8" : "pt-24 pb-10"}>
        {!results && (
          <div className="mb-9 max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-1 font-mono text-[11px] text-mute-300">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
              12 skills · 4 departments · 1 new hire starting Monday
            </div>
            <h1 className="text-[42px] leading-[1.08] font-semibold tracking-[-0.03em] text-white">
              Someone at your company
              <br />
              already solved this.
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-mute-400">
              Skillbase is the registry for your company&apos;s AI-agent skills. Describe the
              outcome you want, install the workflow a colleague already proved, and onboard new
              teammates from your company&apos;s best work.
            </p>
            <Link
              href="/onboarding"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-400/8 px-3.5 py-2 text-[12.5px] text-violet-300 transition hover:border-violet-400/40 hover:bg-violet-400/12 hover:text-white"
            >
              See Maya&apos;s knowledge become Alex&apos;s day-one onboarding
              <span aria-hidden>→</span>
            </Link>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(query);
          }}
          className="relative"
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe what you're trying to do…"
            className="hairline w-full rounded-xl bg-ink-850/80 py-4 pl-5 pr-32 text-[15px] text-white placeholder:text-mute-400/70 focus:border-accent-500/50"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-accent-500 px-4 py-2 text-[13px] font-semibold text-ink-950 transition hover:bg-accent-400 disabled:opacity-35"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[11px] text-mute-400">I am a</span>
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                role === r
                  ? "border-accent-500/50 bg-accent-500/12 text-accent-400"
                  : "border-white/8 text-mute-400 hover:text-mute-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {!results && (
          <div className="mt-8">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-mute-400">
              Try
            </p>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => search(ex)}
                  className="hairline group flex items-center gap-3 rounded-lg bg-white/2 px-4 py-2.5 text-left text-[13px] text-mute-300 transition hover:border-accent-500/30 hover:text-white"
                >
                  <span className="text-mute-400 transition group-hover:text-accent-500">›</span>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {!results && !loading && (
        <section className="mt-14 border-t border-white/6 pt-8">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                n: "01",
                h: "Describe the outcome",
                p: "Not a skill name — what you are actually trying to get done. Skillbase ranks against your role.",
              },
              {
                n: "02",
                h: "skillbase install",
                p: "The skill file lands in your agent's skill directory. Claude Code, Cursor, or your internal agent.",
              },
              {
                n: "03",
                h: "New hires start ahead",
                p: "Build role-specific onboarding from proven skills, then verify readiness with the first real task.",
              },
            ].map((s) => (
              <div key={s.n}>
                <p className="font-mono text-[11px] text-accent-500">{s.n}</p>
                <h3 className="mt-2 text-[13.5px] font-semibold tracking-tight text-white">
                  {s.h}
                </h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute-400">{s.p}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <div className="space-y-3">
          <p className="mb-4 flex items-center gap-2 font-mono text-[11px] text-mute-400">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent-500" />
            reading 12 skills · matching against your role
          </p>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="card h-28 animate-pulse bg-white/2"
              style={{ animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      )}

      {results && !loading && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[13px] text-mute-400">
              <span className="text-white">{results.length}</span> skills matched
            </p>
            <span
              className="font-mono text-[11px] text-mute-400"
              title="Which ranking engine answered this query"
            >
              ranked by{" "}
              <span className={engine === "lexical" ? "text-amber-400" : "text-accent-400"}>
                {engine}
              </span>
            </span>
          </div>

          <div className="space-y-3">
            {results.map((r, i) => (
              <article
                key={r.slug}
                className="card rise p-5"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 w-5 shrink-0 font-mono text-[13px] text-mute-400">
                    {i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/skill/${r.slug}`}
                        className="text-[16px] font-semibold tracking-tight text-white hover:text-accent-400"
                      >
                        {r.name}
                      </Link>
                      {r.official && (
                        <span className="rounded border border-accent-500/25 bg-accent-500/10 px-1.5 py-0.5 font-mono text-[10px] text-accent-400">
                          official
                        </span>
                      )}
                      {r.locked && (
                        <span className="rounded border border-amber-400/25 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">
                          needs {r.requiredRole}
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-mute-400">
                        {r.department} · v{r.version}
                      </span>
                    </div>

                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-mute-300">
                      {r.tagline}
                    </p>

                    <p className="mt-3 border-l-2 border-accent-500/40 pl-3 text-[13px] leading-relaxed text-accent-400/95">
                      {r.reason}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-mute-400">
                      <span>
                        <span className="text-mute-200">{r.installs}</span> installs
                      </span>
                      <span>
                        <span className="text-mute-200">{r.activeUsers}</span> active
                      </span>
                      <span>
                        <span className="text-mute-200">{r.rating}</span> ★
                      </span>
                      <span className="text-mute-400/80">{r.impact}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-3">
                    <Sparkline data={r.weeklyUsage} />
                    <button
                      onClick={() => copy(r.slug)}
                      disabled={r.locked}
                      className="rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 font-mono text-[11px] text-mute-200 transition hover:border-accent-500/40 hover:text-white disabled:opacity-35 disabled:hover:border-white/10"
                      title={
                        r.locked
                          ? `Requires ${r.requiredRole} — request approval`
                          : "Copy install command"
                      }
                    >
                      {r.locked
                        ? "request access"
                        : copied === r.slug
                          ? "copied ✓"
                          : "skillbase install"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {results.length === 0 && (
            <p className="card p-8 text-center text-[13px] text-mute-400">
              No skill covers this yet. That gap is the interesting part — publish one.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
