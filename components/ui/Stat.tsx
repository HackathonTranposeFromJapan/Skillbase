import { Sparkline } from '@/components/dither-kit'
import type { DitherColor } from '@/components/dither-kit'
import { cn } from '@/lib/utils'

export function Stat({
  label,
  value,
  unit,
  delta,
  spark,
  color = 'purple',
}: {
  label: string
  value: string | number
  unit?: string
  /** Fractional change, e.g. 0.12 for +12%. */
  delta?: number
  spark?: number[]
  color?: DitherColor
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-hairline bg-surface/70 p-3.5">
      <p className="label">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-mono font-medium text-[22px] text-foreground tabular-nums">
          {value}
        </span>
        {unit && <span className="font-mono text-[11px] text-muted-foreground">{unit}</span>}
        {delta !== undefined && (
          <span
            className={cn(
              'ml-auto font-mono text-[11px]',
              delta >= 0 ? 'text-emerald-400/90' : 'text-red-400/90',
            )}
          >
            {delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}%
          </span>
        )}
      </div>
      {spark && spark.length > 0 && (
        <div className="mt-2 h-10 w-full">
          <Sparkline data={spark} color={color} className="h-full w-full" />
        </div>
      )}
    </div>
  )
}
