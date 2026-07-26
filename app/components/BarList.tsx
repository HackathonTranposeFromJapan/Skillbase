"use client";

import { useState } from "react";

export type BarDatum = {
  label: string;
  value: number;
  /** Shown in the tooltip under the value. */
  note?: string;
};

/**
 * Single-series magnitude comparison. One hue, thin marks, rounded data-end,
 * recessive baseline, value direct-labelled — no legend (the title names the series).
 */
export function BarList({
  data,
  unit = "count",
  hue = "var(--color-accent-500)",
}: {
  data: BarDatum[];
  /** Server components can't pass a formatter function across the boundary. */
  unit?: "count" | "percent";
  hue?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const format = (v: number) => (unit === "percent" ? `${v}%` : v.toLocaleString());

  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li
          key={d.label}
          className="relative"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-[12.5px] text-mute-200">{d.label}</span>
            <span className="shrink-0 font-mono text-[11px] text-mute-400">
              {format(d.value)}
            </span>
          </div>
          {/* 8px tall track keeps the mark thin; the fill is the only saturated element. */}
          <div className="h-[7px] w-full overflow-hidden rounded-[4px] bg-white/5">
            <div
              className="h-full rounded-[4px] transition-[width,opacity] duration-500 ease-out"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: hue,
                opacity: hover === null || hover === i ? 1 : 0.4,
              }}
            />
          </div>

          {hover === i && d.note && (
            <div className="pointer-events-none absolute -top-1 right-0 z-10 -translate-y-full rounded-md border border-white/10 bg-ink-800 px-2.5 py-1.5 text-[11px] text-mute-200 shadow-xl">
              {d.note}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
