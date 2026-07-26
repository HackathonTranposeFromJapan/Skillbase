"use client";

import { useState } from "react";

export function InstallCommand({
  slug,
  locked,
  requiredRole,
}: {
  slug: string;
  locked: boolean;
  requiredRole: string;
}) {
  const [copied, setCopied] = useState(false);
  const [requested, setRequested] = useState(false);
  const cmd = `skilldrop install ${slug}`;

  if (locked) {
    return (
      <div className="card border-amber-400/20 bg-amber-400/4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] text-white">
              This skill is gated to <span className="font-mono text-amber-400">{requiredRole}</span>
            </p>
            <p className="mt-1 text-[12px] text-mute-400">
              Install is blocked until an admin grants the role. Governance is enforced at the
              registry, not in the client.
            </p>
          </div>
          <button
            onClick={() => setRequested(true)}
            disabled={requested}
            className="shrink-0 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 font-mono text-[12px] text-amber-400 transition hover:bg-amber-400/16 disabled:opacity-60"
          >
            {requested ? "request sent ✓" : "request access"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(cmd);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="card group flex w-full items-center gap-3 p-4 text-left"
    >
      <span className="font-mono text-[13px] text-accent-400">$</span>
      <span className="flex-1 font-mono text-[13px] text-white">{cmd}</span>
      <span className="shrink-0 font-mono text-[11px] text-mute-400 transition group-hover:text-accent-400">
        {copied ? "copied ✓" : "copy"}
      </span>
    </button>
  );
}
