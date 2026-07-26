"use client";

import { useEffect, useState } from "react";

type SkillEvent = {
  id: number;
  type: "install" | "run" | "update" | "uninstall";
  slug: string;
  actor: string;
  department: string;
  at: string;
  live: boolean;
};

const VERB: Record<SkillEvent["type"], string> = {
  install: "installed",
  run: "ran",
  update: "published an update to",
  uninstall: "removed",
};

function ago(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export function LiveFeed() {
  const [events, setEvents] = useState<SkillEvent[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const json = await res.json();
        if (alive) setEvents(json.events ?? []);
      } catch {
        /* keep the last good frame rather than blanking the panel */
      }
    }
    poll();
    const id = setInterval(() => {
      poll();
      setTick((t) => t + 1);
    }, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const liveCount = events.filter((e) => e.live).length;

  return (
    <div className="card flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold tracking-tight text-white">Activity</h2>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-mute-400">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent-500" />
          live
        </span>
      </div>

      <ul className="min-h-0 flex-1 space-y-0 overflow-y-auto" key={tick % 1}>
        {events.map((e) => (
          <li
            key={e.id}
            className={`flex items-start gap-2.5 border-l-2 py-2 pl-3 text-[12.5px] leading-snug ${
              e.live ? "border-accent-500 bg-accent-500/6" : "border-white/8"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="text-mute-200">{e.actor}</span>{" "}
              <span className="text-mute-400">{VERB[e.type]}</span>{" "}
              <span className="text-white">{e.slug}</span>
              {e.live && (
                <span className="ml-1.5 rounded border border-accent-500/30 bg-accent-500/10 px-1 py-px font-mono text-[9px] text-accent-400">
                  this session
                </span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-mute-400">{ago(e.at)}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-white/6 pt-3 font-mono text-[10.5px] leading-relaxed text-mute-400">
        {liveCount > 0 ? (
          <>
            <span className="text-accent-400">{liveCount} real event{liveCount > 1 ? "s" : ""}</span>{" "}
            from skilldrop this session · the rest is seeded demo data
          </>
        ) : (
          <>seeded demo data · run skilldrop to see a real event land here</>
        )}
      </p>
    </div>
  );
}
