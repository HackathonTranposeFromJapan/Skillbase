import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  BlockLegend,
  Grid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  Tooltip,
  XAxis,
  YAxis,
} from '@/components/dither-kit'
import type { ChartSpec } from '@/lib/ai/types'
import { cn } from '@/lib/utils'

const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))

/** Renders any agent- or dashboard-produced {@link ChartSpec} with dither-kit. */
export function ChartBlock({ spec, className }: { spec: ChartSpec; className?: string }) {
  return (
    <figure
      className={cn(
        'flex flex-col rounded-lg border border-hairline bg-surface-2/40 p-3',
        className,
      )}
    >
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="label">{spec.title}</span>
        {spec.caption && <span className="text-[11px] text-muted-foreground">{spec.caption}</span>}
      </figcaption>
      <Body spec={spec} />
    </figure>
  )
}

function Body({ spec }: { spec: ChartSpec }) {
  const height = spec.height ?? 200

  if (spec.kind === 'pie') {
    const values = Object.fromEntries(
      spec.data.map((row) => [String(row[spec.nameKey]), Number(row[spec.dataKey])]),
    )
    return (
      <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row">
        <div className="relative w-full sm:w-1/2" style={{ height }}>
          <PieChart
            data={spec.data}
            config={spec.config}
            dataKey={spec.dataKey}
            nameKey={spec.nameKey}
            innerRadius={0.58}
            bloom="low"
            className="absolute inset-0 h-full w-full"
          >
            <Pie />
            <Tooltip labelKey={spec.nameKey} valueFormatter={(v) => compact(v)} />
          </PieChart>
        </div>
        <BlockLegend
          config={spec.config}
          values={values}
          valueFormatter={compact}
          className="w-full sm:w-1/2"
        />
      </div>
    )
  }

  if (spec.kind === 'radar') {
    return (
      <div className="relative flex-1" style={{ minHeight: height }}>
        <RadarChart
          data={spec.data}
          config={spec.config}
          nameKey={spec.nameKey}
          bloom="low"
          className="absolute inset-0 h-full w-full"
        >
          {spec.series.map((key) => (
            <Radar key={key} dataKey={key} variant="gradient" />
          ))}
          <Tooltip valueFormatter={(v) => `${Math.round(v)}%`} />
        </RadarChart>
      </div>
    )
  }

  if (spec.kind === 'bar') {
    return (
      <div className="relative flex-1" style={{ minHeight: height }}>
        <BarChart
          data={spec.data}
          config={spec.config}
          stackType={spec.stacked ? 'stacked' : 'default'}
          bloom="low"
          className="absolute inset-0 h-full w-full"
        >
          <Grid />
          <XAxis dataKey={spec.xKey} />
          <YAxis tickFormatter={compact} />
          <Tooltip labelKey={spec.xKey} valueFormatter={(v) => compact(v)} />
          {spec.series.map((key, i) => (
            <Bar key={key} dataKey={key} variant={i === 0 ? 'gradient' : 'hatched'} />
          ))}
        </BarChart>
      </div>
    )
  }

  const Chart = spec.kind === 'line' ? LineChart : AreaChart
  const Series = spec.kind === 'line' ? Line : Area

  return (
    <div className="relative flex-1" style={{ minHeight: height }}>
      <Chart
        data={spec.data}
        config={spec.config}
        bloom="low"
        bloomOnHover
        className="absolute inset-0 h-full w-full"
      >
        <Grid />
        <XAxis dataKey={spec.xKey} />
        <YAxis tickFormatter={compact} />
        <Tooltip labelKey={spec.xKey} valueFormatter={(v) => compact(v)} />
        {spec.series.map((key, i) => (
          <Series key={key} dataKey={key} variant={i === 0 ? 'gradient' : 'hatched'} />
        ))}
      </Chart>
    </div>
  )
}
